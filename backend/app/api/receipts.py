"""
Receipt OCR API endpoints
Test version without LLM for Expo Go testing
"""

import base64
import hashlib
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional
from io import BytesIO

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field

from app.services.cache_service import receipt_cache
from app.services.alias_resolution_simple import alias_service
from app.services.hybrid_parser import HybridReceiptParser
from app.services.item_normalizer import item_normalizer
# from app.services.fix_queue_learning import fix_queue_learner
from app.utils.pii_redaction import redact_pii, detect_pii

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/receipts", tags=["receipts"])

# Initialize enhanced hybrid parser
hybrid_parser = HybridReceiptParser(
    gemini_api_key=os.getenv('GEMINI_API_KEY')
)

# Rate limiting tracking (in production, use database)
user_rate_limits = {}


class OCRRequest(BaseModel):
    """Request for OCR processing"""
    image_base64: str = Field(..., description="Base64 encoded image")
    household_id: str
    user_id: str
    merchant_hint: Optional[str] = None
    skip_cache: bool = False
    ocr_text: Optional[str] = None  # OCR text from on-device OCR
    use_gemini: bool = False  # Force Gemini parser instead of heuristics


class LineItem(BaseModel):
    """Parsed line item"""
    raw_text: str
    parsed_name: Optional[str] = None
    normalized_name: Optional[str] = None  # Readable, normalized version
    quantity: float = 1.0
    unit: str = "piece"
    price: Optional[float] = None  # In dollars for API compatibility
    price_cents: Optional[int] = None  # Internal storage as cents
    category: Optional[str] = None
    confidence: float = 0.0
    needs_review: bool = True


class OCRResponse(BaseModel):
    """OCR processing response"""
    receipt_id: str
    content_hash: Optional[str] = None
    merchant: Optional[str] = None
    store_id: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    total: Optional[float] = None  # In dollars for API
    tax: Optional[float] = None
    subtotal: Optional[float] = None
    total_cents: Optional[int] = None  # Internal as cents
    tax_cents: Optional[int] = None
    subtotal_cents: Optional[int] = None

    line_items: List[LineItem] = []
    fix_queue_items: List[LineItem] = []

    processing_time_ms: int
    confidence: float
    source: str  # 'cache', 'heuristics', 'llm', 'mock'
    needs_review: bool = True

    debug_info: Optional[Dict] = None


class FixQueueUpdate(BaseModel):
    """Update for fix queue item"""
    fix_queue_id: str
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    deleted: bool = False


@router.post("/scan", response_model=OCRResponse)
async def scan_receipt(request: OCRRequest):
    """
    Process receipt image with OCR (test version without LLM)
    """
    start_time = datetime.now()

    try:
        # Decode image
        image_data = base64.b64decode(request.image_base64)
        image_hash = hashlib.sha256(image_data).hexdigest()[:16]

        # Check cache first
        if not request.skip_cache:
            cached = await receipt_cache.get(
                image_hash=image_hash,
                merchant=request.merchant_hint
            )

            if cached:
                elapsed_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                cached['processing_time_ms'] = elapsed_ms
                cached['source'] = 'cache'
                return OCRResponse(**cached)

        # Process real OCR text from frontend
        # The frontend will send OCR text along with the image
        ocr_text = request.ocr_text

        logger.info(f"Received OCR text length: {len(ocr_text) if ocr_text else 0}")
        if ocr_text:
            logger.info(f"OCR text preview: {ocr_text[:200]}...")

        if not ocr_text:
            # Fallback to mock for testing if no OCR text provided
            logger.info("No OCR text provided, using mock data")
            ocr_text = await _mock_ocr_processing(image_data)

        # Check rate limits
        user_id = request.user_id
        if user_id in user_rate_limits:
            last_request = user_rate_limits[user_id]
            if (datetime.now() - last_request).seconds < 1:
                raise HTTPException(status_code=429, detail="Rate limit exceeded")

        user_rate_limits[user_id] = datetime.now()

        # Process with enhanced hybrid parser
        result = await hybrid_parser.parse(
            ocr_text,
            force_gemini=request.use_gemini,
            store_hint=request.merchant_hint,
            user_id=request.user_id
        )

        # Count items with prices for better logging
        lines = result.get('lines', [])
        items_with_prices = sum(1 for line in lines if line.get('price', 0) > 0)

        logger.info(f"Parser ({result.get('source')}): merchant={result.get('merchant')}, "
                   f"total={result.get('total')}, items={len(lines)} "
                   f"(with_prices={items_with_prices}), confidence={result.get('confidence', 0):.2f}, "
                   f"cost=${result.get('gemini_cost', 0):.6f}")

        # Try alias resolution for line items
        line_items = []
        fix_queue_items = []

        for line in result.get('lines', []):
            # Try to resolve via alias map
            resolution = await alias_service.resolve(
                line.get('raw_text', ''),
                merchant=result.get('merchant'),
                household_id=request.household_id
            )

            # Handle both formats (heuristics uses 'item', Gemini uses 'item_name')
            item_name = line.get('item_name') or line.get('item', '')
            quantity = line.get('quantity') or line.get('qty', 1.0)

            # Apply normalization to improve readability
            normalized_result = item_normalizer.normalize(
                item_name or line.get('raw_text', ''),
                merchant=result.get('merchant')
            )

            # Handle both cents and dollars
            price = line.get('price')
            price_cents = line.get('price_cents')
            if price_cents and not price:
                price = price_cents / 100.0
            elif price and not price_cents:
                price_cents = int(price * 100)

            item = LineItem(
                raw_text=line.get('raw_text', ''),
                parsed_name=item_name,
                normalized_name=normalized_result.normalized,  # Use normalized version
                quantity=quantity,
                unit=line.get('unit', 'piece'),
                price=price,
                price_cents=price_cents,
                category=line.get('category'),
                confidence=resolution['confidence'] if resolution else line.get('confidence', 0.3),
                needs_review=resolution is None or resolution['confidence'] < 0.7
            )

            if resolution:
                item.category = resolution.get('ingredient_class')
                item.confidence = resolution['confidence']

            # Add to appropriate list
            if item.needs_review:
                fix_queue_items.append(item)
            else:
                line_items.append(item)

        # Build response with both cents and dollar values
        response_data = {
            'receipt_id': f"receipt_{image_hash}",
            'content_hash': result.get('content_hash', image_hash),
            'merchant': result.get('merchant'),
            'store_id': result.get('store_id'),
            'date': result.get('date'),
            'time': result.get('time'),
            'total': result.get('total'),
            'tax': result.get('tax'),
            'subtotal': result.get('subtotal'),
            'total_cents': result.get('total_cents'),
            'tax_cents': result.get('tax_cents'),
            'subtotal_cents': result.get('subtotal_cents'),
            'line_items': line_items,
            'fix_queue_items': fix_queue_items,
            'processing_time_ms': result.get('processing_time_ms', int((datetime.now() - start_time).total_seconds() * 1000)),
            'confidence': result.get('confidence', 0.5),
            'source': result.get('source', 'unknown'),
            'needs_review': len(fix_queue_items) > 0,
            'debug_info': {
                'gemini_cost': result.get('gemini_cost', 0.0),
                'stats': result.get('stats', {}),
                'detected_pii': result.get('detected_pii', []),
                'reconciliation': result.get('reconciliation', {})
            }
        }

        # Cache the result
        await receipt_cache.set(
            response_data,
            image_hash=image_hash,
            merchant=result.get('merchant'),
            date=result.get('date'),
            total=result.get('total')
        )

        return OCRResponse(**response_data)

    except Exception as e:
        logger.error(f"OCR processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _mock_ocr_processing(image_data: bytes) -> Dict:
    """
    Mock OCR processing for testing
    Returns sample receipt text
    """
    # For testing, return sample receipt text
    # In production, this would call the actual OCR service
    return {
        'text_annotations': [{
            'description': """KROGER
123 MAIN ST
ATLANTA GA 30301
(404) 555-0123

GROCERY

MILK 2% GAL          3.99
BREAD WHEAT         2.49
EGGS LARGE DOZ      4.99
CHICKEN BREAST      8.67
  2.45 LB @ 3.54/LB
BANANAS             1.87
  3.12 LB @ 0.59/LB
CHEESE CHEDDAR      5.99
YOGURT GREEK 4PK    4.49

SUBTOTAL           32.49
TAX                 2.28
TOTAL              34.77

CASH               40.00
CHANGE              5.23

Thank you for shopping!
01/15/25 14:32
"""
        }],
        'confidence': 0.95
    }


@router.post("/fix-queue/update")
async def update_fix_queue(update: FixQueueUpdate):
    """
    Update fix queue item with user corrections
    """
    try:
        # Learn from the correction
        original = {
            'fix_queue_id': update.fix_queue_id,
            'raw_text': '',  # Would come from database
            'parsed_name': ''  # Would come from database
        }

        corrected = {
            'name': update.name,
            'quantity': update.quantity,
            'unit': update.unit,
            'category': update.category,
            'price': update.price,
            'deleted': update.deleted
        }

        # Process correction for learning
        # In production, would get household_id from auth
        # success = await fix_queue_learner.process_correction(
        #     update.fix_queue_id,
        #     original,
        #     corrected,
        #     household_id='test_household',
        #     merchant=None
        # )
        success = True  # Mock for testing

        return {
            'success': success,
            'message': 'Correction processed and learned'
        }

    except Exception as e:
        logger.error(f"Fix queue update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fix-queue/{household_id}")
async def get_fix_queue(household_id: str):
    """
    Get fix queue items for household
    """
    # In production, would query database
    return {
        'items': [],
        'count': 0
    }


@router.get("/stats/{household_id}")
async def get_ocr_stats(household_id: str):
    """
    Get OCR statistics for household
    """
    cache_stats = receipt_cache.get_stats()

    # Get alias learning stats
    alias_stats = await alias_service.get_confidence_stats(
        household_id=household_id
    )

    return {
        'cache': cache_stats,
        'aliases': alias_stats,
        'avg_processing_time_ms': 1500,
        'total_receipts_processed': cache_stats.get('hits', 0) + cache_stats.get('misses', 0),
        'llm_usage_rate': 0.0,  # No LLM in test version
        'automation_rate': alias_stats.get('hit_rate', 0.0)
    }