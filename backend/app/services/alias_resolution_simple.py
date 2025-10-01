"""
Simplified alias resolution service without database dependencies
For testing the OCR flow
"""

import logging
from typing import Dict, List, Optional
from app.services.token_normalizer import TokenNormalizer, normalize_token

logger = logging.getLogger(__name__)


class SimpleAliasResolutionService:
    """
    Simple in-memory alias resolution for testing
    """

    def __init__(self):
        self.normalizer = TokenNormalizer()

        # Static mappings for common items
        self.static_aliases = {
            'MILK': 'milk',
            'WHOLE MILK': 'milk',
            '2% MILK': 'milk',
            'BREAD': 'bread',
            'WHEAT BREAD': 'bread',
            'WHITE BREAD': 'bread',
            'EGGS': 'eggs',
            'DOZEN EGGS': 'eggs',
            'CHICKEN': 'chicken',
            'CHICKEN BREAST': 'chicken',
            'BANANAS': 'bananas',
            'CHEESE': 'cheese',
            'CHEDDAR': 'cheese',
            'YOGURT': 'yogurt',
            'GREEK YOGURT': 'yogurt',
        }

    async def resolve(
        self,
        raw_text: str,
        merchant: Optional[str] = None,
        household_id: Optional[str] = None,
        use_cache: bool = True
    ) -> Optional[Dict]:
        """
        Simple resolution based on static mappings
        """
        if not raw_text:
            return None

        # Normalize the text
        normalized = normalize_token(raw_text).upper()

        # Check static mappings
        if normalized in self.static_aliases:
            return {
                'ingredient_class': self.static_aliases[normalized],
                'confidence': 0.8,
                'source': 'static',
                'pattern_type': 'exact',
                'alias_id': f'static_{normalized}'
            }

        # Try partial matching
        for pattern, ingredient_class in self.static_aliases.items():
            if pattern in normalized or normalized in pattern:
                return {
                    'ingredient_class': ingredient_class,
                    'confidence': 0.6,
                    'source': 'static',
                    'pattern_type': 'partial',
                    'alias_id': f'static_{pattern}'
                }

        return None

    async def learn_from_correction(
        self,
        raw_text: str,
        correct_class: str,
        merchant: Optional[str] = None,
        household_id: Optional[str] = None
    ) -> bool:
        """
        For testing - just log the correction
        """
        logger.info(f"Learning: {raw_text} -> {correct_class}")
        return True

    async def get_confidence_stats(
        self,
        merchant: Optional[str] = None,
        household_id: Optional[str] = None
    ) -> Dict:
        """
        Return dummy stats for testing
        """
        return {
            'total_aliases': len(self.static_aliases),
            'avg_confidence': 0.7,
            'total_hits': 0,
            'total_misses': 0,
            'high_confidence_count': 10,
            'low_confidence_count': 2,
            'hit_rate': 0.0
        }


# Global instance
alias_service = SimpleAliasResolutionService()