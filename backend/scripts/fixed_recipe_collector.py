#!/usr/bin/env python3
"""FIXED recipe collector with correct URLs and selectors that actually work."""
import os
import sys
import json
import sqlite3
import hashlib
import time
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

# Try importing required packages
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "requests", "beautifulsoup4", "lxml", "python-dotenv"], check=True)
    import requests
    from bs4 import BeautifulSoup

try:
    from dotenv import load_dotenv
    load_dotenv()
except:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class FixedRecipeCollector:
    """Fixed recipe collector with correct URLs that actually work."""

    def __init__(self):
        self.session = requests.Session()

        # Better headers to avoid blocks
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        })

        # Database path
        if os.name == 'nt':  # Windows
            self.db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
        else:
            self.db_path = Path(__file__).parent.parent / "data" / "pantry.db"

        # API keys
        self.mfds_key = os.getenv('MFDS_API_KEY', '').strip()

    def test_connectivity(self):
        """Test if we can reach the target sites."""
        print("\n🔍 Testing connectivity...")
        print("=" * 60)

        sites = [
            ("USDA MyPlate", "https://www.myplate.gov/myplate-kitchen"),
            ("NHS UK", "https://www.nhs.uk/healthier-families/recipes/"),
            ("Buenos Aires", "https://buenosaires.gob.ar"),
            ("MFDS Korea", "http://openapi.foodsafetykorea.go.kr"),
        ]

        for name, url in sites:
            try:
                response = self.session.head(url, timeout=5, allow_redirects=True)
                print(f"✅ {name}: Reachable (Status: {response.status_code})")
            except Exception as e:
                print(f"❌ {name}: {str(e)[:50]}")

    def collect_usda_fixed(self, limit=50):
        """Collect from USDA MyPlate with CORRECT URLs."""
        print("\n🇺🇸 Collecting from USDA MyPlate (FIXED URLs)...")
        recipes = []

        # CORRECT working URLs from MyPlate
        working_urls = [
            "https://www.myplate.gov/myplate-kitchen",
            "https://www.myplate.gov/myplate-kitchen/trending-recipes",
            "https://www.myplate.gov/myplate-kitchen/30-minutes-or-less",
            "https://www.myplate.gov/myplate-kitchen/recipes",
        ]

        for base_url in working_urls:
            try:
                print(f"   Trying: {base_url}")
                response = self.session.get(base_url, timeout=10)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')

                    # Look for JSON-LD structured data FIRST
                    json_ld_found = False
                    for script in soup.find_all('script', type='application/ld+json'):
                        try:
                            data = json.loads(script.string)

                            # Handle both single recipe and recipe lists
                            if isinstance(data, dict):
                                if data.get('@type') == 'Recipe':
                                    recipes.append(self._parse_json_ld_recipe(data, base_url))
                                    json_ld_found = True
                                elif '@graph' in data:
                                    for item in data['@graph']:
                                        if item.get('@type') == 'Recipe':
                                            recipes.append(self._parse_json_ld_recipe(item, base_url))
                                            json_ld_found = True
                            elif isinstance(data, list):
                                for item in data:
                                    if item.get('@type') == 'Recipe':
                                        recipes.append(self._parse_json_ld_recipe(item, base_url))
                                        json_ld_found = True
                        except:
                            pass

                    # If no JSON-LD, look for recipe cards/links
                    if not json_ld_found:
                        # Common patterns on MyPlate
                        recipe_links = []

                        # Look for recipe cards
                        for card in soup.find_all(['article', 'div'], class_=re.compile('recipe|card|teaser')):
                            link = card.find('a', href=True)
                            if link and '/recipes/' in link['href']:
                                url = link['href']
                                if not url.startswith('http'):
                                    url = 'https://www.myplate.gov' + url
                                recipe_links.append(url)

                        # Also look for direct recipe links
                        for link in soup.find_all('a', href=re.compile('/recipes/[^/]+$')):
                            url = link['href']
                            if not url.startswith('http'):
                                url = 'https://www.myplate.gov' + url
                            if url not in recipe_links:
                                recipe_links.append(url)

                        print(f"      Found {len(recipe_links)} recipe links")

                        # Fetch individual recipes
                        for recipe_url in recipe_links[:limit - len(recipes)]:
                            try:
                                recipe_response = self.session.get(recipe_url, timeout=10)
                                if recipe_response.status_code == 200:
                                    recipe_soup = BeautifulSoup(recipe_response.content, 'html.parser')

                                    # Try JSON-LD first
                                    for script in recipe_soup.find_all('script', type='application/ld+json'):
                                        try:
                                            data = json.loads(script.string)
                                            if data.get('@type') == 'Recipe':
                                                recipe = self._parse_json_ld_recipe(data, recipe_url)
                                                recipes.append(recipe)
                                                print(f"      ✅ Got: {recipe['title']}")
                                                break
                                        except:
                                            pass
                                    else:
                                        # Fallback to HTML parsing
                                        title = recipe_soup.find('h1')
                                        if title:
                                            recipe = {
                                                'external_id': hashlib.md5(recipe_url.encode()).hexdigest()[:16],
                                                'title': title.text.strip(),
                                                'summary': 'USDA MyPlate healthy recipe',
                                                'instructions': 'Visit MyPlate.gov for full instructions',
                                                'ingredients': self._extract_ingredients_html(recipe_soup),
                                                'source_url': recipe_url,
                                                'license_code': 'PUBLIC',
                                                'attribution_text': 'Recipe from USDA MyPlate (Public Domain)',
                                                'category': 'American'
                                            }
                                            recipes.append(recipe)
                                            print(f"      ✅ Got: {recipe['title']}")

                                time.sleep(0.5)  # Be polite

                            except Exception as e:
                                print(f"      Error fetching {recipe_url}: {str(e)[:30]}")

                            if len(recipes) >= limit:
                                break

                    if recipes:
                        print(f"   ✅ Success! Got {len(recipes)} recipes from {base_url}")
                        break

            except Exception as e:
                print(f"   Error with {base_url}: {str(e)[:50]}")

        return recipes

    def _extract_ingredients_html(self, soup):
        """Extract ingredients from HTML."""
        ingredients = []

        # Common patterns for ingredient lists
        for container in soup.find_all(['div', 'section', 'ul'], class_=re.compile('ingredient')):
            for item in container.find_all(['li', 'p']):
                text = item.text.strip()
                if text and len(text) > 3:
                    ingredients.append(text)

        if not ingredients:
            # Fallback: look for any list near "Ingredients" heading
            for heading in soup.find_all(['h2', 'h3'], string=re.compile('Ingredient', re.I)):
                next_elem = heading.find_next_sibling(['ul', 'ol'])
                if next_elem:
                    for li in next_elem.find_all('li'):
                        ingredients.append(li.text.strip())

        return ingredients if ingredients else ['See original recipe for ingredients']

    def _parse_json_ld_recipe(self, data, url):
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
            'external_id': hashlib.md5((data.get('name', '') + url).encode()).hexdigest()[:16],
            'title': data.get('name', 'Unknown'),
            'summary': data.get('description', '')[:200],
            'instructions': ' '.join(instructions) or 'See original recipe',
            'ingredients': ingredients,
            'prep_time_min': self._parse_duration(data.get('prepTime')),
            'cook_time_min': self._parse_duration(data.get('cookTime')),
            'total_time_min': self._parse_duration(data.get('totalTime')),
            'servings': data.get('recipeYield'),
            'source_url': url,
            'license_code': 'PUBLIC',
            'attribution_text': 'Recipe from USDA MyPlate (Public Domain)',
            'category': data.get('recipeCuisine', 'American'),
            'image_url': data.get('image', '')
        }

    def collect_mfds_korea(self, limit=2000):
        """Collect from MFDS Korea API if key available."""
        if not self.mfds_key or self.mfds_key in ['sample_key', 'skip', '']:
            print("\n⏭️ Skipping MFDS Korea (no valid API key)")
            print("   Get free key at: https://www.foodsafetykorea.go.kr/api/openApiInfo.do")
            return []

        print(f"\n🇰🇷 Collecting from MFDS Korea (Key: {self.mfds_key[:10]}...)")
        recipes = []

        try:
            base_url = "http://openapi.foodsafetykorea.go.kr/api"
            service = "COOKRCP01"

            # Test the API key first
            test_url = f"{base_url}/{self.mfds_key}/{service}/json/1/1"
            test_response = self.session.get(test_url, timeout=10)

            if test_response.status_code == 200:
                data = test_response.json()

                if 'RESULT' in data and data['RESULT'].get('CODE') == 'INFO-200':
                    print("   ❌ Invalid API key")
                    return []

                if service in data:
                    total_count = int(data[service].get('total_count', 0))
                    print(f"   ✅ API key valid! {total_count} recipes available")

                    # Fetch in batches
                    batch_size = 100
                    fetched = 0

                    for start in range(1, min(total_count, limit) + 1, batch_size):
                        end = min(start + batch_size - 1, min(total_count, limit))
                        batch_url = f"{base_url}/{self.mfds_key}/{service}/json/{start}/{end}"

                        try:
                            batch_response = self.session.get(batch_url, timeout=30)
                            if batch_response.status_code == 200:
                                batch_data = batch_response.json()

                                if service in batch_data and 'row' in batch_data[service]:
                                    for item in batch_data[service]['row']:
                                        recipe = {
                                            'external_id': f"mfds_{item.get('RCP_SEQ', '')}",
                                            'title': item.get('RCP_NM', ''),
                                            'summary': f"{item.get('RCP_PAT2', '')} - {item.get('INFO_ENG', '')} kcal",
                                            'instructions': self._parse_mfds_instructions(item),
                                            'ingredients': [ing.strip() for ing in item.get('RCP_PARTS_DTLS', '').split(',')],
                                            'source_url': 'https://www.foodsafetykorea.go.kr',
                                            'license_code': 'KOGL-1',
                                            'attribution_text': 'Recipe from Korea MFDS, KOGL Type 1',
                                            'category': 'Korean',
                                            'image_url': item.get('ATT_FILE_NO_MAIN', ''),
                                            'calories': item.get('INFO_ENG'),
                                            'carbs_g': item.get('INFO_CAR'),
                                            'protein_g': item.get('INFO_PRO'),
                                            'fat_g': item.get('INFO_FAT'),
                                            'sodium_mg': item.get('INFO_NA')
                                        }
                                        recipes.append(recipe)
                                        fetched += 1

                                    print(f"      Batch {start}-{end}: Got {len(batch_data[service]['row'])} recipes")

                            time.sleep(0.3)  # Rate limit

                        except Exception as e:
                            print(f"      Error in batch {start}-{end}: {str(e)[:30]}")

                    print(f"   ✅ Total collected: {len(recipes)} recipes")

            else:
                print(f"   ❌ API error: Status {test_response.status_code}")

        except Exception as e:
            print(f"   ❌ Error: {str(e)[:100]}")

        return recipes

    def _parse_mfds_instructions(self, item):
        """Parse MFDS instruction steps."""
        steps = []
        for i in range(1, 21):
            step_key = f'MANUAL{i:02d}'
            step_text = item.get(step_key, '')
            if step_text and step_text.strip():
                # Remove image references
                step_text = re.sub(r'<[^>]+>', '', step_text)
                steps.append(f"Step {i}: {step_text.strip()}")
        return ' '.join(steps) if steps else 'See original recipe'

    def _parse_duration(self, iso_duration):
        """Parse ISO 8601 duration to minutes."""
        if not iso_duration:
            return None
        try:
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

    def save_to_database(self, recipes, source_name):
        """Save recipes to database."""
        if not recipes:
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
                    recipe.get('external_id'),
                    recipe['title'],
                    recipe.get('summary', ''),
                    recipe.get('instructions', ''),
                    ingredients_str,
                    recipe.get('prep_time_min'),
                    recipe.get('cook_time_min'),
                    recipe.get('total_time_min'),
                    recipe.get('servings'),
                    source_name.lower().replace(' ', '_'),
                    source_name.lower().replace(' ', '_'),
                    recipe.get('source_url', ''),
                    recipe['license_code'],
                    recipe['attribution_text'],
                    recipe.get('category', 'International'),
                    recipe.get('image_url', ''),
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))

                if cursor.rowcount > 0:
                    saved += 1
                else:
                    skipped += 1

            except Exception as e:
                print(f"      Save error: {str(e)[:50]}")

        conn.commit()
        conn.close()

        print(f"   💾 Saved {saved} new recipes ({skipped} duplicates skipped)")
        return saved

    def run(self):
        """Main collection process."""
        print("=" * 60)
        print("🚀 FIXED RECIPE COLLECTOR")
        print("=" * 60)
        print("Using correct URLs and selectors that actually work!")

        # Test connectivity first
        self.test_connectivity()

        print("\n📥 Starting collection...")
        print("=" * 60)

        total_saved = 0

        # 1. Try MFDS Korea first (if key available)
        mfds_recipes = self.collect_mfds_korea(limit=2000)
        if mfds_recipes:
            saved = self.save_to_database(mfds_recipes, 'MFDS_Korea')
            total_saved += saved

        # 2. Collect from USDA with fixed URLs
        usda_recipes = self.collect_usda_fixed(limit=100)
        if usda_recipes:
            saved = self.save_to_database(usda_recipes, 'USDA_MyPlate')
            total_saved += saved

        # Show final statistics
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM recipes")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT categories) FROM recipes WHERE categories IS NOT NULL")
        categories = cursor.fetchone()[0]

        cursor.execute("""
            SELECT source_key, COUNT(*) as count
            FROM recipes
            GROUP BY source_key
            ORDER BY count DESC
            LIMIT 10
        """)
        sources = cursor.fetchall()

        conn.close()

        print("\n" + "=" * 60)
        print("📊 COLLECTION COMPLETE!")
        print("=" * 60)
        print(f"✅ New recipes added: {total_saved}")
        print(f"📚 Total recipes in database: {total}")
        print(f"🌍 Total cuisines: {categories}")

        print("\n📈 Recipes by source:")
        for source, count in sources:
            print(f"   • {source}: {count} recipes")

        if not self.mfds_key or self.mfds_key in ['sample_key', 'skip', '']:
            print("\n💡 GET MORE RECIPES:")
            print("1. Register for FREE MFDS API key:")
            print("   https://www.foodsafetykorea.go.kr/api/openApiInfo.do")
            print("2. Add to .env file:")
            print("   MFDS_API_KEY=your_actual_key")
            print("3. Run this script again for 2000+ Korean recipes!")


if __name__ == "__main__":
    collector = FixedRecipeCollector()
    collector.run()