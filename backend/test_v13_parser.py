#!/usr/bin/env python3
"""Test v13 parser with problematic receipt"""

import requests
import json
from datetime import datetime

# Test receipt with PAYMENT AMOUNT issue
test_receipt = """SAFEWAYS
STORE #3132

12/29/2024

4053
20 LEMONS                   1.98
You Pay                     1.78

4608
28 GRAYLIC BUL              1.98
You Pay                     1.79

BELVITA BLUEBERY            4.49

4067
17 ZUCCHINI SQUAS           2.69
You Pay                     2.42

4068
17 ONIONS GREEN ORG         1.98
You Pay                     1.79

SUBTOTAL                   13.12
TAX                         0.00
TOTAL                      39.20

PAYMENT AMOUNT             39.20
CASH                       40.00
CHANGE                      0.80
"""

def test_parser():
    """Test the v13 parser with payment section handling"""

    # Your Supabase project details
    SUPABASE_URL = "https://fqkpcvioinfvwozcdgsg.supabase.co"
    SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxa3BjdmlvaW5mdndvemNkZ3NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NTA1MDEsImV4cCI6MjA3NDMyNjUwMX0.4G3B7Gye5vVFpAP37j7i88iYX7q5WTuzvLuAXuPeQnQ"

    # Edge Function URL
    edge_function_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

    # Add timestamp to force new parse
    receipt_with_timestamp = test_receipt + f"\n[v13-test-{datetime.now().timestamp()}]"

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
    print("TESTING V13 PARSER")
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
            print(f"📦 Found {len(items)} items:")
            print("-" * 40)

            total_price = 0
            for item in items:
                price = item['price_cents'] / 100
                total_price += price
                print(f"  {item['parsed_name']:<20} ${price:6.2f}")

                # Check for problematic items
                if "PAYMENT" in item['parsed_name'].upper():
                    print(f"    ❌ ERROR: PAYMENT AMOUNT still being parsed!")
                if "GRAYLIC" in item['parsed_name'].upper():
                    print(f"    ⚠️ WARNING: GARLIC not corrected from GRAYLIC")
                if price == 39.20:
                    print(f"    ❌ ERROR: Item has total price $39.20!")

            print("-" * 40)
            print(f"  {'Item Total:':<20} ${total_price:6.2f}")

            # Check receipt total
            receipt = result.get('receipt', {})
            receipt_total = receipt.get('total_amount_cents', 0) / 100
            print(f"  {'Receipt Total:':<20} ${receipt_total:6.2f}")
            print()

            # Verify fixes
            print("🔍 Verification:")

            # 1. No PAYMENT AMOUNT as item
            has_payment = any("PAYMENT" in item['parsed_name'].upper() for item in items)
            if not has_payment:
                print("  ✅ PAYMENT AMOUNT not extracted as item")
            else:
                print("  ❌ PAYMENT AMOUNT still being extracted")

            # 2. Correct prices (not $39.20 for items)
            wrong_prices = [item for item in items if item['price_cents'] == 3920]
            if not wrong_prices:
                print("  ✅ No items with wrong $39.20 price")
            else:
                print(f"  ❌ {len(wrong_prices)} items have wrong $39.20 price")

            # 3. PLU corrections applied
            garlic_found = any("GARLIC" in item['parsed_name'].upper() for item in items)
            graylic_found = any("GRAYLIC" in item['parsed_name'].upper() for item in items)
            if garlic_found and not graylic_found:
                print("  ✅ GARLIC corrected from GRAYLIC")
            elif graylic_found:
                print("  ❌ GRAYLIC not corrected to GARLIC")

            # 4. Total calculation
            if abs(receipt_total - 39.20) < 0.01:
                print(f"  ✅ Receipt total correct: ${receipt_total:.2f}")
            else:
                print(f"  ❌ Receipt total wrong: ${receipt_total:.2f} (should be $39.20)")

            # 5. All expected items found
            expected_items = ["LEMONS", "GARLIC", "BELVITA", "ZUCCHINI", "ONIONS"]
            found_items = [item['parsed_name'].upper() for item in items]

            print("\n📋 Expected items check:")
            for expected in expected_items:
                found = any(expected in item for item in found_items)
                if found:
                    print(f"  ✅ {expected} found")
                else:
                    print(f"  ❌ {expected} missing")

        else:
            print("❌ Parser failed:")
            print(json.dumps(result, indent=2))

    except Exception as e:
        print(f"❌ Error calling Edge Function: {e}")

if __name__ == "__main__":
    test_parser()