#!/usr/bin/env python3
"""
Test Safeway complex receipt that failed with heuristics
"""

import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).parent))

from app.services.gemini_parser import GeminiReceiptParser

# Complex Safeway receipt with multiple patterns
SAFEWAY_RECEIPT = """SAFEWAY
456 ELM ST

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
MISCELLANEOUS
22189
9.49 9.49 S

DSPSBL BAG CHARGE
0.10

SUBTOTAL     23.57
TAX           1.65
TOTAL        25.22"""


async def main():
    print("🧪 Testing Complex Safeway Receipt (Previous: 74% accuracy)\n")

    parser = GeminiReceiptParser()
    if not parser.enabled:
        print("❌ Parser not available")
        return 1

    print("📝 Parsing...")
    result = await parser.parse_receipt(SAFEWAY_RECEIPT)

    print(f"\n📊 Results:")
    print(f"   Merchant: {result.merchant or 'N/A'}")
    print(f"   Total: ${result.total or 0:.2f}")
    print(f"   Items extracted: {len(result.items)}")

    # Calculate items total
    items_total = sum(item.price for item in result.items)
    expected_total = 23.57  # Subtotal from receipt

    print(f"\n💰 Financial Check:")
    print(f"   Items total: ${items_total:.2f}")
    print(f"   Expected subtotal: ${expected_total:.2f}")
    print(f"   Difference: ${abs(items_total - expected_total):.2f}")

    match_ratio = items_total / expected_total if expected_total > 0 else 0
    print(f"   Match ratio: {match_ratio:.1%}")

    print(f"\n📝 Items:")
    for i, item in enumerate(result.items, 1):
        print(f"   {i}. {item.item_name:40} ${item.price:.2f}")

    # Expected items
    expected_items = {
        "LND 0 LKS BTR HF S": 6.49,
        "WHP CREAM": 7.49,
        "BELGIOIOSO AMERICA": 9.49,
        "DSPSBL BAG CHARGE": 0.10
    }

    print(f"\n✅ Expected Items Check:")
    found_count = 0
    for name, price in expected_items.items():
        found = any(name.lower() in item.item_name.lower() or
                   item.item_name.lower() in name.lower()
                   for item in result.items)
        status = "✅" if found else "❌"
        print(f"   {status} {name}: ${price:.2f}")
        if found:
            found_count += 1

    print(f"\n{'='*60}")
    if match_ratio > 0.95 and found_count >= 3:
        print(f"🎉 SUCCESS! {found_count}/{len(expected_items)} items found, {match_ratio:.0%} match")
        print(f"   Previous heuristics: 74% accuracy")
        print(f"   Gemini JSON mode: {match_ratio:.0%} accuracy")
        return 0
    elif match_ratio > 0.85:
        print(f"⚠️  PARTIAL SUCCESS: {match_ratio:.0%} match, {found_count}/{len(expected_items)} items")
        return 0
    else:
        print(f"❌ FAILED: Only {match_ratio:.0%} match")
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
