#!/usr/bin/env python3
"""Test Costco receipt parsing with problematic receipt"""

import requests
import json
from datetime import datetime

# Actual Costco receipt from user logs with issues
test_receipt = """749030
WHOLE PIZZA
16.99

1218638
KS WHITE BREAD
5.79

1160709
RIP CAULIFLOWER
6.99

35457
KS ORG PB
11.49

7487010
2.00 OFF
STRAWBERRIES
5.99

1724226
RUSTIC ITALN
9.99

1772134
PASTURE EGGS
7.99

1323015
KS ORG BUTTER
11.49

1537209
KS ORG PNT BTR
14.49

1541920
KS MAYO
9.59

1244653
KS SALSA
7.99

1273149
ORG SPINACH
6.99

31145
BANANAS
2.49

533552
KS LS BACON
14.99

1673669
MIXED PEPPER
6.99

2120150
WHITE PEACH
14.99

SUBTOTAL 179.44
TAX 0.40

**TOTAL 179.84**

A MEMBER WOULD HAVE SAVED 34.84
CASH 180.00
CHANGE DUE 0.16
"""

def test_parser():
    """Test the parser with Costco receipt"""

    # Your Supabase project details
    SUPABASE_URL = "https://fqkpcvioinfvwozcdgsg.supabase.co"
    SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxa3BjdmlvaW5mdndvemNkZ3NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NTA1MDEsImV4cCI6MjA3NDMyNjUwMX0.4G3B7Gye5vVFpAP37j7i88iYX7q5WTuzvLuAXuPeQnQ"

    # Edge Function URL
    edge_function_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

    # Add timestamp to force new parse
    receipt_with_timestamp = test_receipt + f"\n[costco-test-{datetime.now().timestamp()}]"

    # Prepare request
    headers = {
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "ocr_text": receipt_with_timestamp,
        "household_id": "d0e3e538-fa64-4d0f-ba3e-a13dce52f228",  # test5's household
        "options": {
            "ocrConfidence": 0.9,
            "useGemini": False
        }
    }

    print("=" * 50)
    print("TESTING COSTCO RECEIPT PARSER")
    print("=" * 50)
    print("Sending receipt to Edge Function...")
    print()

    try:
        response = requests.post(edge_function_url, json=payload, headers=headers)
        result = response.json()

        if result.get('success'):
            print("✅ Parser successful!")
            print(f"Method: {result.get('method')}")
            print(f"Confidence: {result.get('confidence')}")
            print(f"Receipt ID: {result.get('receipt_id')}")
            print()

            # Check items
            items = result.get('items', [])
            print(f"📦 Found {len(items)} items (expected 16):")
            print("-" * 50)

            # Expected items for verification
            expected_items = [
                ("WHOLE PIZZA", 16.99),
                ("KS WHITE BREAD", 5.79),
                ("RIP CAULIFLOWER", 6.99),
                ("KS ORG PB", 11.49),
                ("STRAWBERRIES", 5.99),
                ("RUSTIC ITALN", 9.99),
                ("PASTURE EGGS", 7.99),
                ("KS ORG BUTTER", 11.49),
                ("KS ORG PNT BTR", 14.49),
                ("KS MAYO", 9.59),
                ("KS SALSA", 7.99),
                ("ORG SPINACH", 6.99),
                ("BANANAS", 2.49),
                ("KS LS BACON", 14.99),
                ("MIXED PEPPER", 6.99),
                ("WHITE PEACH", 14.99)
            ]

            total_price = 0
            found_items = []

            for item in items:
                price = item['price_cents'] / 100
                total_price += price
                name = item['parsed_name'].upper()
                found_items.append(name)

                # Check if this is a real item or garbage
                is_expected = False
                expected_price = None
                for exp_name, exp_price in expected_items:
                    if exp_name in name or name in exp_name:
                        is_expected = True
                        expected_price = exp_price
                        break

                status = "✅" if is_expected else "❌"
                print(f"  {status} {item['parsed_name']:<20} ${price:6.2f}", end="")

                if is_expected and expected_price:
                    if abs(price - expected_price) > 0.01:
                        print(f" (WRONG! Expected ${expected_price:.2f})")
                    else:
                        print(" (correct price)")
                elif not is_expected:
                    print(" (GARBAGE ITEM!)")
                else:
                    print()

            print("-" * 50)
            print(f"  {'Item Total:':<20} ${total_price:6.2f}")

            # Check receipt total
            receipt = result.get('receipt', {})
            receipt_total = receipt.get('total_amount_cents', 0) / 100
            print(f"  {'Receipt Total:':<20} ${receipt_total:6.2f} (should be $179.84)")
            print()

            # Detailed verification
            print("🔍 Verification:")

            # 1. Check item count
            if len(items) == 16:
                print(f"  ✅ Correct item count: {len(items)}")
            else:
                print(f"  ❌ Wrong item count: {len(items)} (expected 16)")

            # 2. Check for garbage items
            garbage_patterns = ["REEEE", "ZEEEE", "EWHOLESAL", "OFF"]
            garbage_found = []
            for item in items:
                name_upper = item['parsed_name'].upper()
                for pattern in garbage_patterns:
                    if pattern in name_upper:
                        garbage_found.append(item['parsed_name'])
                        break

            if not garbage_found:
                print("  ✅ No garbage items detected")
            else:
                print(f"  ❌ Garbage items found: {', '.join(garbage_found)}")

            # 3. Check for missing items
            print("\n📋 Expected items check:")
            missing_items = []
            for expected_name, expected_price in expected_items:
                found = any(expected_name in item or item in expected_name
                           for item in found_items)
                if found:
                    print(f"  ✅ {expected_name} found")
                else:
                    print(f"  ❌ {expected_name} MISSING")
                    missing_items.append(expected_name)

            # 4. Total verification
            if abs(receipt_total - 179.84) < 0.01:
                print(f"\n  ✅ Receipt total correct: ${receipt_total:.2f}")
            else:
                print(f"\n  ❌ Receipt total wrong: ${receipt_total:.2f} (should be $179.84)")

            # 5. Summary
            print("\n📊 Summary:")
            print(f"  Items found: {len(items)}/16")
            print(f"  Missing items: {len(missing_items)}")
            if missing_items:
                print(f"    Missing: {', '.join(missing_items)}")
            print(f"  Garbage items: {len(garbage_found)}")
            print(f"  Total accuracy: ${receipt_total:.2f} vs $179.84 expected")

        else:
            print("❌ Parser failed:")
            print(json.dumps(result, indent=2))

    except Exception as e:
        print(f"❌ Error calling Edge Function: {e}")

if __name__ == "__main__":
    test_parser()