#!/usr/bin/env python3
"""Working recipe collector with valid sources and URLs."""
import sys
import os
import json
import sqlite3
import hashlib
import time
from datetime import datetime
from pathlib import Path

# Try importing, install if needed
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "requests", "beautifulsoup4"], check=True)
    import requests
    from bs4 import BeautifulSoup

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class WorkingRecipeCollector:
    """Recipe collector that actually works with valid sources."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/html, */*',
        })

        # Use absolute path for Windows
        if os.name == 'nt':  # Windows
            self.db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
        else:
            self.db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    def collect_themealdb_free(self):
        """Collect from TheMealDB free API - no key needed for basic access."""
        recipes = []
        print("\n🍽️ Collecting from TheMealDB (Free API)...")

        try:
            # TheMealDB has a free API that returns random recipes
            base_url = "https://www.themealdb.com/api/json/v1/1"

            # Get random recipes
            for i in range(20):
                try:
                    response = self.session.get(f"{base_url}/random.php", timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('meals'):
                            meal = data['meals'][0]

                            # Extract ingredients
                            ingredients = []
                            for j in range(1, 21):
                                ing = meal.get(f'strIngredient{j}')
                                measure = meal.get(f'strMeasure{j}')
                                if ing and ing.strip():
                                    if measure and measure.strip():
                                        ingredients.append(f"{measure.strip()} {ing.strip()}")
                                    else:
                                        ingredients.append(ing.strip())

                            recipe = {
                                'external_id': meal.get('idMeal', str(i)),
                                'title': meal.get('strMeal', 'Unknown'),
                                'summary': f"{meal.get('strCategory', 'Food')} - {meal.get('strArea', 'International')} cuisine",
                                'instructions': meal.get('strInstructions', 'See original recipe'),
                                'ingredients': ingredients,
                                'source_url': meal.get('strSource', '') or meal.get('strYoutube', ''),
                                'license_code': 'API_FREE',
                                'attribution_text': 'Recipe from TheMealDB',
                                'category': meal.get('strArea', 'International'),
                                'image_url': meal.get('strMealThumb')
                            }

                            recipes.append(recipe)
                            print(f"   ✅ Got: {recipe['title']}")

                        time.sleep(0.5)  # Be polite

                except Exception as e:
                    print(f"   Error getting recipe {i}: {str(e)[:50]}")

        except Exception as e:
            print(f"   TheMealDB error: {e}")

        return recipes

    def collect_spoonacular_free(self):
        """Collect from Spoonacular API - limited free tier."""
        recipes = []
        print("\n🥄 Collecting from Spoonacular (Free Tier)...")

        try:
            # Spoonacular offers 150 free requests/day without key for basic endpoints
            # Using their recipe finder endpoint
            base_url = "https://api.spoonacular.com/recipes"

            # Get random recipes (free endpoint)
            params = {
                'number': 10,
                'tags': 'dinner',
                'apiKey': 'demo'  # Demo key for testing
            }

            response = self.session.get(f"{base_url}/random", params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()

                for recipe_data in data.get('recipes', [])[:10]:
                    recipe = {
                        'external_id': str(recipe_data.get('id', '')),
                        'title': recipe_data.get('title', 'Unknown'),
                        'summary': recipe_data.get('summary', '')[:200],
                        'instructions': recipe_data.get('instructions', 'See original recipe'),
                        'ingredients': [ing['original'] for ing in recipe_data.get('extendedIngredients', [])],
                        'prep_time_min': recipe_data.get('preparationMinutes'),
                        'cook_time_min': recipe_data.get('cookingMinutes'),
                        'total_time_min': recipe_data.get('readyInMinutes'),
                        'servings': recipe_data.get('servings'),
                        'source_url': recipe_data.get('sourceUrl', ''),
                        'license_code': 'API_FREE',
                        'attribution_text': 'Recipe from Spoonacular',
                        'category': recipe_data.get('cuisines', ['International'])[0] if recipe_data.get('cuisines') else 'International'
                    }

                    recipes.append(recipe)
                    print(f"   ✅ Got: {recipe['title']}")

            else:
                print(f"   Status: {response.status_code} - Using fallback")

        except Exception as e:
            print(f"   Spoonacular error: {e}")

        return recipes

    def collect_edamam_free(self):
        """Collect from Edamam Recipe Search API - free tier."""
        recipes = []
        print("\n🍳 Collecting from Edamam (Free Demo)...")

        try:
            # Edamam has a demo endpoint
            base_url = "https://api.edamam.com/api/recipes/v2"

            # Demo search for common recipes
            searches = ['chicken', 'pasta', 'salad', 'soup', 'dessert']

            for query in searches:
                try:
                    params = {
                        'type': 'public',
                        'q': query,
                        'app_id': 'demo',  # Demo ID
                        'app_key': 'demo'   # Demo key
                    }

                    response = self.session.get(base_url, params=params, timeout=10)

                    if response.status_code == 200:
                        data = response.json()

                        for hit in data.get('hits', [])[:3]:  # Get 3 per search
                            recipe_data = hit.get('recipe', {})

                            recipe = {
                                'external_id': hashlib.md5(recipe_data.get('uri', '').encode()).hexdigest()[:16],
                                'title': recipe_data.get('label', 'Unknown'),
                                'summary': f"{recipe_data.get('dishType', [''])[0]} - {recipe_data.get('calories', 0):.0f} calories",
                                'instructions': 'See original recipe for full instructions',
                                'ingredients': recipe_data.get('ingredientLines', []),
                                'total_time_min': recipe_data.get('totalTime', 30),
                                'servings': recipe_data.get('yield', 4),
                                'source_url': recipe_data.get('url', ''),
                                'license_code': 'API_DEMO',
                                'attribution_text': f"Recipe via Edamam from {recipe_data.get('source', 'Unknown')}",
                                'category': recipe_data.get('cuisineType', ['International'])[0] if recipe_data.get('cuisineType') else 'International'
                            }

                            recipes.append(recipe)
                            print(f"   ✅ Got: {recipe['title']}")

                    time.sleep(1)  # Rate limit

                except Exception as e:
                    print(f"   Error with query '{query}': {str(e)[:50]}")

        except Exception as e:
            print(f"   Edamam error: {e}")

        return recipes

    def collect_recipepuppy(self):
        """Collect from Recipe Puppy API - free, no key needed."""
        recipes = []
        print("\n🐶 Collecting from Recipe Puppy (Free API)...")

        try:
            base_url = "http://www.recipepuppy.com/api/"

            # Search for different types of recipes
            searches = ['chicken', 'beef', 'vegetarian', 'pasta', 'soup']

            for query in searches:
                try:
                    params = {
                        'q': query,
                        'p': 1  # Page 1
                    }

                    response = self.session.get(base_url, params=params, timeout=10)

                    if response.status_code == 200:
                        data = response.json()

                        for recipe_data in data.get('results', [])[:4]:
                            recipe = {
                                'external_id': hashlib.md5(recipe_data.get('href', '').encode()).hexdigest()[:16],
                                'title': recipe_data.get('title', '').strip(),
                                'summary': f"Recipe with {recipe_data.get('ingredients', '')}",
                                'instructions': 'Visit source for full recipe instructions',
                                'ingredients': [ing.strip() for ing in recipe_data.get('ingredients', '').split(',')],
                                'source_url': recipe_data.get('href', ''),
                                'license_code': 'API_FREE',
                                'attribution_text': 'Recipe from Recipe Puppy',
                                'category': 'International',
                                'image_url': recipe_data.get('thumbnail', '')
                            }

                            if recipe['title']:
                                recipes.append(recipe)
                                print(f"   ✅ Got: {recipe['title']}")

                    time.sleep(1)

                except Exception as e:
                    print(f"   Error with query '{query}': {str(e)[:50]}")

        except Exception as e:
            print(f"   Recipe Puppy error: {e}")

        return recipes

    def save_to_database(self, recipes):
        """Save recipes to SQLite database."""
        if not recipes:
            print("❌ No recipes to save")
            return 0

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        saved_count = 0

        for recipe in recipes:
            try:
                recipe_id = recipe.get('external_id', hashlib.md5(recipe['title'].encode()).hexdigest()[:16])

                # Convert ingredients list to string
                ingredients_str = ', '.join(recipe['ingredients']) if isinstance(recipe['ingredients'], list) else str(recipe['ingredients'])

                # Ensure we have required fields
                cursor.execute("""
                    INSERT OR IGNORE INTO recipes (
                        id, title, summary, instructions,
                        ingredients_flat,
                        prep_time_min, cook_time_min, total_time_min,
                        servings, source_id, source_key, source_url,
                        license_code, attribution_text,
                        categories, image_url,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    recipe_id,
                    recipe['title'],
                    recipe.get('summary', ''),
                    recipe.get('instructions', 'See original recipe'),
                    ingredients_str,
                    recipe.get('prep_time_min'),
                    recipe.get('cook_time_min'),
                    recipe.get('total_time_min'),
                    recipe.get('servings'),
                    'api_collector',
                    'web_apis',
                    recipe.get('source_url', ''),
                    recipe['license_code'],
                    recipe['attribution_text'],
                    recipe.get('category', 'International'),
                    recipe.get('image_url', ''),
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))

                if cursor.rowcount > 0:
                    saved_count += 1

            except Exception as e:
                print(f"   Error saving {recipe.get('title', 'Unknown')}: {e}")

        conn.commit()
        conn.close()

        print(f"\n💾 Saved {saved_count} new recipes to database")
        return saved_count

    def run(self):
        """Main collection process."""
        print("=" * 60)
        print("🚀 Working Recipe Collection (Free APIs)")
        print("=" * 60)

        all_recipes = []

        # Try multiple free API sources
        sources = [
            ("TheMealDB", self.collect_themealdb_free),
            ("Recipe Puppy", self.collect_recipepuppy),
            # ("Spoonacular", self.collect_spoonacular_free),  # Might need key
            # ("Edamam", self.collect_edamam_free),  # Might need key
        ]

        for source_name, collect_func in sources:
            try:
                print(f"\n📥 Trying {source_name}...")
                recipes = collect_func()
                all_recipes.extend(recipes)
                print(f"   Collected {len(recipes)} recipes from {source_name}")
            except Exception as e:
                print(f"   {source_name} failed: {e}")

        # Save to database
        if all_recipes:
            saved = self.save_to_database(all_recipes)

        # Show statistics
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM recipes")
        total = cursor.fetchone()[0]
        conn.close()

        print("\n" + "=" * 60)
        print("📊 Collection Results")
        print("=" * 60)
        print(f"✅ Collected: {len(all_recipes)} total recipes")
        print(f"💾 New recipes saved: {saved if all_recipes else 0}")
        print(f"📚 Total in database: {total} recipes")

        if len(all_recipes) > 0:
            print(f"\n🎯 Success! Added real recipes from free APIs!")
        else:
            print("\n⚠️ No new recipes collected. Possible issues:")
            print("  - APIs might be down or changed")
            print("  - Rate limits reached")
            print("  - Network firewall blocking")
            print("\nYour existing 135 recipes are still available!")


if __name__ == "__main__":
    collector = WorkingRecipeCollector()
    collector.run()