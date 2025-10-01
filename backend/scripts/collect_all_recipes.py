#!/usr/bin/env python3
"""
Unified Recipe Collector - Fetches ALL recipes from working sources.
Skips sources that require API keys if not configured.
"""
import os
import sys
import json
import sqlite3
import time
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import collectors
from scripts.nhs_collector import NHSCollector
from scripts.myplate_collector import MyPlateCollector
from scripts.smart_recipe_collector import SmartRecipeCollector

def run_collection():
    """Run ALL recipe collectors and fetch ALL available recipes."""
    print("=" * 70)
    print("🌍 UNIFIED RECIPE COLLECTOR - FULL COLLECTION")
    print("=" * 70)
    print("This will fetch ALL available recipes from:")
    print("  1. TheMealDB API (Free, no limit)")
    print("  2. NHS Healthier Families (ALL recipes)")
    print("  3. USDA MyPlate Kitchen (ALL recipes)")
    print("  4. MFDS Korea (Skipped if no API key)")
    print("=" * 70)

    # Database path
    if os.name == 'nt':
        db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
    else:
        db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    total_before = 0
    total_after = 0

    # Get initial count
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM recipes")
        total_before = cursor.fetchone()[0]
        conn.close()
    except:
        pass

    print(f"\n📊 Starting with {total_before} recipes in database\n")

    # 1. Run TheMealDB and MFDS (if key available) via smart collector
    print("─" * 70)
    print("PHASE 1: API-BASED SOURCES")
    print("─" * 70)

    try:
        print("\n🍴 Running Smart Recipe Collector (TheMealDB + MFDS if available)...")
        collector = SmartRecipeCollector()
        collector.run()
        print("✅ Smart collector completed")
    except Exception as e:
        print(f"⚠️  Smart collector error: {str(e)[:100]}")

    time.sleep(2)

    # 2. Run NHS collector for ALL recipes
    print("\n" + "─" * 70)
    print("PHASE 2: NHS HEALTHIER FAMILIES")
    print("─" * 70)

    try:
        print("\n🇬🇧 Running NHS Collector (ALL recipes)...")
        nhs = NHSCollector()
        recipes = nhs.collect_nhs_recipes(limit=None)  # Get ALL recipes
        if recipes:
            nhs.save_to_database(recipes)
        print("✅ NHS collector completed")
    except Exception as e:
        print(f"⚠️  NHS collector error: {str(e)[:100]}")

    time.sleep(2)

    # 3. Run MyPlate collector for ALL recipes
    print("\n" + "─" * 70)
    print("PHASE 3: USDA MYPLATE KITCHEN")
    print("─" * 70)

    try:
        print("\n🇺🇸 Running MyPlate Collector (ALL recipes)...")
        myplate = MyPlateCollector()
        recipes = myplate.collect_myplate_recipes(limit=None)  # Get ALL recipes
        if recipes:
            myplate.save_to_database(recipes)
        print("✅ MyPlate collector completed")
    except Exception as e:
        print(f"⚠️  MyPlate collector error: {str(e)[:100]}")

    # Get final count and breakdown
    print("\n" + "=" * 70)
    print("📊 COLLECTION SUMMARY")
    print("=" * 70)

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Total count
        cursor.execute("SELECT COUNT(*) FROM recipes")
        total_after = cursor.fetchone()[0]

        # Breakdown by source
        cursor.execute("""
            SELECT source_key, COUNT(*) as count
            FROM recipes
            GROUP BY source_key
            ORDER BY count DESC
        """)
        sources = cursor.fetchall()

        print(f"\n📚 Total recipes: {total_after} (Added {total_after - total_before} new)")
        print("\nBreakdown by source:")
        for source, count in sources:
            emoji = {
                'themealdb': '🍴',
                'nhs_healthier_families': '🇬🇧',
                'myplate_kitchen': '🇺🇸',
                'mfds_korea': '🇰🇷',
                'manual_dataset': '📝'
            }.get(source, '📋')
            print(f"  {emoji} {source}: {count} recipes")

        # Category distribution
        cursor.execute("""
            SELECT categories, COUNT(*) as count
            FROM recipes
            WHERE categories IS NOT NULL AND categories != ''
            GROUP BY categories
            ORDER BY count DESC
            LIMIT 10
        """)
        categories = cursor.fetchall()

        if categories:
            print("\nTop 10 categories:")
            for cat, count in categories:
                print(f"  • {cat}: {count} recipes")

        conn.close()

    except Exception as e:
        print(f"Error getting statistics: {str(e)}")

    print("\n" + "=" * 70)
    print("✅ COLLECTION COMPLETE")
    print("=" * 70)

    if total_after < 1000:
        print("\n💡 To get more recipes:")
        print("  1. Register for MFDS Korea API key (2000+ recipes):")
        print("     https://www.foodsafetykorea.go.kr/api/openApiInfo.do")
        print("  2. Add the key to .env as MFDS_API_KEY=your_key_here")
        print("  3. Run this script again")

    print("\n🎉 Your recipe database is ready to use!")
    print(f"   Total recipes available: {total_after}")

    return total_after

if __name__ == "__main__":
    # Check if running from Windows
    if os.name != 'nt':
        print("⚠️  WARNING: Best results when run from Windows PowerShell")
        print("   WSL2 may have network issues with some sites")
        print()

    # Run collection
    total = run_collection()

    if total == 0:
        print("\n❌ No recipes collected. Troubleshooting:")
        print("  1. Check your internet connection")
        print("  2. Try running from Windows PowerShell (not WSL)")
        print("  3. Check if sites are accessible in your browser")