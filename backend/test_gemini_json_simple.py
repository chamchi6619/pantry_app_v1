#!/usr/bin/env python3
"""
Test Gemini JSON mode - loads .env properly
"""

import asyncio
import os
import sys
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.gemini_parser import GeminiReceiptParser

# Simple test receipt
TEST_RECEIPT = """COSTCO
96716 ORG SPINACH
4.99
9652107 BANANAS
2.42
TOTAL 7.41"""


async def main():
    print("🧪 Testing Gemini JSON Mode\n")

    # Check API key
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("❌ No GEMINI_API_KEY in environment")
        print("   Add to .env: GEMINI_API_KEY=your_key_here")
        return 1

    print(f"✅ API key found: {api_key[:15]}...")

    # Initialize parser
    parser = GeminiReceiptParser()

    if not parser.enabled:
        print("❌ Parser failed to initialize")
        return 1

    print("✅ Parser initialized\n")

    # Parse receipt
    print("📝 Parsing test receipt...")
    result = await parser.parse_receipt(TEST_RECEIPT)

    print(f"\n📊 Results:")
    print(f"   Items: {len(result.items)}")
    print(f"   Total: ${result.total or 0:.2f}")

    if result.items:
        print(f"\n   Items found:")
        for item in result.items:
            print(f"     • {item.item_name}: ${item.price:.2f}")
        print(f"\n✅ SUCCESS - JSON mode working!")
        return 0
    else:
        print(f"\n❌ FAILED - No items extracted")
        if result.processing_notes:
            print(f"   Notes: {result.processing_notes}")
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
