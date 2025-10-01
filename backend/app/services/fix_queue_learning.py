"""
Fix Queue Learning Service
Connects user corrections from Fix Queue to the alias learning system
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from enum import Enum

import asyncpg

from app.services.alias_resolution import (
    AliasResolutionService,
    AliasSource,
    learn_ingredient_correction
)
from app.services.token_normalizer import TokenNormalizer, token_similarity
from app.database import get_db_pool

logger = logging.getLogger(__name__)


class CorrectionType(Enum):
    """Types of corrections made in Fix Queue"""
    NAME = "name"          # Item name correction
    QUANTITY = "quantity"  # Quantity correction
    UNIT = "unit"         # Unit correction
    CATEGORY = "category"  # Category correction
    PRICE = "price"       # Price correction
    DELETE = "delete"     # Item deleted
    MERGE = "merge"       # Items merged


class FixQueueLearningService:
    """
    Learns from user corrections in the Fix Queue
    to improve future OCR and classification accuracy
    """

    def __init__(self):
        self.alias_service = AliasResolutionService()
        self.normalizer = TokenNormalizer()
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Get database connection pool"""
        if not self._pool:
            self._pool = await get_db_pool()
        return self._pool

    async def process_correction(
        self,
        fix_queue_id: str,
        original_data: Dict,
        corrected_data: Dict,
        household_id: str,
        merchant: Optional[str] = None,
        receipt_id: Optional[str] = None
    ) -> bool:
        """
        Process a single correction from Fix Queue

        Args:
            fix_queue_id: ID of the Fix Queue entry
            original_data: Original OCR/parsed data
            corrected_data: User-corrected data
            household_id: User's household ID
            merchant: Store name from receipt
            receipt_id: Receipt ID for tracking

        Returns:
            True if learning was successful
        """
        try:
            # Determine what was corrected
            corrections = self._identify_corrections(
                original_data, corrected_data
            )

            success = True

            # Process name corrections (most valuable for alias learning)
            if CorrectionType.NAME in corrections:
                success = await self._learn_name_correction(
                    original_data.get('raw_text', ''),
                    original_data.get('parsed_name', ''),
                    corrected_data.get('name', ''),
                    corrected_data.get('category', ''),
                    household_id,
                    merchant
                )

            # Process category corrections
            if CorrectionType.CATEGORY in corrections:
                await self._learn_category_pattern(
                    corrected_data.get('name', ''),
                    corrected_data.get('category', ''),
                    household_id,
                    merchant
                )

            # Record the correction for analytics
            await self._record_correction(
                fix_queue_id,
                corrections,
                household_id,
                merchant,
                receipt_id
            )

            return success

        except Exception as e:
            logger.error(f"Error processing correction: {e}")
            return False

    def _identify_corrections(
        self,
        original: Dict,
        corrected: Dict
    ) -> List[CorrectionType]:
        """Identify what types of corrections were made"""
        corrections = []

        # Check name change
        if original.get('parsed_name') != corrected.get('name'):
            corrections.append(CorrectionType.NAME)

        # Check quantity change
        if original.get('qty') != corrected.get('qty'):
            corrections.append(CorrectionType.QUANTITY)

        # Check unit change
        if original.get('unit') != corrected.get('unit'):
            corrections.append(CorrectionType.UNIT)

        # Check category change
        if original.get('categories') != corrected.get('category'):
            corrections.append(CorrectionType.CATEGORY)

        # Check price change
        if original.get('price') != corrected.get('price'):
            corrections.append(CorrectionType.PRICE)

        # Check if deleted
        if corrected.get('deleted', False):
            corrections.append(CorrectionType.DELETE)

        return corrections

    async def _learn_name_correction(
        self,
        raw_text: str,
        original_name: str,
        corrected_name: str,
        category: str,
        household_id: str,
        merchant: Optional[str] = None
    ) -> bool:
        """Learn from name corrections"""
        if not raw_text or not corrected_name:
            return False

        # Create alias from raw text to corrected name
        success = await learn_ingredient_correction(
            raw_text,
            category or corrected_name,  # Use category as class if available
            merchant,
            household_id
        )

        # If original parsed name was different, also learn that mapping
        if original_name and original_name != raw_text:
            await learn_ingredient_correction(
                original_name,
                category or corrected_name,
                merchant,
                household_id
            )

        return success

    async def _learn_category_pattern(
        self,
        item_name: str,
        category: str,
        household_id: str,
        merchant: Optional[str] = None
    ):
        """Learn category patterns from corrections"""
        if not item_name or not category:
            return

        # Extract key tokens from item name
        tokens = self.normalizer.extract_key_tokens(item_name)

        if tokens:
            # Create token-based pattern for category
            main_token = tokens[0]

            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO ingredient_aliases (
                        pattern, pattern_type, ingredient_class,
                        household_id, confidence, source
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (pattern, pattern_type, merchant, household_id)
                    DO UPDATE SET
                        ingredient_class = EXCLUDED.ingredient_class,
                        confidence = GREATEST(
                            ingredient_aliases.confidence * 1.05,
                            EXCLUDED.confidence
                        ),
                        hit_count = ingredient_aliases.hit_count + 1,
                        updated_at = NOW()
                """, main_token, 'token', category,
                    household_id, 0.7, 'user')

    async def _record_correction(
        self,
        fix_queue_id: str,
        corrections: List[CorrectionType],
        household_id: str,
        merchant: Optional[str] = None,
        receipt_id: Optional[str] = None
    ):
        """Record correction for analytics and learning"""
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                # Update fix queue entry as resolved
                await conn.execute("""
                    UPDATE fix_queue
                    SET resolved = true,
                        resolved_at = NOW(),
                        correction_types = $1
                    WHERE id = $2
                """, [c.value for c in corrections], fix_queue_id)

                # Track correction metrics (if table exists)
                await conn.execute("""
                    INSERT INTO correction_metrics (
                        household_id, merchant, receipt_id,
                        correction_types, created_at
                    ) VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT DO NOTHING
                """, household_id, merchant, receipt_id,
                    [c.value for c in corrections])

        except Exception as e:
            logger.debug(f"Could not record metrics: {e}")

    async def bulk_process_corrections(
        self,
        corrections: List[Dict]
    ) -> Dict[str, int]:
        """
        Process multiple corrections in batch

        Args:
            corrections: List of correction dictionaries

        Returns:
            Statistics about processing
        """
        stats = {
            'processed': 0,
            'learned': 0,
            'failed': 0
        }

        for correction in corrections:
            try:
                success = await self.process_correction(
                    correction['fix_queue_id'],
                    correction['original_data'],
                    correction['corrected_data'],
                    correction['household_id'],
                    correction.get('merchant'),
                    correction.get('receipt_id')
                )

                stats['processed'] += 1
                if success:
                    stats['learned'] += 1

            except Exception as e:
                logger.error(f"Error in bulk processing: {e}")
                stats['failed'] += 1

        logger.info(
            f"Bulk processing complete: {stats['processed']} processed, "
            f"{stats['learned']} learned, {stats['failed']} failed"
        )

        return stats

    async def analyze_correction_patterns(
        self,
        household_id: Optional[str] = None,
        merchant: Optional[str] = None,
        days_back: int = 30
    ) -> Dict:
        """
        Analyze patterns in corrections to identify common issues

        Args:
            household_id: Filter by household
            merchant: Filter by merchant
            days_back: Days to analyze

        Returns:
            Analysis of correction patterns
        """
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                # Build query filters
                filters = ["resolved = true"]
                params = []
                param_count = 0

                if household_id:
                    param_count += 1
                    filters.append(f"household_id = ${param_count}")
                    params.append(household_id)

                if merchant:
                    param_count += 1
                    filters.append(f"merchant = ${param_count}")
                    params.append(merchant)

                where_clause = " AND ".join(filters)

                # Get correction statistics
                stats = await conn.fetchrow(f"""
                    SELECT
                        COUNT(*) as total_corrections,
                        COUNT(DISTINCT household_id) as unique_households,
                        COUNT(DISTINCT merchant) as unique_merchants,
                        AVG(CASE WHEN price_diff IS NOT NULL
                            THEN ABS(price_diff) ELSE 0 END) as avg_price_diff
                    FROM fix_queue
                    WHERE {where_clause}
                    AND resolved_at > NOW() - INTERVAL '{days_back} days'
                """, *params)

                # Most commonly corrected items
                common_items = await conn.fetch(f"""
                    SELECT
                        raw_text,
                        parsed_name,
                        COUNT(*) as correction_count
                    FROM fix_queue
                    WHERE {where_clause}
                    AND resolved_at > NOW() - INTERVAL '{days_back} days'
                    GROUP BY raw_text, parsed_name
                    HAVING COUNT(*) > 1
                    ORDER BY COUNT(*) DESC
                    LIMIT 20
                """, *params)

                # Correction type distribution
                correction_types = await conn.fetch(f"""
                    SELECT
                        unnest(correction_types) as correction_type,
                        COUNT(*) as count
                    FROM fix_queue
                    WHERE {where_clause}
                    AND resolved_at > NOW() - INTERVAL '{days_back} days'
                    AND correction_types IS NOT NULL
                    GROUP BY correction_type
                    ORDER BY count DESC
                """, *params)

                return {
                    'total_corrections': stats['total_corrections'] or 0,
                    'unique_households': stats['unique_households'] or 0,
                    'unique_merchants': stats['unique_merchants'] or 0,
                    'avg_price_diff': float(stats['avg_price_diff'] or 0),
                    'common_corrections': [
                        {
                            'raw_text': item['raw_text'],
                            'parsed_name': item['parsed_name'],
                            'count': item['correction_count']
                        }
                        for item in common_items
                    ],
                    'correction_types': {
                        ct['correction_type']: ct['count']
                        for ct in correction_types
                    }
                }

        except Exception as e:
            logger.error(f"Error analyzing patterns: {e}")
            return {}

    async def suggest_automation_rules(
        self,
        min_occurrences: int = 3,
        min_confidence: float = 0.8
    ) -> List[Dict]:
        """
        Suggest automation rules based on consistent corrections

        Args:
            min_occurrences: Minimum times a correction must occur
            min_confidence: Minimum confidence for suggestion

        Returns:
            List of suggested automation rules
        """
        pool = await self._get_pool()
        suggestions = []

        try:
            async with pool.acquire() as conn:
                # Find consistent name corrections
                name_patterns = await conn.fetch("""
                    SELECT
                        raw_text,
                        parsed_name,
                        corrected_name,
                        category,
                        COUNT(*) as occurrence_count,
                        COUNT(DISTINCT household_id) as household_count
                    FROM fix_queue
                    WHERE resolved = true
                    AND corrected_name IS NOT NULL
                    AND raw_text != corrected_name
                    GROUP BY raw_text, parsed_name, corrected_name, category
                    HAVING COUNT(*) >= $1
                    ORDER BY COUNT(*) DESC
                """, min_occurrences)

                for pattern in name_patterns:
                    # Calculate confidence based on consistency
                    confidence = min(
                        0.6 + (pattern['occurrence_count'] * 0.05),
                        0.95
                    )

                    if confidence >= min_confidence:
                        suggestions.append({
                            'type': 'name_mapping',
                            'from': pattern['raw_text'],
                            'to': pattern['corrected_name'],
                            'category': pattern['category'],
                            'confidence': confidence,
                            'occurrences': pattern['occurrence_count'],
                            'households': pattern['household_count'],
                            'action': 'create_alias'
                        })

                # Find consistent category corrections
                category_patterns = await conn.fetch("""
                    SELECT
                        corrected_name,
                        category,
                        COUNT(*) as occurrence_count
                    FROM fix_queue
                    WHERE resolved = true
                    AND category IS NOT NULL
                    GROUP BY corrected_name, category
                    HAVING COUNT(*) >= $1
                    ORDER BY COUNT(*) DESC
                """, min_occurrences)

                for pattern in category_patterns:
                    confidence = min(
                        0.5 + (pattern['occurrence_count'] * 0.05),
                        0.9
                    )

                    if confidence >= min_confidence:
                        suggestions.append({
                            'type': 'category_mapping',
                            'item': pattern['corrected_name'],
                            'category': pattern['category'],
                            'confidence': confidence,
                            'occurrences': pattern['occurrence_count'],
                            'action': 'create_category_rule'
                        })

        except Exception as e:
            logger.error(f"Error suggesting rules: {e}")

        return suggestions


# Global instance
fix_queue_learner = FixQueueLearningService()


# Convenience functions
async def learn_from_fix_queue(
    fix_queue_id: str,
    original: Dict,
    corrected: Dict,
    household_id: str,
    merchant: Optional[str] = None
) -> bool:
    """Learn from a Fix Queue correction"""
    return await fix_queue_learner.process_correction(
        fix_queue_id, original, corrected, household_id, merchant
    )


async def analyze_fix_patterns(
    household_id: Optional[str] = None,
    merchant: Optional[str] = None
) -> Dict:
    """Analyze Fix Queue correction patterns"""
    return await fix_queue_learner.analyze_correction_patterns(
        household_id, merchant
    )