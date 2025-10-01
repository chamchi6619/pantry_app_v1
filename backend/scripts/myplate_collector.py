#!/usr/bin/env python3
"""MyPlate recipe collector using the CORRECT recipe URL."""
import os
import sys
import json
import sqlite3
import hashlib
import time
import re
from datetime import datetime
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "requests", "beautifulsoup4", "lxml"], check=True)
    import requests
    from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class MyPlateCollector:
    """Collector for the ACTUAL MyPlate recipe site."""

    def __init__(self):
        self.session = requests.Session()

        # Standard browser headers
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
        })

        if os.name == 'nt':
            self.db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
        else:
            self.db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    def collect_myplate_recipes(self, limit=None):
        """Collect from the ACTUAL MyPlate recipe page."""
        print("\n🇺🇸 Collecting from MyPlate Kitchen Recipes...")
        print("   Using: https://www.myplate.gov/myplate-kitchen/recipes")

        recipes = []
        base_url = "https://www.myplate.gov"
        recipes_url = "https://www.myplate.gov/myplate-kitchen/recipes"

        try:
            print("   Fetching main recipe page...")
            response = self.session.get(recipes_url, timeout=30)

            if response.status_code != 200:
                print(f"   ❌ Got status {response.status_code}")
                return recipes

            soup = BeautifulSoup(response.content, 'html.parser')
            print("   ✅ Page loaded successfully")

            # Strategy 1: Look for JSON-LD structured data
            json_ld_found = False
            for script in soup.find_all('script', type='application/ld+json'):
                try:
                    data = json.loads(script.string)

                    # Check for Recipe type
                    if isinstance(data, dict):
                        if data.get('@type') == 'Recipe':
                            recipes.append(self._parse_json_ld(data, recipes_url))
                            json_ld_found = True
                        elif '@graph' in data:
                            for item in data['@graph']:
                                if item.get('@type') == 'Recipe':
                                    recipes.append(self._parse_json_ld(item, recipes_url))
                                    json_ld_found = True
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and item.get('@type') == 'Recipe':
                                recipes.append(self._parse_json_ld(item, recipes_url))
                                json_ld_found = True

                    if json_ld_found:
                        print(f"   ✅ Found {len(recipes)} recipes in JSON-LD")

                except Exception as e:
                    pass

            # Strategy 2: Find recipe links on the page
            recipe_links = set()

            # Look for recipe cards/teasers
            for card in soup.find_all(['article', 'div'], class_=re.compile('recipe|card|teaser|node--type-recipe', re.I)):
                link = card.find('a', href=True)
                if link:
                    href = link['href']
                    if not href.startswith('http'):
                        href = base_url + href
                    recipe_links.add(href)

            # Also find direct links to recipes
            for link in soup.find_all('a', href=True):
                href = link['href']
                # MyPlate recipe URLs typically contain /recipes/
                if '/recipes/' in href and href != recipes_url:
                    if not href.startswith('http'):
                        href = base_url + href
                    # Filter out non-recipe pages
                    if not any(skip in href for skip in ['search', 'print', 'pdf', '#', '?page=']):
                        recipe_links.add(href)

            print(f"   Found {len(recipe_links)} recipe links to fetch")

            # Fetch individual recipe pages
            recipe_list = list(recipe_links)
            if limit:
                recipe_list = recipe_list[:limit]

            print(f"   Will fetch {len(recipe_list)} recipes...")

            for idx, recipe_url in enumerate(recipe_list, 1):
                try:
                    print(f"   Fetching recipe {idx}/{len(recipe_list)}: {recipe_url.split('/')[-1][:30]}...")

                    recipe_response = self.session.get(recipe_url, timeout=20)
                    if recipe_response.status_code == 200:
                        recipe_soup = BeautifulSoup(recipe_response.content, 'html.parser')

                        # Try to extract recipe data
                        recipe = self._extract_recipe_from_page(recipe_soup, recipe_url)
                        if recipe:
                            recipes.append(recipe)
                            print(f"      ✅ Got: {recipe['title'][:50]}")

                    time.sleep(1)  # Be polite

                except Exception as e:
                    print(f"      Error: {str(e)[:50]}")

        except requests.exceptions.Timeout:
            print("   ⏱️ Connection timeout - try running from Windows PowerShell (not WSL)")
        except Exception as e:
            print(f"   ❌ Error: {str(e)[:100]}")

        print(f"\n   Summary: Collected {len(recipes)} recipes from MyPlate")
        return recipes

    def _extract_recipe_from_page(self, soup, url):
        """Extract recipe data from a MyPlate recipe page."""

        # First try JSON-LD
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string)
                if data.get('@type') == 'Recipe':
                    return self._parse_json_ld(data, url)
            except:
                pass

        # Fallback to HTML extraction
        recipe = {}

        # Get title (h1 is usually the recipe title)
        title = soup.find('h1')
        if not title:
            return None

        recipe['title'] = title.text.strip()
        recipe['external_id'] = hashlib.md5((recipe['title'] + url).encode()).hexdigest()[:16]
        recipe['source_url'] = url
        recipe['license_code'] = 'PUBLIC'
        recipe['attribution_text'] = 'Recipe from USDA MyPlate (Public Domain)'
        recipe['category'] = 'American'

        # Get summary/description
        summary = soup.find(['div', 'p'], class_=re.compile('summary|description|intro', re.I))
        recipe['summary'] = summary.text.strip()[:200] if summary else 'Healthy recipe from USDA MyPlate'

        # Get ingredients
        ingredients = []

        # Look for ingredients section
        for section in soup.find_all(['div', 'section'], class_=re.compile('ingredient', re.I)):
            for item in section.find_all(['li', 'p']):
                text = item.text.strip()
                if text and len(text) > 2:
                    ingredients.append(text)

        # Alternative: look for heading followed by list
        if not ingredients:
            for heading in soup.find_all(['h2', 'h3'], string=re.compile('ingredient', re.I)):
                next_sibling = heading.find_next_sibling()
                if next_sibling and next_sibling.name in ['ul', 'ol']:
                    for li in next_sibling.find_all('li'):
                        ingredients.append(li.text.strip())

        recipe['ingredients'] = ingredients if ingredients else ['See original recipe for ingredients']

        # Get instructions
        instructions = []

        # Look for instructions/directions section
        for section in soup.find_all(['div', 'section'], class_=re.compile('instruction|direction|method|step', re.I)):
            for item in section.find_all(['li', 'p']):
                text = item.text.strip()
                if text and len(text) > 10:
                    instructions.append(text)

        # Alternative: look for heading followed by list
        if not instructions:
            for heading in soup.find_all(['h2', 'h3'], string=re.compile('instruction|direction|method', re.I)):
                next_sibling = heading.find_next_sibling()
                if next_sibling and next_sibling.name in ['ul', 'ol']:
                    for li in next_sibling.find_all('li'):
                        instructions.append(li.text.strip())

        recipe['instructions'] = ' '.join(instructions) if instructions else 'Visit MyPlate.gov for full instructions'

        # Get nutrition info if available
        nutrition_section = soup.find(['div', 'section'], class_=re.compile('nutrition', re.I))
        if nutrition_section:
            recipe['has_nutrition'] = True

        return recipe

    def _parse_json_ld(self, data, url):
        """Parse JSON-LD recipe data."""
        ingredients = data.get('recipeIngredient', [])
        if isinstance(ingredients, str):
            ingredients = [ingredients]

        instructions = []
        if 'recipeInstructions' in data:
            for inst in data['recipeInstructions']:
                if isinstance(inst, dict):
                    instructions.append(inst.get('text', inst.get('name', '')))
                else:
                    instructions.append(str(inst))

        return {
            'external_id': hashlib.md5((str(data.get('name', '')) + url).encode()).hexdigest()[:16],
            'title': data.get('name', 'Unknown Recipe'),
            'summary': data.get('description', '')[:200] if data.get('description') else 'Healthy recipe from USDA MyPlate',
            'instructions': ' '.join(instructions) if instructions else 'See original recipe for instructions',
            'ingredients': ingredients if ingredients else ['See original recipe for ingredients'],
            'prep_time_min': self._parse_duration(data.get('prepTime')),
            'cook_time_min': self._parse_duration(data.get('cookTime')),
            'total_time_min': self._parse_duration(data.get('totalTime')),
            'servings': data.get('recipeYield'),
            'source_url': url,
            'license_code': 'PUBLIC',
            'attribution_text': 'Recipe from USDA MyPlate (Public Domain)',
            'category': data.get('recipeCuisine', 'American'),
            'image_url': data.get('image', ''),
            'calories': data.get('nutrition', {}).get('calories') if isinstance(data.get('nutrition'), dict) else None
        }

    def _parse_duration(self, iso_duration):
        """Parse ISO 8601 duration to minutes."""
        if not iso_duration:
            return None
        try:
            # Parse PT30M format
            if 'PT' in iso_duration:
                minutes = 0
                if 'H' in iso_duration:
                    hours = int(re.search(r'(\d+)H', iso_duration).group(1))
                    minutes += hours * 60
                if 'M' in iso_duration:
                    mins = int(re.search(r'(\d+)M', iso_duration).group(1))
                    minutes += mins
                return minutes
        except:
            return None

    def save_to_database(self, recipes):
        """Save recipes to database."""
        if not recipes:
            print("   No recipes to save")
            return 0

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        saved = 0
        skipped = 0

        for recipe in recipes:
            try:
                ingredients_str = ', '.join(recipe.get('ingredients', []))

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
                    recipe['external_id'],
                    recipe['title'],
                    recipe.get('summary', ''),
                    recipe.get('instructions', ''),
                    ingredients_str,
                    recipe.get('prep_time_min'),
                    recipe.get('cook_time_min'),
                    recipe.get('total_time_min'),
                    recipe.get('servings'),
                    'myplate_kitchen',
                    'myplate_kitchen',
                    recipe.get('source_url', ''),
                    recipe['license_code'],
                    recipe['attribution_text'],
                    recipe.get('category', 'American'),
                    recipe.get('image_url', ''),
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))

                if cursor.rowcount > 0:
                    saved += 1
                else:
                    skipped += 1

            except Exception as e:
                print(f"      DB error: {str(e)[:50]}")

        conn.commit()
        conn.close()

        print(f"\n   💾 Database update: {saved} new, {skipped} duplicates skipped")
        return saved

    def run(self):
        """Main collection process."""
        print("=" * 60)
        print("🚀 MYPLATE KITCHEN RECIPE COLLECTOR")
        print("=" * 60)
        print("Target: https://www.myplate.gov/myplate-kitchen/recipes")
        print("\n⚠️  If this times out:")
        print("  1. Run from Windows PowerShell (not WSL)")
        print("  2. Check if you can access the URL in your browser")
        print("  3. Try: curl -I https://www.myplate.gov/myplate-kitchen/recipes")

        # Collect ALL recipes (no limit)
        recipes = self.collect_myplate_recipes(limit=None)

        # Save to database
        if recipes:
            saved = self.save_to_database(recipes)

        # Show final stats
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM recipes")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM recipes WHERE source_key = 'myplate_kitchen'")
        myplate_count = cursor.fetchone()[0]

        conn.close()

        print("\n" + "=" * 60)
        print("📊 FINAL RESULTS")
        print("=" * 60)
        print(f"📚 Total recipes in database: {total}")
        print(f"🇺🇸 MyPlate recipes: {myplate_count}")

        print("\n💡 Next steps:")
        print("1. Get MFDS API key for 2000+ Korean recipes:")
        print("   https://www.foodsafetykorea.go.kr/api/openApiInfo.do")
        print("2. Your current recipes are ready to use!")


if __name__ == "__main__":
    collector = MyPlateCollector()
    collector.run()