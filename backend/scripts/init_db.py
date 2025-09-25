#!/usr/bin/env python3
"""Initialize database and create test data."""
import sys
import os
import asyncio
import sqlite3
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, engine
from app.auth import get_password_hash
from sqlalchemy import text
import uuid


async def seed_test_data():
    """Add test data to database."""
    async with engine.begin() as conn:
        # Create test household
        household_id = str(uuid.uuid4())
        await conn.execute(
            text("INSERT INTO households (id, name) VALUES (:id, :name)"),
            {"id": household_id, "name": "Test Household"}
        )

        # Create test user
        user_id = str(uuid.uuid4())
        await conn.execute(
            text("""
                INSERT INTO users (id, email, username, password_hash, household_id)
                VALUES (:id, :email, :username, :password_hash, :household_id)
            """),
            {
                "id": user_id,
                "email": "test@example.com",
                "username": "testuser",
                "password_hash": get_password_hash("password123"),
                "household_id": household_id
            }
        )

        # Add test ingredients
        ingredients = [
            ("ing_1", "Chicken Breast", "Meat & Poultry"),
            ("ing_2", "Eggs", "Dairy"),
            ("ing_3", "Milk", "Dairy"),
            ("ing_4", "Flour", "Baking"),
            ("ing_5", "Sugar", "Baking"),
            ("ing_6", "Salt", "Spices"),
            ("ing_7", "Black Pepper", "Spices"),
            ("ing_8", "Olive Oil", "Oils"),
            ("ing_9", "Butter", "Dairy"),
            ("ing_10", "Garlic", "Produce"),
            ("ing_11", "Onion", "Produce"),
            ("ing_12", "Tomatoes", "Produce"),
            ("ing_13", "Lettuce", "Produce"),
            ("ing_14", "Rice", "Grains"),
            ("ing_15", "Pasta", "Grains"),
        ]

        for ing_id, name, category in ingredients:
            await conn.execute(
                text("""
                    INSERT INTO ingredients (id, canonical_name, display_name, category)
                    VALUES (:id, :name, :name, :category)
                """),
                {"id": ing_id, "name": name, "category": category}
            )

        # Add test source
        source_id = str(uuid.uuid4())
        await conn.execute(
            text("""
                INSERT INTO sources (id, name, territory, license_code, license_url)
                VALUES (:id, :name, :territory, :license_code, :license_url)
            """),
            {
                "id": source_id,
                "name": "Test Recipe Source",
                "territory": "US",
                "license_code": "CC-BY",
                "license_url": "https://creativecommons.org/licenses/by/4.0/"
            }
        )

        # Add test recipes
        recipes = [
            {
                "id": str(uuid.uuid4()),
                "title": "Simple Scrambled Eggs",
                "summary": "Quick and easy scrambled eggs",
                "instructions": "1. Crack eggs into bowl\n2. Add milk and whisk\n3. Heat butter in pan\n4. Pour eggs and scramble\n5. Season with salt and pepper",
                "total_time_min": 10,
                "prep_time_min": 5,
                "servings": 2,
                "ingredients_vec": "ing_2,ing_3,ing_9,ing_6,ing_7",
                "required_count": 5
            },
            {
                "id": str(uuid.uuid4()),
                "title": "Grilled Chicken Salad",
                "summary": "Healthy grilled chicken over fresh greens",
                "instructions": "1. Season chicken with salt and pepper\n2. Grill chicken until cooked\n3. Slice chicken\n4. Arrange lettuce and tomatoes\n5. Top with chicken\n6. Drizzle with olive oil",
                "total_time_min": 25,
                "prep_time_min": 10,
                "servings": 2,
                "ingredients_vec": "ing_1,ing_13,ing_12,ing_8,ing_6,ing_7",
                "required_count": 6
            },
            {
                "id": str(uuid.uuid4()),
                "title": "Garlic Butter Pasta",
                "summary": "Simple pasta with garlic butter sauce",
                "instructions": "1. Cook pasta according to package\n2. Melt butter in pan\n3. Sauté garlic\n4. Toss pasta in garlic butter\n5. Season and serve",
                "total_time_min": 20,
                "prep_time_min": 5,
                "servings": 4,
                "ingredients_vec": "ing_15,ing_9,ing_10,ing_6,ing_7",
                "required_count": 5
            }
        ]

        for recipe in recipes:
            await conn.execute(
                text("""
                    INSERT INTO recipes (
                        id, slug, title, summary, instructions,
                        total_time_min, prep_time_min, servings,
                        ingredients_vec, required_count,
                        source_id, source_url, license_code, attribution_text,
                        instructions_allowed
                    ) VALUES (
                        :id, :slug, :title, :summary, :instructions,
                        :total_time_min, :prep_time_min, :servings,
                        :ingredients_vec, :required_count,
                        :source_id, :source_url, :license_code, :attribution_text,
                        1
                    )
                """),
                {
                    **recipe,
                    "slug": recipe["title"].lower().replace(" ", "-"),
                    "source_id": source_id,
                    "source_url": "https://example.com",
                    "license_code": "CC-BY",
                    "attribution_text": "Test recipe for development"
                }
            )

            # Update FTS index
            await conn.execute(
                text("""
                    INSERT INTO recipes_fts (rowid, title, ingredients_flat)
                    VALUES (:id, :title, :ingredients)
                """),
                {
                    "id": recipe["id"],
                    "title": recipe["title"],
                    "ingredients": recipe["ingredients_vec"].replace(",", " ")
                }
            )

        # Add some staples
        staples = [("ing_6", 0.1), ("ing_7", 0.1), ("ing_8", 0.2)]  # Salt, pepper, oil
        for ing_id, weight in staples:
            await conn.execute(
                text("INSERT INTO staples (ingredient_id, penalty_weight) VALUES (:id, :weight)"),
                {"id": ing_id, "weight": weight}
            )

        print("✓ Test data added successfully!")
        print("\nTest credentials:")
        print("  Email: test@example.com")
        print("  Password: password123")


async def main():
    """Initialize database and add test data."""
    print("Initializing database...")
    await init_db()

    print("\nAdding test data...")
    await seed_test_data()

    print("\n✓ Database initialization complete!")


if __name__ == "__main__":
    asyncio.run(main())