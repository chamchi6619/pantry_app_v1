#!/usr/bin/env python3
"""
Test Gemini JSON mode with real receipt examples
"""

import asyncio
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.gemini_parser import GeminiReceiptParser

# Test receipts
COSTCO_RECEIPT = """COSTCO WHOLESALE
123 MAIN ST
ATLANTA GA 30301

E 96716 ORG SPINACH
4.99 E
9652107 BANANAS
2.42 E
1599844 ORG STRAWBERRIES
6.99 E

SUBTOTAL     14.40
TAX           1.01
TOTAL        15.41"""

SAFEWAY_RECEIPT = """SAFEWAY
456 ELM ST
ATLANTA GA 30302

3450015192
LND 0 LKS BTR HF S
6.49
6.49 S

74236521685
WHP CREAM
7.49
7.49 S

DELI
3114237925 BELGIOIOSO AMERICA
9.49 S

22189
DSPSBL BAG CHARGE
0.10

SUBTOTAL     23.57
TAX           1.65
TOTAL        25.22"""

WALMART_RECEIPT = """WALMART
789 OAK AVE
ATLANTA GA 30303

GV MLK 2% GAL         3.99
BREAD WHEAT          2.49
EGGS LARGE DOZ       4.99
CHKN BRST BNLS       8.99
GRND BF 80/20        6.99

SUBTOTAL           27.45
TAX                 1.92
TOTAL              29.37"""


async def test_receipt(name: str, ocr_text: str):
    """Test a single receipt"""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print(f"{'='*60}")

    parser = GeminiReceiptParser()

    if not parser.enabled:
        print("❌ Gemini parser not enabled. Check GEMINI_API_KEY")
        return False

    print(f"✅ Parser initialized with model")

    # Parse receipt
    result = await parser.parse_receipt(ocr_text)

    # Display results
    print(f"\n📊 Results:")
    print(f"  Merchant: {result.merchant or 'N/A'}")
    print(f"  Date: {result.date or 'N/A'}")
    print(f"  Total: ${result.total or 0:.2f}")
    print(f"  Subtotal: ${result.subtotal or 0:.2f}")
    print(f"  Tax: ${result.tax or 0:.2f}")
    print(f"  Items: {len(result.items)}")
    print(f"  Confidence: {result.confidence:.2%}")

    if result.items:
        print(f"\n📝 Items:")
        items_total = 0
        for i, item in enumerate(result.items, 1):
            print(f"  {i}. {item.item_name:40} ${item.price:.2f}")
            items_total += item.price

        print(f"\n💰 Items Total: ${items_total:.2f}")

        if result.total:
            diff = abs(items_total - result.total)
            match_ratio = items_total / result.total if result.total > 0 else 0
            print(f"   Receipt Total: ${result.total:.2f}")
            print(f"   Difference: ${diff:.2f}")
            print(f"   Match: {match_ratio:.1%}")

            if match_ratio > 0.95:
                print(f"   ✅ EXCELLENT MATCH")
            elif match_ratio > 0.85:
                print(f"   ⚠️  Good match (some items may be missing)")
            else:
                print(f"   ❌ Poor match (many items missing)")
    else:
        print(f"\n❌ No items extracted!")

    if result.processing_notes:
        print(f"\n📋 Notes: {result.processing_notes}")

    # Calculate cost
    cost = parser.estimate_cost(len(ocr_text))
    print(f"\n💵 Estimated cost: ${cost:.6f} ({cost * 100000:.3f}¢ per 1000)")

    return len(result.items) > 0


async def main():
    """Test all receipts"""
    print("🧪 Testing Gemini JSON Mode")
    print(f"Python: {sys.version}")
    print(f"API Key: {'✅ Set' if os.getenv('GEMINI_API_KEY') else '❌ Missing'}")

    results = {}

    # Test each receipt
    results['Costco'] = await test_receipt('COSTCO (Simple)', COSTCO_RECEIPT)
    results['Safeway'] = await test_receipt('SAFEWAY (Complex)', SAFEWAY_RECEIPT)
    results['Walmart'] = await test_receipt('WALMART (Abbreviations)', WALMART_RECEIPT)

    # Summary
    print(f"\n\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")

    for name, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {name:20} {status}")

    total = len(results)
    passed = sum(results.values())
    print(f"\n  Total: {passed}/{total} passed ({passed/total:.0%})")

    if passed == total:
        print(f"\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  Some tests failed")
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
