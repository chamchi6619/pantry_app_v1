"""
Confidence decay mechanism for alias patterns
Ensures aliases remain accurate over time
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from enum import Enum

import asyncpg

from app.database import get_db_pool

logger = logging.getLogger(__name__)


class DecayStrategy(Enum):
    """Strategies for confidence decay"""
    LINEAR = "linear"          # Simple linear decay
    EXPONENTIAL = "exponential" # Exponential decay
    ADAPTIVE = "adaptive"      # Based on error rate


class ConfidenceDecayService:
    """
    Manages confidence decay for alias patterns
    Reduces confidence over time for unused/incorrect patterns
    """

    def __init__(
        self,
        decay_rate: float = 0.02,      # 2% decay per period
        boost_rate: float = 0.05,      # 5% boost for correct usage
        min_confidence: float = 0.3,    # Minimum confidence floor
        max_confidence: float = 1.0,    # Maximum confidence ceiling
        decay_after_days: int = 7       # Days of inactivity before decay
    ):
        self.decay_rate = decay_rate
        self.boost_rate = boost_rate
        self.min_confidence = min_confidence
        self.max_confidence = max_confidence
        self.decay_after_days = decay_after_days
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Get database connection pool"""
        if not self._pool:
            self._pool = await get_db_pool()
        return self._pool

    async def apply_time_decay(
        self,
        strategy: DecayStrategy = DecayStrategy.ADAPTIVE
    ) -> Dict[str, int]:
        """
        Apply time-based decay to inactive aliases

        Args:
            strategy: Decay strategy to use

        Returns:
            Dict with counts of aliases affected
        """
        pool = await self._get_pool()
        cutoff_date = datetime.utcnow() - timedelta(days=self.decay_after_days)

        stats = {
            'decayed': 0,
            'removed': 0,
            'unchanged': 0
        }

        try:
            async with pool.acquire() as conn:
                # Get inactive aliases
                inactive_aliases = await conn.fetch("""
                    SELECT id, confidence, hit_count, miss_count,
                           last_used, source, pattern_type
                    FROM ingredient_aliases
                    WHERE (last_used IS NULL OR last_used < $1)
                    AND source != 'user'  -- Don't decay user corrections
                    AND confidence > $2   -- Only decay if above minimum
                """, cutoff_date, self.min_confidence)

                for alias in inactive_aliases:
                    new_confidence = await self._calculate_decay(
                        alias, strategy
                    )

                    if new_confidence < self.min_confidence:
                        # Remove very low confidence aliases
                        if alias['source'] != 'user' and alias['hit_count'] == 0:
                            await conn.execute(
                                "DELETE FROM ingredient_aliases WHERE id = $1",
                                alias['id']
                            )
                            stats['removed'] += 1
                        else:
                            # Keep but set to minimum
                            await conn.execute("""
                                UPDATE ingredient_aliases
                                SET confidence = $1, updated_at = NOW()
                                WHERE id = $2
                            """, self.min_confidence, alias['id'])
                            stats['decayed'] += 1
                    elif new_confidence < alias['confidence']:
                        # Apply decay
                        await conn.execute("""
                            UPDATE ingredient_aliases
                            SET confidence = $1, updated_at = NOW()
                            WHERE id = $2
                        """, new_confidence, alias['id'])
                        stats['decayed'] += 1
                    else:
                        stats['unchanged'] += 1

                logger.info(
                    f"Decay complete: {stats['decayed']} decayed, "
                    f"{stats['removed']} removed, {stats['unchanged']} unchanged"
                )

        except Exception as e:
            logger.error(f"Error applying decay: {e}")

        return stats

    async def _calculate_decay(
        self,
        alias: Dict,
        strategy: DecayStrategy
    ) -> float:
        """Calculate new confidence after decay"""
        current_confidence = alias['confidence']
        hit_count = alias['hit_count'] or 0
        miss_count = alias['miss_count'] or 0

        if strategy == DecayStrategy.LINEAR:
            # Simple linear decay
            return max(
                self.min_confidence,
                current_confidence * (1 - self.decay_rate)
            )

        elif strategy == DecayStrategy.EXPONENTIAL:
            # Exponential decay based on time since last use
            if alias['last_used']:
                days_inactive = (
                    datetime.utcnow() - alias['last_used']
                ).days
                decay_factor = (1 - self.decay_rate) ** (days_inactive / 7)
            else:
                # Never used, stronger decay
                decay_factor = 0.7

            return max(
                self.min_confidence,
                current_confidence * decay_factor
            )

        elif strategy == DecayStrategy.ADAPTIVE:
            # Adaptive based on performance
            total_uses = hit_count + miss_count

            if total_uses == 0:
                # Never used, moderate decay
                return max(
                    self.min_confidence,
                    current_confidence * 0.9
                )

            # Calculate error rate
            error_rate = miss_count / total_uses if total_uses > 0 else 0

            # Adjust decay based on error rate
            if error_rate > 0.5:
                # High error rate, stronger decay
                decay_factor = 1 - (self.decay_rate * 2)
            elif error_rate > 0.2:
                # Moderate error rate
                decay_factor = 1 - self.decay_rate
            else:
                # Low error rate, minimal decay
                decay_factor = 1 - (self.decay_rate * 0.5)

            # Consider pattern type (exact patterns decay slower)
            if alias['pattern_type'] == 'exact':
                decay_factor = decay_factor ** 0.5  # Square root for slower decay

            return max(
                self.min_confidence,
                current_confidence * decay_factor
            )

        return current_confidence

    async def boost_active_aliases(self) -> int:
        """
        Boost confidence for frequently used correct aliases

        Returns:
            Number of aliases boosted
        """
        pool = await self._get_pool()
        recent_date = datetime.utcnow() - timedelta(days=7)
        count = 0

        try:
            async with pool.acquire() as conn:
                # Find well-performing aliases
                good_aliases = await conn.fetch("""
                    SELECT id, confidence, hit_count, miss_count
                    FROM ingredient_aliases
                    WHERE last_used > $1
                    AND hit_count > miss_count * 2  -- At least 2:1 hit ratio
                    AND hit_count >= 5              -- Minimum usage
                    AND confidence < $2              -- Room to grow
                """, recent_date, self.max_confidence * 0.95)

                for alias in good_aliases:
                    new_confidence = min(
                        self.max_confidence,
                        alias['confidence'] * (1 + self.boost_rate)
                    )

                    await conn.execute("""
                        UPDATE ingredient_aliases
                        SET confidence = $1, updated_at = NOW()
                        WHERE id = $2
                    """, new_confidence, alias['id'])

                    count += 1

                if count > 0:
                    logger.info(f"Boosted confidence for {count} well-performing aliases")

        except Exception as e:
            logger.error(f"Error boosting aliases: {e}")

        return count

    async def rebalance_merchant_aliases(
        self,
        merchant: str
    ) -> Dict[str, int]:
        """
        Rebalance aliases for a specific merchant based on usage

        Args:
            merchant: Merchant name

        Returns:
            Stats about rebalancing
        """
        pool = await self._get_pool()
        stats = {
            'promoted': 0,
            'demoted': 0,
            'removed': 0
        }

        try:
            async with pool.acquire() as conn:
                # Get merchant-specific aliases
                aliases = await conn.fetch("""
                    SELECT id, pattern, confidence,
                           hit_count, miss_count, pattern_type
                    FROM ingredient_aliases
                    WHERE merchant = $1
                    ORDER BY confidence DESC
                """, merchant)

                # Group by pattern to find duplicates
                pattern_groups = {}
                for alias in aliases:
                    key = (alias['pattern'], alias['pattern_type'])
                    if key not in pattern_groups:
                        pattern_groups[key] = []
                    pattern_groups[key].append(alias)

                # Consolidate duplicates
                for pattern_key, group in pattern_groups.items():
                    if len(group) > 1:
                        # Keep the best performing one
                        best = max(group, key=lambda a: (
                            a['hit_count'] - a['miss_count'],
                            a['confidence']
                        ))

                        for alias in group:
                            if alias['id'] != best['id']:
                                # Merge stats into best
                                await conn.execute("""
                                    UPDATE ingredient_aliases
                                    SET hit_count = hit_count + $1,
                                        miss_count = miss_count + $2
                                    WHERE id = $3
                                """, alias['hit_count'], alias['miss_count'], best['id'])

                                # Remove duplicate
                                await conn.execute(
                                    "DELETE FROM ingredient_aliases WHERE id = $1",
                                    alias['id']
                                )
                                stats['removed'] += 1

                # Adjust confidence based on relative performance
                for alias in aliases:
                    if alias['hit_count'] + alias['miss_count'] < 3:
                        continue  # Not enough data

                    success_rate = (
                        alias['hit_count'] /
                        (alias['hit_count'] + alias['miss_count'])
                    )

                    target_confidence = success_rate * 0.9  # Slightly conservative

                    if abs(alias['confidence'] - target_confidence) > 0.1:
                        if target_confidence > alias['confidence']:
                            stats['promoted'] += 1
                        else:
                            stats['demoted'] += 1

                        await conn.execute("""
                            UPDATE ingredient_aliases
                            SET confidence = $1, updated_at = NOW()
                            WHERE id = $2
                        """, target_confidence, alias['id'])

        except Exception as e:
            logger.error(f"Error rebalancing merchant aliases: {e}")

        return stats

    async def analyze_feedback_trends(
        self,
        days_back: int = 30
    ) -> Dict:
        """
        Analyze recent feedback to identify problem patterns

        Args:
            days_back: Number of days to analyze

        Returns:
            Analysis results
        """
        pool = await self._get_pool()
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)

        try:
            async with pool.acquire() as conn:
                # Get feedback statistics
                feedback_stats = await conn.fetchrow("""
                    SELECT
                        COUNT(*) as total_feedback,
                        COUNT(CASE WHEN was_correct THEN 1 END) as correct_count,
                        COUNT(CASE WHEN NOT was_correct THEN 1 END) as incorrect_count
                    FROM alias_feedback
                    WHERE created_at > $1
                """, cutoff_date)

                # Find problematic aliases
                problem_aliases = await conn.fetch("""
                    SELECT
                        a.id,
                        a.pattern,
                        a.pattern_type,
                        a.ingredient_class,
                        COUNT(f.id) as feedback_count,
                        COUNT(CASE WHEN NOT f.was_correct THEN 1 END) as error_count
                    FROM ingredient_aliases a
                    JOIN alias_feedback f ON f.alias_id = a.id
                    WHERE f.created_at > $1
                    GROUP BY a.id
                    HAVING COUNT(CASE WHEN NOT f.was_correct THEN 1 END) > 2
                    ORDER BY COUNT(CASE WHEN NOT f.was_correct THEN 1 END) DESC
                    LIMIT 20
                """, cutoff_date)

                # Find commonly corrected patterns
                common_corrections = await conn.fetch("""
                    SELECT
                        raw_text,
                        corrected_to,
                        COUNT(*) as correction_count
                    FROM alias_feedback
                    WHERE NOT was_correct
                    AND corrected_to IS NOT NULL
                    AND created_at > $1
                    GROUP BY raw_text, corrected_to
                    HAVING COUNT(*) > 1
                    ORDER BY COUNT(*) DESC
                    LIMIT 20
                """, cutoff_date)

                accuracy_rate = (
                    feedback_stats['correct_count'] /
                    feedback_stats['total_feedback']
                    if feedback_stats['total_feedback'] > 0
                    else 0
                )

                return {
                    'total_feedback': feedback_stats['total_feedback'],
                    'accuracy_rate': accuracy_rate,
                    'problem_aliases': [
                        {
                            'pattern': alias['pattern'],
                            'type': alias['pattern_type'],
                            'class': alias['ingredient_class'],
                            'error_rate': (
                                alias['error_count'] / alias['feedback_count']
                            )
                        }
                        for alias in problem_aliases
                    ],
                    'common_corrections': [
                        {
                            'from': corr['raw_text'],
                            'to': corr['corrected_to'],
                            'count': corr['correction_count']
                        }
                        for corr in common_corrections
                    ]
                }

        except Exception as e:
            logger.error(f"Error analyzing feedback: {e}")
            return {}

    async def run_maintenance_cycle(self) -> Dict:
        """
        Run complete maintenance cycle

        Returns:
            Summary of all maintenance operations
        """
        logger.info("Starting confidence maintenance cycle")

        results = {}

        # Apply time-based decay
        results['decay'] = await self.apply_time_decay()

        # Boost active aliases
        results['boosted'] = await self.boost_active_aliases()

        # Analyze feedback trends
        results['analysis'] = await self.analyze_feedback_trends()

        # Log problem patterns
        if results['analysis'].get('problem_aliases'):
            logger.warning(
                f"Found {len(results['analysis']['problem_aliases'])} "
                f"problematic alias patterns"
            )

        logger.info("Maintenance cycle complete")
        return results


# Global instance with default settings
confidence_manager = ConfidenceDecayService()


# Convenience function for periodic maintenance
async def run_confidence_maintenance():
    """Run confidence maintenance (call periodically)"""
    return await confidence_manager.run_maintenance_cycle()