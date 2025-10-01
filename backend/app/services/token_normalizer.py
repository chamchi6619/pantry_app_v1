"""
Token normalization service for ingredient alias patterns
Handles abbreviations, brand removal, and size normalizations
"""

import re
from typing import Dict, List, Optional, Set, Tuple
import logging

logger = logging.getLogger(__name__)

class TokenNormalizer:
    """
    Normalizes receipt text tokens for better alias matching
    """

    def __init__(self):
        # Common abbreviation expansions
        self.abbreviations = {
            # Dairy
            'MLK': ['MILK'],
            'WHL': ['WHOLE'],
            'SK': ['SKIM'],
            'CRM': ['CREAM'],
            'CHSE': ['CHEESE'],
            'CHDR': ['CHEDDAR'],
            'MOZZ': ['MOZZARELLA'],
            'YOG': ['YOGURT'],
            'YGHRT': ['YOGURT'],

            # Meat
            'CHKN': ['CHICKEN'],
            'CHCK': ['CHICKEN'],
            'BF': ['BEEF'],
            'GRD': ['GROUND'],
            'GRND': ['GROUND'],
            'STK': ['STEAK'],
            'BKN': ['BACON'],
            'SAUS': ['SAUSAGE'],
            'TURK': ['TURKEY'],

            # Produce
            'VEG': ['VEGETABLE', 'VEGETABLES'],
            'TOM': ['TOMATO', 'TOMATOES'],
            'LET': ['LETTUCE'],
            'POT': ['POTATO', 'POTATOES'],
            'BAN': ['BANANA', 'BANANAS'],
            'APP': ['APPLE', 'APPLES'],
            'ORG': ['ORANGE', 'ORANGES'],
            'CARR': ['CARROT', 'CARROTS'],
            'BROC': ['BROCCOLI'],

            # Sizes
            'LG': ['LARGE'],
            'MD': ['MEDIUM'],
            'SM': ['SMALL'],
            'XL': ['EXTRA LARGE'],
            'REG': ['REGULAR'],

            # Units
            'GAL': ['GALLON'],
            'QT': ['QUART'],
            'PT': ['PINT'],
            'LB': ['POUND'],
            'OZ': ['OUNCE'],
            'FL': ['FLUID'],
            'DZ': ['DOZEN'],
            'DOZ': ['DOZEN'],
            'PKG': ['PACKAGE'],
            'PK': ['PACK'],

            # Common words
            'ASST': ['ASSORTED'],
            'FLVR': ['FLAVOR'],
            'ORIG': ['ORIGINAL'],
            'NAT': ['NATURAL'],
            'ORG': ['ORGANIC'],
            'FF': ['FAT FREE'],
            'LF': ['LOW FAT'],
            'RED': ['REDUCED'],
            'CHOC': ['CHOCOLATE'],
            'VAN': ['VANILLA'],
            'STRAW': ['STRAWBERRY']
        }

        # Brand stopwords to remove
        self.brand_stopwords = {
            # Major brands
            'KROGER', 'WALMART', 'TARGET', 'COSTCO', 'SAMS', 'PUBLIX',
            'SAFEWAY', 'ALBERTSONS', 'HEB', 'WEGMANS', 'WHOLE FOODS',
            'TRADER JOES', 'ALDI', 'LIDL', 'SPROUTS',

            # Store brands
            'GREAT VALUE', 'KIRKLAND', 'MEMBERS MARK', 'SIMPLE TRUTH',
            'PRIVATE SELECTION', '365', 'GOOD GATHER', 'MARKET PANTRY',

            # Food brands
            'KRAFT', 'NESTLE', 'GENERAL MILLS', 'KELLOGGS', 'PEPSI',
            'COCA COLA', 'NABISCO', 'CAMPBELLS', 'HEINZ', 'HUNTS',
            'DOLE', 'CHIQUITA', 'DRISCOLL', 'TROPICANA', 'MINUTE MAID',
            'YOPLAIT', 'DANNON', 'CHOBANI', 'OIKOS', 'FAGE',
            'TYSON', 'PERDUE', 'HORMEL', 'OSCAR MAYER', 'HILLSHIRE',
            'BARILLA', 'RONZONI', 'MUELLER', 'BIRDSEYE', 'GREEN GIANT'
        }

        # Size modifiers to normalize
        self.size_patterns = [
            (r'\b(\d+)\s*GAL\b', r'\1 GALLON'),
            (r'\b(\d+)\s*QT\b', r'\1 QUART'),
            (r'\b(\d+)\s*PT\b', r'\1 PINT'),
            (r'\b(\d+)\s*LB\b', r'\1 POUND'),
            (r'\b(\d+)\s*OZ\b', r'\1 OUNCE'),
            (r'\bFL\s+OZ\b', 'FLUID OUNCE'),
            (r'\b(\d+)\s*PK\b', r'\1 PACK'),
            (r'\b(\d+)\s*CT\b', r'\1 COUNT')
        ]

        # Common typos and OCR errors
        self.ocr_corrections = {
            'MLIK': 'MILK',
            'MILX': 'MILK',
            'CHICKFN': 'CHICKEN',
            'CHICKRN': 'CHICKEN',
            'TQMATO': 'TOMATO',
            'T0MAT0': 'TOMATO',  # Zeros instead of O
            'BANAN4': 'BANANA',
            'APPL3': 'APPLE',
            '0RANGE': 'ORANGE',
            'P0TAT0': 'POTATO',
            'CHEE5E': 'CHEESE',
            'CH33SE': 'CHEESE'
        }

    def normalize(self, text: str) -> str:
        """
        Full normalization pipeline
        """
        if not text:
            return ""

        # Start with uppercase
        normalized = text.upper().strip()

        # Remove special characters except spaces and hyphens
        normalized = re.sub(r'[^\w\s\-]', ' ', normalized)

        # Apply OCR corrections
        normalized = self._apply_ocr_corrections(normalized)

        # Expand abbreviations
        normalized = self._expand_abbreviations(normalized)

        # Normalize sizes
        normalized = self._normalize_sizes(normalized)

        # Remove brand stopwords
        normalized = self._remove_brands(normalized)

        # Clean up whitespace
        normalized = ' '.join(normalized.split())

        return normalized

    def _apply_ocr_corrections(self, text: str) -> str:
        """Apply common OCR error corrections"""
        for typo, correction in self.ocr_corrections.items():
            text = text.replace(typo, correction)
        return text

    def _expand_abbreviations(self, text: str) -> str:
        """Expand known abbreviations"""
        tokens = text.split()
        expanded = []

        for token in tokens:
            # Check if token is an abbreviation
            if token in self.abbreviations:
                # Use first expansion as primary
                expanded.append(self.abbreviations[token][0])
            else:
                expanded.append(token)

        return ' '.join(expanded)

    def _normalize_sizes(self, text: str) -> str:
        """Normalize size patterns"""
        for pattern, replacement in self.size_patterns:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        return text

    def _remove_brands(self, text: str) -> str:
        """Remove brand names"""
        tokens = text.split()

        # Filter out individual brand tokens
        filtered = []
        for token in tokens:
            if token not in self.brand_stopwords:
                filtered.append(token)

        # Also check for multi-word brands
        result = ' '.join(filtered)
        for brand in self.brand_stopwords:
            if ' ' in brand:  # Multi-word brand
                result = result.replace(brand, '')

        return result.strip()

    def generate_variants(self, text: str) -> List[str]:
        """
        Generate possible variants for matching
        Returns list of variants including original
        """
        variants = set()
        normalized = self.normalize(text)

        # Add normalized version
        variants.add(normalized)

        # Add original if different
        original_upper = text.upper().strip()
        if original_upper != normalized:
            variants.add(original_upper)

        # Generate abbreviation variants
        tokens = normalized.split()

        # Try reversing expansions (find abbreviations for expanded words)
        abbreviated = []
        for token in tokens:
            found_abbrev = False
            for abbrev, expansions in self.abbreviations.items():
                if token in expansions:
                    abbreviated.append(abbrev)
                    found_abbrev = True
                    break
            if not found_abbrev:
                abbreviated.append(token)

        if abbreviated != tokens:
            variants.add(' '.join(abbreviated))

        # Add singular/plural variants
        if normalized.endswith('S'):
            variants.add(normalized[:-1])  # Remove S
        elif not normalized.endswith('S'):
            variants.add(normalized + 'S')  # Add S

        return list(variants)

    def extract_key_tokens(self, text: str) -> List[str]:
        """
        Extract key tokens for token-based matching
        Returns list of significant tokens
        """
        normalized = self.normalize(text)
        tokens = normalized.split()

        # Filter out very common/non-distinctive words
        stopwords = {
            'THE', 'A', 'AN', 'OF', 'WITH', 'IN', 'ON', 'FOR',
            'AND', 'OR', 'BUT', 'TO', 'FROM', 'BY', 'AS', 'IS'
        }

        # Keep tokens that are likely ingredient indicators
        key_tokens = []
        for token in tokens:
            # Skip stopwords and very short tokens
            if token not in stopwords and len(token) > 2:
                key_tokens.append(token)

        return key_tokens

    def calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity score between two texts
        Returns score between 0.0 and 1.0
        """
        tokens1 = set(self.extract_key_tokens(text1))
        tokens2 = set(self.extract_key_tokens(text2))

        if not tokens1 or not tokens2:
            return 0.0

        # Jaccard similarity
        intersection = tokens1.intersection(tokens2)
        union = tokens1.union(tokens2)

        if not union:
            return 0.0

        return len(intersection) / len(union)

    def create_regex_pattern(self, text: str) -> str:
        """
        Create flexible regex pattern from text
        Useful for creating alias patterns
        """
        normalized = self.normalize(text)
        tokens = normalized.split()

        # Build pattern with optional spaces and word boundaries
        pattern_parts = []
        for token in tokens:
            # Allow for OCR variations (0/O, 1/I, etc.)
            token_pattern = token
            token_pattern = token_pattern.replace('O', '[O0]')
            token_pattern = token_pattern.replace('I', '[I1]')
            token_pattern = token_pattern.replace('S', '[S5]')
            token_pattern = token_pattern.replace('E', '[E3]')
            pattern_parts.append(token_pattern)

        # Join with flexible spacing
        pattern = r'\s*'.join(pattern_parts)

        # Add word boundaries
        pattern = r'\b' + pattern + r'\b'

        return pattern


# Global instance
normalizer = TokenNormalizer()


def normalize_token(text: str) -> str:
    """Convenience function for normalization"""
    return normalizer.normalize(text)


def get_token_variants(text: str) -> List[str]:
    """Convenience function for variant generation"""
    return normalizer.generate_variants(text)


def extract_ingredient_tokens(text: str) -> List[str]:
    """Convenience function for token extraction"""
    return normalizer.extract_key_tokens(text)


def token_similarity(text1: str, text2: str) -> float:
    """Convenience function for similarity calculation"""
    return normalizer.calculate_similarity(text1, text2)