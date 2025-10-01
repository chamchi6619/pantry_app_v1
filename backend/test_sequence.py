#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# EXACT sequence from Costco receipt
import time
ocr_text = f"""COSTCO WHOLESALE
TEST-{int(time.time())}
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

print("🔍 EXACT SEQUENCE TEST WITH ORG PREFIX\n")

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print(f"Items found: {len(data.get('items', []))}/3\n")

if data.get('items'):
    for i, item in enumerate(data['items'], 1):
        print(f"{i}. {item['parsed_name']:<40} ${item['price_cents']/100:6.2f}")

    names = '|'.join([item['parsed_name'] for item in data['items']])
    print(f"\n{'✅' if 'BANANAS' in names else '❌'} BANANAS")
    print(f"{'✅' if 'STRAWBERRIES' in names else '❌ FAIL'} STRAWBERRIES")
    print(f"{'✅' if 'ALMONDS' in names else '❌'} ALMONDS")
