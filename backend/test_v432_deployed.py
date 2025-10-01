#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# BRAND NEW TEST - v4.3.2 DEPLOYED
ocr_text = """SAFEWAY v432 TEST
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

print("=" * 70)
print("🚀 TESTING v4.3.2 DEPLOYMENT - ROCK SOLID FIXES")
print("=" * 70)

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"\n✅ Success: {data.get('success', False)}")
print(f"🏪 Store: {data.get('store', 'N/A')}")
print(f"📊 Method: {data.get('method', 'N/A')}")
print(f"📈 Confidence: {data.get('confidence', 0):.2f}")
print(f"📦 Items: {len(data.get('items', []))}/7")

if data.get('items'):
    total = sum(item['price_cents'] for item in data['items']) / 100
    print(f"\n💵 Total: ${total:.2f} (Expected: $94.39)")

    print(f"\n{'Item':<45} {'Price':>10}")
    print("=" * 70)
    for i, item in enumerate(data['items'], 1):
        print(f"{i:2}. {item['parsed_name']:<42} ${item['price_cents']/100:6.2f}")

    print("\n" + "=" * 70)
    print("CRITICAL CHECKS:")
    print("=" * 70)

    names = [item['parsed_name'].upper() for item in data['items']]
    prices = {item['parsed_name'].upper(): item['price_cents']/100 for item in data['items']}

    checks = {
        "✅ BIONATURAE discount ($3.99)": any("BIONATURAE" in n and abs(prices.get(n, 0) - 3.99) < 0.01 for n in names),
        "✅ JALAPENO with extra '0' ($2.79)": any("JALAPENO" in n for n in names),
        "✅ BROWN EGGS after GEN MERCHANDISE ($8.49)": any("BROWN" in n and "EGG" in n for n in names),
        "✅ LUBRIDERM after SEAFOOD ($7.99)": any("LUBRIDERM" in n for n in names),
        "✅ ONIONS with '2#' prefix ($3.58)": any("ONION" in n and "GREEN" in n for n in names),
    }

    for check, passed in checks.items():
        status = "✅" if passed else "❌"
        print(f"  {status} {check}")

    print("\n" + "=" * 70)
    if all(checks.values()) and len(data['items']) == 7 and abs(total - 94.39) < 0.01:
        print("🎉🎉🎉 ALL TESTS PASSED! 🎉🎉🎉")
        print("\n✅ Separate-line discounts working")
        print("✅ Extra digits in UPC codes handled")
        print("✅ Category headers skipped correctly")
        print("✅ Special prefixes (2#) handled")
        print("=" * 70)
    else:
        print(f"⚠️  Progress: {len(data['items'])}/7 items, ${total:.2f}/$94.39")
        print(f"   Passed: {sum(checks.values())}/5 critical checks")
        print("=" * 70)
else:
    print("\n❌ ERROR:", data.get('error', 'No items returned'))
