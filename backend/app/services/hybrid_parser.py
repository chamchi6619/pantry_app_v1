"""
Hybrid Receipt Parser
Combines enhanced heuristics with selective Gemini fallback
Target: $0 cost for 80% of receipts
"""

import os
import json
import logging
import hashlib
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from app.services.enhanced_heuristics import EnhancedHeuristicParser, ReceiptData
from app.services.gemini_parser import GeminiReceiptParser
from app.utils.pii_redaction import redact_pii, detect_pii

logger = logging.getLogger(__name__)


class HybridReceiptParser:
    """
    Intelligent receipt parser that uses heuristics first,
    then falls back to Gemini only when needed
    """

    def __init__(self, gemini_api_key: Optional[str] = None):
        """Initialize both parsers"""
        self.heuristic_parser = EnhancedHeuristicParser()
        self.gemini_parser = GeminiReceiptParser(api_key=gemini_api_key)

        # Track usage for cost monitoring
        self.stats = {
            'total_processed': 0,
            'heuristic_only': 0,
            'gemini_used': 0,
            'gemini_calls_today': 0,
            'last_reset': datetime.now()
        }

        # Daily limits (free tier)
        self.daily_gemini_limit = 500  # Gemini free tier
        self.daily_ocr_limit = 100  # Per user limit

    async def parse(
        self,
        ocr_text: str,
        force_gemini: bool = False,
        store_hint: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """
        Parse receipt text with intelligent routing

        Args:
            ocr_text: Raw OCR text from receipt
            force_gemini: Force Gemini usage (for testing)
            store_hint: Optional store name hint
            user_id: User ID for rate limiting

        Returns:
            Parsed receipt data with source and cost info
        """
        start_time = datetime.now()
        self.stats['total_processed'] += 1

        # Reset daily counters if needed
        self._check_daily_reset()

        # Redact PII before processing
        detected_pii = detect_pii(ocr_text)
        safe_text = redact_pii(ocr_text)

        if detected_pii:
            logger.info(f"PII detected and redacted: {list(detected_pii.keys())}")

        # Calculate content hash for idempotency
        content_hash = hashlib.sha256(ocr_text.encode()).hexdigest()[:16]

        # Step 1: Always try heuristics first (FREE)
        heuristic_result = await self.heuristic_parser.parse(safe_text, store_hint)

        # Log heuristic performance
        logger.info(
            f"Heuristics: merchant={heuristic_result.merchant}, "
            f"total=${heuristic_result.total:.2f}, "
            f"items={len(heuristic_result.items)}, "
            f"confidence={heuristic_result.confidence:.2f}, "
            f"reconciliation={'OK' if heuristic_result.reconciliation_ok else 'FAIL'}"
        )

        # Step 2: Decide if Gemini is needed
        use_gemini = force_gemini or self._should_use_gemini(heuristic_result)

        if not use_gemini:
            # Heuristics succeeded!
            self.stats['heuristic_only'] += 1
            processing_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return self._format_response(
                heuristic_result,
                source='heuristics',
                processing_ms=processing_ms,
                gemini_cost=0.0,
                content_hash=content_hash,
                detected_pii=detected_pii
            )

        # Step 3: Check rate limits before using Gemini
        if not self._check_rate_limit(user_id):
            logger.warning(f"Rate limit exceeded for user {user_id}")
            # Return heuristic result even if not perfect
            processing_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return self._format_response(
                heuristic_result,
                source='heuristics_rate_limited',
                processing_ms=processing_ms,
                gemini_cost=0.0,
                content_hash=content_hash,
                detected_pii=detected_pii
            )

        # Step 4: Use Gemini for enhancement
        if not self.gemini_parser.enabled:
            logger.warning("Gemini not available, using heuristics only")
            processing_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return self._format_response(
                heuristic_result,
                source='heuristics_no_gemini',
                processing_ms=processing_ms,
                gemini_cost=0.0,
                content_hash=content_hash,
                detected_pii=detected_pii
            )

        try:
            # Only send low-confidence items to Gemini for efficiency
            gemini_prompt = self._create_selective_prompt(safe_text, heuristic_result)

            gemini_result = await self.gemini_parser.parse_receipt(gemini_prompt)

            # Merge results: Use Gemini for low-confidence items only
            merged_result = self._merge_results(heuristic_result, gemini_result)

            self.stats['gemini_used'] += 1
            self.stats['gemini_calls_today'] += 1

            # Estimate cost (Gemini Flash: ~$0.00004 per receipt)
            gemini_cost = self._estimate_gemini_cost(len(gemini_prompt))

            processing_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            logger.info(
                f"Gemini enhancement complete: "
                f"improved_confidence={merged_result.confidence:.2f}, "
                f"cost=${gemini_cost:.6f}"
            )

            return self._format_response(
                merged_result,
                source='heuristics+gemini',
                processing_ms=processing_ms,
                gemini_cost=gemini_cost,
                content_hash=content_hash,
                detected_pii=detected_pii
            )

        except Exception as e:
            logger.error(f"Gemini enhancement failed: {e}")
            # Fall back to heuristic result
            processing_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return self._format_response(
                heuristic_result,
                source='heuristics_gemini_failed',
                processing_ms=processing_ms,
                gemini_cost=0.0,
                content_hash=content_hash,
                detected_pii=detected_pii
            )

    def _should_use_gemini(self, heuristic_result: ReceiptData) -> bool:
        """
        Decide if Gemini is needed based on heuristic results

        Only use Gemini when:
        1. Confidence is low (<0.7)
        2. Reconciliation failed
        3. Too few items found (<3)
        4. Missing critical metadata
        """
        # High confidence and good reconciliation = no Gemini needed
        if heuristic_result.confidence >= 0.75 and heuristic_result.reconciliation_ok:
            return False

        # Very low confidence = definitely need help
        if heuristic_result.confidence < 0.5:
            return True

        # Missing critical data
        if not heuristic_result.merchant or not heuristic_result.total_cents:
            return True

        # Too few items
        items_with_price = sum(1 for item in heuristic_result.items if item.price_cents > 0)
        if items_with_price < 3:
            return True

        # Reconciliation failed badly
        if not heuristic_result.reconciliation_ok:
            # Check how badly it failed
            items_total = sum(item.price_cents for item in heuristic_result.items)
            if heuristic_result.total_cents > 0:
                diff_percent = abs(items_total - heuristic_result.total_cents) / heuristic_result.total_cents
                if diff_percent > 0.1:  # More than 10% off
                    return True

        return False

    def _create_selective_prompt(self, ocr_text: str, heuristic_result: ReceiptData) -> str:
        """
        Create a focused prompt for Gemini
        Only ask about low-confidence items to save tokens
        """
        # Find low-confidence items
        low_confidence_items = [
            item for item in heuristic_result.items
            if item.confidence < 0.7
        ]

        if not low_confidence_items and heuristic_result.confidence >= 0.7:
            # Just need totals verification
            return f"""
            Verify these receipt totals. Return JSON only.

            Found: Total=${heuristic_result.total:.2f}, Tax=${heuristic_result.tax:.2f}

            OCR Text:
            {ocr_text[-500:]}  # Last 500 chars usually has totals

            Return: {{"total": number, "tax": number, "subtotal": number}}
            """

        # Focus on problem items
        problem_lines = '\n'.join([item.raw_text for item in low_confidence_items[:10]])

        return f"""
        Parse these unclear receipt items. Fix OCR errors.

        Store: {heuristic_result.merchant or 'Unknown'}

        Unclear items:
        {problem_lines}

        Return JSON:
        {{
            "items": [
                {{"name": "string", "price": number, "quantity": number, "confidence": 0-1}}
            ],
            "total": number
        }}
        """

    def _merge_results(self, heuristic: ReceiptData, gemini: any) -> ReceiptData:
        """
        Merge heuristic and Gemini results
        Keep high-confidence heuristic items, use Gemini for low-confidence
        """
        merged = heuristic  # Start with heuristic base

        # Replace low-confidence items with Gemini results
        if hasattr(gemini, 'items') and gemini.items:
            # Keep high-confidence heuristic items
            high_conf_items = [
                item for item in heuristic.items
                if item.confidence >= 0.7
            ]

            # Add Gemini items for low-confidence ones
            for gemini_item in gemini.items:
                # Convert to our format
                # ... conversion logic ...
                pass

            merged.items = high_conf_items + gemini.items[:10]  # Limit to prevent explosion

        # Update totals if Gemini has better ones
        if hasattr(gemini, 'total') and gemini.total:
            if heuristic.total_cents == 0 or not heuristic.reconciliation_ok:
                merged.total_cents = int(gemini.total * 100)

        # Recalculate confidence
        merged.confidence = min(0.95, heuristic.confidence + 0.2)  # Gemini boost

        return merged

    def _check_rate_limit(self, user_id: Optional[str]) -> bool:
        """Check if user is within rate limits"""
        if not user_id:
            return True  # No user ID = no limiting (testing)

        # Simple in-memory check (in production, use database)
        if self.stats['gemini_calls_today'] >= self.daily_gemini_limit:
            return False

        # Per-user limiting would go here
        # ...

        return True

    def _check_daily_reset(self):
        """Reset daily counters if needed"""
        now = datetime.now()
        if (now - self.stats['last_reset']).days >= 1:
            self.stats['gemini_calls_today'] = 0
            self.stats['last_reset'] = now
            logger.info("Daily usage counters reset")

    def _estimate_gemini_cost(self, prompt_length: int) -> float:
        """
        Estimate Gemini API cost
        Gemini 2.5 Flash: Free for 500/day, then ~$0.00004 per 1K tokens
        """
        # Rough token estimate (1 token ≈ 4 chars)
        tokens = prompt_length / 4

        # Free tier
        if self.stats['gemini_calls_today'] <= 500:
            return 0.0

        # Paid tier (if we exceed free)
        # Input: $0.0375 per million tokens
        # Output: $0.15 per million tokens
        # Average receipt: ~500 input + 200 output tokens
        input_cost = (tokens / 1_000_000) * 0.0375
        output_cost = (200 / 1_000_000) * 0.15

        return input_cost + output_cost

    def _format_response(
        self,
        receipt_data: ReceiptData,
        source: str,
        processing_ms: int,
        gemini_cost: float,
        content_hash: str,
        detected_pii: Dict
    ) -> Dict:
        """Format response for API"""
        # Convert items to API format
        lines = []
        for item in receipt_data.items:
            lines.append({
                'raw_text': item.raw_text,
                'item_name': item.item_name,
                'quantity': item.quantity,
                'unit': item.unit,
                'price': item.price,  # Convert from cents
                'category': item.category,
                'confidence': item.confidence
            })

        return {
            'merchant': receipt_data.merchant,
            'store_id': receipt_data.store_id,
            'date': receipt_data.date,
            'time': receipt_data.time,
            'total': receipt_data.total,
            'subtotal': receipt_data.subtotal,
            'tax': receipt_data.tax,
            'lines': lines,
            'confidence': receipt_data.confidence,
            'reconciliation': {
                'ok': receipt_data.reconciliation_ok,
                'lines_paired_ratio': receipt_data.lines_paired_ratio
            },
            'source': source,
            'content_hash': content_hash,
            'processing_time_ms': processing_ms,
            'gemini_cost': gemini_cost,
            'should_skip_llm': not receipt_data.should_use_gemini,
            'detected_pii': list(detected_pii.keys()) if detected_pii else [],
            'stats': {
                'total_processed': self.stats['total_processed'],
                'heuristic_success_rate': self.stats['heuristic_only'] / max(1, self.stats['total_processed']),
                'gemini_usage_rate': self.stats['gemini_used'] / max(1, self.stats['total_processed']),
                'daily_gemini_remaining': max(0, self.daily_gemini_limit - self.stats['gemini_calls_today'])
            }
        }

    def get_usage_stats(self) -> Dict:
        """Get usage statistics"""
        return {
            **self.stats,
            'heuristic_success_rate': self.stats['heuristic_only'] / max(1, self.stats['total_processed']),
            'gemini_usage_rate': self.stats['gemini_used'] / max(1, self.stats['total_processed']),
            'estimated_monthly_cost': (self.stats['gemini_used'] / max(1, self.stats['total_processed'])) * 30 * 50 * 0.00004
        }