#!/usr/bin/env python3
"""
Test script for Supabase Edge Function receipt parsing
Verifies the complete flow from OCR text to Fix Queue
"""

import asyncio
import json
import hashlib
from datetime import datetime
from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://dyevpemrrlmbhifhqiwx.supabase.co')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY')

# Test receipt (Kroger format)
TEST_RECEIPT = """
KROGER
123 MAIN ST
ATLANTA GA 30301
(404) 555-0123

GROCERY

MILK 2% GAL          3.99
BREAD WHEAT         2.49
EGGS LARGE DOZ      4.99
CHICKEN BREAST      8.67
  2.45 LB @ 3.54/LB
BANANAS             1.87
  3.12 LB @ 0.59/LB
CHEESE CHEDDAR      5.99
YOGURT GREEK 4PK    4.49

SUBTOTAL           32.49
TAX                 2.28
TOTAL              34.77

CASH               40.00
CHANGE              5.23

Thank you for shopping!
01/15/25 14:32
"""


async def test_edge_function():
    """Test the parse-receipt Edge Function"""

    if not SUPABASE_ANON_KEY:
        print("❌ SUPABASE_ANON_KEY not found in environment")
        print("Please set it in your .env file or environment variables")
        return

    # Initialize Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    # Sign in (you'll need to create a test user first)
    try:
        # Try to sign in with test credentials
        auth_response = supabase.auth.sign_in_with_password({
            "email": "test@example.com",
            "password": "testpassword123"
        })
        print(f"✅ Signed in as: {auth_response.user.email}")
    except Exception as e:
        print(f"⚠️  Auth failed: {e}")
        print("Creating a test user...")
        try:
            auth_response = supabase.auth.sign_up({
                "email": "test@example.com",
                "password": "testpassword123"
            })
            print(f"✅ Created and signed in as: {auth_response.user.email}")
        except Exception as e2:
            print(f"❌ Could not create user: {e2}")
            return

    # Get or create household
    user_id = auth_response.user.id

    # Check if user has a household
    household_response = supabase.table('household_members').select('household_id').eq('user_id', user_id).execute()

    if household_response.data:
        household_id = household_response.data[0]['household_id']
        print(f"✅ Found household: {household_id}")
    else:
        # Create household and membership
        print("Creating household...")

        # Create profile first if it doesn't exist
        profile_response = supabase.table('profiles').upsert({
            'id': user_id,
            'email': 'test@example.com',
            'display_name': 'Test User'
        }).execute()

        # Create household
        household_response = supabase.table('households').insert({
            'name': 'Test Household',
            'created_by': user_id
        }).execute()
        household_id = household_response.data[0]['id']

        # Add user to household
        member_response = supabase.table('household_members').insert({
            'household_id': household_id,
            'user_id': user_id,
            'role': 'owner'
        }).execute()

        print(f"✅ Created household: {household_id}")

    # Calculate content hash
    content_hash = hashlib.sha256(TEST_RECEIPT.encode()).hexdigest()[:16]

    print("\n" + "="*50)
    print("TESTING EDGE FUNCTION")
    print("="*50)

    # Prepare request data
    request_data = {
        'ocr_text': TEST_RECEIPT,
        'content_hash': content_hash,
        'household_id': household_id,
        'ocr_confidence': 0.85,
        'use_gemini': False  # Test heuristics first
    }

    print(f"\nRequest data:")
    print(f"  - OCR text length: {len(TEST_RECEIPT)} chars")
    print(f"  - Content hash: {content_hash}")
    print(f"  - Household ID: {household_id}")
    print(f"  - Force Gemini: No (testing heuristics)")

    # Call Edge Function
    print("\n🚀 Calling Edge Function...")
    start_time = datetime.now()

    try:
        response = supabase.functions.invoke(
            'parse-receipt',
            invoke_options={'body': request_data}
        )

        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"✅ Response received in {elapsed:.2f} seconds")

        # Parse response
        if response:
            result = response

            print("\n" + "="*50)
            print("RESULTS")
            print("="*50)

            if 'success' in result and result['success']:
                print(f"✅ Parsing successful!")

                if 'receipt' in result:
                    receipt = result['receipt']
                    print(f"\n📄 Receipt:")
                    print(f"  - ID: {receipt.get('id')}")
                    print(f"  - Store: {receipt.get('store_name')}")
                    print(f"  - Date: {receipt.get('receipt_date')}")
                    print(f"  - Total: ${receipt.get('total_amount_cents', 0) / 100:.2f}")
                    print(f"  - Status: {receipt.get('status')}")

                if 'items' in result:
                    items = result['items']
                    print(f"\n📦 Fix Queue Items: {len(items)}")
                    for item in items[:5]:  # Show first 5
                        price = item.get('price_cents', 0) / 100 if item.get('price_cents') else 0
                        print(f"  - {item.get('parsed_name')}: ${price:.2f} (conf: {item.get('confidence', 0):.2f})")

                if 'path_taken' in result:
                    print(f"\n🔄 Processing path: {result['path_taken']}")

                if 'confidence' in result:
                    print(f"📊 Overall confidence: {result['confidence']:.2%}")

                if 'processing_time_ms' in result:
                    print(f"⏱️  Processing time: {result['processing_time_ms']}ms")

                if 'gemini_cost' in result:
                    print(f"💰 Gemini cost: ${result['gemini_cost']:.6f}")

            else:
                print(f"❌ Parsing failed")
                if 'error' in result:
                    print(f"Error: {result['error']}")
        else:
            print("❌ No response received")

    except Exception as e:
        print(f"❌ Edge Function call failed: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "="*50)
    print("TEST COMPLETE")
    print("="*50)

    # Test with Gemini enhancement
    print("\n🔄 Testing with Gemini enhancement...")
    request_data['use_gemini'] = True
    request_data['content_hash'] = content_hash + '_gemini'  # Different hash to avoid cache

    try:
        response = supabase.functions.invoke(
            'parse-receipt',
            invoke_options={'body': request_data}
        )

        if response and 'path_taken' in response:
            print(f"✅ Gemini test - Path: {response['path_taken']}")
            if 'gemini_cost' in response:
                print(f"💰 Gemini cost: ${response['gemini_cost']:.6f}")
    except Exception as e:
        print(f"⚠️  Gemini test failed (expected if GEMINI_API_KEY not set): {e}")


if __name__ == "__main__":
    asyncio.run(test_edge_function())