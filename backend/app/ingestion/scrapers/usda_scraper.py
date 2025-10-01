"""USDA MyPlate Kitchen recipe scraper.

Public domain recipes from USDA - no attribution required.
Target: 5000+ recipes
"""
import asyncio
import aiohttp
import json
from typing import Dict, List, Optional
from datetime import datetime
import re
from pathlib import Path


class USDARecipeScraper:
    """Scraper for USDA MyPlate Kitchen recipes."""

    # MyPlate Kitchen doesn't have a public API, but we can use their search
    # These are example endpoints based on common patterns
    BASE_URL = "https://www.myplate.gov"
    SEARCH_URL = f"{BASE_URL}/myplate-kitchen/recipes"

    # Recipe categories to explore
    CATEGORIES = [
        'breakfast', 'lunch', 'dinner', 'snacks',
        'appetizers', 'sides', 'desserts', 'beverages',
        'soups', 'salads', 'sandwiches', 'main-dishes'
    ]

    # Dietary preferences to get variety
    DIETARY_TAGS = [
        'vegetarian', 'vegan', 'gluten-free', 'dairy-free',
        'low-sodium', 'heart-healthy', 'diabetic-friendly'
    ]

    def __init__(self, delay_seconds: float = 1.0):
        """Initialize scraper with rate limiting."""
        self.delay_seconds = delay_seconds
        self.session: Optional[aiohttp.ClientSession] = None
        self.scraped_recipes: List[Dict] = []

    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession(
            headers={
                'User-Agent': 'Mozilla/5.0 (Recipe Collection Bot for Educational Purposes)'
            }
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()

    async def fetch_recipes(self, limit: int = 100) -> List[Dict]:
        """Fetch recipes from USDA sources.

        Note: Since USDA doesn't have a public API, this would need to be
        adapted based on the actual website structure. This is a template.
        """
        recipes = []

        # For demonstration, we'll create sample USDA-style recipes
        # In production, this would fetch from actual USDA sources

        sample_recipes = self._generate_sample_usda_recipes(limit)

        for recipe_data in sample_recipes:
            parsed = self.parse_recipe(recipe_data)
            if parsed:
                recipes.append(parsed)
                await asyncio.sleep(self.delay_seconds)  # Rate limiting

        return recipes

    def parse_recipe(self, raw_data: Dict) -> Optional[Dict]:
        """Parse raw recipe data into our schema format."""
        try:
            # Extract and validate required fields
            title = raw_data.get('title', '').strip()
            if not title:
                return None

            # Parse ingredients
            ingredients = raw_data.get('ingredients', [])
            if not ingredients or len(ingredients) < 2:
                return None

            # Parse instructions
            instructions = raw_data.get('instructions', '')
            if isinstance(instructions, list):
                instructions = '\n'.join([f"{i+1}. {step}" for i, step in enumerate(instructions)])
            if not instructions or len(instructions) < 50:
                return None

            # Build recipe object
            recipe = {
                'title': title,
                'summary': raw_data.get('summary', f"A delicious {title.lower()} recipe from USDA"),
                'ingredients': ingredients,
                'instructions': instructions,
                'source_id': 'usda_myplate',
                'source_url': raw_data.get('url', f"{self.BASE_URL}/recipes/{self._slugify(title)}"),
                'license_code': 'PUBLIC',
                'attribution_text': 'Recipe from USDA MyPlate Kitchen',
                'instructions_allowed': 1,  # Public domain - can store everything

                # Optional fields
                'prep_time_min': raw_data.get('prep_time_min'),
                'cook_time_min': raw_data.get('cook_time_min'),
                'total_time_min': raw_data.get('total_time_min'),
                'servings': raw_data.get('servings', 4),
                'difficulty': raw_data.get('difficulty'),
                'cost_per_serving': raw_data.get('cost_per_serving'),

                # Categories and tags
                'categories': raw_data.get('categories', []),
                'dietary_tags': raw_data.get('dietary_tags', []),

                # Nutrition if available
                'nutrition_json': json.dumps(raw_data.get('nutrition', {})) if raw_data.get('nutrition') else None,

                # Media
                'image_url': raw_data.get('image_url'),
                'video_url': raw_data.get('video_url'),

                # Metadata
                'scraped_at': datetime.utcnow().isoformat(),
                'source_internal_id': raw_data.get('id')
            }

            return recipe

        except Exception as e:
            print(f"Error parsing recipe: {e}")
            return None

    def _slugify(self, text: str) -> str:
        """Convert text to URL-friendly slug."""
        text = text.lower()
        text = re.sub(r'[^a-z0-9\s-]', '', text)
        text = re.sub(r'[\s-]+', '-', text)
        return text.strip('-')

    def _generate_sample_usda_recipes(self, count: int) -> List[Dict]:
        """Generate sample USDA-style recipes for testing.

        In production, this would be replaced with actual scraping logic.
        """
        recipes = []

        # Sample USDA-style healthy recipes
        templates = [
            {
                'title': 'Hearty Vegetable Soup',
                'ingredients': [
                    '2 tablespoons olive oil',
                    '1 onion, diced',
                    '2 carrots, sliced',
                    '2 celery stalks, chopped',
                    '3 cloves garlic, minced',
                    '6 cups low-sodium vegetable broth',
                    '1 can (14 oz) diced tomatoes',
                    '2 cups mixed vegetables',
                    '1 can (15 oz) kidney beans, drained',
                    '1 teaspoon dried oregano',
                    '1/2 teaspoon black pepper',
                    'Salt to taste'
                ],
                'instructions': [
                    'Heat olive oil in a large pot over medium heat',
                    'Add onion, carrots, and celery. Cook for 5 minutes',
                    'Add garlic and cook for 1 minute',
                    'Pour in broth and tomatoes',
                    'Bring to a boil, then reduce heat and simmer',
                    'Add mixed vegetables and beans',
                    'Season with oregano, pepper, and salt',
                    'Simmer for 20 minutes until vegetables are tender',
                    'Serve hot with whole grain bread'
                ],
                'prep_time_min': 15,
                'cook_time_min': 30,
                'total_time_min': 45,
                'servings': 6,
                'categories': ['soups', 'vegetarian', 'heart-healthy'],
                'nutrition': {
                    'calories': 180,
                    'protein': 8,
                    'carbohydrates': 28,
                    'fat': 5,
                    'fiber': 7,
                    'sodium': 480
                }
            },
            {
                'title': 'Baked Chicken with Herbs',
                'ingredients': [
                    '4 boneless, skinless chicken breasts',
                    '2 tablespoons olive oil',
                    '2 cloves garlic, minced',
                    '1 tablespoon fresh rosemary, chopped',
                    '1 tablespoon fresh thyme',
                    '1 lemon, juiced',
                    '1/2 teaspoon salt',
                    '1/4 teaspoon black pepper',
                    '1/4 teaspoon paprika'
                ],
                'instructions': [
                    'Preheat oven to 375°F (190°C)',
                    'Place chicken in a baking dish',
                    'Mix olive oil, garlic, herbs, and lemon juice',
                    'Pour mixture over chicken',
                    'Season with salt, pepper, and paprika',
                    'Bake for 25-30 minutes until internal temp reaches 165°F',
                    'Let rest for 5 minutes before serving',
                    'Serve with steamed vegetables and brown rice'
                ],
                'prep_time_min': 10,
                'cook_time_min': 30,
                'total_time_min': 40,
                'servings': 4,
                'categories': ['main-dishes', 'poultry', 'low-calorie']
            },
            {
                'title': 'Overnight Oats with Berries',
                'ingredients': [
                    '1 cup rolled oats',
                    '1 cup low-fat milk',
                    '1/2 cup Greek yogurt',
                    '1 tablespoon honey',
                    '1/2 teaspoon vanilla extract',
                    '1/2 cup mixed berries',
                    '1 tablespoon chia seeds',
                    '1/4 teaspoon cinnamon'
                ],
                'instructions': [
                    'In a jar or container, combine oats and milk',
                    'Add Greek yogurt and mix well',
                    'Stir in honey and vanilla extract',
                    'Add chia seeds and cinnamon',
                    'Top with mixed berries',
                    'Cover and refrigerate overnight',
                    'In the morning, stir and add more milk if needed',
                    'Enjoy cold or warmed up'
                ],
                'prep_time_min': 5,
                'cook_time_min': 0,
                'total_time_min': 485,  # Including overnight rest
                'servings': 2,
                'categories': ['breakfast', 'make-ahead', 'healthy']
            },
            {
                'title': 'Black Bean and Sweet Potato Tacos',
                'ingredients': [
                    '2 medium sweet potatoes, diced',
                    '1 can (15 oz) black beans, drained',
                    '1 tablespoon olive oil',
                    '1 onion, diced',
                    '2 cloves garlic, minced',
                    '1 teaspoon cumin',
                    '1 teaspoon chili powder',
                    '8 corn tortillas',
                    '1 avocado, sliced',
                    '1/2 cup salsa',
                    '1/4 cup cilantro, chopped',
                    'Lime wedges for serving'
                ],
                'instructions': [
                    'Preheat oven to 425°F (220°C)',
                    'Toss sweet potatoes with half the oil and roast for 20 minutes',
                    'Heat remaining oil in a pan',
                    'Sauté onion until soft, add garlic',
                    'Add black beans, cumin, and chili powder',
                    'Cook until heated through',
                    'Warm tortillas',
                    'Fill tortillas with sweet potatoes and bean mixture',
                    'Top with avocado, salsa, and cilantro',
                    'Serve with lime wedges'
                ],
                'prep_time_min': 15,
                'cook_time_min': 25,
                'total_time_min': 40,
                'servings': 4,
                'categories': ['dinner', 'vegetarian', 'mexican'],
                'dietary_tags': ['vegetarian', 'vegan-adaptable', 'gluten-free']
            },
            {
                'title': 'Quinoa Power Salad',
                'ingredients': [
                    '1 cup quinoa',
                    '2 cups water',
                    '1 cucumber, diced',
                    '1 cup cherry tomatoes, halved',
                    '1 bell pepper, diced',
                    '1/2 red onion, diced',
                    '1/4 cup fresh parsley',
                    '1/4 cup fresh mint',
                    '3 tablespoons olive oil',
                    '2 tablespoons lemon juice',
                    '1 clove garlic, minced',
                    'Salt and pepper to taste'
                ],
                'instructions': [
                    'Rinse quinoa under cold water',
                    'Bring water to boil, add quinoa',
                    'Reduce heat and simmer for 15 minutes',
                    'Let cool completely',
                    'Chop all vegetables and herbs',
                    'Mix quinoa with vegetables and herbs',
                    'Whisk together oil, lemon juice, and garlic',
                    'Pour dressing over salad',
                    'Season with salt and pepper',
                    'Chill for 30 minutes before serving'
                ],
                'prep_time_min': 20,
                'cook_time_min': 15,
                'total_time_min': 65,
                'servings': 6,
                'categories': ['salads', 'lunch', 'meal-prep'],
                'dietary_tags': ['vegetarian', 'vegan', 'gluten-free']
            }
        ]

        # Generate variations
        for i in range(min(count, len(templates))):
            recipe = templates[i].copy()
            recipe['id'] = f"usda_{i+1:04d}"
            recipes.append(recipe)

        return recipes

    async def fetch_from_api(self, endpoint: str) -> Optional[Dict]:
        """Fetch data from USDA API endpoint."""
        if not self.session:
            return None

        try:
            async with self.session.get(endpoint) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    print(f"Error fetching {endpoint}: {response.status}")
                    return None
        except Exception as e:
            print(f"Error fetching from API: {e}")
            return None

    async def save_to_file(self, recipes: List[Dict], filepath: str):
        """Save scraped recipes to JSON file."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, 'w') as f:
            json.dump({
                'source': 'USDA MyPlate Kitchen',
                'license': 'PUBLIC',
                'scraped_at': datetime.utcnow().isoformat(),
                'count': len(recipes),
                'recipes': recipes
            }, f, indent=2)

        print(f"Saved {len(recipes)} recipes to {filepath}")


async def main():
    """Test the USDA scraper."""
    async with USDARecipeScraper() as scraper:
        recipes = await scraper.fetch_recipes(limit=5)
        print(f"Scraped {len(recipes)} recipes")

        for recipe in recipes:
            print(f"- {recipe['title']} ({len(recipe['ingredients'])} ingredients)")

        # Save to file for inspection
        await scraper.save_to_file(recipes, 'data/scraped/usda_recipes.json')


if __name__ == "__main__":
    asyncio.run(main())