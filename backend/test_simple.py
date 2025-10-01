#!/usr/bin/env python3
import json
import requests

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# TEST 1: Without ORG prefix
ocr_text1 = """COSTCO
1599844 STRAWBERRIES
6.99 E"""

# TEST 2: Different code
ocr_text2 = """COSTCO
1234567 STRAWBERRIES
6.99 E"""

# TEST 3: BANANAS works
ocr_text3 = """COSTCO
9652107 BANANAS
2.42 E"""

for test_num, ocr_text in enumerate([ocr_text1, ocr_text2, ocr_text3], 1):
    payload = {"ocr_text": ocr_text, "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"}
    response = requests.post(url, headers=headers, json=payload)
    data = response.json()

    print(f"TEST {test_num}: {ocr_text.split(chr(10))[1]} → ", end="")
    if data.get('items'):
        print(f"✅ {data['items'][0]['parsed_name']}")
    else:
        print(f"❌ NO ITEMS")
