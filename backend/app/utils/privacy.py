"""
PII redaction and privacy utilities for receipt processing
"""

import re
import hashlib
from typing import Dict, List, Tuple, Optional
from PIL import Image
import piexif
import logging

logger = logging.getLogger(__name__)

# PII patterns to redact
PII_PATTERNS: List[Tuple[str, str]] = [
    # Credit/debit cards - keep last 4 digits
    (r'\b(\d{4}[\s\-]?)(\d{4}[\s\-]?)(\d{4}[\s\-]?)(\d{4})\b', r'[CARD-****\4]'),

    # Phone numbers
    (r'\b\d{3}[\-\.]?\d{3}[\-\.]?\d{4}\b', '[PHONE]'),
    (r'\b\(\d{3}\)\s*\d{3}[\-\.]?\d{4}\b', '[PHONE]'),

    # Email addresses
    (r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]'),

    # Social Security Numbers
    (r'\b\d{3}\-\d{2}\-\d{4}\b', '[SSN]'),

    # Full addresses (street addresses)
    (r'\d+\s+[\w\s]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Plaza|Pl)\b',
     '[ADDRESS]'),

    # Loyalty/member IDs (13-19 digits)
    (r'\b\d{13,19}\b', '[LOYALTY]'),

    # Barcodes/UPC codes
    (r'\b\d{5,12}\s*\d{5,12}\b', '[BARCODE]'),

    # Driver's license patterns (varies by state)
    (r'\b[A-Z]\d{7,12}\b', '[LICENSE]'),

    # GPS coordinates
    (r'[\-]?\d{1,3}\.\d{4,},?\s*[\-]?\d{1,3}\.\d{4,}', '[GPS]'),
]

class PrivacyService:
    """Service for handling PII and privacy concerns"""

    def __init__(self):
        self.redaction_log = []

    def redact_pii(self, text: str) -> str:
        """
        Redact PII from text before sending to LLM or logging

        Args:
            text: Raw text that may contain PII

        Returns:
            Redacted text with PII replaced by placeholders
        """
        if not text:
            return text

        redacted = text
        redaction_count = 0

        for pattern, replacement in PII_PATTERNS:
            matches = re.finditer(pattern, redacted, re.IGNORECASE)
            for match in matches:
                redaction_count += 1

            redacted = re.sub(pattern, replacement, redacted, flags=re.IGNORECASE)

        if redaction_count > 0:
            logger.info(f"Redacted {redaction_count} PII instances")

        return redacted

    def strip_exif_and_hash(self, image_path: str) -> Tuple[str, str]:
        """
        Remove EXIF data (including GPS) from image and generate hash

        Args:
            image_path: Path to the image file

        Returns:
            Tuple of (clean_image_path, image_hash)
        """
        try:
            # Open image
            img = Image.open(image_path)

            # Remove all EXIF data
            data = list(img.getdata())
            img_without_exif = Image.new(img.mode, img.size)
            img_without_exif.putdata(data)

            # Save cleaned image
            clean_path = image_path.replace('.jpg', '_clean.jpg').replace('.jpeg', '_clean.jpg')
            img_without_exif.save(clean_path, "JPEG", quality=85, exif=b'')

            # Generate hash for caching
            with open(clean_path, 'rb') as f:
                file_hash = hashlib.sha256(f.read()).hexdigest()

            logger.info(f"Stripped EXIF from image, hash: {file_hash[:8]}...")
            return clean_path, file_hash

        except Exception as e:
            logger.error(f"Failed to strip EXIF: {e}")
            # If stripping fails, at least hash the original
            with open(image_path, 'rb') as f:
                file_hash = hashlib.sha256(f.read()).hexdigest()
            return image_path, file_hash

    def check_for_residual_pii(self, text: str) -> bool:
        """
        Check if text still contains PII after redaction

        Args:
            text: Text to check

        Returns:
            True if potential PII found
        """
        # Quick checks for patterns that might indicate missed PII
        suspicious_patterns = [
            r'\b\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\b',  # Credit card
            r'\b\d{3}\-\d{2}\-\d{4}\b',             # SSN
            r'@[a-zA-Z0-9\.\-]+\.[a-zA-Z]{2,}',     # Email domain
        ]

        for pattern in suspicious_patterns:
            if re.search(pattern, text):
                return True

        return False

    def sanitize_for_logging(self, data: Dict) -> Dict:
        """
        Sanitize data structure for safe logging

        Args:
            data: Dictionary that may contain sensitive data

        Returns:
            Sanitized dictionary safe for logging
        """
        safe_data = {}

        for key, value in data.items():
            # Never log these fields
            if key in ['ocr_text', 'raw_text', 'full_text', 'image_data']:
                safe_data[key] = f"<{len(str(value))} chars>"

            # Hash long strings
            elif isinstance(value, str) and len(value) > 100:
                safe_data[key] = hashlib.sha256(value.encode()).hexdigest()[:8] + "..."

            # Redact any remaining text fields
            elif isinstance(value, str):
                safe_data[key] = self.redact_pii(value)

            # Recurse into dictionaries
            elif isinstance(value, dict):
                safe_data[key] = self.sanitize_for_logging(value)

            # Handle lists
            elif isinstance(value, list):
                if len(value) > 0 and isinstance(value[0], str):
                    safe_data[key] = [self.redact_pii(item) for item in value[:3]] + \
                                    ([f"...{len(value)-3} more"] if len(value) > 3 else [])
                else:
                    safe_data[key] = f"<list of {len(value)} items>"

            else:
                safe_data[key] = value

        return safe_data

    def generate_anonymous_id(self, identifier: str) -> str:
        """
        Generate anonymous ID from a real identifier

        Args:
            identifier: Real ID (email, phone, etc)

        Returns:
            Anonymous hash that's consistent for the same input
        """
        # Use SHA256 for consistent anonymization
        return hashlib.sha256(identifier.encode()).hexdigest()[:16]

    def validate_no_pii(self, text: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that text contains no PII

        Args:
            text: Text to validate

        Returns:
            Tuple of (is_safe, error_message)
        """
        for pattern, placeholder in PII_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return False, f"Found PII matching {placeholder}"

        return True, None

class SafeLogger:
    """Logger that automatically sanitizes output"""

    def __init__(self, logger_name: str = __name__):
        self.logger = logging.getLogger(logger_name)
        self.privacy = PrivacyService()

    def _log(self, level: str, msg: str, **kwargs):
        """Internal log method with sanitization"""
        safe_kwargs = self.privacy.sanitize_for_logging(kwargs)
        getattr(self.logger, level)(msg, extra=safe_kwargs)

    def debug(self, msg: str, **kwargs):
        self._log('debug', msg, **kwargs)

    def info(self, msg: str, **kwargs):
        self._log('info', msg, **kwargs)

    def warning(self, msg: str, **kwargs):
        self._log('warning', msg, **kwargs)

    def error(self, msg: str, **kwargs):
        self._log('error', msg, **kwargs)

    def critical(self, msg: str, **kwargs):
        self._log('critical', msg, **kwargs)

# Export singleton instances
privacy_service = PrivacyService()
safe_logger = SafeLogger()

# Convenience functions
def redact_pii(text: str) -> str:
    """Convenience function for PII redaction"""
    return privacy_service.redact_pii(text)

def strip_exif(image_path: str) -> Tuple[str, str]:
    """Convenience function for EXIF stripping"""
    return privacy_service.strip_exif_and_hash(image_path)

def safe_log_data(data: Dict) -> Dict:
    """Convenience function for safe logging"""
    return privacy_service.sanitize_for_logging(data)