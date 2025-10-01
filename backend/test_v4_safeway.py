#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# Safeway receipt
ocr_text = """SAFEWAY
Store 1248
2840058986 CHEETOS CRUNCHY
5.89
You Pay
5.79 S
Member Savings -0.10
4400002827 BELVITA BREAKFAST
5.49 4.99 S
Member Savings -0.50
REFRIG/FROZEN
2113004726 LUC CHESE 4 BLEND
2.69
2.69 S
2500013665
SIMPLY ORANGE
8.49
8.49 S
PRODUCE
2113053079
SIG GOLD POTATOES
5.99
5.99 S
3338365020
ICEBERG LETTUCE
2.99
2.99 S
4053
2@ LEMONS
1.58
1.38 S
Member Savings -0.20
4067
ZUCCHINI SQUASH
1.84 1.84 S
WT
1.09 lb @ $1.69 /lb
4608
2@ GARLIC BULK
1.18
1.18 S
4612
GINGER ROOT
2.07
2.07 S
WT
0.52 lb @ $3.99 /lb
94068
ONIONS GREEN ORG
1.79 1.79 S
TAX
0.00
**** BALANCE
39.20"""

payload = {
    "ocr_text": ocr_text,
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
}

print("🧪 Testing Universal Parser v4 with Safeway Receipt")
print("=" * 60)

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"✅ Success: {data.get('success', False)}")
print(f"🏪 Store: {data.get('store', 'N/A')}")
print(f"📊 Method: {data.get('method', 'N/A')}")
print(f"📈 Confidence: {data.get('confidence', 0):.2f}")
print(f"📦 Items extracted: {len(data.get('items', []))}/11")

if data.get('items'):
    total = sum(item['price_cents'] for item in data['items']) / 100
    print(f"\n💵 Total: ${total:.2f} (Expected: $39.20)")
    match = "✅ CLOSE" if abs(total - 39.20) < 1.0 else "❌ MISMATCH"
    print(f"   Match: {match}")

    print(f"\n--- All {len(data['items'])} Items ---")
    for i, item in enumerate(data['items'], 1):
        print(f"{i:2}. {item['parsed_name']:35} ${item['price_cents']/100:6.2f}")

    print("\n" + "=" * 60)
    expected = ["CHEETOS", "BELVITA", "CHEESE", "ORANGE", "POTATOES", "LETTUCE", "LEMONS", "ZUCCHINI", "GARLIC", "GINGER", "ONIONS"]
    found = [item['parsed_name'] for item in data['items']]
    missing = [e for e in expected if not any(e in f for f in found)]

    if len(data['items']) >= 10 and not missing:
        print("🎉 SAFEWAY WORKS!")
    else:
        print(f"⚠️  Expected ~11 items, got {len(data['items'])}")
        if missing:
            print(f"Missing: {', '.join(missing)}")
else:
    print("\n❌ ERROR:", data.get('error', 'No items returned'))

print("\n📋 Expected items:")
print("1. CHEETOS CRUNCHY - $5.79")
print("2. BELVITA BREAKFAST - $4.99")
print("3. LUC CHESE 4 BLEND - $2.69")
print("4. SIMPLY ORANGE - $8.49")
print("5. SIG GOLD POTATOES - $5.99")
print("6. ICEBERG LETTUCE - $2.99")
print("7. LEMONS - $1.38")
print("8. ZUCCHINI SQUASH - $1.84")
print("9. GARLIC BULK - $1.18")
print("10. GINGER ROOT - $2.07")
print("11. ONIONS GREEN ORG - $1.79")
