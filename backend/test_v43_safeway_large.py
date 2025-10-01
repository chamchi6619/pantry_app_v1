#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# Large Safeway receipt v43
ocr_text = """SAFEWAY v43
Store #1248
1115202140 KIKKOMAN MAN
5.49
5.49 S
79921082501 BIONATURAE PASTA E
4.79
3.99 S
GROCERY
79804601011 O ORG OLIVE OIL
15.99
15.99 S
7989312513 0 ORG JALAPENO PPR
2.79
2.79 S
7989340154 0 ORG BROWN EGGS A
GEN MERCHANDISE
8.49
8.49 S
5280035327 LUBRIDERM DAILY NO
SEAFOOD
7.99
7.99 T
3338390403 2# ONIONS GREEN ORG
3.58
3.58 S
SUBTOTAL 94.39"""

payload = {
    "ocr_text": ocr_text,
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
}

print("🧪 Testing v4.3 Parser with Large Safeway Receipt")
print("=" * 60)
print("This receipt has:")
print("- Items followed by category headers (GEN MERCHANDISE, SEAFOOD)")
print("- Discount prices (BIONATURAE PASTA: 4.79 -> 3.99)")
print("- Special prefixes (2# ONIONS)")
print("- Extra digits in UPC codes")
print("=" * 60)

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"\n✅ Success: {data.get('success', False)}")
print(f"🏪 Store: {data.get('store', 'N/A')}")
print(f"📊 Method: {data.get('method', 'N/A')}")
print(f"📈 Confidence: {data.get('confidence', 0):.2f}")
print(f"📦 Items extracted: {len(data.get('items', []))}/7")

if data.get('items'):
    total = sum(item['price_cents'] for item in data['items']) / 100
    print(f"\n💵 Total: ${total:.2f} (Expected: $94.39)")
    match = "✅ PERFECT" if abs(total - 94.39) < 0.01 else "❌ MISMATCH"
    print(f"   Match: {match}")

    print(f"\n--- All {len(data['items'])} Items ---")
    for i, item in enumerate(data['items'], 1):
        print(f"{i:2}. {item['parsed_name']:35} ${item['price_cents']/100:6.2f}")

    print("\n" + "=" * 60)
    # Check critical items
    names = [item['parsed_name'] for item in data['items']]

    critical_checks = {
        "BIONATURAE": any("BIONATURAE" in n for n in names),
        "JALAPENO": any("JALAPENO" in n for n in names),
        "BROWN EGGS": any("BROWN" in n and "EGG" in n for n in names),
        "LUBRIDERM": any("LUBRIDERM" in n for n in names),
        "ONIONS GREEN": any("ONION" in n and "GREEN" in n for n in names)
    }

    prices = {item['parsed_name']: item['price_cents']/100 for item in data['items']}

    print("Critical Tests:")
    for item, found in critical_checks.items():
        status = "✅" if found else "❌"
        print(f"  {status} {item}: {'Found' if found else 'MISSING'}")

    # Check BIONATURAE price
    bionaturae_price = next((p for n, p in prices.items() if "BIONATURAE" in n), None)
    if bionaturae_price:
        correct_price = abs(bionaturae_price - 3.99) < 0.01
        print(f"  {'✅' if correct_price else '❌'} BIONATURAE price: ${bionaturae_price:.2f} (Expected: $3.99)")

    if all(critical_checks.values()) and len(data['items']) == 7 and abs(total - 94.39) < 0.01:
        print("\n🎉 ALL CRITICAL TESTS PASSED!")
        print("✅ Category headers handled correctly")
        print("✅ Discount prices extracted correctly")
        print("✅ Special prefixes (2#) handled correctly")
        print("✅ Extra digits in UPC codes handled correctly")
    else:
        print(f"\n⚠️  Some tests failed")
        if not all(critical_checks.values()):
            print(f"Missing items: {[k for k, v in critical_checks.items() if not v]}")
else:
    print("\n❌ ERROR:", data.get('error', 'No items returned'))

print("\n📋 Expected items:")
print("1. KIKKOMAN MAN - $5.49")
print("2. BIONATURAE PASTA E - $3.99 (discount from $4.79)")
print("3. O ORG OLIVE OIL - $15.99")
print("4. ORG JALAPENO PPR - $2.79")
print("5. ORG BROWN EGGS A - $8.49")
print("6. LUBRIDERM DAILY NO - $7.99")
print("7. ONIONS GREEN ORG - $3.58")
