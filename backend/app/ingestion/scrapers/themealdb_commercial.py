"""TheMealDB commercial API collector.

Requires Patreon subscription for commercial use.
API: https://www.themealdb.com/api.php
Target: 300+ recipes with images and videos
"""
import asyncio
import aiohttp
import json
import hashlib
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path


class TheMealDBCollector:
    """Collector for TheMealDB recipes (commercial tier)."""

    BASE_URL = "https://www.themealdb.com/api/json/v2"

    def __init__(self, api_key: str = None, rate_limit: float = 0.5):
        """Initialize collector with API key."""
        self.api_key = api_key or "1"  # "1" is test key with limited recipes
        self.rate_limit = rate_limit
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession(
            headers={
                'Accept': 'application/json',
                'User-Agent': 'PantryPal-Collector/1.0 (Commercial; +https://pantrypal.app/bot)'
            }
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()

    async def fetch_categories(self) -> List[str]:
        """Fetch all recipe categories."""
        url = f"{self.BASE_URL}/{self.api_key}/categories.php"

        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    if data and 'categories' in data:
                        return [cat['strCategory'] for cat in data['categories']]
        except Exception as e:
            print(f"Error fetching categories: {e}")

        return []

    async def fetch_recipes_by_category(self, category: str) -> List[Dict]:
        """Fetch recipes for a specific category."""
        url = f"{self.BASE_URL}/{self.api_key}/filter.php"
        params = {'c': category}

        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data and 'meals' in data:
                        return data['meals']
        except Exception as e:
            print(f"Error fetching {category} recipes: {e}")

        return []

    async def fetch_recipe_details(self, meal_id: str) -> Optional[Dict]:
        """Fetch detailed recipe information."""
        url = f"{self.BASE_URL}/{self.api_key}/lookup.php"
        params = {'i': meal_id}

        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data and 'meals' in data and data['meals']:
                        return data['meals'][0]
        except Exception as e:
            print(f"Error fetching recipe {meal_id}: {e}")

        return None

    def parse_recipe(self, meal_data: Dict) -> Optional[Dict]:
        """Parse TheMealDB recipe into our schema."""
        try:
            recipe = {
                'external_id': meal_data.get('idMeal', ''),
                'source_key': 'themealdb',
                'title': meal_data.get('strMeal', ''),
                'category': meal_data.get('strCategory', ''),
                'area': meal_data.get('strArea', ''),  # Cuisine
                'tags': [],
            }

            # Skip if no title
            if not recipe['title']:
                return None

            # Parse tags
            if meal_data.get('strTags'):
                recipe['tags'] = [tag.strip() for tag in meal_data['strTags'].split(',')]

            # Parse ingredients and measurements
            ingredients = []
            for i in range(1, 21):
                ingredient = meal_data.get(f'strIngredient{i}', '').strip()
                measure = meal_data.get(f'strMeasure{i}', '').strip()

                if ingredient:
                    # Combine measurement and ingredient
                    if measure and measure != ' ':
                        ingredients.append(f"{measure} {ingredient}")
                    else:
                        ingredients.append(ingredient)

            recipe['ingredients'] = ingredients

            # Skip if too few ingredients
            if len(ingredients) < 2:
                return None

            # Instructions
            instructions = meal_data.get('strInstructions', '')
            recipe['instructions'] = self._clean_instructions(instructions)

            # Skip if no instructions
            if not recipe['instructions'] or len(recipe['instructions']) < 50:
                return None

            # Media (check commercial license terms)
            recipe['image_url'] = meal_data.get('strMealThumb', '')
            recipe['video_url'] = meal_data.get('strYoutube', '')

            # Source link
            if meal_data.get('strSource'):
                recipe['original_source'] = meal_data['strSource']

            # Times (estimate based on instructions length)
            recipe['total_time_min'] = self._estimate_time(instructions)
            recipe['servings'] = 4  # Default, TheMealDB doesn't specify

            # License and attribution
            recipe['source_id'] = 'themealdb'
            recipe['source_url'] = f"https://www.themealdb.com/meal/{recipe['external_id']}"
            recipe['license_code'] = 'API'  # Commercial API terms
            recipe['attribution_text'] = f"Recipe data from TheMealDB (Commercial License)"
            recipe['instructions_allowed'] = 1  # With commercial license
            recipe['share_alike_required'] = 0

            # Image licensing (verify with current terms)
            recipe['image_licence_allowed'] = 0  # Default false, verify terms
            if recipe['image_url']:
                recipe['image_hotlink_only'] = recipe['image_url']

            # Generate fingerprint
            recipe['fingerprint'] = self._generate_fingerprint(recipe)

            # Add cuisine as category
            if recipe['area']:
                recipe['categories'] = [recipe['category'], recipe['area']]
            else:
                recipe['categories'] = [recipe['category']]

            return recipe

        except Exception as e:
            print(f"Error parsing recipe: {e}")
            return None

    def _clean_instructions(self, instructions: str) -> str:
        """Clean and format instructions."""
        if not instructions:
            return ""

        # TheMealDB often has \r\n line breaks
        instructions = instructions.replace('\r\n', '\n')
        instructions = instructions.replace('\r', '\n')

        # Remove excessive whitespace
        lines = instructions.split('\n')
        cleaned = []

        for line in lines:
            line = line.strip()
            if line:
                cleaned.append(line)

        # Join with proper spacing
        return '\n'.join(cleaned)

    def _estimate_time(self, instructions: str) -> int:
        """Estimate cooking time based on instructions."""
        # Simple heuristic based on instruction length
        # and common cooking keywords

        base_time = 30  # Default

        instruction_lower = instructions.lower()

        # Quick recipes
        if any(word in instruction_lower for word in ['quick', 'easy', 'simple', '10 minute']):
            base_time = 20

        # Slow recipes
        if any(word in instruction_lower for word in ['overnight', 'slow cook', 'hours', 'marinate']):
            base_time = 60

        # Baking
        if 'bake' in instruction_lower or 'oven' in instruction_lower:
            base_time = 45

        # Adjust by instruction length
        instruction_lines = instructions.count('\n') + 1
        if instruction_lines > 10:
            base_time += 15

        return min(base_time, 120)  # Cap at 2 hours

    def _generate_fingerprint(self, recipe: Dict) -> str:
        """Generate fingerprint for deduplication."""
        ingredients = sorted([
            ing.lower().strip()
            for ing in recipe.get('ingredients', [])
        ])

        title_normalized = recipe['title'][:48].lower().strip()
        fp_string = ':'.join(ingredients) + ':' + title_normalized

        return hashlib.sha1(fp_string.encode()).hexdigest()

    def _save_raw_response(self, data: Dict, category: str = "general"):
        """Save raw API response for debugging."""
        raw_dir = Path(__file__).parent.parent.parent.parent / "data" / "raw" / "themealdb"
        raw_dir.mkdir(parents=True, exist_ok=True)

        date_str = datetime.now().strftime("%Y%m%d")
        filename = raw_dir / date_str / f"{category}_{datetime.now().strftime('%H%M%S')}.json"
        filename.parent.mkdir(exist_ok=True)

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    async def collect(self, limit: int = 300) -> List[Dict]:
        """Collect recipes from TheMealDB."""
        recipes = []

        print(f"🍔 Starting TheMealDB collection (target: {limit} recipes)...")

        # Get categories
        categories = await self.fetch_categories()
        await asyncio.sleep(self.rate_limit)

        if not categories:
            print("⚠️ No categories found. Using defaults...")
            categories = ['Beef', 'Chicken', 'Dessert', 'Lamb', 'Pasta',
                         'Pork', 'Seafood', 'Vegetarian', 'Breakfast']

        print(f"   Found {len(categories)} categories")

        # Fetch recipes from each category
        all_meal_ids = set()

        for category in categories:
            category_meals = await self.fetch_recipes_by_category(category)

            for meal in category_meals:
                if meal.get('idMeal'):
                    all_meal_ids.add(meal['idMeal'])

            await asyncio.sleep(self.rate_limit)

            if len(all_meal_ids) >= limit:
                break

        print(f"   Found {len(all_meal_ids)} unique recipes")

        # Fetch details for each recipe
        for i, meal_id in enumerate(list(all_meal_ids)[:limit], 1):
            meal_data = await self.fetch_recipe_details(meal_id)

            if meal_data:
                recipe = self.parse_recipe(meal_data)
                if recipe:
                    recipes.append(recipe)

                    # Save raw data
                    self._save_raw_response({'meal': meal_data}, f"recipe_{meal_id}")

            if i % 10 == 0:
                print(f"   Processed {i}/{min(len(all_meal_ids), limit)} recipes...")

            await asyncio.sleep(self.rate_limit)

        print(f"✅ TheMealDB collection complete: {len(recipes)} recipes")
        return recipes


async def main():
    """Test TheMealDB collector."""
    import os

    # Get API key from environment or use test key
    api_key = os.getenv('THEMEALDB_API_KEY', '1')

    async with TheMealDBCollector(api_key=api_key) as collector:
        recipes = await collector.collect(limit=10)

        print(f"\nCollected {len(recipes)} recipes from TheMealDB")

        for i, recipe in enumerate(recipes[:3], 1):
            print(f"\n{i}. {recipe['title']}")
            print(f"   Category: {recipe.get('category')}")
            print(f"   Cuisine: {recipe.get('area')}")
            print(f"   Ingredients: {len(recipe['ingredients'])} items")
            print(f"   Instructions: {len(recipe['instructions'])} chars")
            print(f"   Has image: {bool(recipe.get('image_url'))}")

        # Save to file
        output_path = Path(__file__).parent.parent.parent.parent / "data" / "collected" / "themealdb_recipes.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({
                'source': 'TheMealDB',
                'license': 'API Commercial',
                'collected_at': datetime.utcnow().isoformat(),
                'count': len(recipes),
                'recipes': recipes
            }, f, ensure_ascii=False, indent=2)

        print(f"\n✅ Saved to {output_path}")


if __name__ == "__main__":
    asyncio.run(main())