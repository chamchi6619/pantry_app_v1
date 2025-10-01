"""
Item Normalization Service
Normalizes receipt item names to readable, consistent format
"""

import re
import logging
from typing import Dict, Optional, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class NormalizedItem:
    """Result from normalization"""
    original: str
    normalized: str
    confidence: float
    method: str  # 'learned', 'rules', 'gemini'


class ItemNormalizer:
    """
    Intelligent item name normalizer
    Combines rules, learning, and AI
    """

    def __init__(self):
        # Common abbreviation expansions
        self.abbreviations = {
            # Dairy
            'whp': 'whipping',
            'whd': 'whipped',
            'hvy': 'heavy',
            'crm': 'cream',
            'mlk': 'milk',
            'whl': 'whole',
            'choc': 'chocolate',
            'van': 'vanilla',
            'strw': 'strawberry',
            'yog': 'yogurt',
            'chs': 'cheese',
            'chz': 'cheese',
            'ched': 'cheddar',
            'mozz': 'mozzarella',
            'parm': 'parmesan',
            'bttr': 'butter',
            'marg': 'margarine',

            # Meat
            'chkn': 'chicken',
            'chckn': 'chicken',
            'brst': 'breast',
            'thgh': 'thigh',
            'wng': 'wing',
            'grnd': 'ground',
            'bf': 'beef',
            'prk': 'pork',
            'bcon': 'bacon',
            'ssg': 'sausage',
            'turk': 'turkey',
            'bnls': 'boneless',
            'skls': 'skinless',
            'rstd': 'roasted',

            # Produce
            'veg': 'vegetable',
            'frt': 'fruit',
            'org': 'organic',
            'grn': 'green',
            'red': 'red',
            'yel': 'yellow',
            'wht': 'white',
            'swt': 'sweet',
            'pot': 'potato',
            'tom': 'tomato',
            'lett': 'lettuce',
            'spin': 'spinach',
            'carr': 'carrot',
            'broc': 'broccoli',
            'caul': 'cauliflower',
            'pep': 'pepper',
            'onin': 'onion',
            'garl': 'garlic',
            'avo': 'avocado',
            'ban': 'banana',
            'appl': 'apple',
            'orng': 'orange',
            'brry': 'berry',
            'strw': 'strawberry',

            # Pantry
            'brd': 'bread',
            'wht': 'white',
            'whl': 'whole',
            'grn': 'grain',
            'flr': 'flour',
            'sgr': 'sugar',
            'brwn': 'brown',
            'slt': 'salt',
            'pepp': 'pepper',
            'spce': 'spice',
            'vnla': 'vanilla',
            'choc': 'chocolate',
            'cndy': 'candy',
            'ckies': 'cookies',
            'crckrs': 'crackers',
            'chps': 'chips',
            'snck': 'snack',

            # Beverages
            'jce': 'juice',
            'sda': 'soda',
            'wtr': 'water',
            'sprkl': 'sparkling',
            'coff': 'coffee',
            'decaf': 'decaffeinated',

            # Sizes
            'sm': 'small',
            'sml': 'small',
            'med': 'medium',
            'lg': 'large',
            'lrg': 'large',
            'xl': 'extra large',
            'fam': 'family',
            'bndl': 'bundle',
            'pk': 'pack',
            'pkg': 'package',

            # Units
            'gal': 'gallon',
            'qt': 'quart',
            'pt': 'pint',
            'lb': 'pound',
            'oz': 'ounce',
            'dz': 'dozen',
            'ct': 'count',

            # Other
            'asst': 'assorted',
            'asstd': 'assorted',
            'var': 'variety',
            'orig': 'original',
            'nat': 'natural',
            'frzn': 'frozen',
            'frsh': 'fresh',
            'rstd': 'roasted',
            'grld': 'grilled',
            'bkd': 'baked',
            'frd': 'fried'
        }

        # Store brand prefixes to remove
        self.brand_prefixes = [
            'GV', 'GREAT VALUE',
            'KROGER', 'KROGER VALUE',
            'WALMART', 'MARKETSIDE',
            'SIGNATURE', 'SIGNATURE SELECT',
            'SIMPLE TRUTH',
            'PRIVATE SELECTION',
            'PUBLIX',
            'WEGMANS',
            'WHOLE FOODS',
            '365',
            'KIRKLAND',
            'MEMBER\'S MARK',
            'SAM\'S CHOICE',
            'HILL COUNTRY',
            'HEB'
        ]

        # Special brand handling (brand products that need special treatment)
        self.brand_products = {
            'SILK': {'append': 'Milk', 'category': 'dairy'},
            'ALMOND BREEZE': {'replace': 'Almond Milk', 'category': 'dairy'},
            'OAT BLENDERS': {'replace': 'Oat Milk', 'category': 'dairy'},
            'BLUE DIAMOND': {'context': 'almonds'},
            'CHOBANI': {'context': 'yogurt'},
            'DANNON': {'context': 'yogurt'},
            'YOPLAIT': {'context': 'yogurt'},
            'PHILADELPHIA': {'context': 'cream cheese'},
            'KRAFT': {'keep': True},  # Keep brand name
            'HEINZ': {'keep': True},
            'CAMPBELL\'S': {'keep': True},
            'KELLOGG\'S': {'keep': True},
            'GENERAL MILLS': {'keep': True},
            'NESTLE': {'keep': True},
            'HERSHEY\'S': {'keep': True},
            'OREO': {'keep': True},
            'DORITOS': {'keep': True},
            'LAY\'S': {'keep': True},
            'PRINGLES': {'keep': True},
            'CHEERIOS': {'keep': True},
            'FROSTED FLAKES': {'keep': True}
        }

    def normalize(self, raw_text: str, merchant: Optional[str] = None) -> NormalizedItem:
        """
        Normalize an item name

        Args:
            raw_text: Original receipt text
            merchant: Store name for context

        Returns:
            NormalizedItem with cleaned name
        """
        # Start with original
        normalized = raw_text.upper().strip()

        # Remove UPC codes (long numbers)
        normalized = re.sub(r'\b\d{10,}\b', '', normalized).strip()

        # Remove store codes (single letters at end)
        normalized = re.sub(r'\s+[A-Z]$', '', normalized).strip()

        # Remove price if included
        normalized = re.sub(r'\s+\d+\.\d{2}$', '', normalized).strip()

        # Apply special brand handling first
        normalized = self._handle_brands(normalized)

        # Remove generic store brands
        for brand in self.brand_prefixes:
            if normalized.startswith(brand + ' '):
                normalized = normalized[len(brand)+1:].strip()
                break

        # Expand abbreviations
        normalized = self._expand_abbreviations(normalized)

        # Clean up spacing and capitalization
        normalized = self._clean_formatting(normalized)

        # Calculate confidence
        confidence = self._calculate_confidence(raw_text, normalized)

        return NormalizedItem(
            original=raw_text,
            normalized=normalized,
            confidence=confidence,
            method='rules'
        )

    def _handle_brands(self, text: str) -> str:
        """Handle special brand products"""
        upper_text = text.upper()

        # Check for special brand products
        for brand, rules in self.brand_products.items():
            if brand in upper_text:
                if 'replace' in rules:
                    return rules['replace']
                elif 'append' in rules:
                    # Remove brand and append the product type
                    cleaned = upper_text.replace(brand, '').strip()
                    if not rules['append'].upper() in cleaned:
                        return f"{cleaned} {rules['append']}".strip()
                elif 'keep' in rules and rules['keep']:
                    # Keep the brand name but clean the rest
                    return text

        return text

    def _expand_abbreviations(self, text: str) -> str:
        """Expand common abbreviations"""
        import re
        words = text.split()
        expanded = []

        for word in words:
            lower_word = word.lower()

            # Check if entire word is an abbreviation
            if lower_word in self.abbreviations:
                expanded.append(self.abbreviations[lower_word])
            else:
                # Check for partial matches (e.g., "2%MLK")
                # Only expand if it's a word boundary match
                expanded_word = word
                for abbr, full in self.abbreviations.items():
                    # Use word boundary regex to avoid partial matches in already-expanded words
                    pattern = r'\b' + re.escape(abbr) + r'\b'
                    if re.search(pattern, lower_word):
                        expanded_word = re.sub(pattern, full, lower_word, flags=re.IGNORECASE)
                        # Preserve original capitalization for the rest
                        if word[0].isupper():
                            expanded_word = expanded_word.capitalize()
                        break  # Only expand the first match
                expanded.append(expanded_word)

        return ' '.join(expanded)

    def _clean_formatting(self, text: str) -> str:
        """Clean up formatting and capitalization"""
        # Remove extra spaces
        text = ' '.join(text.split())

        # Title case but preserve certain words
        words = text.split()
        formatted = []

        for i, word in enumerate(words):
            # Keep numbers as-is
            if any(c.isdigit() for c in word):
                formatted.append(word)
            # First word or important word
            elif i == 0 or len(word) > 2:
                formatted.append(word.capitalize())
            # Small words lowercase (unless at start)
            else:
                formatted.append(word.lower())

        return ' '.join(formatted)

    def _calculate_confidence(self, original: str, normalized: str) -> float:
        """Calculate confidence in normalization"""
        # High confidence if significant changes were made
        if original.upper() == normalized.upper():
            return 0.3  # No changes made

        # Check if we expanded abbreviations
        if len(normalized) > len(original):
            return 0.8

        # Check if we removed brand/codes
        if len(normalized) < len(original) * 0.7:
            return 0.7

        return 0.6

    def learn_normalization(self, raw_text: str, corrected: str,
                           merchant: Optional[str] = None):
        """
        Learn from user corrections (to be implemented with database)

        Args:
            raw_text: Original text
            corrected: User-corrected version
            merchant: Store context
        """
        # This will be implemented when we add the database
        logger.info(f"Learning: '{raw_text}' -> '{corrected}' (merchant: {merchant})")

    def batch_normalize(self, items: List[str],
                        merchant: Optional[str] = None) -> List[NormalizedItem]:
        """Normalize multiple items"""
        return [self.normalize(item, merchant) for item in items]


# Export singleton instance
item_normalizer = ItemNormalizer()