"""Korea MFDS Food Safety API collector.

KOGL Type 1 license - full text allowed with attribution.
API: http://openapi.foodsafetykorea.go.kr/api/
Service: COOKRCP01
Target: 2000+ recipes with full nutrition data
"""
import asyncio
import aiohttp
import json
import hashlib
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path
import xml.etree.ElementTree as ET


class MFDSCollector:
    """Collector for Korea MFDS Food Safety recipes."""

    BASE_URL = "http://openapi.foodsafetykorea.go.kr/api"
    SERVICE_NAME = "COOKRCP01"

    # Field mappings from Korean API to our schema
    FIELD_MAPPINGS = {
        'RCP_SEQ': 'external_id',           # Recipe sequence number
        'RCP_NM': 'title',                   # Recipe name
        'RCP_WAY2': 'cooking_method',        # Cooking method
        'RCP_PAT2': 'category',              # Recipe category
        'INFO_WGT': 'serving_size',          # Serving size (g)
        'INFO_ENG': 'calories',              # Calories (kcal)
        'INFO_CAR': 'carbohydrates',         # Carbs (g)
        'INFO_PRO': 'protein',               # Protein (g)
        'INFO_FAT': 'fat',                   # Fat (g)
        'INFO_NA': 'sodium',                 # Sodium (mg)
        'HASH_TAG': 'tags',                  # Hash tags
        'ATT_FILE_NO_MAIN': 'image_url',     # Main image
        'ATT_FILE_NO_MK': 'process_image',   # Process image
        'RCP_PARTS_DTLS': 'ingredients_raw', # Raw ingredients text
    }

    # Process steps fields (1-20)
    MANUAL_FIELDS = [f'MANUAL{i:02d}' for i in range(1, 21)]
    MANUAL_IMG_FIELDS = [f'MANUAL_IMG{i:02d}' for i in range(1, 21)]

    def __init__(self, api_key: str = None, rate_limit: float = 2.0):
        """Initialize collector with API key and rate limiting."""
        self.api_key = api_key or "sample_key"  # Replace with actual key
        self.rate_limit = rate_limit
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession(
            headers={'Accept': 'application/json'}
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()

    async def fetch_page(self, start_idx: int = 1, end_idx: int = 100) -> Optional[Dict]:
        """Fetch a page of recipes from the API."""
        if not self.session:
            return None

        url = f"{self.BASE_URL}/{self.api_key}/{self.SERVICE_NAME}/json/{start_idx}/{end_idx}"

        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    text = await response.text()
                    # Parse JSON response
                    data = json.loads(text)

                    # Check for API success
                    if self.SERVICE_NAME in data:
                        service_data = data[self.SERVICE_NAME]
                        if 'RESULT' in service_data:
                            result = service_data['RESULT']
                            if result.get('CODE') == 'INFO-000':
                                return service_data

                    print(f"API returned non-success code: {data}")
                    return None
                else:
                    print(f"HTTP {response.status} for {url}")
                    return None

        except Exception as e:
            print(f"Error fetching MFDS page {start_idx}-{end_idx}: {e}")
            return None

    async def collect(self, limit: int = 2000) -> List[Dict]:
        """Collect recipes from MFDS API."""
        recipes = []
        page_size = 100

        print(f"🇰🇷 Starting MFDS collection (target: {limit} recipes)...")

        # Collect in batches
        for start in range(1, limit + 1, page_size):
            end = min(start + page_size - 1, limit)

            # Fetch page with rate limiting
            page_data = await self.fetch_page(start, end)
            await asyncio.sleep(self.rate_limit)

            if page_data and 'row' in page_data:
                rows = page_data['row']

                for row in rows:
                    recipe = self.parse_recipe(row)
                    if recipe:
                        recipes.append(recipe)

                print(f"   Collected {len(recipes)} recipes...")

                # Save raw data for debugging
                self._save_raw_response(page_data, start, end)

        print(f"✅ MFDS collection complete: {len(recipes)} recipes")
        return recipes

    def parse_recipe(self, raw_data: Dict) -> Optional[Dict]:
        """Parse MFDS API response into our recipe schema."""
        try:
            # Extract basic fields
            recipe = {
                'external_id': raw_data.get('RCP_SEQ', ''),
                'source_key': 'mfds_korea',
                'title': raw_data.get('RCP_NM', '').strip(),
                'title_ko': raw_data.get('RCP_NM', '').strip(),  # Keep original Korean
                'category': raw_data.get('RCP_PAT2', ''),
                'cooking_method': raw_data.get('RCP_WAY2', ''),
                'tags': self._parse_tags(raw_data.get('HASH_TAG', '')),
            }

            # Skip if no title
            if not recipe['title']:
                return None

            # Parse ingredients
            ingredients_raw = raw_data.get('RCP_PARTS_DTLS', '')
            recipe['ingredients'] = self._parse_ingredients(ingredients_raw)

            # Skip if too few ingredients
            if len(recipe['ingredients']) < 2:
                return None

            # Parse instructions from MANUAL fields
            instructions = self._parse_instructions(raw_data)
            recipe['instructions'] = instructions
            recipe['instructions_ko'] = instructions  # Keep original Korean

            # Skip if no instructions
            if not instructions or len(instructions) < 50:
                return None

            # Parse nutrition
            recipe['nutrition_json'] = json.dumps({
                'calories': self._safe_float(raw_data.get('INFO_ENG')),
                'carbohydrates': self._safe_float(raw_data.get('INFO_CAR')),
                'protein': self._safe_float(raw_data.get('INFO_PRO')),
                'fat': self._safe_float(raw_data.get('INFO_FAT')),
                'sodium': self._safe_float(raw_data.get('INFO_NA')),
                'serving_size_g': self._safe_float(raw_data.get('INFO_WGT'))
            })

            # Images
            recipe['image_url'] = raw_data.get('ATT_FILE_NO_MAIN', '')
            recipe['process_images'] = self._extract_process_images(raw_data)

            # Times (estimate based on category and method)
            recipe['total_time_min'] = self._estimate_time(
                raw_data.get('RCP_WAY2', ''),
                raw_data.get('RCP_PAT2', '')
            )

            # Servings (default to 1 if not specified)
            recipe['servings'] = 1

            # Source and attribution
            recipe['source_id'] = 'mfds_korea'
            recipe['source_url'] = f"https://www.foodsafetykorea.go.kr/recipe/{recipe['external_id']}"
            recipe['license_code'] = 'KOGL-1'
            recipe['attribution_text'] = 'Recipe from Korea Food Safety (식품안전나라), KOGL Type 1'
            recipe['instructions_allowed'] = 1
            recipe['share_alike_required'] = 0

            # Generate fingerprint for deduplication
            recipe['fingerprint'] = self._generate_fingerprint(recipe)

            return recipe

        except Exception as e:
            print(f"Error parsing MFDS recipe: {e}")
            return None

    def _parse_ingredients(self, ingredients_text: str) -> List[str]:
        """Parse ingredients from Korean text."""
        if not ingredients_text:
            return []

        # Korean ingredients are often separated by commas or newlines
        ingredients = []

        # Try different separators
        if ',' in ingredients_text:
            parts = ingredients_text.split(',')
        elif '\n' in ingredients_text:
            parts = ingredients_text.split('\n')
        else:
            # Treat as single ingredient list
            parts = [ingredients_text]

        for part in parts:
            part = part.strip()
            if part and len(part) > 1:
                ingredients.append(part)

        return ingredients

    def _parse_instructions(self, raw_data: Dict) -> str:
        """Extract and combine instruction steps."""
        steps = []

        for i, field in enumerate(self.MANUAL_FIELDS, 1):
            step_text = raw_data.get(field, '').strip()
            if step_text:
                # Format as numbered step
                steps.append(f"{i}. {step_text}")

        return '\n'.join(steps)

    def _extract_process_images(self, raw_data: Dict) -> List[str]:
        """Extract process/step images."""
        images = []

        for field in self.MANUAL_IMG_FIELDS:
            img_url = raw_data.get(field, '').strip()
            if img_url and img_url.startswith('http'):
                images.append(img_url)

        return images

    def _parse_tags(self, tag_string: str) -> List[str]:
        """Parse hashtags into list."""
        if not tag_string:
            return []

        # Remove # symbols and split
        tags = []
        for tag in tag_string.split('#'):
            tag = tag.strip()
            if tag:
                tags.append(tag)

        return tags

    def _safe_float(self, value) -> Optional[float]:
        """Safely convert to float."""
        if value is None or value == '':
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def _estimate_time(self, cooking_method: str, category: str) -> int:
        """Estimate cooking time based on method and category."""
        # Base estimates by cooking method
        time_estimates = {
            '굽기': 30,  # Grilling
            '끓이기': 45,  # Boiling/Stewing
            '볶기': 20,  # Stir-frying
            '찌기': 40,  # Steaming
            '튀기기': 25,  # Deep-frying
            '조리기': 35,  # Simmering
            '무침': 15,  # Mixing/Salad
            '절임': 480,  # Pickling (overnight)
        }

        # Get base time or default
        base_time = 30
        for method, time in time_estimates.items():
            if method in cooking_method:
                base_time = time
                break

        return base_time

    def _generate_fingerprint(self, recipe: Dict) -> str:
        """Generate fingerprint for deduplication."""
        # Sort ingredients
        ingredients = sorted([
            ing.lower().strip()
            for ing in recipe.get('ingredients', [])
        ])

        # Normalize title
        title_normalized = recipe['title'][:48].lower().strip()

        # Create fingerprint string
        fp_string = ':'.join(ingredients) + ':' + title_normalized

        return hashlib.sha1(fp_string.encode()).hexdigest()

    def _save_raw_response(self, data: Dict, start: int, end: int):
        """Save raw API response for debugging/provenance."""
        raw_dir = Path(__file__).parent.parent.parent.parent / "data" / "raw" / "mfds"
        raw_dir.mkdir(parents=True, exist_ok=True)

        date_str = datetime.now().strftime("%Y%m%d")
        filename = raw_dir / date_str / f"api_response_{start:04d}_{end:04d}.json"
        filename.parent.mkdir(exist_ok=True)

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


async def main():
    """Test the MFDS collector."""
    async with MFDSCollector(api_key="sample_key") as collector:
        recipes = await collector.collect(limit=10)

        print(f"\nCollected {len(recipes)} recipes from MFDS")

        for i, recipe in enumerate(recipes[:3], 1):
            print(f"\n{i}. {recipe['title']}")
            print(f"   Ingredients: {len(recipe['ingredients'])} items")
            print(f"   Instructions: {len(recipe['instructions'])} chars")
            if recipe.get('nutrition_json'):
                nutrition = json.loads(recipe['nutrition_json'])
                print(f"   Calories: {nutrition.get('calories')} kcal")

        # Save to file
        output_path = Path(__file__).parent.parent.parent.parent / "data" / "collected" / "mfds_recipes.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({
                'source': 'Korea MFDS Food Safety',
                'license': 'KOGL-1',
                'collected_at': datetime.utcnow().isoformat(),
                'count': len(recipes),
                'recipes': recipes
            }, f, ensure_ascii=False, indent=2)

        print(f"\n✅ Saved to {output_path}")


if __name__ == "__main__":
    asyncio.run(main())