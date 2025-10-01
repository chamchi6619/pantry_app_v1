"""
Alias resolution service for progressive learning
Reduces LLM usage over time by learning from corrections
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from enum import Enum

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.services.token_normalizer import TokenNormalizer, normalize_token, token_similarity
from app.database import get_db

logger = logging.getLogger(__name__)


class AliasSource(Enum):
    """Source of alias creation"""
    USER = "user"      # Direct user correction
    SYSTEM = "system"  # System-generated
    LLM = "llm"       # LLM-suggested


class PatternType(Enum):
    """Pattern matching type"""
    EXACT = "exact"    # Exact match (case-insensitive)
    REGEX = "regex"    # Regular expression
    TOKEN = "token"    # Token-based matching


class AliasResolutionService:
    """
    Service for resolving ingredient text to normalized classes
    with progressive learning from user corrections
    """

    def __init__(self):
        self.normalizer = TokenNormalizer()
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Get database connection pool"""
        if not self._pool:
            self._pool = await get_db_pool()
        return self._pool

    async def resolve(
        self,
        raw_text: str,
        merchant: Optional[str] = None,
        household_id: Optional[str] = None,
        use_cache: bool = True
    ) -> Optional[Dict]:
        """
        Resolve raw ingredient text to normalized class

        Args:
            raw_text: Raw text from receipt
            merchant: Store name for merchant-specific patterns
            household_id: Household for household-specific overrides
            use_cache: Whether to use cached aliases

        Returns:
            Dict with ingredient_class, confidence, source, alias_id if found
        """
        if not raw_text:
            return None

        pool = await self._get_pool()

        # Use the database function for resolution
        query = """
            SELECT * FROM get_best_alias($1, $2, $3)
        """

        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(query, raw_text, merchant, household_id)

                if row and row['ingredient_class']:
                    # Update hit count
                    await self._record_usage(row['alias_id'], True)

                    return {
                        'ingredient_class': row['ingredient_class'],
                        'confidence': row['confidence'],
                        'source': row['source'],
                        'pattern_type': row['pattern_type'],
                        'alias_id': row['alias_id']
                    }

        except Exception as e:
            logger.error(f"Error resolving alias: {e}")

        return None

    async def learn_from_correction(
        self,
        raw_text: str,
        correct_class: str,
        merchant: Optional[str] = None,
        household_id: Optional[str] = None,
        source: AliasSource = AliasSource.USER
    ) -> bool:
        """
        Learn from a user correction by creating or updating aliases

        Args:
            raw_text: Original text that was corrected
            correct_class: The correct ingredient class
            merchant: Store if merchant-specific
            household_id: Household if user-specific
            source: Source of the correction

        Returns:
            True if alias was created/updated successfully
        """
        pool = await self._get_pool()

        try:
            # Normalize the text
            normalized = normalize_token(raw_text)

            async with pool.acquire() as conn:
                # Check if exact pattern exists
                existing = await conn.fetchrow("""
                    SELECT id, confidence, hit_count
                    FROM ingredient_aliases
                    WHERE pattern = $1
                    AND pattern_type = 'exact'
                    AND ($2::text IS NULL OR merchant = $2)
                    AND ($3::text IS NULL OR household_id = $3)
                """, normalized, merchant, household_id)

                if existing:
                    # Update confidence and hit count
                    new_confidence = min(existing['confidence'] * 1.1, 1.0)
                    await conn.execute("""
                        UPDATE ingredient_aliases
                        SET confidence = $1,
                            hit_count = hit_count + 1,
                            ingredient_class = $2,
                            updated_at = NOW()
                        WHERE id = $3
                    """, new_confidence, correct_class, existing['id'])

                    logger.info(f"Updated alias confidence: {normalized} -> {correct_class}")

                else:
                    # Create new alias
                    # Start with higher confidence for user corrections
                    initial_confidence = 0.8 if source == AliasSource.USER else 0.6

                    await conn.execute("""
                        INSERT INTO ingredient_aliases (
                            pattern, pattern_type, ingredient_class,
                            merchant, household_id, confidence,
                            source, created_by
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (pattern, pattern_type, merchant, household_id)
                        DO UPDATE SET
                            ingredient_class = EXCLUDED.ingredient_class,
                            confidence = GREATEST(ingredient_aliases.confidence, EXCLUDED.confidence),
                            updated_at = NOW()
                    """, normalized, 'exact', correct_class,
                        merchant, household_id, initial_confidence,
                        source.value, household_id)

                    logger.info(f"Created new alias: {normalized} -> {correct_class}")

                # Also create token-based pattern for broader matching
                tokens = self.normalizer.extract_key_tokens(raw_text)
                if tokens:
                    main_token = tokens[0]  # Use most significant token

                    await conn.execute("""
                        INSERT INTO ingredient_aliases (
                            pattern, pattern_type, ingredient_class,
                            confidence, source
                        ) VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (pattern, pattern_type, merchant, household_id)
                        DO NOTHING
                    """, main_token, 'token', correct_class, 0.5, source.value)

                return True

        except Exception as e:
            logger.error(f"Error learning from correction: {e}")
            return False

    async def _record_usage(
        self,
        alias_id: str,
        was_correct: bool,
        raw_text: Optional[str] = None,
        corrected_to: Optional[str] = None,
        receipt_id: Optional[str] = None,
        household_id: Optional[str] = None
    ):
        """Record alias usage for confidence adjustment"""
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                # Call the confidence update function
                await conn.execute(
                    "SELECT update_alias_confidence($1, $2)",
                    alias_id, was_correct
                )

                # Record feedback if we have details
                if raw_text:
                    await conn.execute("""
                        INSERT INTO alias_feedback (
                            alias_id, was_correct, raw_text,
                            corrected_to, receipt_id, household_id
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                    """, alias_id, was_correct, raw_text,
                        corrected_to, receipt_id, household_id)

        except Exception as e:
            logger.error(f"Error recording usage: {e}")

    async def bulk_resolve(
        self,
        texts: List[str],
        merchant: Optional[str] = None,
        household_id: Optional[str] = None
    ) -> List[Optional[Dict]]:
        """
        Resolve multiple texts efficiently

        Args:
            texts: List of raw texts to resolve
            merchant: Store name
            household_id: Household ID

        Returns:
            List of resolution results (None if not found)
        """
        tasks = [
            self.resolve(text, merchant, household_id)
            for text in texts
        ]

        return await asyncio.gather(*tasks)

    async def get_confidence_stats(
        self,
        merchant: Optional[str] = None,
        household_id: Optional[str] = None
    ) -> Dict:
        """Get statistics about alias confidence and usage"""
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                # Build query based on scope
                where_clause = []
                params = []
                param_count = 0

                if merchant:
                    param_count += 1
                    where_clause.append(f"merchant = ${param_count}")
                    params.append(merchant)

                if household_id:
                    param_count += 1
                    where_clause.append(f"household_id = ${param_count}")
                    params.append(household_id)

                where_sql = f"WHERE {' AND '.join(where_clause)}" if where_clause else ""

                stats = await conn.fetchrow(f"""
                    SELECT
                        COUNT(*) as total_aliases,
                        AVG(confidence) as avg_confidence,
                        SUM(hit_count) as total_hits,
                        SUM(miss_count) as total_misses,
                        COUNT(CASE WHEN confidence >= 0.8 THEN 1 END) as high_confidence_count,
                        COUNT(CASE WHEN confidence < 0.5 THEN 1 END) as low_confidence_count
                    FROM ingredient_aliases
                    {where_sql}
                """, *params)

                return {
                    'total_aliases': stats['total_aliases'] or 0,
                    'avg_confidence': float(stats['avg_confidence'] or 0),
                    'total_hits': stats['total_hits'] or 0,
                    'total_misses': stats['total_misses'] or 0,
                    'high_confidence_count': stats['high_confidence_count'] or 0,
                    'low_confidence_count': stats['low_confidence_count'] or 0,
                    'hit_rate': (
                        stats['total_hits'] / (stats['total_hits'] + stats['total_misses'])
                        if (stats['total_hits'] or 0) + (stats['total_misses'] or 0) > 0
                        else 0
                    )
                }

        except Exception as e:
            logger.error(f"Error getting stats: {e}")
            return {}

    async def prune_low_confidence(
        self,
        threshold: float = 0.3,
        min_age_days: int = 30
    ) -> int:
        """
        Remove aliases with consistently low confidence

        Args:
            threshold: Minimum confidence to keep
            min_age_days: Only prune aliases older than this

        Returns:
            Number of aliases removed
        """
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                result = await conn.execute("""
                    DELETE FROM ingredient_aliases
                    WHERE confidence < $1
                    AND miss_count > hit_count * 2
                    AND created_at < NOW() - INTERVAL '%s days'
                    AND source != 'user'  -- Never delete user corrections
                """, threshold, min_age_days)

                count = int(result.split()[-1])
                if count > 0:
                    logger.info(f"Pruned {count} low-confidence aliases")

                return count

        except Exception as e:
            logger.error(f"Error pruning aliases: {e}")
            return 0

    async def import_from_taxonomy(
        self,
        taxonomy_path: str = "/mnt/c/Users/chamc/OneDrive/Documents/GitHub/pantry_app_v1/backend/data/ingredient_taxonomy.json"
    ) -> int:
        """
        Import aliases from the ingredient taxonomy file

        Returns:
            Number of aliases imported
        """
        import json

        try:
            with open(taxonomy_path, 'r') as f:
                taxonomy = json.load(f)

            pool = await self._get_pool()
            count = 0

            async with pool.acquire() as conn:
                for ingredient_class, details in taxonomy.get('ingredient_classes', {}).items():
                    aliases = details.get('aliases', [])

                    for alias in aliases:
                        normalized = normalize_token(alias)

                        # Insert as system alias with decent confidence
                        await conn.execute("""
                            INSERT INTO ingredient_aliases (
                                pattern, pattern_type, ingredient_class,
                                confidence, source
                            ) VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (pattern, pattern_type, merchant, household_id)
                            DO NOTHING
                        """, normalized, 'exact', ingredient_class, 0.7, 'system')

                        count += 1

                        # Also create token patterns for key words
                        tokens = self.normalizer.extract_key_tokens(alias)
                        if tokens:
                            main_token = tokens[0]
                            await conn.execute("""
                                INSERT INTO ingredient_aliases (
                                    pattern, pattern_type, ingredient_class,
                                    confidence, source
                                ) VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT (pattern, pattern_type, merchant, household_id)
                                DO NOTHING
                            """, main_token, 'token', ingredient_class, 0.5, 'system')

            logger.info(f"Imported {count} aliases from taxonomy")
            return count

        except Exception as e:
            logger.error(f"Error importing taxonomy: {e}")
            return 0


# Global instance
alias_service = AliasResolutionService()


# Convenience functions
async def resolve_ingredient(
    text: str,
    merchant: Optional[str] = None,
    household_id: Optional[str] = None
) -> Optional[Dict]:
    """Resolve ingredient text to normalized class"""
    return await alias_service.resolve(text, merchant, household_id)


async def learn_ingredient_correction(
    raw_text: str,
    correct_class: str,
    merchant: Optional[str] = None,
    household_id: Optional[str] = None
) -> bool:
    """Learn from user correction"""
    return await alias_service.learn_from_correction(
        raw_text, correct_class, merchant, household_id, AliasSource.USER
    )