#!/usr/bin/env python3
"""Massive recipe collection - get 500+ real recipes from TheMealDB."""
import sys
import os
import json
import sqlite3
import hashlib
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "requests"], check=True)
    import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class MassiveRecipeCollector:
    """Collect ALL available recipes from TheMealDB."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        })

        if os.name == 'nt':  # Windows
            self.db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
        else:
            self.db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    def get_all_themealdb_recipes(self):
        """Get ALL recipes from TheMealDB using multiple strategies."""
        recipes = []
        base_url = "https://www.themealdb.com/api/json/v1/1"

        print("🚀 MASSIVE TheMealDB Collection Starting...")
        print("=" * 60)

        # Strategy 1: Get all recipes by first letter (a-z)
        print("\n📤 Strategy 1: Fetching by letter (a-z)...")
        for letter in 'abcdefghijklmnopqrstuvwxyz':
            try:
                response = self.session.get(f"{base_url}/search.php?f={letter}", timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('meals'):
                        print(f"   Letter {letter.upper()}: Found {len(data['meals'])} recipes")
                        for meal in data['meals']:
                            recipes.append(self.parse_meal(meal))
                time.sleep(0.3)  # Be polite
            except Exception as e:
                print(f"   Error with letter {letter}: {str(e)[:50]}")

        # Strategy 2: Get all recipes by category
        print(f"\n📤 Strategy 2: Fetching by category...")
        categories = [
            'Beef', 'Chicken', 'Dessert', 'Lamb', 'Miscellaneous', 'Pasta',
            'Pork', 'Seafood', 'Side', 'Starter', 'Vegan', 'Vegetarian',
            'Breakfast', 'Goat'
        ]

        for category in categories:
            try:
                response = self.session.get(f"{base_url}/filter.php?c={category}", timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('meals'):
                        print(f"   {category}: Found {len(data['meals'])} recipes")
                        # Get full details for each
                        for meal_summary in data['meals'][:10]:  # Limit to avoid rate limiting
                            meal_id = meal_summary.get('idMeal')
                            if meal_id:
                                detail_response = self.session.get(f"{base_url}/lookup.php?i={meal_id}", timeout=10)
                                if detail_response.status_code == 200:
                                    detail_data = detail_response.json()
                                    if detail_data.get('meals'):
                                        recipes.append(self.parse_meal(detail_data['meals'][0]))
                                time.sleep(0.2)
            except Exception as e:
                print(f"   Error with category {category}: {str(e)[:50]}")

        # Strategy 3: Get all recipes by area/cuisine
        print(f"\n📤 Strategy 3: Fetching by cuisine...")
        areas = [
            'American', 'British', 'Canadian', 'Chinese', 'Croatian', 'Dutch',
            'Egyptian', 'French', 'Greek', 'Indian', 'Irish', 'Italian',
            'Jamaican', 'Japanese', 'Kenyan', 'Malaysian', 'Mexican', 'Moroccan',
            'Polish', 'Portuguese', 'Russian', 'Spanish', 'Thai', 'Tunisian',
            'Turkish', 'Unknown', 'Vietnamese'
        ]

        for area in areas:
            try:
                response = self.session.get(f"{base_url}/filter.php?a={area}", timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('meals'):
                        print(f"   {area}: Found {len(data['meals'])} recipes")
                        # Get a sample from each cuisine
                        for meal_summary in data['meals'][:5]:
                            meal_id = meal_summary.get('idMeal')
                            if meal_id:
                                detail_response = self.session.get(f"{base_url}/lookup.php?i={meal_id}", timeout=10)
                                if detail_response.status_code == 200:
                                    detail_data = detail_response.json()
                                    if detail_data.get('meals'):
                                        recipes.append(self.parse_meal(detail_data['meals'][0]))
                                time.sleep(0.2)
            except Exception as e:
                print(f"   Error with area {area}: {str(e)[:50]}")

        # Strategy 4: Get by main ingredients
        print(f"\n📤 Strategy 4: Fetching by main ingredient...")
        ingredients = [
            'chicken_breast', 'salmon', 'rice', 'potato', 'tomato', 'cheese',
            'eggs', 'beef', 'pork', 'pasta', 'bread', 'chocolate', 'apple',
            'banana', 'milk', 'butter', 'flour', 'sugar', 'onion', 'garlic'
        ]

        for ingredient in ingredients:
            try:
                response = self.session.get(f"{base_url}/filter.php?i={ingredient}", timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('meals'):
                        print(f"   {ingredient}: Found {len(data['meals'])} recipes")
                        for meal_summary in data['meals'][:3]:
                            meal_id = meal_summary.get('idMeal')
                            if meal_id:
                                detail_response = self.session.get(f"{base_url}/lookup.php?i={meal_id}", timeout=10)
                                if detail_response.status_code == 200:
                                    detail_data = detail_response.json()
                                    if detail_data.get('meals'):
                                        recipes.append(self.parse_meal(detail_data['meals'][0]))
                                time.sleep(0.2)
            except Exception as e:
                print(f"   Error with ingredient {ingredient}: {str(e)[:50]}")

        # Remove duplicates based on ID
        unique_recipes = {}
        for recipe in recipes:
            unique_recipes[recipe['external_id']] = recipe

        return list(unique_recipes.values())

    def parse_meal(self, meal):
        """Parse a meal object from TheMealDB."""
        # Extract ingredients
        ingredients = []
        for i in range(1, 21):
            ing = meal.get(f'strIngredient{i}')
            measure = meal.get(f'strMeasure{i}')
            if ing and ing.strip():
                if measure and measure.strip():
                    ingredients.append(f"{measure.strip()} {ing.strip()}")
                else:
                    ingredients.append(ing.strip())

        return {
            'external_id': meal.get('idMeal', ''),
            'title': meal.get('strMeal', 'Unknown'),
            'summary': f"{meal.get('strCategory', 'Food')} from {meal.get('strArea', 'International')} cuisine",
            'instructions': meal.get('strInstructions', 'See original recipe'),
            'ingredients': ingredients,
            'source_url': meal.get('strSource', '') or meal.get('strYoutube', ''),
            'license_code': 'API_FREE',
            'attribution_text': 'Recipe from TheMealDB',
            'category': meal.get('strArea', 'International'),
            'tags': meal.get('strTags', ''),
            'image_url': meal.get('strMealThumb')
        }

    def save_to_database(self, recipes):
        """Save recipes to database."""
        if not recipes:
            return 0

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        saved_count = 0
        skipped_count = 0

        for recipe in recipes:
            try:
                recipe_id = f"mealdb_{recipe['external_id']}"
                ingredients_str = ', '.join(recipe['ingredients'])

                cursor.execute("""
                    INSERT OR IGNORE INTO recipes (
                        id, title, summary, instructions,
                        ingredients_flat,
                        source_id, source_key, source_url,
                        license_code, attribution_text,
                        categories, tags, image_url,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    recipe_id,
                    recipe['title'],
                    recipe['summary'],
                    recipe['instructions'],
                    ingredients_str,
                    'themealdb_api',
                    'themealdb',
                    recipe.get('source_url', ''),
                    recipe['license_code'],
                    recipe['attribution_text'],
                    recipe['category'],
                    recipe.get('tags', ''),
                    recipe.get('image_url', ''),
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))

                if cursor.rowcount > 0:
                    saved_count += 1
                else:
                    skipped_count += 1

            except Exception as e:
                print(f"   Error saving {recipe.get('title', 'Unknown')}: {e}")

        conn.commit()
        conn.close()

        return saved_count, skipped_count

    def run(self):
        """Run the massive collection."""
        print("=" * 60)
        print("🎯 MASSIVE RECIPE COLLECTION")
        print("=" * 60)
        print("Collecting ALL available recipes from TheMealDB...")
        print("This will take a few minutes...\n")

        # Collect all recipes
        all_recipes = self.get_all_themealdb_recipes()

        print(f"\n📊 Collection Summary:")
        print(f"   Total unique recipes found: {len(all_recipes)}")

        # Save to database
        if all_recipes:
            saved, skipped = self.save_to_database(all_recipes)
            print(f"   New recipes saved: {saved}")
            print(f"   Duplicates skipped: {skipped}")

        # Final statistics
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM recipes")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT categories) FROM recipes WHERE categories IS NOT NULL")
        categories = cursor.fetchone()[0]

        cursor.execute("""
            SELECT categories, COUNT(*) as count
            FROM recipes
            WHERE source_key = 'themealdb'
            GROUP BY categories
            ORDER BY count DESC
            LIMIT 10
        """)
        top_cuisines = cursor.fetchall()

        conn.close()

        print("\n" + "=" * 60)
        print("🎉 COLLECTION COMPLETE!")
        print("=" * 60)
        print(f"📚 Total recipes in database: {total}")
        print(f"🌍 Total cuisines: {categories}")

        print("\n🏆 Top Cuisines from TheMealDB:")
        for cuisine, count in top_cuisines:
            bar = "█" * min(30, count // 2)
            print(f"   {cuisine:15} {bar} {count}")

        print(f"\n✨ Your database is now packed with {total} real recipes!")
        print("   Ready for your Pantry app!")


if __name__ == "__main__":
    collector = MassiveRecipeCollector()
    collector.run()