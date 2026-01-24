"""
Gemini-based receipt parser
Uses Gemini Flash for intelligent receipt parsing when heuristics fail
"""

import os
import json
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("Google Generative AI not installed. Gemini parser disabled.")
    logger.warning("Install with: pip install google-generativeai")

logger = logging.getLogger(__name__)


@dataclass
class ParsedItem:
    """Parsed line item from receipt"""
    raw_text: str
    item_name: str
    quantity: float = 1.0
    unit: str = "piece"
    price: Optional[float] = None
    category: Optional[str] = None
    confidence: float = 0.0


@dataclass
class ParsedReceipt:
    """Complete parsed receipt"""
    merchant: Optional[str] = None
    date: Optional[str] = None
    total: Optional[float] = None
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    items: List[ParsedItem] = None
    confidence: float = 0.0
    processing_notes: str = ""


class GeminiReceiptParser:
    """
    Intelligent receipt parser using Gemini Flash
    Cost-effective fallback when heuristics fail
    """

    def __init__(self, api_key: Optional[str] = None):
        """Initialize Gemini parser with API key"""
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')

        if not GEMINI_AVAILABLE:
            logger.warning("Gemini parser disabled - google-generativeai not installed")
            self.enabled = False
            return

        if not self.api_key:
            logger.warning("No Gemini API key configured - parser disabled")
            self.enabled = False
            return

        try:
            genai.configure(api_key=self.api_key)
            # Use gemini-2.5-flash as primary model (migrated from 2.0 - Jan 2025)
            model_names = [
                'gemini-2.5-flash',      # Primary model
                'gemini-2.5-flash-lite', # Lite version
                'gemini-1.5-flash',      # Fallback to 1.5 Flash
                'gemini-1.5-flash-latest',
                'gemini-pro'
            ]

            for model_name in model_names:
                try:
                    self.model = genai.GenerativeModel(model_name)
                    self.enabled = True
                    logger.info(f"Gemini parser initialized successfully with {model_name}")
                    break
                except Exception as e:
                    logger.warning(f"Failed to initialize with {model_name}: {e}")
                    continue

            if not self.enabled:
                raise Exception("Could not initialize any Gemini model")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini: {e}")
            self.enabled = False

    async def parse_receipt(self, ocr_text: str) -> ParsedReceipt:
        """
        Parse receipt text using Gemini with JSON mode

        Args:
            ocr_text: Raw OCR text from receipt

        Returns:
            ParsedReceipt with structured data
        """
        if not self.enabled:
            logger.warning("Gemini parser not enabled")
            return ParsedReceipt(
                items=[],
                confidence=0.0,
                processing_notes="Gemini parser not available"
            )

        try:
            # Create minimal prompt for Gemini
            prompt = self._create_prompt(ocr_text)

            # Define strict JSON schema for receipt
            receipt_schema = {
                "type": "object",
                "properties": {
                    "merchant": {"type": "string"},
                    "date": {"type": "string"},
                    "total": {"type": "number"},
                    "subtotal": {"type": "number"},
                    "tax": {"type": "number"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "raw_text": {"type": "string"},
                                "item_name": {"type": "string"},
                                "price": {"type": "number"},
                                "quantity": {"type": "number"},
                                "unit": {"type": "string"},
                                "category": {"type": "string"}
                            },
                            "required": ["item_name", "price"]
                        }
                    }
                },
                "required": ["items"]
            }

            # Configure safety settings to be less restrictive for receipt parsing
            from google.generativeai.types import HarmCategory, HarmBlockThreshold

            safety_settings = [
                {
                    "category": HarmCategory.HARM_CATEGORY_HARASSMENT,
                    "threshold": HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    "threshold": HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    "threshold": HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    "threshold": HarmBlockThreshold.BLOCK_NONE,
                },
            ]

            # Generate response with JSON mode
            response = self.model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0,  # Zero temperature for consistent parsing
                    "max_output_tokens": 2048,
                    "response_mime_type": "application/json",
                    "response_schema": receipt_schema
                },
                safety_settings=safety_settings
            )

            # Extract response text (guaranteed to be valid JSON)
            raw_text = None
            if response.text:
                raw_text = response.text
            elif response.candidates:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    raw_text = candidate.content.parts[0].text
                else:
                    logger.warning(f"Gemini response blocked or empty. Finish reason: {candidate.finish_reason if candidate else 'unknown'}")
                    raise Exception("Gemini response was filtered or empty")
            else:
                raise Exception("No valid response from Gemini")

            # Log the raw response for debugging
            logger.info(f"Gemini JSON response (first 500 chars): {raw_text[:500] if raw_text else 'None'}")

            # Parse JSON (no markdown extraction needed - JSON mode guarantees valid JSON)
            result = json.loads(raw_text)

            # Convert to ParsedReceipt
            receipt = self._parse_response(result, ocr_text)

            logger.info(f"Gemini parsed: merchant={receipt.merchant}, "
                       f"total={receipt.total}, items={len(receipt.items)}")

            return receipt

        except Exception as e:
            logger.error(f"Gemini parsing error: {e}")
            return ParsedReceipt(
                items=[],
                confidence=0.0,
                processing_notes=f"Parsing error: {str(e)}"
            )

    def _create_prompt(self, ocr_text: str) -> str:
        """Create minimal prompt for Gemini JSON mode"""
        return f"""Extract all items from this receipt.

Normalize abbreviations:
ORG→Organic, MLK→Milk, WHP→Whipped, WHD→Whipped, CRM→Cream, HVY→Heavy
CHKN→Chicken, BF→Beef, CHZ→Cheese, CHED→Cheddar, VEG→Vegetable
GRND→Ground, BRST→Breast, BNLS→Boneless, SKLS→Skinless
WHL→Whole, SM/SML→Small, LG/LRG→Large

Receipt text:
{ocr_text}"""

    def _parse_response(self, result: Dict, original_text: str) -> ParsedReceipt:
        """Convert Gemini response to ParsedReceipt"""
        items = []

        # Parse items
        for item_data in result.get('items', []):
            item = ParsedItem(
                raw_text=item_data.get('raw_text', ''),
                item_name=item_data.get('item_name', ''),
                quantity=float(item_data.get('quantity', 1.0)),
                unit=item_data.get('unit', 'piece'),
                price=item_data.get('price'),
                category=item_data.get('category'),
                confidence=0.85  # High confidence from LLM parsing
            )
            items.append(item)

        # Create receipt
        receipt = ParsedReceipt(
            merchant=result.get('merchant'),
            date=result.get('date'),
            total=result.get('total'),
            subtotal=result.get('subtotal'),
            tax=result.get('tax'),
            items=items,
            confidence=float(result.get('confidence', 0.8)),
            processing_notes=result.get('notes', '')
        )

        return receipt

    def estimate_cost(self, text_length: int) -> float:
        """
        Estimate cost for processing text

        Gemini 2.0 Flash pricing (as of 2025):
        - Input: $0.10 per 1M tokens (~4M chars)
        - Output: $0.40 per 1M tokens (~4M chars)
        - Avg receipt: ~2000 chars in, ~1000 chars out
        """
        # Estimate tokens (rough: 1 token ≈ 4 chars)
        input_tokens = (text_length + 1000) / 4  # Include prompt
        output_tokens = 250  # Typical response in tokens

        # Calculate cost in dollars (free tier handles most usage)
        # Only costs apply after free tier exhausted
        input_cost = (input_tokens / 1_000_000) * 0.10
        output_cost = (output_tokens / 1_000_000) * 0.40

        total_cost = input_cost + output_cost

        # Typical receipt: ~$0.00015 (0.015¢) if paying
        # But FREE within generous tier limits!
        return total_cost


class HybridReceiptParser:
    """
    Hybrid parser that combines heuristics with Gemini fallback
    """

    def __init__(self, gemini_api_key: Optional[str] = None):
        """Initialize hybrid parser"""
        from app.services.receipt_heuristics_py import ReceiptHeuristics

        self.heuristics = ReceiptHeuristics()
        self.gemini = GeminiReceiptParser(gemini_api_key)
        self.use_gemini_threshold = 0.5  # Use Gemini if confidence < 50%
        self.min_items_threshold = 3  # Require at least 3 items parsed

    async def parse(self, ocr_text: str, force_gemini: bool = False) -> Dict:
        """
        Parse receipt with hybrid approach

        Args:
            ocr_text: Raw OCR text
            force_gemini: Skip heuristics, use Gemini directly

        Returns:
            Parsed receipt data with source indicator
        """
        # Try heuristics first (unless forced to use Gemini)
        if not force_gemini:
            logger.info("Trying heuristics first...")
            heuristics_result = await self.heuristics.process(ocr_text)

            # Check if heuristics are sufficient
            confidence = heuristics_result.get('confidence', 0)
            items = heuristics_result.get('lines', [])
            items_with_prices = [item for item in items if item.get('price', 0) > 0]

            logger.info(f"Heuristics: confidence={confidence:.2f}, items={len(items)}, "
                       f"items_with_prices={len(items_with_prices)}")

            # Decision logic for using heuristics vs Gemini
            use_heuristics = (
                confidence >= self.use_gemini_threshold and
                len(items_with_prices) >= self.min_items_threshold
            )

            if use_heuristics:
                logger.info("Using heuristics result (sufficient confidence and items)")
                heuristics_result['source'] = 'heuristics'
                heuristics_result['gemini_cost'] = 0.0
                return heuristics_result
            else:
                logger.info(f"Heuristics insufficient: confidence={confidence:.2f} < {self.use_gemini_threshold} "
                           f"or items_with_prices={len(items_with_prices)} < {self.min_items_threshold}")

        # Fall back to Gemini for better parsing
        if self.gemini.enabled:
            logger.info("Using Gemini for intelligent parsing...")

            # Estimate cost
            estimated_cost = self.gemini.estimate_cost(len(ocr_text))
            logger.info(f"Estimated Gemini cost: ${estimated_cost:.6f}")

            # Parse with Gemini
            gemini_result = await self.gemini.parse_receipt(ocr_text)

            # Convert to API format
            result = {
                'merchant': gemini_result.merchant,
                'date': gemini_result.date,
                'total': gemini_result.total,
                'subtotal': gemini_result.subtotal,
                'tax': gemini_result.tax,
                'lines': [asdict(item) for item in gemini_result.items],
                'confidence': gemini_result.confidence,
                'source': 'gemini',
                'gemini_cost': estimated_cost,
                'processing_notes': gemini_result.processing_notes
            }

            return result
        else:
            # No Gemini available, return heuristics result
            logger.warning("Gemini not available, using heuristics only")
            if force_gemini:
                # Was specifically asked for Gemini but it's not available
                return {
                    'error': 'Gemini parser not available',
                    'source': 'error',
                    'lines': []
                }
            else:
                # Return the heuristics result we already have
                heuristics_result['source'] = 'heuristics_fallback'
                return heuristics_result