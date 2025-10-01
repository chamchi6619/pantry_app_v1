#!/usr/bin/env python3
"""Smart recipe collector - skips sources without API keys, uses all available sources."""
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

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class SmartRecipeCollector:
    """Intelligent recipe collector that works with available API keys."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8',
        })

        # Database path
        if os.name == 'nt':  # Windows
            self.db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
        else:
            self.db_path = Path(__file__).parent.parent / "data" / "pantry.db"

        # Check available API keys
        self.api_keys = {
            'mfds': os.getenv('MFDS_API_KEY', '').strip(),
            'themealdb': os.getenv('THEMEALDB_API_KEY', '').strip(),
            'spoonacular': os.getenv('SPOONACULAR_API_KEY', '').strip(),
            'edamam_id': os.getenv('EDAMAM_APP_ID', '').strip(),
            'edamam_key': os.getenv('EDAMAM_APP_KEY', '').strip(),
        }

        self.collected_count = 0

    def check_available_sources(self):
        """Check which sources are available."""
        print("\n🔍 Checking available sources...")
        print("=" * 60)

        available = []

        # Check MFDS Korea
        if self.api_keys['mfds'] and self.api_keys['mfds'] not in ['sample_key', 'skip', '']:
            print("✅ MFDS Korea API: Ready (2000+ Korean recipes)")
            available.append('mfds')
        else:
            print("⏭️  MFDS Korea API: Skipped (no API key)")
            print("   → Get free key at: https://www.foodsafetykorea.go.kr/api/openApiInfo.do")

        # Check TheMealDB
        if self.api_keys['themealdb'] and self.api_keys['themealdb'] != '':
            if self.api_keys['themealdb'] == '1':
                print("✅ TheMealDB: Ready (test mode - 20 recipes)")
            else:
                print("✅ TheMealDB: Ready (commercial - 300+ recipes)")
            available.append('themealdb')
        else:
            print("✅ TheMealDB: Ready (free tier - 300+ recipes)")
            available.append('themealdb')  # Works without key too

        # Skip USDA MyPlate - use dedicated myplate_collector.py instead
        # (Has timeout issues in smart collector)
        print("⏭️  USDA MyPlate: Skipped (use myplate_collector.py separately)")
        # available.append('usda')

        print("✅ NHS UK: Ready (500+ recipes, OGL license)")
        available.append('nhs')

        print("✅ Buenos Aires: Ready (300+ recipes, CC BY 2.5)")
        available.append('buenos_aires')

        # Check optional APIs
        if self.api_keys['spoonacular']:
            print("✅ Spoonacular: Ready")
            available.append('spoonacular')

        if self.api_keys['edamam_id'] and self.api_keys['edamam_key']:
            print("✅ Edamam: Ready")
            available.append('edamam')

        print(f"\n📊 Total available sources: {len(available)}")
        return available

    def collect_mfds_korea(self, limit=100):
        """Collect from MFDS Korea API - requires key."""
        if not self.api_keys['mfds'] or self.api_keys['mfds'] in ['sample_key', 'skip']:
            return []

        print("\n🇰🇷 Collecting from MFDS Korea...")
        recipes = []

        try:
            base_url = "http://openapi.foodsafetykorea.go.kr/api"
            api_key = self.api_keys['mfds']
            service = "COOKRCP01"

            # Get total count first
            url = f"{base_url}/{api_key}/{service}/json/1/5"
            response = self.session.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if service in data:
                    total = min(limit, int(data[service].get('total_count', 0)))
                    print(f"   Found {total} recipes available")

                    # Fetch in batches
                    batch_size = 100
                    for start in range(1, total + 1, batch_size):
                        end = min(start + batch_size - 1, total)
                        batch_url = f"{base_url}/{api_key}/{service}/json/{start}/{end}"

                        batch_response = self.session.get(batch_url, timeout=30)
                        if batch_response.status_code == 200:
                            batch_data = batch_response.json()

                            if service in batch_data and 'row' in batch_data[service]:
                                for item in batch_data[service]['row']:
                                    # Parse recipe
                                    recipe = {
                                        'external_id': item.get('RCP_SEQ', ''),
                                        'title': item.get('RCP_NM', ''),
                                        'summary': f"Korean recipe - {item.get('RCP_PAT2', '')}",
                                        'instructions': self._parse_mfds_instructions(item),
                                        'ingredients': item.get('RCP_PARTS_DTLS', '').split(','),
                                        'calories': item.get('INFO_ENG'),
                                        'source_url': 'https://www.foodsafetykorea.go.kr',
                                        'license_code': 'KOGL-1',
                                        'attribution_text': 'Recipe from Korea Food Safety (MFDS)',
                                        'category': 'Korean',
                                        'image_url': item.get('ATT_FILE_NO_MAIN', '')
                                    }
                                    recipes.append(recipe)

                            print(f"   Fetched {start}-{end} ({len(recipes)} total)")

                        time.sleep(0.5)  # Be polite

        except Exception as e:
            print(f"   Error: {str(e)[:100]}")

        return recipes

    def _parse_mfds_instructions(self, item):
        """Parse MFDS instruction steps."""
        steps = []
        for i in range(1, 21):
            step = item.get(f'MANUAL{i:02d}', '')
            if step and step.strip():
                steps.append(f"{i}. {step}")
        return ' '.join(steps) if steps else 'See original recipe'

    def collect_usda_myplate(self, limit=50):
        """Collect from USDA MyPlate Kitchen - public domain."""
        print("\n🇺🇸 Collecting from USDA MyPlate Kitchen...")
        recipes = []

        try:
            base_url = "https://www.myplate.gov"

            # Try the recipe search/listing pages
            search_urls = [
                f"{base_url}/myplate-kitchen/recipes",
                f"{base_url}/recipes",
                f"{base_url}/myplate-kitchen"
            ]

            for search_url in search_urls:
                try:
                    response = self.session.get(search_url, timeout=10)
                    if response.status_code == 200:
                        soup = BeautifulSoup(response.content, 'html.parser')

                        # Look for recipe links
                        recipe_links = []

                        # Common patterns for recipe links
                        for link in soup.find_all('a', href=True):
                            href = link['href']
                            if '/recipes/' in href or '/recipe/' in href:
                                if href.startswith('/'):
                                    href = base_url + href
                                recipe_links.append(href)

                        # Also look for JSON-LD structured data
                        for script in soup.find_all('script', type='application/ld+json'):
                            try:
                                data = json.loads(script.string)
                                if isinstance(data, dict) and data.get('@type') == 'Recipe':
                                    recipes.append(self._parse_json_ld_recipe(data, search_url))
                                elif isinstance(data, list):
                                    for item in data:
                                        if item.get('@type') == 'Recipe':
                                            recipes.append(self._parse_json_ld_recipe(item, search_url))
                            except:
                                pass

                        # Fetch individual recipe pages
                        for recipe_url in recipe_links[:limit]:
                            recipe = self._fetch_usda_recipe(recipe_url)
                            if recipe:
                                recipes.append(recipe)
                                print(f"   ✅ Got: {recipe['title']}")

                            if len(recipes) >= limit:
                                break

                            time.sleep(1)

                        if recipes:
                            break

                except Exception as e:
                    print(f"   Error with {search_url}: {str(e)[:50]}")

            # Fallback: Use known recipe patterns
            if not recipes:
                print("   Using fallback recipe IDs...")
                recipe_ids = ['sweet-potato-turkey-chili', 'veggie-quesadillas', 'banana-split-oatmeal',
                             'turkey-chili', 'chicken-salad', 'tuna-salad', 'egg-salad-sandwich']

                for recipe_id in recipe_ids[:limit]:
                    url = f"{base_url}/recipes/{recipe_id}"
                    recipe = self._fetch_usda_recipe(url)
                    if recipe:
                        recipes.append(recipe)
                        print(f"   ✅ Got: {recipe['title']}")
                    time.sleep(1)

        except Exception as e:
            print(f"   Error: {str(e)[:100]}")

        return recipes

    def _fetch_usda_recipe(self, url):
        """Fetch a single USDA recipe."""
        try:
            response = self.session.get(url, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                # Look for JSON-LD
                for script in soup.find_all('script', type='application/ld+json'):
                    try:
                        data = json.loads(script.string)
                        if data.get('@type') == 'Recipe':
                            return self._parse_json_ld_recipe(data, url)
                    except:
                        pass

                # Fallback to HTML parsing
                title = soup.find('h1')
                if title:
                    return {
                        'external_id': hashlib.md5(url.encode()).hexdigest()[:16],
                        'title': title.text.strip(),
                        'summary': 'USDA MyPlate recipe',
                        'instructions': 'Visit MyPlate.gov for full instructions',
                        'ingredients': ['See original recipe'],
                        'source_url': url,
                        'license_code': 'PUBLIC',
                        'attribution_text': 'Recipe from USDA MyPlate (Public Domain)',
                        'category': 'American'
                    }
        except:
            pass
        return None

    def _parse_json_ld_recipe(self, data, url):
        """Parse JSON-LD recipe data."""
        ingredients = data.get('recipeIngredient', [])
        if isinstance(ingredients, str):
            ingredients = [ingredients]

        instructions = []
        if 'recipeInstructions' in data:
            for inst in data['recipeInstructions']:
                if isinstance(inst, dict):
                    instructions.append(inst.get('text', ''))
                else:
                    instructions.append(str(inst))

        return {
            'external_id': hashlib.md5(url.encode()).hexdigest()[:16],
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
            'category': 'American'
        }

    def collect_nhs_uk(self, limit=50):
        """Collect from NHS UK - OGL license."""
        print("\n🇬🇧 Collecting from NHS UK Healthier Families...")
        recipes = []

        try:
            base_url = "https://www.nhs.uk"
            recipes_url = f"{base_url}/healthier-families/recipes"

            response = self.session.get(recipes_url, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                # Find recipe links
                recipe_links = []
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    if '/recipes/' in href:
                        if href.startswith('/'):
                            href = base_url + href
                        if href not in recipe_links:
                            recipe_links.append(href)

                print(f"   Found {len(recipe_links)} recipe links")

                # Fetch each recipe
                for recipe_url in recipe_links[:limit]:
                    try:
                        recipe_response = self.session.get(recipe_url, timeout=10)
                        if recipe_response.status_code == 200:
                            recipe_soup = BeautifulSoup(recipe_response.content, 'html.parser')

                            # Parse recipe
                            title = recipe_soup.find('h1')
                            if title:
                                # Look for structured data
                                ingredients = []
                                instructions = []

                                # Find ingredients section
                                ing_section = recipe_soup.find(['div', 'section'], class_=re.compile('ingredient'))
                                if ing_section:
                                    for li in ing_section.find_all('li'):
                                        ingredients.append(li.text.strip())

                                # Find instructions
                                inst_section = recipe_soup.find(['div', 'section'], class_=re.compile('method|instruction'))
                                if inst_section:
                                    for li in inst_section.find_all('li'):
                                        instructions.append(li.text.strip())

                                recipe = {
                                    'external_id': hashlib.md5(recipe_url.encode()).hexdigest()[:16],
                                    'title': title.text.strip(),
                                    'summary': 'Healthy recipe from NHS',
                                    'instructions': ' '.join(instructions) or 'Visit NHS website for instructions',
                                    'ingredients': ingredients or ['See original recipe'],
                                    'source_url': recipe_url,
                                    'license_code': 'OGL',
                                    'attribution_text': '© Crown copyright, NHS Healthier Families, licensed under OGL v3.0',
                                    'category': 'British'
                                }

                                recipes.append(recipe)
                                print(f"   ✅ Got: {recipe['title']}")

                        time.sleep(1)

                    except Exception as e:
                        print(f"   Error fetching recipe: {str(e)[:50]}")

        except Exception as e:
            print(f"   Error: {str(e)[:100]}")

        return recipes

    def collect_buenos_aires(self, limit=50):
        """Collect from Buenos Aires - CC BY 2.5 AR."""
        print("\n🇦🇷 Collecting from Buenos Aires...")
        recipes = []

        try:
            # Buenos Aires has published recipe collections
            base_url = "https://www.buenosaires.gob.ar"

            # Known recipe sections (these would need to be discovered)
            recipe_sections = [
                f"{base_url}/desarrolloeconomico/gastronomia/recetas",
                f"{base_url}/cultura/gastronomia",
            ]

            for section_url in recipe_sections:
                try:
                    response = self.session.get(section_url, timeout=10)
                    if response.status_code == 200:
                        soup = BeautifulSoup(response.content, 'html.parser')

                        # Look for recipe content
                        recipe_cards = soup.find_all(['article', 'div'], class_=re.compile('receta|recipe'))

                        for card in recipe_cards[:limit]:
                            title_elem = card.find(['h2', 'h3', 'h4'])
                            if title_elem:
                                recipe = {
                                    'external_id': hashlib.md5(title_elem.text.encode()).hexdigest()[:16],
                                    'title': title_elem.text.strip(),
                                    'summary': 'Traditional Argentine recipe',
                                    'instructions': 'Visit Buenos Aires website for full recipe',
                                    'ingredients': ['Traditional Argentine ingredients'],
                                    'source_url': section_url,
                                    'license_code': 'CC-BY',
                                    'attribution_text': 'Recipe from Buenos Aires, CC BY 2.5 AR',
                                    'category': 'Argentine'
                                }
                                recipes.append(recipe)

                        if recipes:
                            print(f"   Found {len(recipes)} recipes")
                            break

                except Exception as e:
                    print(f"   Error with {section_url}: {str(e)[:50]}")

        except Exception as e:
            print(f"   Error: {str(e)[:100]}")

        return recipes

    def collect_themealdb_all(self):
        """Collect all available recipes from TheMealDB."""
        print("\n🍽️ Collecting from TheMealDB (Free API)...")
        recipes = []
        base_url = "https://www.themealdb.com/api/json/v1/1"

        try:
            # Get recipes by first letter (comprehensive)
            for letter in 'abcdefghijklmnopqrstuvwxyz':
                try:
                    response = self.session.get(f"{base_url}/search.php?f={letter}", timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('meals'):
                            for meal in data['meals']:
                                recipe = self._parse_themealdb_meal(meal)
                                recipes.append(recipe)
                            print(f"   Letter {letter.upper()}: {len(data['meals'])} recipes")
                    time.sleep(0.3)
                except Exception as e:
                    print(f"   Error with letter {letter}: {str(e)[:30]}")

        except Exception as e:
            print(f"   Error: {str(e)[:100]}")

        return recipes

    def _parse_themealdb_meal(self, meal):
        """Parse TheMealDB meal object."""
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
            'external_id': f"mealdb_{meal.get('idMeal', '')}",
            'title': meal.get('strMeal', 'Unknown'),
            'summary': f"{meal.get('strCategory', 'Food')} from {meal.get('strArea', 'International')}",
            'instructions': meal.get('strInstructions', 'See original'),
            'ingredients': ingredients,
            'source_url': meal.get('strSource', ''),
            'license_code': 'API_FREE',
            'attribution_text': 'Recipe from TheMealDB',
            'category': meal.get('strArea', 'International'),
            'image_url': meal.get('strMealThumb', '')
        }

    def _parse_duration(self, iso_duration):
        """Parse ISO 8601 duration to minutes."""
        if not iso_duration:
            return None
        try:
            # Simple parsing for PT15M format
            if 'PT' in iso_duration:
                minutes = 0
                if 'H' in iso_duration:
                    hours = int(iso_duration.split('H')[0].split('PT')[1])
                    minutes += hours * 60
                if 'M' in iso_duration:
                    mins = int(iso_duration.split('M')[0].split('H')[-1].split('PT')[-1])
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
                    recipe.get('external_id', hashlib.md5(recipe['title'].encode()).hexdigest()[:16]),
                    recipe['title'],
                    recipe.get('summary', ''),
                    recipe.get('instructions', ''),
                    ingredients_str,
                    recipe.get('prep_time_min'),
                    recipe.get('cook_time_min'),
                    recipe.get('total_time_min'),
                    recipe.get('servings'),
                    source_name,
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

            except Exception as e:
                print(f"   Save error: {str(e)[:50]}")

        conn.commit()
        conn.close()

        print(f"   💾 Saved {saved} new recipes")
        return saved

    def run(self):
        """Main collection process."""
        print("=" * 60)
        print("🚀 SMART RECIPE COLLECTION")
        print("=" * 60)

        # Check what's available
        available = self.check_available_sources()

        if not available:
            print("\n❌ No sources available!")
            return

        print("\n📥 Starting collection from available sources...")
        print("=" * 60)

        total_saved = 0

        # Run collections based on what's available
        if 'mfds' in available:
            recipes = self.collect_mfds_korea(limit=200)
            if recipes:
                saved = self.save_to_database(recipes, 'MFDS_Korea')
                total_saved += saved

        # Skip USDA MyPlate - use dedicated collector instead
        # if 'usda' in available:
        #     recipes = self.collect_usda_myplate(limit=50)
        #     if recipes:
        #         saved = self.save_to_database(recipes, 'USDA_MyPlate')
        #         total_saved += saved

        if 'nhs' in available:
            recipes = self.collect_nhs_uk(limit=50)
            if recipes:
                saved = self.save_to_database(recipes, 'NHS_UK')
                total_saved += saved

        if 'buenos_aires' in available:
            recipes = self.collect_buenos_aires(limit=30)
            if recipes:
                saved = self.save_to_database(recipes, 'Buenos_Aires')
                total_saved += saved

        if 'themealdb' in available:
            recipes = self.collect_themealdb_all()
            if recipes:
                saved = self.save_to_database(recipes, 'TheMealDB')
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

        print("\n💡 To get more recipes:")
        print("1. Get MFDS API key: https://www.foodsafetykorea.go.kr/api/openApiInfo.do")
        print("2. Add to .env: MFDS_API_KEY=your_key")
        print("3. Run this script again!")


if __name__ == "__main__":
    collector = SmartRecipeCollector()
    collector.run()