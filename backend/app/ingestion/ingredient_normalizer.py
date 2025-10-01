"""Ingredient normalization and parsing utilities."""
import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import sqlite3
from pathlib import Path


@dataclass
class NormalizedIngredient:
    """Structured representation of a parsed ingredient."""
    raw_text: str
    name: str
    canonical_name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    ingredient_id: Optional[str] = None
    confidence: float = 1.0


class IngredientNormalizer:
    """Normalize and parse ingredient text into structured data."""

    # Common measurement units
    VOLUME_UNITS = {
        'cup', 'cups', 'c', 'tablespoon', 'tablespoons', 'tbsp', 'T',
        'teaspoon', 'teaspoons', 'tsp', 't', 'fluid ounce', 'fluid ounces',
        'fl oz', 'fl. oz', 'ounce', 'ounces', 'oz', 'pint', 'pints', 'pt',
        'quart', 'quarts', 'qt', 'gallon', 'gallons', 'gal', 'liter',
        'liters', 'l', 'milliliter', 'milliliters', 'ml'
    }

    WEIGHT_UNITS = {
        'pound', 'pounds', 'lb', 'lbs', 'ounce', 'ounces', 'oz',
        'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
        'milligram', 'milligrams', 'mg'
    }

    COUNT_UNITS = {
        'piece', 'pieces', 'item', 'items', 'whole', 'large', 'medium',
        'small', 'clove', 'cloves', 'head', 'heads', 'stalk', 'stalks',
        'bunch', 'bunches', 'package', 'packages', 'pack', 'packs',
        'can', 'cans', 'jar', 'jars', 'bottle', 'bottles', 'container'
    }

    # Unit conversions to standard units
    UNIT_CONVERSIONS = {
        'tablespoon': 'tbsp', 'tablespoons': 'tbsp', 'T': 'tbsp',
        'teaspoon': 'tsp', 'teaspoons': 'tsp', 't': 'tsp',
        'cup': 'cup', 'cups': 'cup', 'c': 'cup',
        'pound': 'lb', 'pounds': 'lb', 'lbs': 'lb',
        'ounce': 'oz', 'ounces': 'oz',
        'gram': 'g', 'grams': 'g',
        'kilogram': 'kg', 'kilograms': 'kg',
        'liter': 'l', 'liters': 'l',
        'milliliter': 'ml', 'milliliters': 'ml',
        'piece': 'piece', 'pieces': 'piece',
        'clove': 'clove', 'cloves': 'clove',
        'can': 'can', 'cans': 'can'
    }

    # Common ingredient categories
    CATEGORIES = {
        'produce': ['tomato', 'lettuce', 'onion', 'garlic', 'pepper', 'carrot',
                   'potato', 'celery', 'cucumber', 'spinach', 'broccoli'],
        'dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg'],
        'meat': ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage'],
        'seafood': ['fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster'],
        'grains': ['rice', 'pasta', 'bread', 'flour', 'oats', 'quinoa'],
        'spices': ['salt', 'pepper', 'cinnamon', 'paprika', 'cumin', 'oregano'],
        'oils': ['olive oil', 'vegetable oil', 'coconut oil', 'butter'],
        'baking': ['flour', 'sugar', 'baking powder', 'baking soda', 'yeast']
    }

    # Stop words to remove
    STOP_WORDS = {
        'fresh', 'frozen', 'dried', 'ground', 'whole', 'chopped', 'diced',
        'sliced', 'minced', 'crushed', 'grated', 'shredded', 'peeled',
        'organic', 'raw', 'cooked', 'boneless', 'skinless', 'large',
        'medium', 'small', 'fine', 'coarse', 'thick', 'thin'
    }

    def __init__(self, db_path: Optional[str] = None):
        """Initialize normalizer with optional database connection."""
        self.db_path = db_path
        self.ingredient_cache: Dict[str, str] = {}
        self.category_cache: Dict[str, str] = {}

        if db_path and Path(db_path).exists():
            self._load_ingredients_from_db()

    def _load_ingredients_from_db(self):
        """Load existing ingredients from database for matching."""
        if not self.db_path:
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Load canonical ingredients
        cursor.execute("""
            SELECT id, canonical_name, display_name, category, aliases
            FROM ingredients
        """)

        for row in cursor.fetchall():
            ing_id, canonical, display, category, aliases = row
            self.ingredient_cache[canonical.lower()] = ing_id
            if display and display != canonical:
                self.ingredient_cache[display.lower()] = ing_id
            if category:
                self.category_cache[canonical.lower()] = category

            # Parse aliases if they exist
            if aliases:
                try:
                    import json
                    alias_list = json.loads(aliases)
                    for alias in alias_list:
                        self.ingredient_cache[alias.lower()] = ing_id
                except:
                    pass

        conn.close()

    def normalize(self, raw_text: str) -> NormalizedIngredient:
        """Parse raw ingredient text into structured format."""
        if not raw_text:
            return NormalizedIngredient(raw_text="", name="", confidence=0.0)

        original_text = raw_text
        text = raw_text.lower().strip()

        # Extract quantity and unit
        quantity, unit, remaining = self._extract_measurement(text)

        # Clean and extract ingredient name
        ingredient_name = self._clean_ingredient_name(remaining)

        # Match to canonical ingredient
        canonical_name, ingredient_id = self._match_canonical(ingredient_name)

        # Infer category
        category = self._infer_category(canonical_name or ingredient_name)

        # Calculate confidence
        confidence = 1.0 if ingredient_id else 0.7

        return NormalizedIngredient(
            raw_text=original_text,
            name=ingredient_name,
            canonical_name=canonical_name,
            quantity=quantity,
            unit=unit,
            category=category,
            ingredient_id=ingredient_id,
            confidence=confidence
        )

    def _extract_measurement(self, text: str) -> Tuple[Optional[float], Optional[str], str]:
        """Extract quantity and unit from ingredient text."""
        # Pattern for fractions (1/2, 3/4, etc)
        fraction_pattern = r'(\d+)\s*/\s*(\d+)'

        # Pattern for decimals and whole numbers
        number_pattern = r'(\d+\.?\d*)'

        # Pattern for ranges (1-2, 2-3)
        range_pattern = r'(\d+\.?\d*)\s*-\s*(\d+\.?\d*)'

        quantity = None
        unit = None

        # Check for range first (take average)
        range_match = re.match(range_pattern, text)
        if range_match:
            start = float(range_match.group(1))
            end = float(range_match.group(2))
            quantity = (start + end) / 2
            text = text[range_match.end():].strip()
        else:
            # Check for mixed numbers (1 1/2)
            mixed_match = re.match(r'(\d+)\s+(\d+)\s*/\s*(\d+)', text)
            if mixed_match:
                whole = float(mixed_match.group(1))
                numerator = float(mixed_match.group(2))
                denominator = float(mixed_match.group(3))
                quantity = whole + (numerator / denominator)
                text = text[mixed_match.end():].strip()
            else:
                # Check for fractions
                fraction_match = re.match(fraction_pattern, text)
                if fraction_match:
                    numerator = float(fraction_match.group(1))
                    denominator = float(fraction_match.group(2))
                    quantity = numerator / denominator
                    text = text[fraction_match.end():].strip()
                else:
                    # Check for regular numbers
                    number_match = re.match(number_pattern, text)
                    if number_match:
                        quantity = float(number_match.group(1))
                        text = text[number_match.end():].strip()

        # Extract unit
        words = text.split()
        if words:
            potential_unit = words[0].lower()

            # Check if it's a known unit
            all_units = self.VOLUME_UNITS | self.WEIGHT_UNITS | self.COUNT_UNITS
            if potential_unit in all_units:
                unit = self.UNIT_CONVERSIONS.get(potential_unit, potential_unit)
                text = ' '.join(words[1:])
            # Check for parenthetical amounts (14 oz), (400g)
            elif words[0].startswith('(') and words[0].endswith(')'):
                paren_content = words[0][1:-1]
                # Extract number and unit from parentheses
                paren_match = re.match(r'(\d+\.?\d*)([a-zA-Z]+)', paren_content)
                if paren_match:
                    if not quantity:
                        quantity = float(paren_match.group(1))
                    potential_unit = paren_match.group(2).lower()
                    if potential_unit in all_units:
                        unit = self.UNIT_CONVERSIONS.get(potential_unit, potential_unit)
                text = ' '.join(words[1:])

        # Default unit if we have quantity but no unit
        if quantity and not unit:
            # Check context for count items
            if any(word in text.lower() for word in ['clove', 'head', 'bunch', 'can', 'package']):
                for word in ['clove', 'head', 'bunch', 'can', 'package']:
                    if word in text.lower():
                        unit = word
                        break
            else:
                unit = 'piece'

        return quantity, unit, text

    def _clean_ingredient_name(self, text: str) -> str:
        """Clean and normalize ingredient name."""
        # Remove parenthetical information
        text = re.sub(r'\([^)]*\)', '', text)

        # Remove common preparation words
        words = text.split()
        cleaned = []

        for word in words:
            word = word.strip('.,;:')
            if word and word not in self.STOP_WORDS:
                cleaned.append(word)

        # Join and clean up
        result = ' '.join(cleaned).strip()

        # Remove "of" at the beginning (e.g., "of garlic")
        if result.startswith('of '):
            result = result[3:]

        return result

    def _match_canonical(self, ingredient_name: str) -> Tuple[Optional[str], Optional[str]]:
        """Match ingredient to canonical form from database."""
        if not ingredient_name:
            return None, None

        # Direct match
        lower_name = ingredient_name.lower()
        if lower_name in self.ingredient_cache:
            ing_id = self.ingredient_cache[lower_name]
            # Find canonical name for this ID
            for name, id_val in self.ingredient_cache.items():
                if id_val == ing_id and not name.startswith('_'):
                    return name.title(), ing_id

        # Fuzzy match - check if any cached ingredient is contained in the name
        for cached_name, ing_id in self.ingredient_cache.items():
            if cached_name in lower_name or lower_name in cached_name:
                return cached_name.title(), ing_id

        # No match found - return cleaned name as canonical
        return ingredient_name.title(), None

    def _infer_category(self, ingredient_name: str) -> Optional[str]:
        """Infer category based on ingredient name."""
        if not ingredient_name:
            return None

        lower_name = ingredient_name.lower()

        # Check cache first
        if lower_name in self.category_cache:
            return self.category_cache[lower_name]

        # Check predefined categories
        for category, keywords in self.CATEGORIES.items():
            for keyword in keywords:
                if keyword in lower_name:
                    return category

        return None

    def parse_recipe_ingredients(self, ingredients_list: List[str]) -> List[NormalizedIngredient]:
        """Parse a list of ingredient strings from a recipe."""
        normalized = []
        for ingredient_text in ingredients_list:
            if ingredient_text and ingredient_text.strip():
                normalized.append(self.normalize(ingredient_text))
        return normalized

    def get_or_create_ingredient(self, name: str, category: Optional[str] = None) -> str:
        """Get existing ingredient ID or create new one."""
        if not self.db_path:
            # Generate a temporary ID
            return f"ing_{name.lower().replace(' ', '_')}"

        lower_name = name.lower()

        # Check cache
        if lower_name in self.ingredient_cache:
            return self.ingredient_cache[lower_name]

        # Create new ingredient
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Generate ID
        import uuid
        ing_id = f"ing_{uuid.uuid4().hex[:8]}"

        # Infer category if not provided
        if not category:
            category = self._infer_category(name)

        # Insert new ingredient
        cursor.execute("""
            INSERT INTO ingredients (id, canonical_name, display_name, category)
            VALUES (?, ?, ?, ?)
        """, (ing_id, name.title(), name.title(), category))

        conn.commit()
        conn.close()

        # Update cache
        self.ingredient_cache[lower_name] = ing_id
        if category:
            self.category_cache[lower_name] = category

        return ing_id