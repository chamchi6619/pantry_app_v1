#!/usr/bin/env python3
"""Test local recipe ingestion with mock data."""
import sys
import os
import asyncio
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.ingest_recipes import RecipeIngestionPipeline


async def test_local_ingestion():
    """Test recipe ingestion with local mock data."""

    # Create mock recipes
    mock_recipes = [
        {
            "external_id": "test_001",
            "title": "Classic Spaghetti Carbonara",
            "summary": "Traditional Italian pasta with eggs, cheese, and bacon",
            "ingredients": [
                "400g spaghetti",
                "200g pancetta or bacon",
                "4 large eggs",
                "100g Parmesan cheese, grated",
                "Black pepper to taste",
                "Salt for pasta water"
            ],
            "instructions": "1. Cook spaghetti in salted boiling water. 2. Fry pancetta until crispy. 3. Mix eggs and cheese. 4. Combine hot pasta with pancetta, then add egg mixture off heat. 5. Toss quickly and serve.",
            "source_url": "https://example.com/recipes/carbonara",
            "license_code": "PUBLIC",
            "attribution_text": "Public Domain Recipe",
            "servings": 4,
            "prep_time_min": 10,
            "cook_time_min": 20,
            "total_time_min": 30,
            "categories": ["Italian", "Pasta", "Main Course"],
            "nutrition": {
                "calories": 450,
                "protein_g": 20,
                "fat_g": 15,
                "carbs_g": 60
            }
        },
        {
            "external_id": "test_002",
            "title": "Simple Green Salad",
            "summary": "Fresh mixed greens with vinaigrette",
            "ingredients": [
                "4 cups mixed salad greens",
                "1 cucumber, sliced",
                "2 tomatoes, chopped",
                "1/4 cup olive oil",
                "2 tbsp balsamic vinegar",
                "Salt and pepper to taste"
            ],
            "instructions": "1. Wash and dry greens. 2. Add cucumber and tomatoes. 3. Whisk oil and vinegar. 4. Dress salad just before serving.",
            "source_url": "https://example.com/recipes/salad",
            "license_code": "CC-BY",
            "attribution_text": "Recipe from Test Kitchen, CC BY 4.0",
            "servings": 4,
            "prep_time_min": 10,
            "total_time_min": 10,
            "categories": ["Salads", "Vegetarian", "Healthy"]
        },
        {
            "external_id": "test_003",
            "title": "Chicken Stir Fry",
            "summary": "Quick Asian-inspired chicken and vegetables",
            "ingredients": [
                "500g chicken breast, sliced",
                "2 bell peppers, sliced",
                "1 onion, sliced",
                "3 cloves garlic, minced",
                "2 tbsp soy sauce",
                "1 tbsp sesame oil",
                "1 tsp ginger, grated",
                "2 tbsp vegetable oil"
            ],
            "instructions": "1. Heat wok with oil. 2. Stir-fry chicken until cooked. 3. Add vegetables and aromatics. 4. Add sauces and stir-fry 2-3 minutes. 5. Serve hot with rice.",
            "source_url": "https://example.com/recipes/stirfry",
            "license_code": "PUBLIC",
            "attribution_text": "Public Domain Recipe",
            "servings": 4,
            "prep_time_min": 15,
            "cook_time_min": 10,
            "total_time_min": 25,
            "categories": ["Asian", "Chicken", "Quick"]
        }
    ]

    print("=" * 60)
    print("Testing Local Recipe Ingestion")
    print("=" * 60)

    # Initialize pipeline
    db_path = Path(__file__).parent.parent / "data" / "pantry.db"
    pipeline = RecipeIngestionPipeline(str(db_path))

    # Use USDA as test source (public domain)
    print("\n1. Using USDA source (public domain)...")
    source_key = "usda_myplate"

    # Test ingestion
    print("\n2. Ingesting mock recipes...")
    try:
        await pipeline.ingest_from_source(source_key, mock_recipes)

        print(f"\n   ✅ Ingestion complete!")
        print(f"   - Recipes processed: {pipeline.stats['total_processed']}")
        print(f"   - Successfully ingested: {pipeline.stats['successfully_ingested']}")
        print(f"   - Validation failures: {pipeline.stats['validation_failures']}")
        print(f"   - Database errors: {pipeline.stats['database_errors']}")

        if pipeline.stats['validation_failures'] > 0 and pipeline.validation_errors:
            print("\n   Validation errors:")
            for error in pipeline.validation_errors[:3]:
                print(f"   - {error}")

    except Exception as e:
        print(f"   ❌ Ingestion failed: {e}")
        import traceback
        traceback.print_exc()

    # Test database query
    print("\n3. Verifying recipes in database...")
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, title, source_key, license_code
        FROM recipes
        WHERE source_key = 'usda_myplate'
        ORDER BY created_at DESC
        LIMIT 5
    """)

    results = cursor.fetchall()
    if results:
        print(f"   Found {len(results)} test recipes:")
        for recipe_id, title, source, license_code in results:
            print(f"   - [{recipe_id[:8]}...] {title} ({license_code})")
    else:
        print("   No test recipes found in database")

    conn.close()

    print("\n" + "=" * 60)
    print("Test Complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_local_ingestion())