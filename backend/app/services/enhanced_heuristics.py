"""
Enhanced Receipt Heuristics Parser
Target: 75-80% success rate without AI
Includes confidence scoring, better patterns, and store-specific logic
"""

import re
import hashlib
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class ParsedItem:
    """A parsed receipt item with confidence"""
    raw_text: str
    item_name: str
    quantity: float = 1.0
    unit: str = "piece"
    price_cents: int = 0  # Store as cents for precision
    confidence: float = 0.5
    category: Optional[str] = None

    @property
    def price(self) -> float:
        """Get price in dollars"""
        return self.price_cents / 100.0


@dataclass
class ReceiptData:
    """Complete parsed receipt data"""
    merchant: Optional[str] = None
    store_id: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None

    # All money stored as cents
    total_cents: int = 0
    subtotal_cents: int = 0
    tax_cents: int = 0
    savings_cents: int = 0

    items: List[ParsedItem] = None

    # Metadata
    confidence: float = 0.0
    reconciliation_ok: bool = False
    lines_paired_ratio: float = 0.0
    path_taken: str = "heuristics"
    content_hash: Optional[str] = None

    # Processing flags
    should_use_gemini: bool = False
    parsing_errors: List[str] = None

    def __post_init__(self):
        if self.items is None:
            self.items = []
        if self.parsing_errors is None:
            self.parsing_errors = []

    @property
    def total(self) -> float:
        return self.total_cents / 100.0

    @property
    def subtotal(self) -> float:
        return self.subtotal_cents / 100.0

    @property
    def tax(self) -> float:
        return self.tax_cents / 100.0

    def to_dict(self) -> Dict:
        """Convert to dictionary for API response"""
        data = asdict(self)
        # Add computed properties
        data['total'] = self.total
        data['subtotal'] = self.subtotal
        data['tax'] = self.tax
        return data


class EnhancedHeuristicParser:
    """
    Enhanced deterministic receipt parser with improved patterns
    and store-specific logic
    """

    def __init__(self):
        # Store-specific patterns
        self.store_patterns = {
            'WALMART': {
                'name_variations': [r'WAL[\s\-]*MART', r'WALMART\s+SUPERCENTER', r'WAL\*MART'],
                'item_format': 'separate_line',  # Price on next line
                'tax_marker': r'[XON]$',  # X=taxable, O=non-taxable, N=non-food
            },
            'TARGET': {
                'name_variations': [r'TARGET', r'SUPER\s+TARGET'],
                'item_format': 'same_line',
                'tax_marker': r'[TFN]$',  # T=taxable, F=food, N=non-food
            },
            'KROGER': {
                'name_variations': [r'KROGER', r'KING\s+SOOPERS', r'RALPH\'?S', r'FRED\s+MEYER'],
                'item_format': 'same_line',
                'member_card': r'VIC\s+CARD\s+SAVINGS',
            },
            'COSTCO': {
                'name_variations': [r'COSTCO', r'COSTCO\s+WHOLESALE'],
                'item_format': 'code_first',  # Item code before name
                'bulk_items': True,
            },
            'WHOLE_FOODS': {
                'name_variations': [r'WHOLE\s+FOODS', r'WFM', r'WHOLE\s+FOODS\s+MARKET'],
                'item_format': 'same_line',
                'organic_markers': [r'\bORG\b', r'\bORGANIC\b'],
            },
        }

        # Enhanced patterns
        self.price_patterns = {
            'standard': r'(\d{1,4}\.\d{2})',
            'with_dash': r'[\-\s]+(\d{1,4}\.\d{2})',
            'end_of_line': r'(\d{1,4}\.\d{2})\s*[XOTFN]?\s*$',
            'negative': r'-\s*(\d{1,4}\.\d{2})',
            'weighted': r'(\d+\.?\d*)\s*(LB|KG|OZ|EA)\s*@\s*\$?(\d+\.?\d*)',
            'quantity': r'^(\d+)\s+@\s+\$?(\d+\.\d{2})',
        }

        # Common OCR errors to fix
        self.ocr_corrections = {
            r'M[1l]LK': 'MILK',
            r'CH[K8]N': 'CHICKEN',
            r'B[0O]X': 'BOX',
            r'[0O]RANGE': 'ORANGE',
            r'[0O]RG': 'ORG',
            r'P[0O]TAT[0O]': 'POTATO',
            r'T[0O]MAT[0O]': 'TOMATO',
            r'BANAN[A4]': 'BANANA',
            r'[4A]PPLE': 'APPLE',
            r'C[0O]KE': 'COKE',
            r'PEPS[1I]': 'PEPSI',
        }

        # Category patterns
        self.category_patterns = {
            'dairy': r'\b(MILK|CHEESE|YOGURT|BUTTER|CREAM|COTTAGE|SOUR)\b',
            'produce': r'\b(APPLE|BANANA|ORANGE|TOMATO|LETTUCE|POTATO|ONION|CARROT)\b',
            'meat': r'\b(CHICKEN|BEEF|PORK|TURKEY|FISH|SALMON|STEAK|BACON)\b',
            'bakery': r'\b(BREAD|BAGEL|ROLL|MUFFIN|CAKE|DONUT|CROISSANT)\b',
            'beverages': r'\b(WATER|SODA|JUICE|COFFEE|TEA|COKE|PEPSI|SPRITE)\b',
            'frozen': r'\b(FROZEN|ICE\s+CREAM|PIZZA)\b',
            'snacks': r'\b(CHIPS|CRACKERS|COOKIES|CANDY|NUTS|POPCORN)\b',
        }

        # Skip patterns - definitely not items
        self.skip_patterns = [
            r'TOTAL\s+POINTS',
            r'REWARDS?\s+BALANCE',
            r'MEMBER\s+#?\s*\d+',
            r'CARD\s+#?\s*\d{4}',
            r'^\*+$',
            r'^-+$',
            r'^=+$',
            r'THANK\s+YOU',
            r'CUSTOMER\s+COPY',
            r'STORE\s+#?\d+',
            r'REG\s+#?\d+',
            r'CASHIER',
            r'^\d{10,}$',  # Barcodes
            r'^\(\d{3}\)\s*\d{3}-\d{4}$',  # Phone numbers
        ]

    async def parse(self, ocr_text: str, store_hint: Optional[str] = None) -> ReceiptData:
        """
        Parse OCR text into structured receipt data

        Args:
            ocr_text: Raw OCR text from receipt
            store_hint: Optional store name hint

        Returns:
            ReceiptData with parsed information
        """
        # Calculate content hash for idempotency
        content_hash = hashlib.sha256(ocr_text.encode()).hexdigest()[:16]

        # Apply OCR corrections
        corrected_text = self._apply_ocr_corrections(ocr_text)

        # Split into lines
        lines = [line.strip() for line in corrected_text.split('\n') if line.strip()]

        # Detect store
        store_info = self._detect_store(lines[:10], store_hint)

        # Extract metadata
        merchant = store_info.get('name')
        store_id = self._find_store_number(lines[:15])
        date = self._find_date(lines)
        time = self._find_time(lines)

        # Find totals (all as cents)
        totals = self._find_totals_cents(lines)

        # Parse items based on store format
        items = self._parse_items_by_store(lines, store_info)

        # Calculate metrics
        confidence = self._calculate_confidence(
            merchant, date, totals['total'], items
        )

        lines_paired_ratio = self._calculate_pairing_ratio(items)

        reconciliation_ok = self._check_reconciliation(
            items, totals['subtotal'], totals['tax'], totals['total']
        )

        # Determine if Gemini is needed
        should_use_gemini = confidence < 0.7 or not reconciliation_ok

        # Build response
        return ReceiptData(
            merchant=merchant,
            store_id=store_id,
            date=date,
            time=time,
            total_cents=totals['total'],
            subtotal_cents=totals['subtotal'],
            tax_cents=totals['tax'],
            savings_cents=totals['savings'],
            items=items,
            confidence=confidence,
            reconciliation_ok=reconciliation_ok,
            lines_paired_ratio=lines_paired_ratio,
            content_hash=content_hash,
            should_use_gemini=should_use_gemini,
            path_taken="heuristics"
        )

    def _apply_ocr_corrections(self, text: str) -> str:
        """Apply common OCR error corrections"""
        corrected = text
        for pattern, replacement in self.ocr_corrections.items():
            corrected = re.sub(pattern, replacement, corrected, flags=re.IGNORECASE)
        return corrected

    def _detect_store(self, lines: List[str], hint: Optional[str] = None) -> Dict:
        """Detect store from receipt header"""
        store_info = {'name': None, 'type': None, 'format': 'same_line'}

        # Use hint if provided
        if hint:
            hint_upper = hint.upper()
            for store_key, patterns in self.store_patterns.items():
                for pattern in patterns['name_variations']:
                    if re.search(pattern, hint_upper):
                        store_info['name'] = store_key
                        store_info['type'] = store_key
                        store_info['format'] = patterns.get('item_format', 'same_line')
                        return store_info

        # Search in lines
        for line in lines:
            line_upper = line.upper()
            for store_key, patterns in self.store_patterns.items():
                for pattern in patterns['name_variations']:
                    if re.search(pattern, line_upper):
                        store_info['name'] = store_key
                        store_info['type'] = store_key
                        store_info['format'] = patterns.get('item_format', 'same_line')
                        return store_info

        # Generic store name detection
        for line in lines[:5]:
            if line.isupper() and len(line) > 3 and len(line) < 30:
                if not any(char.isdigit() for char in line):
                    store_info['name'] = line
                    break

        return store_info

    def _find_store_number(self, lines: List[str]) -> Optional[str]:
        """Find store number in receipt"""
        patterns = [
            r'STORE\s*#?\s*(\d+)',
            r'ST#?\s*(\d+)',
            r'UNIT\s*#?\s*(\d+)',
            r'#(\d{3,5})\s*$',  # Store number at end of line
        ]

        for line in lines:
            for pattern in patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    return match.group(1)
        return None

    def _find_date(self, lines: List[str]) -> Optional[str]:
        """Find and normalize date"""
        patterns = [
            (r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', 'mdy'),
            (r'(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})', 'ymd'),
            (r'([A-Z]{3})\s+(\d{1,2}),?\s+(\d{4})', 'mdy_text'),
            (r'(\d{1,2})\s+([A-Z]{3})\s+(\d{4})', 'dmy_text'),
            # More flexible patterns for common OCR formats
            (r'(\d{2})[/-](\d{2})[/-](\d{2})\b', 'mdy_short'),  # 01/15/25
            (r'(\d{4})[.-](\d{2})[.-](\d{2})', 'iso'),  # 2025-01-15
        ]

        for line in lines[:20]:  # Date usually in first 20 lines
            for pattern, format_type in patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    try:
                        # Simple ISO format conversion
                        if format_type == 'mdy':
                            m, d, y = match.groups()
                            if len(y) == 2:
                                y = '20' + y
                            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
                        elif format_type == 'mdy_short':
                            m, d, y = match.groups()
                            y = '20' + y  # Assume 2000s
                            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
                        elif format_type == 'ymd':
                            y, m, d = match.groups()
                            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
                        elif format_type == 'iso':
                            return match.group(0)  # Already in ISO
                        else:
                            return match.group(0)  # Return as-is for now
                    except:
                        return match.group(0)
        return None

    def _find_time(self, lines: List[str]) -> Optional[str]:
        """Find transaction time"""
        time_pattern = r'(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)'

        for line in lines[:20]:
            match = re.search(time_pattern, line, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    def _find_totals_cents(self, lines: List[str]) -> Dict[str, int]:
        """Find all monetary totals and convert to cents"""
        result = {
            'total': 0,
            'subtotal': 0,
            'tax': 0,
            'savings': 0
        }

        # Keywords for each type
        patterns = {
            'total': [r'TOTAL', r'BALANCE\s+DUE', r'AMOUNT\s+DUE', r'GRAND\s+TOTAL'],
            'subtotal': [r'SUBTOTAL', r'SUB\s*-?\s*TOTAL', r'MERCHANDISE'],
            'tax': [r'TAX', r'GST', r'PST', r'HST', r'SALES\s+TAX'],
            'savings': [r'SAVINGS', r'YOU\s+SAVED', r'TOTAL\s+SAVINGS', r'DISCOUNT'],
        }

        for line in lines:
            line_upper = line.upper()

            # Skip non-monetary totals
            if any(skip in line_upper for skip in ['TOTAL POINTS', 'REWARDS', 'ITEMS']):
                continue

            # Check each pattern type
            for total_type, keywords in patterns.items():
                if any(re.search(kw, line_upper) for kw in keywords):
                    # Extract price
                    price_match = re.search(self.price_patterns['standard'], line)
                    if price_match:
                        cents = int(float(price_match.group(1)) * 100)
                        # For savings, check if it's negative
                        if total_type == 'savings':
                            neg_match = re.search(self.price_patterns['negative'], line)
                            if neg_match:
                                cents = int(float(neg_match.group(1)) * 100)

                        # Only update if not already set or if this looks more reliable
                        if result[total_type] == 0:
                            result[total_type] = cents

        return result

    def _parse_items_by_store(self, lines: List[str], store_info: Dict) -> List[ParsedItem]:
        """Parse items based on store format"""
        store_format = store_info.get('format', 'same_line')

        if store_format == 'separate_line':
            return self._parse_walmart_style(lines)
        elif store_format == 'code_first':
            return self._parse_costco_style(lines)
        else:
            return self._parse_standard_format(lines)

    def _parse_standard_format(self, lines: List[str]) -> List[ParsedItem]:
        """Parse standard format: item and price on same line"""
        items = []

        for line in lines:
            # Skip non-item lines
            if self._should_skip_line(line):
                continue

            # Look for price at end of line
            price_match = re.search(self.price_patterns['end_of_line'], line)
            if not price_match:
                continue

            price_cents = int(float(price_match.group(1)) * 100)

            # Extract item name (everything before price)
            item_text = line[:price_match.start()].strip()

            # Clean item name
            item_text = re.sub(r'\s+', ' ', item_text)  # Normalize whitespace
            item_text = re.sub(r'^\d+\s+', '', item_text)  # Remove leading quantity

            # Skip if too short or invalid
            if len(item_text) < 2 or item_text.isdigit():
                continue

            # Check for weighted items
            weight_match = re.search(self.price_patterns['weighted'], line)
            quantity = 1.0
            unit = 'piece'

            if weight_match:
                quantity = float(weight_match.group(1))
                unit = weight_match.group(2).lower()

            # Detect category
            category = self._detect_category(item_text)

            # Calculate confidence
            confidence = self._calculate_item_confidence(item_text, price_cents, category)

            items.append(ParsedItem(
                raw_text=line,
                item_name=item_text,
                quantity=quantity,
                unit=unit,
                price_cents=price_cents,
                category=category,
                confidence=confidence
            ))

        return items

    def _parse_walmart_style(self, lines: List[str]) -> List[ParsedItem]:
        """Parse Walmart format: item name on one line, price on next"""
        items = []
        pending_item = None

        for i, line in enumerate(lines):
            # Skip non-item lines
            if self._should_skip_line(line):
                continue

            # Check if this is a price-only line (e.g., "12.99 X")
            price_only_match = re.match(r'^\s*(\d+\.\d{2})\s*[XOFNT]?\s*$', line)

            if price_only_match:
                # This is a price line
                if pending_item:
                    # Attach to previous item
                    price_cents = int(float(price_only_match.group(1)) * 100)
                    pending_item.price_cents = price_cents
                    pending_item.raw_text += ' ' + line
                    pending_item.confidence = self._calculate_item_confidence(
                        pending_item.item_name, price_cents, pending_item.category
                    )
                    items.append(pending_item)
                    pending_item = None
            else:
                # Check if line has a price (standard format)
                price_match = re.search(self.price_patterns['end_of_line'], line)

                if price_match:
                    # Standard format item
                    price_cents = int(float(price_match.group(1)) * 100)
                    item_text = line[:price_match.start()].strip()

                    if len(item_text) > 2:
                        category = self._detect_category(item_text)
                        items.append(ParsedItem(
                            raw_text=line,
                            item_name=item_text,
                            price_cents=price_cents,
                            category=category,
                            confidence=self._calculate_item_confidence(item_text, price_cents, category)
                        ))
                else:
                    # This might be an item name (price on next line)
                    if len(line) > 2 and not line.isdigit():
                        # Save as pending
                        pending_item = ParsedItem(
                            raw_text=line,
                            item_name=line,
                            category=self._detect_category(line)
                        )

        return items

    def _parse_costco_style(self, lines: List[str]) -> List[ParsedItem]:
        """Parse Costco format: item code, then name, then price"""
        items = []

        for line in lines:
            # Skip non-item lines
            if self._should_skip_line(line):
                continue

            # Look for Costco item pattern: "123456 ITEM NAME 12.99"
            match = re.match(r'^(\d{6,})\s+(.+?)\s+(\d+\.\d{2})\s*[EFTAO]?$', line)

            if match:
                item_code = match.group(1)
                item_name = match.group(2).strip()
                price_cents = int(float(match.group(3)) * 100)

                category = self._detect_category(item_name)

                items.append(ParsedItem(
                    raw_text=line,
                    item_name=item_name,
                    price_cents=price_cents,
                    category=category,
                    confidence=self._calculate_item_confidence(item_name, price_cents, category)
                ))
            else:
                # Try standard format as fallback
                price_match = re.search(self.price_patterns['end_of_line'], line)
                if price_match:
                    price_cents = int(float(price_match.group(1)) * 100)
                    item_text = line[:price_match.start()].strip()

                    # Remove item code if present
                    item_text = re.sub(r'^\d{6,}\s+', '', item_text)

                    if len(item_text) > 2:
                        category = self._detect_category(item_text)
                        items.append(ParsedItem(
                            raw_text=line,
                            item_name=item_text,
                            price_cents=price_cents,
                            category=category,
                            confidence=self._calculate_item_confidence(item_text, price_cents, category)
                        ))

        return items

    def _should_skip_line(self, line: str) -> bool:
        """Check if line should be skipped"""
        line_upper = line.upper()

        # Check skip patterns
        for pattern in self.skip_patterns:
            if re.search(pattern, line_upper):
                return True

        # Skip total/subtotal/tax lines
        total_keywords = ['TOTAL', 'SUBTOTAL', 'TAX', 'BALANCE', 'CHANGE', 'CASH', 'CREDIT']
        if any(kw in line_upper for kw in total_keywords):
            # But allow if it's clearly an item (e.g., "TOTAL CEREAL")
            if not re.search(r'(TOTAL|TAX)\s+[A-Z]{3,}', line_upper):
                return True

        return False

    def _detect_category(self, item_text: str) -> Optional[str]:
        """Detect item category from name"""
        item_upper = item_text.upper()

        for category, pattern in self.category_patterns.items():
            if re.search(pattern, item_upper):
                return category

        return None

    def _calculate_item_confidence(self, item_name: str, price_cents: int, category: Optional[str]) -> float:
        """Calculate confidence for a single item"""
        confidence = 0.5  # Base confidence

        # Valid name length
        if 3 <= len(item_name) <= 50:
            confidence += 0.1

        # Has alphabetic characters
        if any(c.isalpha() for c in item_name):
            confidence += 0.1

        # Reasonable price
        if 1 <= price_cents <= 100000:  # $0.01 to $1000
            confidence += 0.1

        # Has known category
        if category:
            confidence += 0.15

        # No excessive numbers (likely not a barcode)
        if not re.search(r'\d{8,}', item_name):
            confidence += 0.05

        return min(confidence, 0.95)

    def _calculate_confidence(
        self,
        merchant: Optional[str],
        date: Optional[str],
        total_cents: int,
        items: List[ParsedItem]
    ) -> float:
        """Calculate overall receipt confidence"""
        confidence = 0.0

        # Metadata (30% weight)
        if merchant:
            confidence += 0.15
        if date:
            confidence += 0.10
        if total_cents > 0:
            confidence += 0.05

        # Items (70% weight - most important)
        items_with_price = sum(1 for item in items if item.price_cents > 0)

        if items_with_price > 0:
            confidence += 0.20  # Base for having items

            # Scale with number of items
            if items_with_price >= 3:
                confidence += 0.20
            if items_with_price >= 5:
                confidence += 0.15
            if items_with_price >= 10:
                confidence += 0.15

        # Cap at 30% if no items found
        if items_with_price == 0:
            confidence = min(confidence, 0.30)

        return min(confidence, 1.0)

    def _calculate_pairing_ratio(self, items: List[ParsedItem]) -> float:
        """Calculate ratio of items with valid prices"""
        if not items:
            return 0.0

        items_with_price = sum(1 for item in items if item.price_cents > 0)
        return items_with_price / len(items)

    def _check_reconciliation(
        self,
        items: List[ParsedItem],
        subtotal_cents: int,
        tax_cents: int,
        total_cents: int
    ) -> bool:
        """Check if amounts reconcile"""
        if not items or not total_cents:
            return False

        # Sum item prices
        items_sum_cents = sum(item.price_cents for item in items)

        # Check subtotal match (more lenient)
        if subtotal_cents:
            tolerance_cents = max(50, int(subtotal_cents * 0.05))  # 50¢ or 5%
            if abs(items_sum_cents - subtotal_cents) <= tolerance_cents:
                return True  # Good enough!

        # Check total with tax
        if subtotal_cents and tax_cents:
            calculated_total = subtotal_cents + tax_cents
            tolerance_cents = max(50, int(total_cents * 0.05))  # More tolerance
            return abs(calculated_total - total_cents) <= tolerance_cents

        # Estimate with typical tax rate (more forgiving)
        # Tax can range from 0% to 10%
        for tax_rate in [0, 0.05, 0.065, 0.07, 0.08, 0.0875, 0.10]:
            estimated_tax = int(items_sum_cents * tax_rate)
            estimated_total = items_sum_cents + estimated_tax
            tolerance_cents = max(100, int(total_cents * 0.08))  # 100¢ or 8%

            if abs(estimated_total - total_cents) <= tolerance_cents:
                return True  # Found a tax rate that works!

        return False  # Really can't reconcile