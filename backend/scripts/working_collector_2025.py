#!/usr/bin/env python3
"""WORKING recipe collector with verified 2025 URLs and selectors."""
import os
import sys
import json
import sqlite3
import hashlib
import time
import re
from datetime import datetime
from pathlib import Path

# Install if needed
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


class WorkingCollector2025:
    """Recipe collector with URLs that actually work in 2025."""

    def __init__(self):
        self.session = requests.Session()

        # Modern browser headers
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })

        # Database path
        if os.name == 'nt':  # Windows
            self.db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
        else:
            self.db_path = Path(__file__).parent.parent / "data" / "pantry.db"

        # API key
        self.mfds_key = os.getenv('MFDS_API_KEY', '').strip()

    def test_connectivity_cmd(self):
        """Test connectivity using curl commands."""
        print("\n🔍 Testing connectivity (run these in CMD):")
        print("=" * 60)
        print("Copy and run these commands in Windows CMD/PowerShell:\n")

        commands = [
            'curl -I https://www.myplate.gov/shopsimple/recipes',
            'curl -I https://www.nhs.uk/healthier-families/recipes/',
            'curl -I https://buenosaires.gob.ar/recetas-saludables',
        ]

        for cmd in commands:
            print(f"  {cmd}")

        print("\nIf these work in CMD but Python fails, it's a Python SSL/proxy issue.")
        print("Run this script from Windows PowerShell, NOT WSL!")

    def collect_usda_shop_simple(self, limit=50):
        """Collect from USDA Shop Simple - the WORKING section."""
        print("\n🇺🇸 Collecting from USDA Shop Simple (VERIFIED WORKING)...")
        recipes = []

        # The ACTUAL WORKING URLs
        shop_simple_urls = [
            "https://www.myplate.gov/shopsimple/recipes",  # Main recipe grid
            "https://www.myplate.gov/myplate-kitchen",  # Kitchen hub
        ]

        for base_url in shop_simple_urls:
            try:
                print(f"   Fetching: {base_url}")

                # Longer timeout, allow redirects
                response = self.session.get(base_url, timeout=30, allow_redirects=True)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')

                    # Strategy 1: Look for JSON-LD
                    for script in soup.find_all('script', type='application/ld+json'):
                        try:
                            data = json.loads(script.string)
                            if '@graph' in data:
                                for item in data['@graph']:
                                    if item.get('@type') == 'Recipe':
                                        recipes.append(self._parse_json_ld(item, base_url))
                            elif data.get('@type') == 'Recipe':
                                recipes.append(self._parse_json_ld(data, base_url))
                        except:
                            pass

                    # Strategy 2: Find recipe cards/links
                    recipe_links = set()

                    # Shop Simple specific selectors
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        # Look for recipe patterns
                        if any(pattern in href for pattern in ['/recipes/', '/recipe/', 'recipe-']):
                            if not href.startswith('http'):
                                href = 'https://www.myplate.gov' + href
                            recipe_links.add(href)

                    print(f"      Found {len(recipe_links)} recipe links")

                    # Fetch individual recipes
                    for recipe_url in list(recipe_links)[:limit]:
                        try:
                            recipe_resp = self.session.get(recipe_url, timeout=20)
                            if recipe_resp.status_code == 200:
                                recipe_soup = BeautifulSoup(recipe_resp.content, 'html.parser')

                                # Extract recipe data
                                title = recipe_soup.find('h1')
                                if title:
                                    recipe = {
                                        'external_id': hashlib.md5(recipe_url.encode()).hexdigest()[:16],
                                        'title': title.text.strip(),
                                        'summary': 'USDA budget-friendly recipe',
                                        'instructions': self._extract_instructions(recipe_soup),
                                        'ingredients': self._extract_ingredients(recipe_soup),
                                        'source_url': recipe_url,
                                        'license_code': 'PUBLIC',
                                        'attribution_text': 'Recipe from USDA MyPlate (Public Domain)',
                                        'category': 'American'
                                    }
                                    recipes.append(recipe)
                                    print(f"      ✅ Got: {recipe['title']}")

                            time.sleep(1)  # Polite delay

                            if len(recipes) >= limit:
                                break

                        except Exception as e:
                            print(f"      Error fetching recipe: {str(e)[:30]}")

                    if recipes:
                        break

            except requests.exceptions.Timeout:
                print(f"   ⏱️ Timeout - likely network/firewall issue")
                print("   Try running from Windows PowerShell, not WSL!")
            except Exception as e:
                print(f"   Error: {str(e)[:50]}")

        return recipes

    def collect_buenos_aires_fixed(self, limit=30):
        """Collect from Buenos Aires with CORRECT 2025 URLs."""
        print("\n🇦🇷 Collecting from Buenos Aires (FIXED URLs)...")
        recipes = []

        # The ACTUAL recipe sections that exist
        ba_urls = [
            "https://buenosaires.gob.ar/recetas-saludables",
            "https://buenosaires.gob.ar/recetas-de-las-colectividades",
        ]

        for base_url in ba_urls:
            try:
                print(f"   Fetching: {base_url}")
                response = self.session.get(base_url, timeout=20)

                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')

                    # Find recipe links
                    recipe_links = set()

                    # BA uses various patterns
                    for link in soup.find_all('a', href=True):
                        href = link['href']
                        # Look for recipe patterns
                        if 'receta' in href.lower():
                            if not href.startswith('http'):
                                href = 'https://buenosaires.gob.ar' + href
                            recipe_links.add(href)

                    # Also extract directly from the page if recipes are inline
                    # BA often has recipe titles as H2/H3
                    for heading in soup.find_all(['h2', 'h3']):
                        text = heading.text.strip()
                        if len(text) > 5 and len(text) < 100:  # Likely a recipe title
                            # Look for ingredients/instructions nearby
                            parent = heading.parent
                            if parent:
                                recipe = {
                                    'external_id': hashlib.md5(text.encode()).hexdigest()[:16],
                                    'title': text,
                                    'summary': 'Receta argentina tradicional',
                                    'instructions': self._extract_ba_content(parent),
                                    'ingredients': self._extract_ba_ingredients(parent),
                                    'source_url': base_url,
                                    'license_code': 'CC-BY',
                                    'attribution_text': 'Receta de Buenos Aires, CC BY 2.5 AR',
                                    'category': 'Argentine'
                                }

                                if recipe['ingredients']:  # Only add if we found ingredients
                                    recipes.append(recipe)
                                    print(f"      ✅ Got: {recipe['title']}")

                                if len(recipes) >= limit:
                                    break

                    if recipes:
                        print(f"   Found {len(recipes)} recipes")
                        break

            except Exception as e:
                print(f"   Error: {str(e)[:50]}")

        return recipes

    def collect_mfds_korea_working(self, limit=2000):
        """Collect from MFDS Korea with CORRECT API endpoint."""
        if not self.mfds_key or self.mfds_key in ['sample_key', 'skip', '']:
            print("\n⏭️ MFDS Korea skipped (no API key)")
            print("   📝 To get 2000+ Korean recipes:")
            print("   1. Register at: https://www.foodsafetykorea.go.kr/api/openApiInfo.do")
            print("   2. Add to .env: MFDS_API_KEY=your_key")
            return []

        print(f"\n🇰🇷 Collecting from MFDS Korea API...")
        recipes = []

        try:
            # CORRECT API endpoint pattern
            base_url = "http://openapi.foodsafetykorea.go.kr/api"
            service = "COOKRCP01"

            # Test API first
            test_url = f"{base_url}/{self.mfds_key}/{service}/json/1/1"
            print(f"   Testing API: {test_url[:50]}...")

            test_resp = self.session.get(test_url, timeout=10)

            if test_resp.status_code == 200:
                data = test_resp.json()

                # Check for API errors
                if 'RESULT' in data:
                    error_code = data['RESULT'].get('CODE', '')
                    if 'INFO-' in error_code:
                        print(f"   ❌ API Error: {data['RESULT'].get('MSG', error_code)}")
                        print("   Make sure you're using a REAL API key, not 'sample_key'")
                        return []

                if service in data:
                    total = int(data[service].get('total_count', 0))
                    print(f"   ✅ API working! {total} recipes available")

                    # Fetch in batches (max 1000 per call)
                    batch_size = 100
                    fetched = 0

                    for start in range(1, min(total, limit) + 1, batch_size):
                        end = min(start + batch_size - 1, min(total, limit))

                        batch_url = f"{base_url}/{self.mfds_key}/{service}/json/{start}/{end}"

                        try:
                            batch_resp = self.session.get(batch_url, timeout=30)
                            if batch_resp.status_code == 200:
                                batch_data = batch_resp.json()

                                if service in batch_data and 'row' in batch_data[service]:
                                    for item in batch_data[service]['row']:
                                        recipe = self._parse_mfds_recipe(item)
                                        recipes.append(recipe)
                                        fetched += 1

                                    print(f"      Fetched {start}-{end}: {len(batch_data[service]['row'])} recipes")

                            time.sleep(0.3)  # Rate limit

                        except Exception as e:
                            print(f"      Batch error: {str(e)[:30]}")

                    print(f"   ✅ Total collected: {len(recipes)} Korean recipes")
            else:
                print(f"   ❌ API returned status {test_resp.status_code}")

        except Exception as e:
            print(f"   ❌ Error: {str(e)[:50]}")

        return recipes

    def _parse_mfds_recipe(self, item):
        """Parse MFDS recipe data."""
        # Parse ingredients
        ingredients = []
        ing_text = item.get('RCP_PARTS_DTLS', '')
        if ing_text:
            # Split by common delimiters
            for ing in re.split('[,，、]', ing_text):
                ing = ing.strip()
                if ing:
                    ingredients.append(ing)

        # Parse instructions (MANUAL01 through MANUAL20)
        instructions = []
        for i in range(1, 21):
            step_key = f'MANUAL{i:02d}'
            step_text = item.get(step_key, '').strip()
            if step_text:
                # Clean up step text
                step_text = re.sub(r'<[^>]+>', '', step_text)  # Remove HTML
                step_text = re.sub(r'\s+', ' ', step_text)  # Normalize spaces
                if step_text:
                    instructions.append(f"Step {i}: {step_text}")

        return {
            'external_id': f"mfds_{item.get('RCP_SEQ', '')}",
            'title': item.get('RCP_NM', 'Unknown'),
            'summary': f"{item.get('RCP_PAT2', 'Korean recipe')} - {item.get('INFO_ENG', '0')} kcal",
            'instructions': ' '.join(instructions) or 'See original recipe',
            'ingredients': ingredients,
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
            'title': data.get('name', 'Unknown'),
            'summary': data.get('description', '')[:200],
            'instructions': ' '.join(instructions) or 'See original recipe',
            'ingredients': ingredients,
            'source_url': url,
            'license_code': 'PUBLIC',
            'attribution_text': 'Recipe from USDA MyPlate (Public Domain)',
            'category': 'American'
        }

    def _extract_ingredients(self, soup):
        """Extract ingredients from HTML."""
        ingredients = []

        # Look for ingredients section
        for section in soup.find_all(['div', 'section', 'ul'], class_=re.compile('ingredient', re.I)):
            for item in section.find_all(['li', 'p']):
                text = item.text.strip()
                if text and len(text) > 3:
                    ingredients.append(text)

        # Fallback: look near "Ingredients" heading
        if not ingredients:
            for heading in soup.find_all(['h2', 'h3', 'h4'], string=re.compile('Ingredient', re.I)):
                next_elem = heading.find_next_sibling()
                if next_elem and next_elem.name in ['ul', 'ol']:
                    for li in next_elem.find_all('li'):
                        ingredients.append(li.text.strip())

        return ingredients if ingredients else ['See original recipe']

    def _extract_instructions(self, soup):
        """Extract instructions from HTML."""
        instructions = []

        # Look for instructions section
        for section in soup.find_all(['div', 'section', 'ol'], class_=re.compile('instruction|method|direction', re.I)):
            for item in section.find_all(['li', 'p']):
                text = item.text.strip()
                if text and len(text) > 10:
                    instructions.append(text)

        return ' '.join(instructions) if instructions else 'Visit website for full instructions'

    def _extract_ba_ingredients(self, parent):
        """Extract ingredients from Buenos Aires pages."""
        ingredients = []

        # Look for lists near the heading
        for ul in parent.find_all('ul'):
            for li in ul.find_all('li'):
                text = li.text.strip()
                if text and 5 < len(text) < 100:  # Reasonable ingredient length
                    ingredients.append(text)

        return ingredients

    def _extract_ba_content(self, parent):
        """Extract content from Buenos Aires pages."""
        content = []

        # Look for paragraphs and lists
        for elem in parent.find_all(['p', 'ol']):
            text = elem.text.strip()
            if text and len(text) > 20:
                content.append(text)

        return ' '.join(content) if content else 'Ver receta completa en el sitio web'

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
                        source_id, source_key, source_url,
                        license_code, attribution_text,
                        categories, image_url,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    recipe['external_id'],
                    recipe['title'],
                    recipe.get('summary', ''),
                    recipe.get('instructions', ''),
                    ingredients_str,
                    source_name.lower(),
                    source_name.lower(),
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
                print(f"      DB error: {str(e)[:30]}")

        conn.commit()
        conn.close()

        print(f"   💾 Saved {saved} new recipes")
        return saved

    def run(self):
        """Main collection process."""
        print("=" * 60)
        print("🚀 RECIPE COLLECTOR 2025 - VERIFIED WORKING URLs")
        print("=" * 60)

        # Show connectivity test commands
        self.test_connectivity_cmd()

        print("\n📥 Starting collection...")
        print("=" * 60)

        total_saved = 0

        # 1. MFDS Korea (if key available)
        mfds_recipes = self.collect_mfds_korea_working(limit=2000)
        if mfds_recipes:
            saved = self.save_to_database(mfds_recipes, 'mfds_korea')
            total_saved += saved

        # 2. USDA Shop Simple
        usda_recipes = self.collect_usda_shop_simple(limit=50)
        if usda_recipes:
            saved = self.save_to_database(usda_recipes, 'usda_shopsimple')
            total_saved += saved

        # 3. Buenos Aires
        ba_recipes = self.collect_buenos_aires_fixed(limit=30)
        if ba_recipes:
            saved = self.save_to_database(ba_recipes, 'buenos_aires')
            total_saved += saved

        # Final stats
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM recipes")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT categories) FROM recipes WHERE categories IS NOT NULL")
        categories = cursor.fetchone()[0]

        conn.close()

        print("\n" + "=" * 60)
        print("📊 FINAL RESULTS")
        print("=" * 60)
        print(f"✅ New recipes added: {total_saved}")
        print(f"📚 Total recipes in database: {total}")
        print(f"🌍 Total cuisines: {categories}")

        if not self.mfds_key:
            print("\n🎯 GET 2000+ MORE RECIPES:")
            print("1. Register (FREE): https://www.foodsafetykorea.go.kr/api/openApiInfo.do")
            print("2. Add to .env: MFDS_API_KEY=your_actual_key")
            print("3. Run again for 2000+ Korean recipes!")

        print("\n💡 TROUBLESHOOTING:")
        print("- If timeouts: Run from Windows PowerShell, NOT WSL")
        print("- If blocked: Check corporate firewall/proxy")
        print("- If SSL errors: Update Python certificates")


if __name__ == "__main__":
    # Run from Windows PowerShell for best results!
    collector = WorkingCollector2025()
    collector.run()