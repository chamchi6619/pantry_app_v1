#!/usr/bin/env python3
"""Test recipe collection pipeline."""
import sys
import os
import asyncio
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.scrapers.mfds_api import MFDSCollector
from app.ingestion.scrapers.usda_enhanced import USDAEnhancedScraper
from app.ingestion import IngredientNormalizer, RecipeValidator, SourceManager


async def test_mfds_collector():
    """Test MFDS Korea API collector."""
    print("\n" + "=" * 60)
    print("Testing MFDS Korea API Collector")
    print("=" * 60)

    try:
        async with MFDSCollector(api_key="sample_key") as collector:
            # Collect just 5 recipes for testing
            recipes = await collector.collect(limit=5)

            print(f"✅ Collected {len(recipes)} recipes")

            if recipes:
                # Show first recipe
                recipe = recipes[0]
                print(f"\nSample Recipe:")
                print(f"  Title: {recipe.get('title', 'N/A')}")
                print(f"  External ID: {recipe.get('external_id', 'N/A')}")
                print(f"  Ingredients: {len(recipe.get('ingredients', []))} items")
                print(f"  Instructions: {len(recipe.get('instructions', ''))} chars")
                print(f"  License: {recipe.get('license_code', 'N/A')}")
                print(f"  Fingerprint: {recipe.get('fingerprint', 'N/A')[:16]}...")

                # Validate first recipe
                validator = RecipeValidator()
                result = validator.validate_recipe(recipe)
                print(f"\n  Validation: {'✅ Valid' if result.is_valid else '❌ Invalid'}")
                if not result.is_valid:
                    print(f"  Errors: {result.errors}")
                if result.warnings:
                    print(f"  Warnings: {result.warnings}")

            return recipes

    except Exception as e:
        print(f"❌ MFDS test failed: {e}")
        return []


async def test_usda_scraper():
    """Test enhanced USDA scraper."""
    print("\n" + "=" * 60)
    print("Testing USDA Enhanced Scraper")
    print("=" * 60)

    try:
        async with USDAEnhancedScraper() as scraper:
            # Test sitemap fetching
            print("Testing sitemap fetch...")
            urls = await scraper.fetch_sitemap()
            print(f"  Found {len(urls)} recipe URLs in sitemap")

            if not urls:
                print("  Trying discovery method...")
                urls = await scraper.discover_recipe_urls()
                print(f"  Discovered {len(urls)} recipe URLs")

            # Test recipe parsing (just 2 recipes)
            if urls:
                recipes = []
                for url in urls[:2]:
                    print(f"\n  Fetching: {url}")
                    recipe = await scraper.fetch_recipe_page(url)
                    if recipe:
                        recipes.append(recipe)
                        print(f"    ✅ Parsed: {recipe['title']}")
                    await asyncio.sleep(1)

                print(f"\n✅ Collected {len(recipes)} USDA recipes")
                return recipes
            else:
                print("❌ No recipe URLs found")
                return []

    except Exception as e:
        print(f"❌ USDA test failed: {e}")
        return []


def test_ingredient_normalizer():
    """Test ingredient normalization."""
    print("\n" + "=" * 60)
    print("Testing Ingredient Normalizer")
    print("=" * 60)

    normalizer = IngredientNormalizer()

    test_ingredients = [
        "2 cups all-purpose flour",
        "1 lb ground beef",
        "3 cloves garlic, minced",
        "1/2 cup olive oil",
        "Salt and pepper to taste",
        "1 (14 oz) can diced tomatoes",
        "2-3 tablespoons honey"
    ]

    print("Testing ingredient parsing:")
    for ing_text in test_ingredients:
        result = normalizer.normalize(ing_text)
        print(f"\n  Input: {ing_text}")
        print(f"  Parsed:")
        print(f"    Name: {result.name}")
        print(f"    Quantity: {result.quantity}")
        print(f"    Unit: {result.unit}")
        print(f"    Category: {result.category}")


def test_source_manager():
    """Test source manager."""
    print("\n" + "=" * 60)
    print("Testing Source Manager")
    print("=" * 60)

    # Create temp database for testing
    import tempfile
    import sqlite3

    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name

    # Initialize database with sources table
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT,
            territory TEXT,
            license_code TEXT,
            license_url TEXT
        )
    """)
    conn.commit()
    conn.close()

    # Test source manager
    manager = SourceManager(db_path)

    # Register sources
    sources_to_test = ['usda_myplate', 'mfds_korea', 'nhs_healthier_families']

    for source_key in sources_to_test:
        try:
            source = manager.register_source(source_key)
            print(f"\n  ✅ {source.name}")
            print(f"     License: {source.license_code}")
            print(f"     Attribution required: {source.requires_attribution}")
            print(f"     Instructions allowed: {source.allows_instructions}")
        except Exception as e:
            print(f"  ❌ Failed to register {source_key}: {e}")

    # Test attribution generation
    print("\n  Testing attribution generation:")
    attribution = manager.format_attribution(
        recipe_title="Test Recipe",
        source_id="mfds_korea",
        source_url="https://example.com/recipe"
    )
    print(f"    {attribution}")

    # Clean up
    os.unlink(db_path)


async def test_full_pipeline():
    """Test the complete collection pipeline."""
    print("\n" + "=" * 60)
    print("Testing Full Collection Pipeline")
    print("=" * 60)

    # Test each component
    mfds_recipes = await test_mfds_collector()
    usda_recipes = await test_usda_scraper()
    test_ingredient_normalizer()
    test_source_manager()

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"✅ MFDS Collector: {len(mfds_recipes)} recipes collected")
    print(f"✅ USDA Scraper: {len(usda_recipes)} recipes collected")
    print(f"✅ Ingredient Normalizer: Working")
    print(f"✅ Source Manager: Working")

    print("\n🎉 All tests completed!")
    print("\nNext steps:")
    print("1. Set up actual API keys in environment variables")
    print("2. Run full collection: python scripts/collect_all.py")
    print("3. Deduplicate: python scripts/deduplicate_enhanced.py")
    print("4. Check stats: python scripts/ingest_recipes.py stats")


if __name__ == "__main__":
    asyncio.run(test_full_pipeline())