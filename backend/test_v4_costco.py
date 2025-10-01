#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# Modified Costco receipt to avoid cache
ocr_text = """WHOLESALE
Arvada #676
96716 ORG SPINACH
3.79 E
9211 ORG YEL ONIO
5.99 E
6111 ORG FUJI APPL
7.59 E
38499 KS PURE OLIVE
19.99 A
9617 ORG ROMA TOMA
6.99 E
91319 ORG RED BELL
7.99 E
96253 ORG BROCCOLI
4.99 E
96716 ORG BABY CARR
5.49 E
93677 ORG CUCUMBERS
5.99 E
93486 ORG CELERY HE
4.99 E
94011 ORG BANANA
3.99 E
94553 ORG GALA APPL
7.99 E
96619 ORG GRAPE TOM
5.99 E
92739 ORG STRAWBERR
8.99 E
96253 ORG CAULIFLOW
5.99 E
93166 ORG MINI PEPP
6.99 E
SUBTOTAL 206.03"""

payload = {
    "ocr_text": ocr_text,
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
}

print("🧪 Testing Universal Parser v4 with Costco Receipt")
print("=" * 60)

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"✅ Success: {data.get('success', False)}")
print(f"🏪 Store: {data.get('store', 'N/A')}")
print(f"📊 Method: {data.get('method', 'N/A')}")
print(f"📈 Confidence: {data.get('confidence', 0):.2f}")
print(f"📦 Items extracted: {len(data.get('items', []))}/16")

if data.get('items'):
    total = sum(item['price_cents'] for item in data['items']) / 100
    print(f"\n💵 Subtotal: ${total:.2f} (Expected: $206.03)")
    match = "✅ PERFECT" if abs(total - 206.03) < 0.01 else "❌ MISMATCH"
    print(f"   Match: {match}")

    print(f"\n--- All {len(data['items'])} Items ---")
    for i, item in enumerate(data['items'], 1):
        print(f"{i:2}. {item['parsed_name']:35} ${item['price_cents']/100:6.2f}")

    print("\n" + "=" * 60)
    if len(data['items']) == 16 and abs(total - 206.03) < 0.01:
        print("🎉 ALL TESTS PASSED!")
    else:
        print(f"⚠️  Expected 16 items, got {len(data['items'])}")
else:
    print("\n❌ ERROR:", data.get('error', 'No items returned'))
