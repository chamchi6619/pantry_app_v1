#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# TEST: STRAWBERRIES in FIRST position
ocr_text = """COSTCO WHOLESALE
1599844 ORG STRAWBERRIES
6.99 E
9652107 BANANAS
2.42 E
SUBTOTAL 9.41"""

payload = {
    "ocr_text": ocr_text,
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
}

print("=" * 70)
print("🔍 TEST - STRAWBERRIES in FIRST POSITION")
print("=" * 70)

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"✅ Success: {data.get('success', False)}")
print(f"📦 Items: {len(data.get('items', []))}/2")

if data.get('items'):
    for i, item in enumerate(data['items'], 1):
        print(f"{i}. {item['parsed_name']} - ${item['price_cents']/100:.2f}")

    names = [item['parsed_name'].upper() for item in data['items']]
    print(f"\n{'✅' if 'STRAWBERRIES' in str(names) else '❌ FAIL:'} STRAWBERRIES {'found' if 'STRAWBERRIES' in str(names) else 'MISSING'}")
    print(f"{'✅' if 'BANANAS' in str(names) else '❌'} BANANAS found")
