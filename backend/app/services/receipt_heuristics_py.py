"""
Receipt heuristics processing - Python version
Port of the TypeScript heuristics for backend use
"""

import re
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class HeuristicsResult:
    """Result from heuristics processing"""
    merchant: Optional[str] = None
    date: Optional[str] = None
    total: Optional[float] = None
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    lines: List[Dict] = None
    confidence: float = 0.0
    lines_paired_ratio: float = 0.0
    reconciliation_ok: bool = False
    should_skip_llm: bool = False


class ReceiptHeuristics:
    """
    Deterministic receipt processing using heuristics
    """

    def __init__(self):
        # Common merchant patterns
        self.merchant_patterns = [
            r'^([A-Z][A-Z0-9\s&\-\.]{2,30})$',
            r'^\s*([A-Z][A-Z\s]{2,20})\s+#?\d+\s*$',
            r'STORE\s+#?(\d+)',
        ]

        # Date patterns
        self.date_patterns = [
            r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(\d{2,4}[/-]\d{1,2}[/-]\d{1,2})',
            r'([A-Z]{3}\s+\d{1,2},?\s+\d{4})',
            r'(\d{1,2}\s+[A-Z]{3}\s+\d{4})',
        ]

        # Price patterns
        self.price_pattern = r'(\d{1,4}\.\d{2})'
        self.negative_price_pattern = r'-\s*(\d{1,4}\.\d{2})'

        # Keywords to identify totals
        self.total_keywords = ['TOTAL', 'BALANCE', 'AMOUNT DUE', 'GRAND TOTAL']
        self.subtotal_keywords = ['SUBTOTAL', 'SUB-TOTAL', 'SUB TOTAL', 'MERCHANDISE']
        self.tax_keywords = ['TAX', 'GST', 'PST', 'HST', 'SALES TAX']

        # Skip patterns (not items)
        self.skip_patterns = [
            r'TOTAL\s+POINTS',
            r'REWARDS?\s+BALANCE',
            r'MEMBER\s+#',
            r'CARD\s+#',
            r'^\*+$',
            r'^-+$',
            r'^=+$',
            r'THANK\s+YOU',
            r'RECEIPT',
            r'CUSTOMER\s+COPY',
        ]

    async def process(self, ocr_data: Dict) -> Dict:
        """
        Process OCR data with heuristics

        Args:
            ocr_data: OCR output with text_annotations

        Returns:
            Processed receipt data
        """
        # Extract text lines
        lines = self._extract_lines(ocr_data)

        # Extract metadata
        merchant = self._find_merchant(lines[:5])  # Check first 5 lines
        date = self._find_date(lines)

        # Find totals
        totals = self._find_totals(lines)
        total = totals.get('total')
        subtotal = totals.get('subtotal')
        tax = totals.get('tax')

        # Parse line items
        item_lines = self._parse_line_items(lines)

        # Calculate confidence
        confidence = self._calculate_confidence(
            merchant, date, total, item_lines
        )

        # Check reconciliation
        reconciliation_ok = self._check_reconciliation(
            item_lines, subtotal, tax, total
        )

        # Determine if we can skip LLM
        lines_paired_ratio = self._calculate_pairing_ratio(item_lines)
        should_skip_llm = self._should_skip_llm(
            merchant, date, total, lines_paired_ratio,
            reconciliation_ok, confidence, item_lines
        )

        return {
            'merchant': merchant,
            'date': date,
            'total': total,
            'subtotal': subtotal,
            'tax': tax,
            'lines': item_lines,
            'confidence': confidence,
            'lines_paired_ratio': lines_paired_ratio,
            'reconciliation': {'ok': reconciliation_ok},
            'should_skip_llm': should_skip_llm
        }

    def _extract_lines(self, ocr_data) -> List[str]:
        """Extract text lines from OCR data"""
        # Handle string input (raw OCR text)
        if isinstance(ocr_data, str):
            return [line.strip() for line in ocr_data.split('\n') if line.strip()]

        # Handle dict input (structured OCR response)
        if isinstance(ocr_data, dict):
            if 'text_annotations' in ocr_data and ocr_data['text_annotations']:
                full_text = ocr_data['text_annotations'][0].get('description', '')
                return [line.strip() for line in full_text.split('\n') if line.strip()]
            elif 'text' in ocr_data:
                return [line.strip() for line in ocr_data['text'].split('\n') if line.strip()]

        return []

    def _find_merchant(self, lines: List[str]) -> Optional[str]:
        """Find merchant name in first few lines"""
        for line in lines:
            # Skip if line has prices (not likely merchant)
            if re.search(self.price_pattern, line):
                continue

            # Check merchant patterns
            for pattern in self.merchant_patterns:
                match = re.match(pattern, line, re.IGNORECASE)
                if match:
                    merchant = match.group(1) if match.groups() else line
                    # Clean up merchant name
                    merchant = merchant.strip().upper()
                    if len(merchant) >= 3:
                        return merchant

            # Simple heuristic: first all-caps line without numbers
            if line.isupper() and not any(char.isdigit() for char in line):
                if len(line) >= 3 and len(line) <= 30:
                    return line

        return None

    def _find_date(self, lines: List[str]) -> Optional[str]:
        """Find date in receipt"""
        for line in lines:
            for pattern in self.date_patterns:
                match = re.search(pattern, line)
                if match:
                    date_str = match.group(1)
                    # Try to normalize date
                    try:
                        # Simple normalization - in production use dateutil
                        return date_str
                    except:
                        return date_str
        return None

    def _find_totals(self, lines: List[str]) -> Dict[str, Optional[float]]:
        """Find total, subtotal, and tax amounts"""
        result = {
            'total': None,
            'subtotal': None,
            'tax': None
        }

        for i, line in enumerate(lines):
            line_upper = line.upper()

            # Skip "TOTAL POINTS" and similar
            if any(skip in line_upper for skip in ['TOTAL POINTS', 'REWARDS', 'SAVED']):
                continue

            # Check for total
            if any(keyword in line_upper for keyword in self.total_keywords):
                price = self._extract_price_from_line(line)
                if price and price > 0:
                    result['total'] = price

            # Check for subtotal
            elif any(keyword in line_upper for keyword in self.subtotal_keywords):
                price = self._extract_price_from_line(line)
                if price and price > 0:
                    result['subtotal'] = price

            # Check for tax
            elif any(keyword in line_upper for keyword in self.tax_keywords):
                price = self._extract_price_from_line(line)
                if price and price > 0:
                    result['tax'] = price

        return result

    def _extract_price_from_line(self, line: str) -> Optional[float]:
        """Extract price from a line"""
        # Look for price pattern
        matches = re.findall(self.price_pattern, line)
        if matches:
            # Return the last price found (usually the actual price)
            try:
                return float(matches[-1])
            except:
                pass
        return None

    def _parse_line_items(self, lines: List[str]) -> List[Dict]:
        """Parse line items from receipt"""
        items = []
        pending_item = None  # For multi-line items (Walmart style)

        for i, line in enumerate(lines):
            # Skip if matches skip patterns
            if any(re.search(pattern, line, re.IGNORECASE) for pattern in self.skip_patterns):
                continue

            # Skip lines with total/subtotal/tax keywords
            line_upper = line.upper()
            if any(keyword in line_upper for keyword in
                   self.total_keywords + self.subtotal_keywords + self.tax_keywords):
                continue

            # Look for price in line
            price = self._extract_price_from_line(line)

            # Handle Walmart format: price on separate line with X or O
            if re.match(r'^\d+\.\d{2}\s*[XO]?\s*$', line.strip()):
                # This is a price-only line
                if pending_item and price:
                    # Attach price to previous item
                    pending_item['price'] = price
                    pending_item['raw_text'] += ' ' + line
                    items.append(pending_item)
                    pending_item = None
                continue

            # Skip lines that are just numbers (barcodes)
            if re.match(r'^\d{10,}$', line.strip()):
                continue

            if price and price > 0:
                # Standard format: item and price on same line
                price_match = re.search(self.price_pattern, line)
                if price_match:
                    item_text = line[:price_match.start()].strip()

                    # Skip if item text is too short or just numbers
                    if len(item_text) < 2 or item_text.isdigit():
                        continue

                    # Check for weighted item (e.g., "2.45 LB @ 3.54/LB")
                    weight_match = re.search(r'(\d+\.?\d*)\s*(LB|KG|OZ)\s*@\s*(\d+\.?\d*)', line)

                    item = {
                        'raw_text': line,
                        'item': item_text,
                        'price': price,
                        'qty': 1.0,
                        'unit': 'piece'
                    }

                    if weight_match:
                        item['qty'] = float(weight_match.group(1))
                        item['unit'] = weight_match.group(2).lower()
                        item['price_per_unit'] = float(weight_match.group(3))

                    items.append(item)
            else:
                # No price on this line - might be item name (Walmart style)
                # Check if it looks like a product name
                if (len(line) > 2 and
                    not line.isdigit() and
                    not re.match(r'^ST#|^OP#|^TE#|^TR#', line) and
                    not re.match(r'^\(\s*\d+\s*\)', line)):  # Not phone number

                    # Save as pending item
                    pending_item = {
                        'raw_text': line,
                        'item': line.strip(),
                        'price': 0,
                        'qty': 1.0,
                        'unit': 'piece'
                    }

        return items

    def _calculate_confidence(
        self,
        merchant: Optional[str],
        date: Optional[str],
        total: Optional[float],
        items: List[Dict]
    ) -> float:
        """Calculate overall confidence score"""
        confidence = 0.0

        # Core metadata (30% total)
        if merchant:
            confidence += 0.15
        if date:
            confidence += 0.10
        if total and total > 0:
            confidence += 0.05

        # Item parsing quality (70% total - most important!)
        items_with_price = sum(1 for item in items if item.get('price', 0) > 0)

        if items_with_price > 0:
            # Base points for having any items
            confidence += 0.20

            # More points based on number of items
            if items_with_price >= 3:
                confidence += 0.20
            if items_with_price >= 5:
                confidence += 0.15
            if items_with_price >= 10:
                confidence += 0.15

        # If we have NO items with prices, cap confidence at 30%
        # This prevents false confidence when parsing fails
        if items_with_price == 0:
            confidence = min(confidence, 0.30)

        return min(confidence, 1.0)

    def _check_reconciliation(
        self,
        items: List[Dict],
        subtotal: Optional[float],
        tax: Optional[float],
        total: Optional[float]
    ) -> bool:
        """Check if amounts reconcile within tolerance"""
        if not items or not total:
            return False

        # Sum item prices
        item_sum = sum(item.get('price', 0) for item in items)

        # If we have subtotal, check against items
        if subtotal:
            tolerance = max(0.05, subtotal * 0.02)  # 5¢ or 2%
            if abs(item_sum - subtotal) > tolerance:
                return False

        # If we have tax and subtotal, check total
        if subtotal and tax:
            calculated_total = subtotal + tax
            tolerance = max(0.05, total * 0.02)
            if abs(calculated_total - total) <= tolerance:
                return True

        # Otherwise check items + typical tax
        estimated_tax = item_sum * 0.08  # Assume 8% tax
        estimated_total = item_sum + estimated_tax
        tolerance = max(0.10, total * 0.05)  # More tolerance without exact tax

        return abs(estimated_total - total) <= tolerance

    def _calculate_pairing_ratio(self, items: List[Dict]) -> float:
        """Calculate ratio of items with prices"""
        if not items:
            return 0.0

        items_with_price = sum(1 for item in items if item.get('price'))
        return items_with_price / len(items)

    def _should_skip_llm(
        self,
        merchant: Optional[str],
        date: Optional[str],
        total: Optional[float],
        lines_paired_ratio: float,
        reconciliation_ok: bool,
        confidence: float,
        items: List[Dict]
    ) -> bool:
        """Determine if LLM can be skipped"""
        # Count items with prices
        items_with_price = sum(1 for item in items if item.get('price', 0) > 0)

        # Require minimum viable parsing to skip LLM
        return (
            merchant is not None and
            date is not None and
            total is not None and total > 0 and
            items_with_price >= 3 and  # Need at least 3 items with prices
            lines_paired_ratio >= 0.70 and
            reconciliation_ok and
            confidence >= 0.7  # Lower threshold since confidence is now more accurate
        )