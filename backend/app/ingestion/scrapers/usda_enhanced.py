"""Enhanced USDA MyPlate Kitchen recipe scraper.

Public domain recipes from USDA - no attribution required.
Uses sitemap.xml and JSON-LD structured data.
Target: 1000-3000 recipes
"""
import asyncio
import aiohttp
import json
import hashlib
import re
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup


class USDAEnhancedScraper:
    """Enhanced scraper for USDA MyPlate Kitchen recipes."""

    BASE_URL = "https://www.myplate.gov"
    SITEMAP_URL = f"{BASE_URL}/sitemap.xml"
    RECIPES_BASE = f"{BASE_URL}/myplate-kitchen/recipes"

    def __init__(self, rate_limit: float = 1.0):
        """Initialize scraper with rate limiting."""
        self.rate_limit = rate_limit
        self.session: Optional[aiohttp.ClientSession] = None
        self.recipe_urls: List[str] = []

    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession(
            headers={
                'User-Agent': 'PantryPal Recipe Collector (Educational/Non-Commercial Use)'
            }
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()

    async def fetch_sitemap(self) -> List[str]:
        """Fetch and parse sitemap to get recipe URLs."""
        recipe_urls = []

        try:
            async with self.session.get(self.SITEMAP_URL) as response:
                if response.status == 200:
                    sitemap_text = await response.text()

                    # Parse XML
                    root = ET.fromstring(sitemap_text)

                    # Extract URLs (handle namespace)
                    namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

                    for url_elem in root.findall('.//ns:url', namespace):
                        loc = url_elem.find('ns:loc', namespace)
                        if loc is not None and loc.text:
                            url = loc.text
                            # Filter for recipe URLs
                            if '/myplate-kitchen/recipes/' in url:
                                recipe_urls.append(url)

                    print(f"Found {len(recipe_urls)} recipe URLs in sitemap")

        except Exception as e:
            print(f"Error fetching sitemap: {e}")
            # Fallback: try common patterns
            recipe_urls = await self.discover_recipe_urls()

        return recipe_urls

    async def discover_recipe_urls(self) -> List[str]:
        """Discover recipe URLs by crawling category pages."""
        urls = []

        # Common recipe categories
        categories = [
            'breakfast', 'lunch', 'dinner', 'snacks',
            'appetizers', 'sides', 'desserts', 'beverages',
            'soups', 'salads', 'sandwiches', 'main-dishes'
        ]

        for category in categories:
            category_url = f"{self.RECIPES_BASE}?f[0]=recipe-category:{category}"

            try:
                async with self.session.get(category_url) as response:
                    if response.status == 200:
                        html = await response.text()
                        soup = BeautifulSoup(html, 'html.parser')

                        # Find recipe links
                        for link in soup.find_all('a', href=True):
                            href = link['href']
                            if '/myplate-kitchen/recipes/' in href and href not in urls:
                                # Make absolute URL
                                if not href.startswith('http'):
                                    href = self.BASE_URL + href
                                urls.append(href)

                await asyncio.sleep(self.rate_limit)

            except Exception as e:
                print(f"Error discovering {category} recipes: {e}")

        return urls

    async def fetch_recipe_page(self, url: str) -> Optional[Dict]:
        """Fetch and parse a recipe page."""
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    html = await response.text()
                    return self.parse_recipe_page(html, url)
                else:
                    print(f"HTTP {response.status} for {url}")
                    return None

        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    def parse_recipe_page(self, html: str, url: str) -> Optional[Dict]:
        """Parse recipe data from HTML page."""
        soup = BeautifulSoup(html, 'html.parser')

        # First try to find JSON-LD structured data
        json_ld_scripts = soup.find_all('script', type='application/ld+json')

        for script in json_ld_scripts:
            try:
                data = json.loads(script.string)

                # Handle different JSON-LD formats
                if isinstance(data, list):
                    data = data[0]

                if data.get('@type') == 'Recipe':
                    return self.parse_json_ld_recipe(data, url)

            except json.JSONDecodeError:
                continue

        # Fallback to manual HTML parsing
        return self.parse_html_recipe(soup, url)

    def parse_json_ld_recipe(self, data: Dict, url: str) -> Dict:
        """Parse recipe from JSON-LD structured data."""
        recipe = {
            'external_id': self._extract_id_from_url(url),
            'source_key': 'usda_myplate',
            'title': data.get('name', ''),
            'summary': data.get('description', ''),
            'source_url': url,
        }

        # Parse ingredients
        ingredients = []
        for ing in data.get('recipeIngredient', []):
            if isinstance(ing, str):
                ingredients.append(ing)
            elif isinstance(ing, dict) and 'name' in ing:
                ingredients.append(ing['name'])
        recipe['ingredients'] = ingredients

        # Parse instructions
        instructions = []
        instruction_data = data.get('recipeInstructions', [])

        for inst in instruction_data:
            if isinstance(inst, str):
                instructions.append(inst)
            elif isinstance(inst, dict):
                text = inst.get('text') or inst.get('name') or ''
                if text:
                    instructions.append(text)

        recipe['instructions'] = self._format_instructions(instructions)

        # Parse times
        recipe['prep_time_min'] = self._parse_duration(data.get('prepTime'))
        recipe['cook_time_min'] = self._parse_duration(data.get('cookTime'))
        recipe['total_time_min'] = self._parse_duration(data.get('totalTime'))

        # Parse yield and servings
        recipe_yield = data.get('recipeYield')
        if isinstance(recipe_yield, str):
            recipe['yields'] = recipe_yield
            # Try to extract number
            match = re.search(r'\d+', recipe_yield)
            if match:
                recipe['servings'] = int(match.group())
        elif isinstance(recipe_yield, (int, float)):
            recipe['servings'] = int(recipe_yield)
            recipe['yields'] = f"{recipe_yield} servings"

        # Parse nutrition
        nutrition_data = data.get('nutrition')
        if nutrition_data:
            recipe['nutrition_json'] = self._parse_nutrition(nutrition_data)

        # Images
        image = data.get('image')
        if image:
            if isinstance(image, str):
                recipe['image_url'] = image
            elif isinstance(image, dict):
                recipe['image_url'] = image.get('url', '')
            elif isinstance(image, list) and image:
                recipe['image_url'] = image[0] if isinstance(image[0], str) else image[0].get('url', '')

        # Categories and keywords
        recipe['categories'] = []
        if data.get('recipeCategory'):
            cats = data['recipeCategory']
            recipe['categories'] = cats if isinstance(cats, list) else [cats]

        recipe['tags'] = []
        if data.get('keywords'):
            keywords = data['keywords']
            if isinstance(keywords, str):
                recipe['tags'] = [k.strip() for k in keywords.split(',')]
            elif isinstance(keywords, list):
                recipe['tags'] = keywords

        return self._finalize_recipe(recipe)

    def parse_html_recipe(self, soup: BeautifulSoup, url: str) -> Optional[Dict]:
        """Fallback HTML parser for recipe pages."""
        recipe = {
            'external_id': self._extract_id_from_url(url),
            'source_key': 'usda_myplate',
            'source_url': url,
        }

        # Find title
        title_elem = soup.find('h1') or soup.find('title')
        if not title_elem:
            return None
        recipe['title'] = title_elem.get_text().strip()

        # Find description/summary
        desc_elem = soup.find('meta', {'name': 'description'}) or \
                   soup.find('div', class_='recipe-summary')
        if desc_elem:
            recipe['summary'] = desc_elem.get('content', '') or desc_elem.get_text().strip()

        # Find ingredients
        ingredients = []
        ing_container = soup.find('div', class_='recipe-ingredients') or \
                       soup.find('ul', class_='ingredients')

        if ing_container:
            for li in ing_container.find_all('li'):
                ing_text = li.get_text().strip()
                if ing_text:
                    ingredients.append(ing_text)

        recipe['ingredients'] = ingredients

        # Find instructions
        instructions = []
        inst_container = soup.find('div', class_='recipe-instructions') or \
                        soup.find('ol', class_='instructions')

        if inst_container:
            for li in inst_container.find_all('li'):
                inst_text = li.get_text().strip()
                if inst_text:
                    instructions.append(inst_text)

        recipe['instructions'] = self._format_instructions(instructions)

        # Find image
        img_elem = soup.find('img', class_='recipe-image') or \
                  soup.find('meta', {'property': 'og:image'})
        if img_elem:
            recipe['image_url'] = img_elem.get('src') or img_elem.get('content')

        return self._finalize_recipe(recipe)

    def _finalize_recipe(self, recipe: Dict) -> Dict:
        """Add final fields and validate recipe."""
        # Skip if missing required fields
        if not recipe.get('title') or len(recipe.get('ingredients', [])) < 2:
            return None

        # USDA is public domain - no attribution required
        recipe['license_code'] = 'PUBLIC'
        recipe['attribution_text'] = ''
        recipe['instructions_allowed'] = 1
        recipe['share_alike_required'] = 0

        # Generate fingerprint
        recipe['fingerprint'] = self._generate_fingerprint(recipe)

        # Default values
        if not recipe.get('servings'):
            recipe['servings'] = 4

        if not recipe.get('summary'):
            recipe['summary'] = f"A delicious {recipe['title'].lower()} recipe from USDA MyPlate Kitchen"

        return recipe

    def _extract_id_from_url(self, url: str) -> str:
        """Extract recipe ID from URL."""
        # Try to get the last path component
        parts = url.rstrip('/').split('/')
        return parts[-1] if parts else hashlib.md5(url.encode()).hexdigest()

    def _parse_duration(self, duration_str: str) -> Optional[int]:
        """Parse ISO 8601 duration to minutes."""
        if not duration_str:
            return None

        # ISO 8601 format: PT15M, PT1H30M, etc.
        match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', duration_str)
        if match:
            hours = int(match.group(1) or 0)
            minutes = int(match.group(2) or 0)
            return hours * 60 + minutes

        return None

    def _parse_nutrition(self, nutrition_data: Dict) -> str:
        """Parse nutrition information."""
        nutrition = {}

        if isinstance(nutrition_data, dict):
            # Schema.org format
            nutrition['calories'] = self._extract_nutrition_value(
                nutrition_data.get('calories')
            )
            nutrition['protein'] = self._extract_nutrition_value(
                nutrition_data.get('proteinContent')
            )
            nutrition['carbohydrates'] = self._extract_nutrition_value(
                nutrition_data.get('carbohydrateContent')
            )
            nutrition['fat'] = self._extract_nutrition_value(
                nutrition_data.get('fatContent')
            )
            nutrition['fiber'] = self._extract_nutrition_value(
                nutrition_data.get('fiberContent')
            )
            nutrition['sugar'] = self._extract_nutrition_value(
                nutrition_data.get('sugarContent')
            )
            nutrition['sodium'] = self._extract_nutrition_value(
                nutrition_data.get('sodiumContent')
            )

        return json.dumps({k: v for k, v in nutrition.items() if v is not None})

    def _extract_nutrition_value(self, value) -> Optional[float]:
        """Extract numeric value from nutrition string."""
        if value is None:
            return None

        if isinstance(value, (int, float)):
            return float(value)

        if isinstance(value, str):
            # Extract number from strings like "250 calories" or "15g"
            match = re.search(r'[\d.]+', value)
            if match:
                try:
                    return float(match.group())
                except ValueError:
                    pass

        return None

    def _format_instructions(self, instructions: List[str]) -> str:
        """Format instructions into numbered steps."""
        if not instructions:
            return ""

        formatted = []
        for i, step in enumerate(instructions, 1):
            step = step.strip()
            if step and not step[0].isdigit():
                formatted.append(f"{i}. {step}")
            else:
                formatted.append(step)

        return '\n'.join(formatted)

    def _generate_fingerprint(self, recipe: Dict) -> str:
        """Generate fingerprint for deduplication."""
        ingredients = sorted([
            ing.lower().strip()
            for ing in recipe.get('ingredients', [])
        ])

        title_normalized = recipe['title'][:48].lower().strip()
        fp_string = ':'.join(ingredients) + ':' + title_normalized

        return hashlib.sha1(fp_string.encode()).hexdigest()

    async def collect(self, limit: int = 1000) -> List[Dict]:
        """Collect recipes from USDA."""
        print(f"🇺🇸 Starting USDA collection (target: {limit} recipes)...")

        # Get recipe URLs from sitemap
        recipe_urls = await self.fetch_sitemap()

        if not recipe_urls:
            print("No recipe URLs found in sitemap, trying discovery...")
            recipe_urls = await self.discover_recipe_urls()

        # Limit to requested number
        recipe_urls = recipe_urls[:limit]

        print(f"Processing {len(recipe_urls)} recipe URLs...")

        recipes = []
        for i, url in enumerate(recipe_urls, 1):
            recipe = await self.fetch_recipe_page(url)

            if recipe:
                recipes.append(recipe)

            if i % 10 == 0:
                print(f"   Processed {i}/{len(recipe_urls)} pages, {len(recipes)} recipes collected...")

            await asyncio.sleep(self.rate_limit)

        print(f"✅ USDA collection complete: {len(recipes)} recipes")
        return recipes


async def main():
    """Test the enhanced USDA scraper."""
    async with USDAEnhancedScraper() as scraper:
        recipes = await scraper.collect(limit=10)

        print(f"\nCollected {len(recipes)} recipes from USDA")

        for i, recipe in enumerate(recipes[:3], 1):
            print(f"\n{i}. {recipe['title']}")
            print(f"   URL: {recipe['source_url']}")
            print(f"   Ingredients: {len(recipe['ingredients'])} items")
            print(f"   Instructions: {len(recipe.get('instructions', ''))} chars")

        # Save to file
        output_path = Path(__file__).parent.parent.parent.parent / "data" / "collected" / "usda_recipes.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({
                'source': 'USDA MyPlate Kitchen',
                'license': 'PUBLIC',
                'collected_at': datetime.utcnow().isoformat(),
                'count': len(recipes),
                'recipes': recipes
            }, f, ensure_ascii=False, indent=2)

        print(f"\n✅ Saved to {output_path}")


if __name__ == "__main__":
    asyncio.run(main())