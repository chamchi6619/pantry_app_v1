#!/usr/bin/env python3
import json, requests, time

url = "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-hybrid"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4",
    "Content-Type": "application/json"
}

# Test different codes for STRAWBERRIES
tests = [
    ("Code: 1599844", f"""COSTCO {int(time.time())}
9652107 BANANAS
2.42 E
1599844 ORG STRAWBERRIES
6.99 E"""),

    ("Code: 1234567", f"""COSTCO {int(time.time())}
9652107 BANANAS
2.42 E
1234567 ORG STRAWBERRIES
6.99 E"""),

    ("Code: 999999", f"""COSTCO {int(time.time())}
9652107 BANANAS
2.42 E
999999 ORG STRAWBERRIES
6.99 E"""),
]

for name, ocr_text in tests:
    payload = {"ocr_text": ocr_text, "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"}
    data = requests.post(url, headers=headers, json=payload).json()
    items = [item['parsed_name'] for item in data.get('items', [])]
    print(f"{name:15} → {len(items)}/2, STRAWBERRIES: {'✅' if any('STRAWBERRIES' in i for i in items) else '❌'}")
