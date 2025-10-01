#!/usr/bin/env python3
"""NHS Healthier Families recipe collector using the CORRECT URL."""
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


class NHSCollector:
    """Collector for NHS Healthier Families recipes."""

    def __init__(self):
        self.session = requests.Session()

        # Standard browser headers
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
            'Connection': 'keep-alive',
        })

        if os.name == 'nt':
            self.db_path = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "data" / "pantry.db"
        else:
            self.db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    def collect_nhs_recipes(self, limit=None):
        """Collect from NHS Healthier Families recipes page."""
        print("\n🇬🇧 Collecting from NHS Healthier Families...")
        print("   Using: https://www.nhs.uk/healthier-families/recipes/")

        recipes = []
        base_url = "https://www.nhs.uk"

        # The main recipes page with all recipes section
        recipes_url = "https://www.nhs.uk/healthier-families/recipes/"
        all_recipes_url = "https://www.nhs.uk/healthier-families/recipes/#all_recipes"

        try:
            print("   Fetching main recipes page...")

            # Try the all_recipes anchor first
            response = self.session.get(all_recipes_url, timeout=30)

            if response.status_code != 200:
                print(f"   Trying base URL instead...")
                response = self.session.get(recipes_url, timeout=30)

            if response.status_code != 200:
                print(f"   ❌ Got status {response.status_code}")
                return recipes

            soup = BeautifulSoup(response.content, 'html.parser')
            print("   ✅ Page loaded successfully")

            # NHS recipe pages typically have recipe cards or links
            recipe_links = set()

            # Strategy 1: Look for recipe cards/blocks
            # NHS often uses article tags or divs with specific classes
            for card in soup.find_all(['article', 'div', 'li'], class_=re.compile('recipe|food|meal', re.I)):
                # Find the link within the card
                link = card.find('a', href=True)
                if link:
                    href = link['href']
                    # Filter for actual recipe pages
                    if '/recipes/' in href and href != recipes_url:
                        if not href.startswith('http'):
                            href = base_url + href
                        recipe_links.add(href)

            # Strategy 2: Find all links that look like recipe pages
            for link in soup.find_all('a', href=True):
                href = link['href']
                # NHS recipe URLs typically contain /recipes/ and end with specific recipe names
                if '/recipes/' in href and href not in [recipes_url, all_recipes_url]:
                    # Filter out category pages and other non-recipe links
                    if not any(skip in href for skip in ['#', 'search', 'print', 'pdf', 'category', 'type']):
                        # Check if it looks like a recipe (ends with recipe name pattern)
                        if re.search(r'/recipes/[^/]+/?$', href):
                            if not href.startswith('http'):
                                href = base_url + href
                            recipe_links.add(href)

            # Strategy 3: Look for specific recipe list sections
            # NHS might have recipe lists in specific containers
            recipe_sections = soup.find_all(['section', 'div'], id=re.compile('all_recipes|recipe-list', re.I))
            for section in recipe_sections:
                for link in section.find_all('a', href=True):
                    href = link['href']
                    if '/recipes/' in href:
                        if not href.startswith('http'):
                            href = base_url + href
                        recipe_links.add(href)

            # Also check for data attributes that might contain recipe URLs
            for elem in soup.find_all(['div', 'a'], attrs={'data-url': True}):
                url = elem.get('data-url')
                if url and '/recipes/' in url:
                    if not url.startswith('http'):
                        url = base_url + url
                    recipe_links.add(url)

            print(f"   Found {len(recipe_links)} recipe links")

            # If no individual recipe links found, try to extract recipes from the page itself
            if not recipe_links:
                print("   No individual recipe links found, extracting from page...")

                # Look for recipe titles on the page
                for heading in soup.find_all(['h2', 'h3', 'h4']):
                    title = heading.text.strip()
                    # Check if this looks like a recipe title
                    if title and not any(skip in title.lower() for skip in ['recipes', 'categories', 'search', 'filter']):
                        # Check if there's recipe-like content near this heading
                        parent = heading.parent
                        if parent:
                            # Simple recipe extracted from the listing
                            recipe = {
                                'external_id': hashlib.md5(title.encode()).hexdigest()[:16],
                                'title': title,
                                'summary': 'Healthy recipe from NHS',
                                'instructions': 'Visit NHS website for full recipe',
                                'ingredients': ['See NHS website for ingredients'],
                                'source_url': all_recipes_url,
                                'license_code': 'OGL',
                                'attribution_text': '© Crown copyright, NHS Healthier Families, licensed under OGL v3.0',
                                'category': 'British'
                            }
                            recipes.append(recipe)
                            print(f"      ✅ Found: {title[:50]}")

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

                        # Extract recipe data
                        recipe = self._extract_recipe_from_page(recipe_soup, recipe_url)
                        if recipe:
                            recipes.append(recipe)
                            print(f"      ✅ Got: {recipe['title'][:50]}")

                    time.sleep(1)  # Be polite to NHS servers

                except Exception as e:
                    print(f"      Error: {str(e)[:50]}")

        except requests.exceptions.Timeout:
            print("   ⏱️ Connection timeout - NHS might be blocking or slow")
            print("   Try running from Windows PowerShell (not WSL)")
        except Exception as e:
            print(f"   ❌ Error: {str(e)[:100]}")

        print(f"\n   Summary: Collected {len(recipes)} recipes from NHS")
        return recipes

    def _extract_recipe_from_page(self, soup, url):
        """Extract recipe data from an NHS recipe page."""

        recipe = {}

        # Get title (usually in h1)
        title = soup.find('h1')
        if not title:
            # Try other heading levels
            title = soup.find(['h2', 'h3'])

        if not title:
            return None

        recipe['title'] = title.text.strip()
        recipe['external_id'] = hashlib.md5((recipe['title'] + url).encode()).hexdigest()[:16]
        recipe['source_url'] = url
        recipe['license_code'] = 'OGL'
        recipe['attribution_text'] = '© Crown copyright, NHS Healthier Families, licensed under OGL v3.0'
        recipe['category'] = 'British'

        # Get summary/description
        # NHS often has an intro paragraph
        summary = None
        for p in soup.find_all('p'):
            text = p.text.strip()
            if len(text) > 50 and len(text) < 300:
                # Likely a description paragraph
                if not any(skip in text.lower() for skip in ['cookie', 'javascript', 'browser']):
                    summary = text
                    break

        recipe['summary'] = summary[:200] if summary else 'Healthy recipe from NHS Healthier Families'

        # Get ingredients
        ingredients = []

        # Look for ingredients section
        # NHS uses various patterns
        ingredients_section = soup.find(['div', 'section'], class_=re.compile('ingredient', re.I))
        if ingredients_section:
            for item in ingredients_section.find_all(['li', 'p']):
                text = item.text.strip()
                if text and len(text) > 2:
                    ingredients.append(text)

        # Alternative: look for "Ingredients" heading
        if not ingredients:
            for heading in soup.find_all(['h2', 'h3', 'h4'], string=re.compile('ingredient', re.I)):
                # Get the next sibling that's a list
                next_elem = heading.find_next_sibling()
                while next_elem:
                    if next_elem.name in ['ul', 'ol']:
                        for li in next_elem.find_all('li'):
                            ingredients.append(li.text.strip())
                        break
                    elif next_elem.name in ['h2', 'h3', 'h4']:
                        # Hit another heading, stop
                        break
                    next_elem = next_elem.find_next_sibling()

        # Another pattern: ingredients in a specific div
        if not ingredients:
            for div in soup.find_all('div'):
                # Check if this div contains ingredient-like content
                text = div.text
                if 'ingredient' in text.lower() and len(text) < 1000:
                    # Extract list items
                    for li in div.find_all('li'):
                        ing = li.text.strip()
                        if ing and len(ing) > 2:
                            ingredients.append(ing)
                    if ingredients:
                        break

        recipe['ingredients'] = ingredients if ingredients else ['See NHS website for ingredients']

        # Get instructions/method
        instructions = []

        # Look for method/instructions section
        method_section = soup.find(['div', 'section'], class_=re.compile('method|instruction|direction', re.I))
        if method_section:
            for item in method_section.find_all(['li', 'p']):
                text = item.text.strip()
                if text and len(text) > 10:
                    instructions.append(text)

        # Alternative: look for "Method" or "Instructions" heading
        if not instructions:
            for heading in soup.find_all(['h2', 'h3', 'h4'], string=re.compile('method|instruction|direction', re.I)):
                next_elem = heading.find_next_sibling()
                while next_elem:
                    if next_elem.name in ['ul', 'ol']:
                        for li in next_elem.find_all('li'):
                            instructions.append(li.text.strip())
                        break
                    elif next_elem.name == 'div':
                        # Check if it contains steps
                        for li in next_elem.find_all('li'):
                            instructions.append(li.text.strip())
                        if instructions:
                            break
                    elif next_elem.name in ['h2', 'h3', 'h4']:
                        break
                    next_elem = next_elem.find_next_sibling()

        recipe['instructions'] = ' '.join(instructions) if instructions else 'Visit NHS website for full instructions'

        # Get cooking time if available
        time_info = soup.find(string=re.compile(r'\d+\s*min', re.I))
        if time_info:
            match = re.search(r'(\d+)\s*min', time_info)
            if match:
                recipe['total_time_min'] = int(match.group(1))

        # Get servings if available
        servings_info = soup.find(string=re.compile(r'serves?\s*\d+', re.I))
        if servings_info:
            match = re.search(r'serves?\s*(\d+)', servings_info, re.I)
            if match:
                recipe['servings'] = int(match.group(1))

        return recipe

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
                        total_time_min, servings,
                        source_id, source_key, source_url,
                        license_code, attribution_text,
                        categories, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    recipe['external_id'],
                    recipe['title'],
                    recipe.get('summary', ''),
                    recipe.get('instructions', ''),
                    ingredients_str,
                    recipe.get('total_time_min'),
                    recipe.get('servings'),
                    'nhs_healthier_families',
                    'nhs_healthier_families',
                    recipe.get('source_url', ''),
                    recipe['license_code'],
                    recipe['attribution_text'],
                    recipe.get('category', 'British'),
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
        print("🇬🇧 NHS HEALTHIER FAMILIES RECIPE COLLECTOR")
        print("=" * 60)
        print("Target: https://www.nhs.uk/healthier-families/recipes/")
        print("License: OGL v3.0 (Open Government Licence)")
        print("\n⚠️  If this times out:")
        print("  1. Run from Windows PowerShell (not WSL)")
        print("  2. NHS might have rate limiting - be patient")
        print("  3. Test: curl -I https://www.nhs.uk/healthier-families/recipes/")

        # Collect ALL recipes (no limit)
        recipes = self.collect_nhs_recipes(limit=None)

        # Save to database
        if recipes:
            saved = self.save_to_database(recipes)

        # Show final stats
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM recipes")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM recipes WHERE source_key = 'nhs_healthier_families'")
        nhs_count = cursor.fetchone()[0]

        conn.close()

        print("\n" + "=" * 60)
        print("📊 FINAL RESULTS")
        print("=" * 60)
        print(f"📚 Total recipes in database: {total}")
        print(f"🇬🇧 NHS recipes: {nhs_count}")

        print("\n✅ NHS Attribution:")
        print("   All NHS recipes are © Crown copyright")
        print("   Licensed under Open Government Licence v3.0")
        print("   Proper attribution has been stored for each recipe")

        print("\n💡 Next steps:")
        print("1. Run MyPlate collector: python scripts\\myplate_collector.py")
        print("2. Get MFDS API key for 2000+ Korean recipes")
        print("3. Your app is ready with the recipes you have!")


if __name__ == "__main__":
    collector = NHSCollector()
    collector.run()