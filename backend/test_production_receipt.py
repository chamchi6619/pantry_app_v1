#!/usr/bin/env python3
"""
Production Receipt OCR Test Suite
Tests the complete system with production hardening applied
"""

import asyncio
import json
import time
from datetime import datetime
from typing import Dict, Any
import httpx
from supabase import create_client, Client

# Test configuration
SUPABASE_URL = "YOUR_SUPABASE_URL"
SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "testPassword123!"

class ProductionReceiptTester:
    def __init__(self):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        self.session = None
        self.household_id = None
        self.results = []

    async def setup(self):
        """Setup test environment"""
        print("🚀 Setting up test environment...")

        # Sign in or create test user
        try:
            auth = self.supabase.auth.sign_in_with_password({
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            self.session = auth.session
        except:
            # Create user if doesn't exist
            auth = self.supabase.auth.sign_up({
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            self.session = auth.session

        # Get or create household
        result = self.supabase.table('households').select("*").execute()
        if result.data:
            self.household_id = result.data[0]['id']
        else:
            result = self.supabase.table('households').insert({
                "name": "Test Household",
                "type": "family"
            }).execute()
            self.household_id = result.data[0]['id']

        print(f"✅ Setup complete. Household ID: {self.household_id}")

    def test_case(self, name: str):
        """Decorator for test cases"""
        def decorator(func):
            async def wrapper(*args, **kwargs):
                start = time.time()
                try:
                    await func(*args, **kwargs)
                    duration = time.time() - start
                    self.results.append({
                        "test": name,
                        "status": "PASS",
                        "duration": f"{duration:.2f}s"
                    })
                    print(f"✅ {name}: PASS ({duration:.2f}s)")
                except Exception as e:
                    duration = time.time() - start
                    self.results.append({
                        "test": name,
                        "status": "FAIL",
                        "error": str(e),
                        "duration": f"{duration:.2f}s"
                    })
                    print(f"❌ {name}: FAIL - {e}")
            return wrapper
        return decorator

    @test_case("Input Validation")
    async def test_input_validation(self):
        """Test Zod validation rejects invalid inputs"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        # Test missing auth
        async with httpx.AsyncClient() as client:
            response = await client.post(edge_url, json={
                "ocr_text": "test",
                "household_id": "invalid"
            })
            assert response.status_code == 401
            assert response.json()["error"]["code"] == "AUTH_MISSING"

        # Test invalid household ID format
        async with httpx.AsyncClient() as client:
            response = await client.post(
                edge_url,
                headers={"Authorization": f"Bearer {self.session.access_token}"},
                json={
                    "ocr_text": "Valid receipt text",
                    "household_id": "not-a-uuid"
                }
            )
            assert response.status_code == 400
            assert response.json()["error"]["code"] == "INVALID_INPUT"

        # Test text too short
        async with httpx.AsyncClient() as client:
            response = await client.post(
                edge_url,
                headers={"Authorization": f"Bearer {self.session.access_token}"},
                json={
                    "ocr_text": "short",
                    "household_id": self.household_id
                }
            )
            assert response.status_code == 400
            data = response.json()
            assert "validation_errors" in data["error"]

    @test_case("Error Envelope Format")
    async def test_error_envelope(self):
        """Test error responses follow standard format"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        async with httpx.AsyncClient() as client:
            response = await client.post(edge_url, json={})

            # Check error structure
            data = response.json()
            assert data["success"] == False
            assert "error" in data
            assert "code" in data["error"]
            assert "message" in data["error"]

            # Check error code header
            assert "X-Error-Code" in response.headers
            assert response.headers["X-Error-Code"] in [
                "INVALID_INPUT", "AUTH_MISSING", "AUTH_INVALID"
            ]

    @test_case("Correlation ID Tracking")
    async def test_correlation_id(self):
        """Test that correlation IDs are returned"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        receipt_text = """
        WALMART
        123 Main St
        2024-12-01

        Milk 2% Gallon      $3.99
        Bread Whole Wheat   $2.49
        Eggs Large Dozen    $4.99

        SUBTOTAL           $11.47
        TAX                 $0.92
        TOTAL             $12.39
        """

        async with httpx.AsyncClient() as client:
            response = await client.post(
                edge_url,
                headers={"Authorization": f"Bearer {self.session.access_token}"},
                json={
                    "ocr_text": receipt_text,
                    "household_id": self.household_id
                }
            )

            data = response.json()
            assert "cid" in data  # Correlation ID in response meta
            assert len(data["cid"]) == 36  # UUID format

    @test_case("Rate Limiting - OCR")
    async def test_rate_limiting_ocr(self):
        """Test distributed rate limiting for OCR"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        # Clear any existing rate limits for clean test
        self.supabase.rpc('check_rate_limit', {
            'p_user_id': self.session.user.id,
            'p_endpoint': 'parse_receipt_ocr',
            'p_max_tokens': 5,  # Low limit for testing
            'p_refill_rate': 1,
            'p_tokens_requested': 0
        }).execute()

        receipt_text = "STORE\n2024-12-01\nItem $1.00\nTOTAL $1.00"

        # Make requests until rate limited
        async with httpx.AsyncClient() as client:
            limited = False
            for i in range(10):
                response = await client.post(
                    edge_url,
                    headers={"Authorization": f"Bearer {self.session.access_token}"},
                    json={
                        "ocr_text": receipt_text + f"\nRequest {i}",
                        "household_id": self.household_id
                    }
                )

                if response.status_code == 429:
                    data = response.json()
                    assert data["error"]["code"] == "RATE_LIMITED"
                    assert "retry_after_seconds" in data["error"]
                    limited = True
                    break

            assert limited, "Should have been rate limited after 5 requests"

    @test_case("Idempotency with Sanitized Hash")
    async def test_idempotency(self):
        """Test idempotency works with sanitized hashing"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        # Receipt with PII that should be sanitized
        receipt_with_pii = """
        WALMART
        Store #1234
        Manager: John Smith
        Phone: 555-123-4567

        2024-12-01 14:30

        Milk           $3.99
        Bread          $2.49

        Card: ****1234
        Auth: 567890

        TOTAL         $6.48
        """

        # First request
        async with httpx.AsyncClient() as client:
            response1 = await client.post(
                edge_url,
                headers={"Authorization": f"Bearer {self.session.access_token}"},
                json={
                    "ocr_text": receipt_with_pii,
                    "household_id": self.household_id
                }
            )

            assert response1.status_code == 200
            data1 = response1.json()
            receipt_id1 = data1["data"]["receipt_id"]

        # Second request with slightly different PII (should still match)
        receipt_different_pii = receipt_with_pii.replace("555-123-4567", "555-987-6543")

        async with httpx.AsyncClient() as client:
            response2 = await client.post(
                edge_url,
                headers={"Authorization": f"Bearer {self.session.access_token}"},
                json={
                    "ocr_text": receipt_different_pii,
                    "household_id": self.household_id
                }
            )

            assert response2.status_code == 200
            data2 = response2.json()
            receipt_id2 = data2["data"]["receipt_id"]

            # Should return same receipt (idempotent)
            assert receipt_id1 == receipt_id2
            assert data2["data"]["duplicate"] == True

    @test_case("Duplicate Item Detection")
    async def test_duplicate_items(self):
        """Test duplicate items are merged within receipts"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        receipt_with_duplicates = """
        TARGET
        2024-12-01

        Apples         $2.99
        Bananas        $1.49
        Apples         $2.99
        Milk           $3.99
        Bananas        $1.49

        TOTAL         $12.95
        """

        async with httpx.AsyncClient() as client:
            response = await client.post(
                edge_url,
                headers={"Authorization": f"Bearer {self.session.access_token}"},
                json={
                    "ocr_text": receipt_with_duplicates,
                    "household_id": self.household_id
                }
            )

            assert response.status_code == 200
            data = response.json()
            items = data["data"]["items"]

            # Should have merged duplicates
            item_names = [item["parsed_name"] for item in items]
            assert len(item_names) == len(set(item_names)), "Duplicates should be merged"

            # Check quantities were combined
            for item in items:
                if "Apples" in item["parsed_name"] or "Bananas" in item["parsed_name"]:
                    assert item["quantity"] == 2, f"Duplicate {item['parsed_name']} should have qty 2"

    @test_case("Heuristics Performance")
    async def test_heuristics_performance(self):
        """Test heuristics parser achieves target success rate"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        test_receipts = [
            # Walmart format
            """WALMART
            Store #5260 Arlington TX
            12/01/24 15:30

            DAIRY
            GTM MLK 2% GAL     3.68
            EGGS LG DOZ        4.98

            GROCERY
            BREAD WHL WHT      2.44
            PB CREAMY 18OZ     3.98

            SUBTOTAL          15.08
            TAX                1.21
            TOTAL             16.29""",

            # Target format
            """TARGET
            ARLINGTON SOUTH
            12/01/2024  3:45 PM

            GROCERY
            Market Pantry Milk  $3.99
            Wonder Bread        $2.49

            PRODUCE
            Bananas 2.5 lb @ $0.49/lb  $1.23

            Subtotal    $7.71
            Tax         $0.62
            Total       $8.33"""
        ]

        results = []
        async with httpx.AsyncClient() as client:
            for receipt in test_receipts:
                response = await client.post(
                    edge_url,
                    headers={"Authorization": f"Bearer {self.session.access_token}"},
                    json={
                        "ocr_text": receipt,
                        "household_id": self.household_id,
                        "use_gemini": False  # Force heuristics only
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    results.append({
                        "method": data["data"]["method"],
                        "confidence": data["data"]["confidence"],
                        "items": len(data["data"]["items"])
                    })

        # Check that heuristics handled these
        heuristic_results = [r for r in results if r["method"] == "heuristics"]
        assert len(heuristic_results) >= len(test_receipts) * 0.75, "Should handle 75%+ with heuristics"

        # Check confidence levels
        avg_confidence = sum(r["confidence"] for r in heuristic_results) / len(heuristic_results)
        assert avg_confidence >= 0.7, f"Average confidence {avg_confidence} should be >= 0.7"

    @test_case("RLS Policy Enforcement")
    async def test_rls_policies(self):
        """Test Row Level Security policies are enforced"""
        # Create a second user with different household
        other_user = self.supabase.auth.sign_up({
            "email": "other@example.com",
            "password": "otherPassword123!"
        })

        # Try to access first user's receipts with second user's token
        result = self.supabase.auth.sign_in_with_password({
            "email": "other@example.com",
            "password": "otherPassword123!"
        })
        other_session = result.session

        # Attempt to query first user's receipts
        other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        other_client.auth.set_session(other_session.access_token, other_session.refresh_token)

        result = other_client.table('receipts').select("*").eq('household_id', self.household_id).execute()

        # Should return empty (RLS blocks access)
        assert len(result.data) == 0, "RLS should prevent cross-household access"

    @test_case("Money Storage as Cents")
    async def test_money_as_cents(self):
        """Test all money is stored as cents (integers)"""
        edge_url = f"{SUPABASE_URL}/functions/v1/parse-receipt"

        receipt = """
        STORE
        2024-12-01

        Item A         $10.99
        Item B         $5.50
        Item C         $0.99

        SUBTOTAL      $17.48
        TAX            $1.40
        TOTAL         $18.88
        """

        async with httpx.AsyncClient() as client:
            response = await client.post(
                edge_url,
                headers={"Authorization": f"Bearer {self.session.access_token}"},
                json={
                    "ocr_text": receipt,
                    "household_id": self.household_id
                }
            )

            assert response.status_code == 200
            receipt_id = response.json()["data"]["receipt_id"]

        # Check database storage
        result = self.supabase.table('receipts').select("*").eq('id', receipt_id).single().execute()
        receipt_data = result.data

        # All money fields should be integers (cents)
        assert isinstance(receipt_data['total_amount_cents'], int)
        assert isinstance(receipt_data['tax_amount_cents'], int)
        assert isinstance(receipt_data['subtotal_amount_cents'], int)
        assert receipt_data['total_amount_cents'] == 1888  # $18.88 = 1888 cents

        # Check items
        items = self.supabase.table('receipt_fix_queue').select("*").eq('receipt_id', receipt_id).execute()
        for item in items.data:
            assert isinstance(item['price_cents'], int), f"Item {item['parsed_name']} price not in cents"

    async def run_all_tests(self):
        """Run all production tests"""
        print("\n" + "="*60)
        print("🧪 PRODUCTION RECEIPT OCR TEST SUITE")
        print("="*60 + "\n")

        await self.setup()

        # Run tests
        await self.test_input_validation()
        await self.test_error_envelope()
        await self.test_correlation_id()
        await self.test_rate_limiting_ocr()
        await self.test_idempotency()
        await self.test_duplicate_items()
        await self.test_heuristics_performance()
        await self.test_rls_policies()
        await self.test_money_as_cents()

        # Print results
        print("\n" + "="*60)
        print("📊 TEST RESULTS")
        print("="*60)

        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")

        for result in self.results:
            icon = "✅" if result["status"] == "PASS" else "❌"
            print(f"{icon} {result['test']}: {result['status']} ({result['duration']})")
            if result["status"] == "FAIL":
                print(f"   Error: {result.get('error', 'Unknown')}")

        print("\n" + "-"*60)
        print(f"Total: {len(self.results)} | Passed: {passed} | Failed: {failed}")
        print(f"Success Rate: {(passed/len(self.results)*100):.1f}%")

        if failed == 0:
            print("\n🎉 ALL TESTS PASSED! System is production-ready.")
        else:
            print(f"\n⚠️  {failed} tests failed. Review and fix before production.")

        return failed == 0

if __name__ == "__main__":
    tester = ProductionReceiptTester()
    success = asyncio.run(tester.run_all_tests())
    exit(0 if success else 1)