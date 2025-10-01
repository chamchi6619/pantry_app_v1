#!/usr/bin/env python3
"""
Test script for enhanced receipt parser
Verifies 75%+ success rate target
"""

import asyncio
import json
from datetime import datetime
from app.services.enhanced_heuristics import EnhancedHeuristicParser
from app.services.hybrid_parser import HybridReceiptParser

# Test receipts with varying complexity
TEST_RECEIPTS = [
    # Receipt 1: Simple Kroger receipt
    """
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
    """,

    # Receipt 2: Walmart format (price on separate line)
    """
    WALMART SUPERCENTER
    STORE #1234
    456 RETAIL DR
    DALLAS TX 75201

    GROCERY
    GV MILK 2%
    3.48 X
    GV BREAD WHITE
    1.98 X
    BANANAS
    2.34 O
    CHICKEN THIGHS
    7.89 X
    DORITOS CHIPS
    3.99 X
    COCA-COLA 12PK
    5.99 X

    SUBTOTAL         25.67
    TAX               1.80
    TOTAL            27.47

    DEBIT TEND       27.47
    CHANGE DUE        0.00

    12/20/24  15:45:22
    """,

    # Receipt 3: Target with RedCard savings
    """
    TARGET
    T-2468 ATLANTA MIDTOWN

    GROCERY

    ORGANIC MILK        5.49 T
    BREAD ARTISAN       3.99 T
    FREE RANGE EGGS     6.99 T
    GROUND TURKEY       5.99 T
    LETTUCE ROMAINE     2.99 F
    TOMATOES            3.49 F
    AVOCADOS 3CT        4.99 F

    SUBTOTAL           33.93
    T = TAX   6.5%      1.10
    TOTAL              35.03

    RedCard 5% Savings -1.75

    TOTAL              33.28

    REDcard ****1234   33.28

    01/18/25  09:23 AM
    """,

    # Receipt 4: Costco with item codes
    """
    COSTCO WHOLESALE
    MEMBERSHIP 123456789

    123456 MILK 2GAL PACK     7.99 E
    234567 BREAD ORGANIC 2PK   5.99 E
    345678 EGGS 5 DOZEN       12.99 E
    456789 CHICKEN ROTISSERIE  4.99 E
    567890 SALMON ATLANTIC    24.99 E
    678901 PAPER TOWELS 12PK  19.99 E

    SUBTOTAL                  76.94
    TAX                        2.00
    TOTAL                     78.94

    CASH                     100.00
    CHANGE                    21.06

    01/10/25  11:15
    """,

    # Receipt 5: Poor OCR quality (intentional errors)
    """
    KR0GER
    l23 MA1N 5T

    M1LK 2% GAL         3,99
    8READ WHEAT        2.49
    EGG5 LARGE D0Z     4.99
    CH1CKEN 8REAST     8.67
    BANAN4S            l.87
    CHEE5E CHEDD4R     5.99
    Y0GURT GREEK       4.49

    5UBTOTAL          32.49
    T4X                2.28
    T0TAL             34.77

    0l/l5/25  l4:32
    """,

    # Receipt 6: Complex receipt with coupons
    """
    SAFEWAY
    STORE 2345

    DAIRY
    MILK ORGANIC 1GAL    5.99
    - MFR COUPON        -1.00
    YOGURT VANILLA 6PK   4.49
    BUTTER UNSALTED      4.99

    MEAT
    BEEF GROUND 80/20    7.99
      2.01 LB @ 3.98/LB
    CHICKEN WINGS        9.99

    PRODUCE
    APPLES GALA          3.87
      3.45 LB @ 1.12/LB
    BROCCOLI CROWNS      2.99

    SUBTOTAL            38.34
    CLUB SAVINGS        -3.50
    COUPON SAVINGS      -1.00

    NEW SUBTOTAL        33.84
    TAX                  2.37
    TOTAL               36.21

    VISA ****5678       36.21

    YOU SAVED $4.50!
    02/01/25  16:45
    """
]


async def test_parser():
    """Test the enhanced parser"""
    heuristic_parser = EnhancedHeuristicParser()
    hybrid_parser = HybridReceiptParser()

    results = []
    print("\n" + "="*80)
    print("ENHANCED RECEIPT PARSER TEST")
    print("="*80)

    for i, receipt_text in enumerate(TEST_RECEIPTS, 1):
        print(f"\n{'='*40}")
        print(f"Testing Receipt #{i}")
        print(f"{'='*40}")

        # Test heuristic parser
        start = datetime.now()
        result = await heuristic_parser.parse(receipt_text)
        elapsed_ms = int((datetime.now() - start).total_seconds() * 1000)

        # Extract key metrics
        items_found = len(result.items)
        items_with_price = sum(1 for item in result.items if item.price_cents > 0)

        print(f"Store: {result.merchant or 'Not found'}")
        print(f"Date: {result.date or 'Not found'}")
        print(f"Total: ${result.total:.2f}")
        print(f"Items: {items_found} total, {items_with_price} with prices")
        print(f"Confidence: {result.confidence:.2%}")
        print(f"Reconciliation: {'✓ PASS' if result.reconciliation_ok else '✗ FAIL'}")
        print(f"Processing: {elapsed_ms}ms")
        print(f"Needs Gemini: {'Yes' if result.should_use_gemini else 'No'}")

        # Show items
        if result.items:
            print("\nItems found:")
            for item in result.items[:5]:  # Show first 5
                print(f"  - {item.item_name}: ${item.price:.2f} (conf: {item.confidence:.2f})")
            if len(result.items) > 5:
                print(f"  ... and {len(result.items) - 5} more")

        # Track results
        results.append({
            'receipt': i,
            'merchant_found': result.merchant is not None,
            'date_found': result.date is not None,
            'total_found': result.total_cents > 0,
            'items_found': items_found,
            'items_with_price': items_with_price,
            'confidence': result.confidence,
            'reconciliation': result.reconciliation_ok,
            'needs_gemini': result.should_use_gemini,
            'processing_ms': elapsed_ms
        })

    # Calculate overall statistics
    print("\n" + "="*80)
    print("OVERALL RESULTS")
    print("="*80)

    total_receipts = len(results)
    successful_parse = sum(1 for r in results if r['confidence'] >= 0.7 and not r['needs_gemini'])
    avg_confidence = sum(r['confidence'] for r in results) / total_receipts
    avg_items = sum(r['items_with_price'] for r in results) / total_receipts
    avg_processing = sum(r['processing_ms'] for r in results) / total_receipts
    reconciliation_pass = sum(1 for r in results if r['reconciliation'])

    print(f"\nSuccess Rate: {successful_parse}/{total_receipts} ({successful_parse/total_receipts:.1%})")
    print(f"Average Confidence: {avg_confidence:.1%}")
    print(f"Average Items Found: {avg_items:.1f}")
    print(f"Reconciliation Pass Rate: {reconciliation_pass}/{total_receipts} ({reconciliation_pass/total_receipts:.1%})")
    print(f"Average Processing Time: {avg_processing:.0f}ms")

    # Gemini usage
    gemini_needed = sum(1 for r in results if r['needs_gemini'])
    print(f"\nGemini Needed: {gemini_needed}/{total_receipts} ({gemini_needed/total_receipts:.1%})")
    print(f"Heuristics Only: {total_receipts - gemini_needed}/{total_receipts} ({(total_receipts - gemini_needed)/total_receipts:.1%})")

    # Target check
    target_success_rate = 0.75
    actual_success_rate = (total_receipts - gemini_needed) / total_receipts

    print(f"\n{'='*40}")
    if actual_success_rate >= target_success_rate:
        print(f"✅ TARGET MET: {actual_success_rate:.1%} >= {target_success_rate:.1%}")
    else:
        print(f"❌ TARGET MISSED: {actual_success_rate:.1%} < {target_success_rate:.1%}")
    print(f"{'='*40}")

    # Cost estimate
    estimated_monthly_receipts = 1000
    gemini_rate = gemini_needed / total_receipts
    estimated_gemini_calls = estimated_monthly_receipts * gemini_rate
    estimated_cost = min(500, estimated_gemini_calls) * 0 + max(0, estimated_gemini_calls - 500) * 0.00004

    print(f"\nCost Projection (1000 receipts/month):")
    print(f"  Gemini calls: {estimated_gemini_calls:.0f}")
    print(f"  Estimated cost: ${estimated_cost:.2f}")

    return results


if __name__ == "__main__":
    results = asyncio.run(test_parser())