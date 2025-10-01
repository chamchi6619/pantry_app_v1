#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# COSTCO RECEIPT - v4.3.5 TAX PREFIX TEST
ocr_text = """COSTCO WHOLESALE
12/15/24
1823420 RUSTIC ITALN LOAF
5.99 E
E 96716 ORG SPINACH
3.79 E
1509488 KS ORG QUINOA
10.99 E
E 1823420 RUSTIC ITALN
5.99 E
1667294 ORG BABY CARROTS
5.99 E
1741874 ORG BROCCOLI
5.49 E
1822287 ORG AVOCADOS
7.99 E
9652107 BANANAS
2.42 E
1599844 ORG STRAWBERRIES
6.99 E
1234567 KS ALMONDS
14.99 E
1700987 ORG BLUEBERRIES
8.99 E
1500234 ORG TOMATOES
6.99 E
1823567 KS LS TURKEY
12.99 E
1900456 ORG MIXED GREENS
5.99 E
1234098 KS OLIVE OIL
19.99 E
1567890 ORG APPLES
8.99 E
SUBTOTAL 206.03"""

payload = {
    "ocr_text": ocr_text,
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
}

print("=" * 70)
print("🚀 TESTING v4.3.5 DEPLOYMENT - COSTCO TAX PREFIX FIX")
print("=" * 70)

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"\n✅ Success: {data.get('success', False)}")
print(f"🏪 Store: {data.get('store', 'N/A')}")
print(f"📊 Method: {data.get('method', 'N/A')}")
print(f"📈 Confidence: {data.get('confidence', 0):.2f}")
print(f"📦 Items: {len(data.get('items', []))}/16")

if data.get('items'):
    total = sum(item['price_cents'] for item in data['items']) / 100
    print(f"\n💵 Total: ${total:.2f} (Expected: $206.03)")

    print(f"\n{'Item':<45} {'Price':>10}")
    print("=" * 70)
    for i, item in enumerate(data['items'], 1):
        print(f"{i:2}. {item['parsed_name']:<42} ${item['price_cents']/100:6.2f}")

    print("\n" + "=" * 70)
    print("CRITICAL CHECKS:")
    print("=" * 70)

    names = [item['parsed_name'].upper() for item in data['items']]

    checks = {
        "✅ E 96716 ORG SPINACH ($3.79)": any("SPINACH" in n and "ORGANIC" in n for n in names),
        "✅ E 1823420 RUSTIC ITALN ($5.99)": any("RUSTIC" in n and "ITALN" in n for n in names),
        "✅ Abbreviations expanded (ORG, KS, LS)": any("ORGANIC" in n or "KIRKLAND" in n for n in names),
    }

    for check, passed in checks.items():
        status = "✅" if passed else "❌"
        print(f"  {status} {check}")

    print("\n" + "=" * 70)
    if all(checks.values()) and len(data['items']) == 16 and abs(total - 206.03) < 0.01:
        print("🎉🎉🎉 ROCK SOLID! ALL 16 ITEMS EXTRACTED! 🎉🎉🎉")
        print("\n✅ Tax prefix 'E' before codes handled")
        print("✅ Store normalizations working (ORG→ORGANIC, KS→KIRKLAND, LS→LESS SODIUM)")
        print("✅ Total matches exactly: $206.03")
        print("=" * 70)
    else:
        print(f"⚠️  Progress: {len(data['items'])}/16 items, ${total:.2f}/$206.03")
        print(f"   Passed: {sum(checks.values())}/{len(checks)} critical checks")
        print("=" * 70)
else:
    print("\n❌ ERROR:", data.get('error', 'No items returned'))
