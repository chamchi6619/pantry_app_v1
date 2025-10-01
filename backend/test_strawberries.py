#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# MINIMAL TEST - Just the 3 items around STRAWBERRIES
ocr_text = """COSTCO WHOLESALE
9652107 BANANAS
2.42 E
1599844 ORG STRAWBERRIES
6.99 E
1234567 KS ALMONDS
14.99 E
SUBTOTAL 24.40"""

payload = {
    "ocr_text": ocr_text,
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
}

print("=" * 70)
print("🔍 DEBUG TEST - STRAWBERRIES ISSUE")
print("=" * 70)

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"\n✅ Success: {data.get('success', False)}")
print(f"📦 Items: {len(data.get('items', []))}/3")

if data.get('items'):
    total = sum(item['price_cents'] for item in data['items']) / 100
    print(f"💵 Total: ${total:.2f} (Expected: $24.40)")

    print(f"\n{'Item':<45} {'Price':>10}")
    print("=" * 70)
    for i, item in enumerate(data['items'], 1):
        print(f"{i:2}. {item['parsed_name']:<42} ${item['price_cents']/100:6.2f}")

    names = [item['parsed_name'].upper() for item in data['items']]
    print("\n" + "=" * 70)
    print("CHECKS:")
    print("=" * 70)
    print(f"  {'✅' if 'BANANAS' in str(names) else '❌'} BANANAS found")
    print(f"  {'✅' if 'STRAWBERRIES' in str(names) else '❌'} STRAWBERRIES found")
    print(f"  {'✅' if 'ALMONDS' in str(names) else '❌'} ALMONDS found")

    if len(data['items']) == 3 and abs(total - 24.40) < 0.01:
        print("\n🎉 ALL 3 ITEMS EXTRACTED!")
    else:
        print(f"\n⚠️  Missing: {3 - len(data['items'])} items")
else:
    print("\n❌ ERROR:", data.get('error', 'No items returned'))
