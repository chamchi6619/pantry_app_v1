"""
PII Redaction for OCR Text
Removes sensitive information before storage
"""

import re
from typing import List, Dict, Optional


class PIIRedactor:
    """
    Redacts personally identifiable information from receipt text
    """

    def __init__(self):
        # Patterns for sensitive data
        self.patterns = {
            # Credit/Debit card numbers (15-16 digits)
            'card_number': [
                r'\b(?:\d{4}[\s\-]?){3}\d{3,4}\b',  # 1234 5678 9012 3456
                r'\b\d{15,16}\b',  # 1234567890123456
                r'X{3,}\d{4}',  # XXXX1234
                r'\*{3,}\d{4}',  # ****1234
            ],

            # Phone numbers
            'phone': [
                r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',  # 123-456-7890
                r'\b\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b',  # (123) 456-7890
                r'\b\d{10}\b(?!\d)',  # 1234567890 (but not part of longer number)
            ],

            # Email addresses
            'email': [
                r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            ],

            # Social Security Numbers
            'ssn': [
                r'\b\d{3}-\d{2}-\d{4}\b',  # 123-45-6789
                r'\b\d{9}\b(?!\d)',  # 123456789
            ],

            # Loyalty/Member card numbers (usually long numbers with member/card prefix)
            'loyalty': [
                r'(?:MEMBER|CARD|VIC|LOYALTY|REW[A4]RDS?)\s*#?\s*:?\s*\d{5,}',
                r'(?:MEM|CRD)\s*#?\s*\d{5,}',
            ],

            # Driver's license (varies by state)
            'license': [
                r'\b[A-Z]\d{7,12}\b',  # Common format: Letter + 7-12 digits
                r'\bDL\s*#?\s*[A-Z0-9]{5,}\b',
            ],

            # IP Addresses
            'ip_address': [
                r'\b(?:\d{1,3}\.){3}\d{1,3}\b',  # IPv4
            ],

            # Barcodes (very long numbers that aren't prices)
            'barcode': [
                r'\b\d{12,13}\b(?!\.\d{2})',  # 12-13 digit barcodes (not prices)
                r'\b\d{20,}\b',  # Very long numbers
            ],

            # Personal names after certain keywords
            'cashier_name': [
                r'(?:CASHIER|ASSOCIATE|SERVED BY|YOUR SERVER)\s*:?\s*([A-Z][A-Za-z\s]+)',
            ],
        }

        # Replacement strings
        self.replacements = {
            'card_number': '[CARD]',
            'phone': '[PHONE]',
            'email': '[EMAIL]',
            'ssn': '[SSN]',
            'loyalty': 'MEMBER [ID]',
            'license': '[LICENSE]',
            'ip_address': '[IP]',
            'barcode': '[BARCODE]',
            'cashier_name': r'\1 [NAME]',  # Keep the prefix, redact the name
        }

        # Lines to completely remove
        self.remove_patterns = [
            r'^CUSTOMER:\s*.+',  # Customer name lines
            r'^NAME:\s*.+',
            r'^ADDRESS:\s*.+',
            r'^\d+\s+[A-Z\s]+ST(?:REET)?',  # Street addresses
            r'^\d+\s+[A-Z\s]+AVE(?:NUE)?',
            r'^\d+\s+[A-Z\s]+RD|ROAD',
            r'^P\.?O\.?\s*BOX',  # PO Box
        ]

    def redact(self, text: str, preserve_structure: bool = True) -> str:
        """
        Redact PII from text

        Args:
            text: Original text to redact
            preserve_structure: Keep line structure intact

        Returns:
            Redacted text
        """
        redacted = text

        # Apply pattern replacements
        for pii_type, patterns in self.patterns.items():
            replacement = self.replacements.get(pii_type, '[REDACTED]')

            for pattern in patterns:
                # Special handling for cashier names
                if pii_type == 'cashier_name':
                    redacted = re.sub(pattern, replacement, redacted, flags=re.IGNORECASE)
                else:
                    redacted = re.sub(pattern, replacement, redacted)

        if preserve_structure:
            # Process line by line for removals
            lines = redacted.split('\n')
            filtered_lines = []

            for line in lines:
                # Check if line should be removed
                should_remove = False
                for pattern in self.remove_patterns:
                    if re.match(pattern, line.strip(), re.IGNORECASE):
                        should_remove = True
                        break

                if not should_remove:
                    filtered_lines.append(line)
                else:
                    # Keep empty line to preserve structure
                    filtered_lines.append('[REDACTED LINE]' if preserve_structure else '')

            redacted = '\n'.join(filtered_lines)

        return redacted

    def detect_pii(self, text: str) -> Dict[str, List[str]]:
        """
        Detect PII without redacting (for logging/metrics)

        Args:
            text: Text to analyze

        Returns:
            Dictionary of PII types found and examples
        """
        detected = {}

        for pii_type, patterns in self.patterns.items():
            matches = []

            for pattern in patterns:
                found = re.findall(pattern, text, re.IGNORECASE if pii_type == 'cashier_name' else 0)
                matches.extend(found)

            if matches:
                # Only store first 3 examples (redacted)
                detected[pii_type] = [
                    self._partial_redact(match) for match in matches[:3]
                ]

        return detected

    def _partial_redact(self, value: str) -> str:
        """
        Partially redact a value for logging
        Shows first/last few characters only
        """
        if len(value) <= 4:
            return '*' * len(value)

        if len(value) <= 8:
            return value[0] + '*' * (len(value) - 2) + value[-1]

        # Show first 2 and last 2 characters
        return value[:2] + '*' * (len(value) - 4) + value[-2:]

    def get_safe_text(self, text: str) -> str:
        """
        Get text safe for storage (main entry point)

        Args:
            text: Raw OCR text

        Returns:
            Safe, redacted text
        """
        # Redact PII
        safe_text = self.redact(text)

        # Additional cleanup
        safe_text = self._remove_excessive_whitespace(safe_text)

        return safe_text

    def _remove_excessive_whitespace(self, text: str) -> str:
        """Remove excessive whitespace while preserving structure"""
        # Replace multiple spaces with single space
        text = re.sub(r' {2,}', ' ', text)

        # Replace multiple newlines with double newline
        text = re.sub(r'\n{3,}', '\n\n', text)

        return text.strip()


# Singleton instance
pii_redactor = PIIRedactor()


# Convenience functions
def redact_pii(text: str) -> str:
    """Redact PII from text"""
    return pii_redactor.redact(text)


def get_safe_text(text: str) -> str:
    """Get storage-safe version of text"""
    return pii_redactor.get_safe_text(text)


def detect_pii(text: str) -> Dict[str, List[str]]:
    """Detect PII in text without redacting"""
    return pii_redactor.detect_pii(text)