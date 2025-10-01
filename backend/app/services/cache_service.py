"""
Enhanced cache service with versioning and dual-key support
"""

import json
import hashlib
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Optional, Tuple
from enum import Enum
import asyncio
import logging

# For now, use in-memory cache (replace with Redis in production)
from collections import OrderedDict

logger = logging.getLogger(__name__)

# Version constants
SCHEMA_VERSION = "1.2.0"
PIPELINE_VERSION = "2024.01.15"

class CacheStrategy(Enum):
    """Cache strategies"""
    STRONG = "strong"  # Image hash based
    WEAK = "weak"     # Merchant/date/total based
    BOTH = "both"     # Try both

class EnhancedReceiptCache:
    """
    Cache service with versioning, dual keys, and automatic eviction
    """

    def __init__(self, max_size: int = 1000):
        # In production, this would be Redis
        self._cache: OrderedDict = OrderedDict()
        self._max_size = max_size
        self._hits = 0
        self._misses = 0
        self._evictions = 0

    def _make_strong_key(self, image_hash: str) -> str:
        """Create strong cache key from image hash"""
        return f"receipt:{image_hash}"

    def _make_weak_key(
        self,
        merchant: str,
        date: str,
        total: float,
        currency: str = "USD",
        line_count: int = 0
    ) -> str:
        """Create weak cache key from receipt metadata"""
        # Bucket line count to reduce key variance
        line_bucket = (line_count // 10) * 10  # 0-9→0, 10-19→10, etc.

        # Create composite key
        key_parts = [
            merchant or "unknown",
            date or "unknown",
            f"{total:.2f}",
            currency,
            str(line_bucket)
        ]

        # Hash for consistency
        key_string = "|".join(key_parts)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()[:8]

        return f"receipt:weak:{key_hash}"

    def _make_cache_entry(self, data: Dict) -> Dict:
        """Create cache entry with metadata"""
        return {
            "schema_version": SCHEMA_VERSION,
            "pipeline_version": PIPELINE_VERSION,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        }

    def _is_valid_entry(self, entry: Dict) -> bool:
        """Check if cache entry is valid for current version"""
        if not isinstance(entry, dict):
            return False

        return (
            entry.get("schema_version") == SCHEMA_VERSION and
            entry.get("pipeline_version") == PIPELINE_VERSION
        )

    def _is_expired(self, entry: Dict, ttl_seconds: int) -> bool:
        """Check if cache entry is expired"""
        if "timestamp" not in entry:
            return True

        try:
            entry_time = datetime.fromisoformat(entry["timestamp"])
            age = datetime.utcnow() - entry_time
            return age.total_seconds() > ttl_seconds
        except:
            return True

    def _evict_if_needed(self):
        """Evict oldest entries if cache is full"""
        while len(self._cache) >= self._max_size:
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
            self._evictions += 1
            logger.debug(f"Evicted cache entry: {oldest_key}")

    async def get(
        self,
        image_hash: Optional[str] = None,
        merchant: Optional[str] = None,
        date: Optional[str] = None,
        total: Optional[float] = None,
        currency: str = "USD",
        line_count: int = 0,
        strategy: CacheStrategy = CacheStrategy.BOTH
    ) -> Optional[Dict]:
        """
        Get cached receipt data

        Args:
            image_hash: Strong key (image hash)
            merchant: For weak key
            date: For weak key
            total: For weak key
            currency: For weak key
            line_count: For weak key
            strategy: Which keys to try

        Returns:
            Cached data if found and valid, None otherwise
        """
        keys_to_try = []

        # Build list of keys based on strategy
        if strategy in [CacheStrategy.STRONG, CacheStrategy.BOTH] and image_hash:
            keys_to_try.append(self._make_strong_key(image_hash))

        if strategy in [CacheStrategy.WEAK, CacheStrategy.BOTH] and merchant and date and total:
            keys_to_try.append(
                self._make_weak_key(merchant, date, total, currency, line_count)
            )

        # Try each key
        for key in keys_to_try:
            if key in self._cache:
                entry = self._cache[key]

                # Validate entry
                if not self._is_valid_entry(entry):
                    logger.debug(f"Invalid cache entry (version mismatch): {key}")
                    del self._cache[key]
                    continue

                # Check expiration (30 days for strong, 7 days for weak)
                ttl = 30 * 24 * 3600 if "weak" not in key else 7 * 24 * 3600
                if self._is_expired(entry, ttl):
                    logger.debug(f"Expired cache entry: {key}")
                    del self._cache[key]
                    continue

                # Move to end (LRU)
                self._cache.move_to_end(key)
                self._hits += 1

                logger.debug(f"Cache hit: {key}")
                return entry["data"]

        self._misses += 1
        return None

    async def set(
        self,
        data: Dict,
        image_hash: Optional[str] = None,
        merchant: Optional[str] = None,
        date: Optional[str] = None,
        total: Optional[float] = None,
        currency: str = "USD",
        line_count: int = 0
    ) -> None:
        """
        Cache receipt data with both strong and weak keys

        Args:
            data: Data to cache
            image_hash: For strong key
            merchant: For weak key
            date: For weak key
            total: For weak key
            currency: For weak key
            line_count: For weak key
        """
        # Evict if needed
        self._evict_if_needed()

        # Create cache entry
        entry = self._make_cache_entry(data)

        # Set with strong key if available
        if image_hash:
            strong_key = self._make_strong_key(image_hash)
            self._cache[strong_key] = entry
            logger.debug(f"Cached with strong key: {strong_key}")

        # Set with weak key if available
        if merchant and date and total is not None:
            weak_key = self._make_weak_key(merchant, date, total, currency, line_count)
            self._cache[weak_key] = entry
            logger.debug(f"Cached with weak key: {weak_key}")

    async def get_or_compute(
        self,
        compute_fn: Callable,
        image_hash: Optional[str] = None,
        merchant: Optional[str] = None,
        date: Optional[str] = None,
        total: Optional[float] = None,
        currency: str = "USD",
        line_count: int = 0
    ) -> Tuple[Dict, bool]:
        """
        Get from cache or compute and cache

        Args:
            compute_fn: Async function to compute if not cached
            image_hash: For caching
            merchant: For caching
            date: For caching
            total: For caching
            currency: For caching
            line_count: For caching

        Returns:
            Tuple of (data, was_cached)
        """
        # Try to get from cache
        cached = await self.get(
            image_hash=image_hash,
            merchant=merchant,
            date=date,
            total=total,
            currency=currency,
            line_count=line_count
        )

        if cached:
            return cached, True

        # Compute
        result = await compute_fn()

        # Cache the result
        await self.set(
            data=result,
            image_hash=image_hash,
            merchant=merchant,
            date=date,
            total=total,
            currency=currency,
            line_count=line_count
        )

        return result, False

    def invalidate_version(self):
        """Invalidate all cache entries (version bump)"""
        logger.info(f"Invalidating {len(self._cache)} cache entries due to version change")
        self._cache.clear()

    def get_stats(self) -> Dict:
        """Get cache statistics"""
        hit_rate = self._hits / (self._hits + self._misses) if (self._hits + self._misses) > 0 else 0

        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": hit_rate,
            "evictions": self._evictions,
            "schema_version": SCHEMA_VERSION,
            "pipeline_version": PIPELINE_VERSION
        }

    def clear(self):
        """Clear all cache entries"""
        self._cache.clear()
        logger.info("Cache cleared")

# Global cache instance
receipt_cache = EnhancedReceiptCache()

# Convenience functions
async def get_cached_receipt(
    image_hash: Optional[str] = None,
    merchant: Optional[str] = None,
    date: Optional[str] = None,
    total: Optional[float] = None
) -> Optional[Dict]:
    """Get cached receipt data"""
    return await receipt_cache.get(
        image_hash=image_hash,
        merchant=merchant,
        date=date,
        total=total
    )

async def cache_receipt(
    data: Dict,
    image_hash: Optional[str] = None,
    merchant: Optional[str] = None,
    date: Optional[str] = None,
    total: Optional[float] = None
) -> None:
    """Cache receipt data"""
    await receipt_cache.set(
        data=data,
        image_hash=image_hash,
        merchant=merchant,
        date=date,
        total=total
    )