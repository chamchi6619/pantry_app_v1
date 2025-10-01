#!/usr/bin/env python3
"""
Test the complete receipt normalization flow
"""

import json
import requests
from app.services.item_normalizer import item_normalizer

def test_direct_normalization():
    """Test the item normalizer directly"""
    print("=" * 50)
    print("Testing Direct Normalization")
    print("=" * 50)

    test_cases = [
        ("WHP HVY CRM", "Whipping Heavy Cream"),
        ("MLK 2% GAL", "Milk 2% Gallon"),
        ("CHKN BRST BNLS", "Chicken Breast Boneless"),
        ("GV WHL MLK", "Whole Milk"),
        ("SILK SOY", "Soy Milk"),
        ("GRND BF 80/20", "Ground Beef 80/20"),
        ("STRW YOG", "Strawberry Yogurt"),
        ("CHED CHS 8OZ", "Cheddar Cheese 8OZ"),
        ("ORG BAN", "Organic Banana"),
        ("FRSH BROC", "Fresh Broccoli"),
    ]

    for raw, expected in test_cases:
        result = item_normalizer.normalize(raw)
        status = "✓" if expected.lower() in result.normalized.lower() else "✗"
        print(f"{status} '{raw}' → '{result.normalized}' (expected: '{expected}')")
        print(f"   Confidence: {result.confidence:.2f}, Method: {result.method}")
    print()

def test_api_endpoint():
    """Test the API endpoint with a sample receipt"""
    print("=" * 50)
    print("Testing API Endpoint")
    print("=" * 50)

    # Sample receipt text with abbreviated items
    receipt_text = """
    WALMART #1234
    123 MAIN ST

    GV WHP CRM QT          3.99
    MLK 2% GAL             3.49
    CHKN BRST BNLS 2LB   10.99
    GRND BF 80/20 1LB     5.99
    SILK SOY UNSWTND       3.29
    ORG BAN 2LB            2.99
    FRSH BROC              1.99
    CHED CHS 8OZ           4.99

    SUBTOTAL              37.72
    TAX                    2.64
    TOTAL                 40.36
    """

    # Test with heuristics parser (no Gemini)
    url = "http://localhost:8000/api/receipts/scan"
    payload = {
        "ocr_text": receipt_text,
        "use_gemini": False,
        "household_id": "test-household"
    }

    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            data = response.json()
            print(f"Merchant: {data.get('merchant', 'Unknown')}")
            print(f"Total: ${data.get('total', 0):.2f}")
            print(f"Confidence: {data.get('confidence', 0):.2f}")
            print(f"Parser: {data.get('source', 'unknown')}")
            print()

            # Check normalized items
            print("Normalized Items:")
            for item in data.get('line_items', []):
                raw = item.get('raw_text', '')
                parsed = item.get('parsed_name', '')
                normalized = item.get('normalized_name', parsed)
                price = item.get('price', 0)
                print(f"  • {normalized}")
                print(f"    Raw: '{raw}' | Price: ${price:.2f}")

            # Check Fix Queue items
            fix_queue = data.get('fix_queue_items', [])
            if fix_queue:
                print(f"\n{len(fix_queue)} items need review:")
                for item in fix_queue:
                    print(f"  - {item.get('normalized_name', item.get('parsed_name'))}")
            else:
                print("\n✓ All items recognized with high confidence!")

        else:
            print(f"Error: API returned status {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"Error testing API: {e}")

    print()

def test_fix_queue_logic():
    """Test that Fix Queue only gets low confidence items"""
    print("=" * 50)
    print("Testing Fix Queue Logic")
    print("=" * 50)

    # Receipt with mix of clear and unclear items
    mixed_receipt = """
    WALMART SUPERCENTER

    MILK 2% GALLON         3.49
    BREAD WHITE            2.99
    EGGS LARGE DOZEN       4.99

    ABC123 XYZ             1.99
    ??? UNKNOWN            5.99
    1234567890 ITEM       3.99

    TOTAL                 23.44
    """

    url = "http://localhost:8000/api/receipts/scan"
    payload = {
        "ocr_text": mixed_receipt,
        "use_gemini": False,
        "household_id": "test-household"
    }

    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            data = response.json()

            line_items = data.get('line_items', [])
            fix_queue = data.get('fix_queue_items', [])

            print(f"Total items parsed: {len(line_items)}")
            print(f"Items needing review: {len(fix_queue)}")
            print()

            # High confidence items (should NOT be in Fix Queue)
            print("High confidence (auto-processed):")
            for item in line_items:
                if item.get('confidence', 0) >= 0.7:
                    print(f"  ✓ {item.get('normalized_name')} (conf: {item.get('confidence', 0):.2f})")

            # Low confidence items (SHOULD be in Fix Queue)
            print("\nLow confidence (Fix Queue):")
            for item in fix_queue:
                print(f"  ⚠ {item.get('normalized_name', item.get('parsed_name'))} (conf: {item.get('confidence', 0):.2f})")

            # Verify no duplicates
            fix_queue_ids = [item.get('id') for item in fix_queue]
            if len(fix_queue_ids) != len(set(fix_queue_ids)):
                print("\n❌ ERROR: Duplicate items in Fix Queue!")
            else:
                print("\n✓ No duplicates in Fix Queue")

        else:
            print(f"Error: API returned status {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Run all tests
    test_direct_normalization()
    test_api_endpoint()
    test_fix_queue_logic()

    print("\n" + "=" * 50)
    print("Test Complete!")
    print("=" * 50)