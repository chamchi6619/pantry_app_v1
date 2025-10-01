#!/usr/bin/env python3
"""Ingest mock recipes directly without external API calls."""
import sys
import os
import sqlite3
import json
from datetime import datetime
from pathlib import Path
import hashlib

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def generate_id():
    """Generate a unique recipe ID."""
    return hashlib.md5(f"{datetime.now().isoformat()}".encode()).hexdigest()[:16]

def ingest_mock_recipes():
    """Ingest mock recipes directly into database."""

    # Mock recipes that don't require external API
    recipes = [
        {
            "title": "Classic Pasta Carbonara",
            "summary": "Creamy Italian pasta with eggs and bacon",
            "instructions": "Cook pasta. Fry bacon. Mix eggs with cheese. Combine hot pasta with bacon, then add egg mixture off heat. Serve immediately.",
            "ingredients": "pasta, eggs, bacon, parmesan cheese, black pepper, salt",
            "prep_time_min": 10,
            "cook_time_min": 15,
            "total_time_min": 25,
            "servings": 4
        },
        {
            "title": "Chicken Stir Fry",
            "summary": "Quick Asian-inspired chicken and vegetables",
            "instructions": "Cut chicken into strips. Heat wok with oil. Stir-fry chicken until cooked. Add vegetables and sauce. Serve over rice.",
            "ingredients": "chicken breast, bell peppers, onions, soy sauce, garlic, ginger, vegetable oil",
            "prep_time_min": 15,
            "cook_time_min": 10,
            "total_time_min": 25,
            "servings": 4
        },
        {
            "title": "Caesar Salad",
            "summary": "Classic salad with romaine and parmesan",
            "instructions": "Wash and chop romaine lettuce. Make dressing with anchovies, garlic, lemon, and oil. Toss lettuce with dressing. Top with croutons and parmesan.",
            "ingredients": "romaine lettuce, parmesan cheese, croutons, anchovies, garlic, lemon, olive oil",
            "prep_time_min": 15,
            "total_time_min": 15,
            "servings": 4
        },
        {
            "title": "Beef Tacos",
            "summary": "Mexican-style tacos with seasoned ground beef",
            "instructions": "Brown ground beef. Add taco seasoning and water. Simmer until thick. Warm tortillas. Fill with beef and toppings.",
            "ingredients": "ground beef, taco shells, lettuce, tomatoes, cheese, sour cream, taco seasoning",
            "prep_time_min": 10,
            "cook_time_min": 15,
            "total_time_min": 25,
            "servings": 6
        },
        {
            "title": "Vegetable Soup",
            "summary": "Hearty soup with mixed vegetables",
            "instructions": "Saute onions and garlic. Add vegetables and broth. Simmer for 20 minutes. Season to taste. Serve hot.",
            "ingredients": "onions, carrots, celery, potatoes, tomatoes, vegetable broth, garlic, herbs",
            "prep_time_min": 15,
            "cook_time_min": 30,
            "total_time_min": 45,
            "servings": 6
        },
        {
            "title": "Grilled Cheese Sandwich",
            "summary": "Classic comfort food sandwich",
            "instructions": "Butter bread slices. Place cheese between bread. Grill in pan until golden and cheese melts.",
            "ingredients": "bread, cheddar cheese, butter",
            "prep_time_min": 5,
            "cook_time_min": 5,
            "total_time_min": 10,
            "servings": 1
        },
        {
            "title": "Greek Salad",
            "summary": "Mediterranean salad with feta and olives",
            "instructions": "Chop tomatoes, cucumbers, and onions. Add olives and feta. Dress with olive oil and lemon. Season with oregano.",
            "ingredients": "tomatoes, cucumbers, red onion, feta cheese, olives, olive oil, lemon, oregano",
            "prep_time_min": 15,
            "total_time_min": 15,
            "servings": 4
        },
        {
            "title": "Banana Smoothie",
            "summary": "Quick and healthy breakfast smoothie",
            "instructions": "Combine banana, yogurt, milk, and honey in blender. Blend until smooth. Add ice if desired.",
            "ingredients": "banana, yogurt, milk, honey, ice",
            "prep_time_min": 5,
            "total_time_min": 5,
            "servings": 1
        },
        {
            "title": "Spaghetti Bolognese",
            "summary": "Italian meat sauce with pasta",
            "instructions": "Brown ground beef with onions. Add tomatoes and herbs. Simmer for 30 minutes. Cook pasta. Serve sauce over pasta.",
            "ingredients": "spaghetti, ground beef, tomatoes, onions, garlic, basil, oregano, olive oil",
            "prep_time_min": 15,
            "cook_time_min": 45,
            "total_time_min": 60,
            "servings": 6
        },
        {
            "title": "French Toast",
            "summary": "Sweet breakfast treat with cinnamon",
            "instructions": "Beat eggs with milk and cinnamon. Dip bread in mixture. Cook on griddle until golden. Serve with syrup.",
            "ingredients": "bread, eggs, milk, cinnamon, butter, maple syrup",
            "prep_time_min": 5,
            "cook_time_min": 10,
            "total_time_min": 15,
            "servings": 2
        }
    ]

    # Connect to database
    db_path = Path(__file__).parent.parent / "data" / "pantry.db"
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    print("=" * 60)
    print("Ingesting Mock Recipes (No API Required)")
    print("=" * 60)

    success_count = 0

    for recipe in recipes:
        try:
            recipe_id = generate_id()

            # Create slug from title
            slug = recipe["title"].lower().replace(" ", "-").replace("'", "")

            # Insert recipe
            cursor.execute("""
                INSERT OR IGNORE INTO recipes (
                    id, slug, title, summary, instructions,
                    ingredients_flat,
                    prep_time_min, cook_time_min, total_time_min,
                    servings, source_key, source_url,
                    license_code, attribution_text,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                recipe_id,
                slug,
                recipe["title"],
                recipe["summary"],
                recipe["instructions"],
                recipe["ingredients"],
                recipe.get("prep_time_min"),
                recipe.get("cook_time_min"),
                recipe["total_time_min"],
                recipe["servings"],
                "mock_local",
                f"https://example.com/recipes/{slug}",
                "PUBLIC",
                "Public Domain Recipe",
                datetime.now().isoformat(),
                datetime.now().isoformat()
            ))

            if cursor.rowcount > 0:
                success_count += 1
                print(f"✅ Added: {recipe['title']}")
            else:
                print(f"⏭️  Skipped (already exists): {recipe['title']}")

        except Exception as e:
            print(f"❌ Error adding {recipe['title']}: {e}")

    conn.commit()

    # Get statistics
    cursor.execute("SELECT COUNT(*) FROM recipes")
    total_recipes = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM recipes WHERE source_key = 'mock_local'")
    mock_recipes = cursor.fetchone()[0]

    conn.close()

    print("\n" + "=" * 60)
    print("Ingestion Complete!")
    print("=" * 60)
    print(f"✅ Successfully added: {success_count} recipes")
    print(f"📊 Total recipes in database: {total_recipes}")
    print(f"📊 Mock recipes in database: {mock_recipes}")
    print("\nYou can now:")
    print("1. Start the API: uvicorn app.main:app --reload")
    print("2. View recipes at: http://localhost:8000/docs")
    print("3. Check stats: python scripts/ingest_recipes.py stats")

if __name__ == "__main__":
    ingest_mock_recipes()