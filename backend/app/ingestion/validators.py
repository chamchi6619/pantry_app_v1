"""Recipe validation utilities."""
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
import re


@dataclass
class ValidationResult:
    """Result of recipe validation."""
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    metadata: Dict


class RecipeValidator:
    """Validate recipe data for quality and completeness."""

    # Required fields for a valid recipe
    REQUIRED_FIELDS = ['title', 'ingredients', 'instructions']

    # Field constraints
    MIN_TITLE_LENGTH = 5
    MAX_TITLE_LENGTH = 200
    MIN_SUMMARY_LENGTH = 10
    MAX_SUMMARY_LENGTH = 500
    MIN_INSTRUCTIONS_LENGTH = 50
    MIN_INGREDIENTS = 2
    MAX_INGREDIENTS = 50
    MIN_PREP_TIME = 0
    MAX_PREP_TIME = 1440  # 24 hours in minutes
    MIN_SERVINGS = 1
    MAX_SERVINGS = 100

    # License codes we accept
    ACCEPTED_LICENSES = {
        'PUBLIC', 'CC0', 'CC-BY', 'CC-BY-SA',
        'CC-BY-NC', 'CC-BY-NC-SA', 'ODbL'
    }

    # Instructions licenses (which allow full text storage)
    INSTRUCTIONS_ALLOWED_LICENSES = {
        'PUBLIC', 'CC0', 'CC-BY', 'CC-BY-SA'
    }

    def validate_recipe(self, recipe_data: Dict) -> ValidationResult:
        """Validate a recipe for completeness and quality."""
        errors = []
        warnings = []
        metadata = {}

        # Check required fields
        for field in self.REQUIRED_FIELDS:
            if field not in recipe_data or not recipe_data[field]:
                errors.append(f"Missing required field: {field}")

        # Validate title
        if 'title' in recipe_data:
            title = recipe_data['title']
            if isinstance(title, str):
                title = title.strip()
                if len(title) < self.MIN_TITLE_LENGTH:
                    errors.append(f"Title too short (min {self.MIN_TITLE_LENGTH} chars)")
                elif len(title) > self.MAX_TITLE_LENGTH:
                    errors.append(f"Title too long (max {self.MAX_TITLE_LENGTH} chars)")

                # Check for suspicious patterns
                if self._contains_url(title):
                    warnings.append("Title contains URL")
                if self._contains_special_chars(title):
                    warnings.append("Title contains special characters")
            else:
                errors.append("Title must be a string")

        # Validate summary
        if 'summary' in recipe_data and recipe_data['summary']:
            summary = recipe_data['summary']
            if isinstance(summary, str):
                summary = summary.strip()
                if len(summary) < self.MIN_SUMMARY_LENGTH:
                    warnings.append(f"Summary too short (recommended min {self.MIN_SUMMARY_LENGTH} chars)")
                elif len(summary) > self.MAX_SUMMARY_LENGTH:
                    warnings.append(f"Summary too long (max {self.MAX_SUMMARY_LENGTH} chars)")

        # Validate ingredients
        if 'ingredients' in recipe_data:
            ingredients = recipe_data['ingredients']
            if isinstance(ingredients, list):
                ing_count = len(ingredients)
                if ing_count < self.MIN_INGREDIENTS:
                    errors.append(f"Too few ingredients (min {self.MIN_INGREDIENTS})")
                elif ing_count > self.MAX_INGREDIENTS:
                    warnings.append(f"Many ingredients ({ing_count}, max recommended {self.MAX_INGREDIENTS})")

                # Check each ingredient
                for i, ingredient in enumerate(ingredients):
                    if not isinstance(ingredient, str) or not ingredient.strip():
                        errors.append(f"Invalid ingredient at position {i+1}")
                    elif len(ingredient) > 200:
                        warnings.append(f"Ingredient {i+1} is very long")

                metadata['ingredient_count'] = ing_count
            else:
                errors.append("Ingredients must be a list")

        # Validate instructions
        if 'instructions' in recipe_data:
            instructions = recipe_data['instructions']
            if isinstance(instructions, str):
                instructions = instructions.strip()
                if len(instructions) < self.MIN_INSTRUCTIONS_LENGTH:
                    errors.append(f"Instructions too short (min {self.MIN_INSTRUCTIONS_LENGTH} chars)")

                # Check for numbered steps
                if '\n' in instructions:
                    metadata['has_steps'] = True
                    step_count = len([line for line in instructions.split('\n') if line.strip()])
                    metadata['step_count'] = step_count
            elif isinstance(instructions, list):
                # Instructions as list of steps
                if len(instructions) < 2:
                    errors.append("Instructions should have at least 2 steps")
                metadata['has_steps'] = True
                metadata['step_count'] = len(instructions)
            else:
                errors.append("Instructions must be a string or list")

        # Validate times
        for time_field in ['total_time_min', 'prep_time_min', 'cook_time_min']:
            if time_field in recipe_data and recipe_data[time_field] is not None:
                try:
                    time_val = int(recipe_data[time_field])
                    if time_val < self.MIN_PREP_TIME:
                        warnings.append(f"{time_field} is negative")
                    elif time_val > self.MAX_PREP_TIME:
                        warnings.append(f"{time_field} seems too long ({time_val} minutes)")
                except (ValueError, TypeError):
                    errors.append(f"{time_field} must be a number")

        # Validate servings
        if 'servings' in recipe_data and recipe_data['servings'] is not None:
            try:
                servings = int(recipe_data['servings'])
                if servings < self.MIN_SERVINGS:
                    errors.append(f"Servings too low (min {self.MIN_SERVINGS})")
                elif servings > self.MAX_SERVINGS:
                    warnings.append(f"Servings very high ({servings})")
            except (ValueError, TypeError):
                errors.append("Servings must be a number")

        # Validate source and licensing
        if 'license_code' in recipe_data:
            license_code = recipe_data['license_code']
            if license_code not in self.ACCEPTED_LICENSES:
                errors.append(f"Unacceptable license: {license_code}")
            else:
                # Check if instructions can be stored
                if license_code not in self.INSTRUCTIONS_ALLOWED_LICENSES:
                    if 'instructions' in recipe_data and recipe_data['instructions']:
                        warnings.append(f"License {license_code} may not allow full instruction storage")
                        metadata['instructions_allowed'] = False
                else:
                    metadata['instructions_allowed'] = True

        # Check attribution
        if 'source_url' in recipe_data:
            if not self._is_valid_url(recipe_data['source_url']):
                warnings.append("Invalid source URL format")

        # Calculate quality score
        quality_score = self._calculate_quality_score(recipe_data, errors, warnings)
        metadata['quality_score'] = quality_score

        # Determine validity
        is_valid = len(errors) == 0

        return ValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            metadata=metadata
        )

    def _contains_url(self, text: str) -> bool:
        """Check if text contains a URL."""
        url_pattern = r'https?://|www\.'
        return bool(re.search(url_pattern, text, re.IGNORECASE))

    def _contains_special_chars(self, text: str) -> bool:
        """Check for unusual special characters."""
        # Allow common punctuation but flag unusual chars
        special_pattern = r'[<>{}|\[\]\\@#$%^*=+]'
        return bool(re.search(special_pattern, text))

    def _is_valid_url(self, url: str) -> bool:
        """Basic URL validation."""
        url_pattern = r'^https?://[^\s/$.?#].[^\s]*$'
        return bool(re.match(url_pattern, url, re.IGNORECASE))

    def _calculate_quality_score(self, recipe_data: Dict, errors: List, warnings: List) -> float:
        """Calculate a quality score for the recipe (0-100)."""
        score = 100.0

        # Deduct for errors (major issues)
        score -= len(errors) * 20

        # Deduct for warnings (minor issues)
        score -= len(warnings) * 5

        # Bonus for completeness
        optional_fields = ['summary', 'prep_time_min', 'total_time_min',
                          'servings', 'image_url', 'nutrition_json']
        for field in optional_fields:
            if field in recipe_data and recipe_data[field]:
                score += 2

        # Bonus for detailed instructions
        if 'instructions' in recipe_data:
            instructions = recipe_data['instructions']
            if isinstance(instructions, str) and len(instructions) > 200:
                score += 5
            elif isinstance(instructions, list) and len(instructions) > 5:
                score += 5

        # Bonus for proper attribution
        if all(field in recipe_data for field in ['source_url', 'attribution_text']):
            score += 5

        # Ensure score is in valid range
        return max(0.0, min(100.0, score))

    def check_duplicate(self, recipe_data: Dict, existing_titles: List[str]) -> bool:
        """Check if recipe is likely a duplicate."""
        if 'title' not in recipe_data:
            return False

        title = recipe_data['title'].lower().strip()

        # Remove common words for comparison
        common_words = {'the', 'a', 'an', 'and', 'or', 'with', 'for', 'to'}
        title_words = set(title.split()) - common_words

        for existing_title in existing_titles:
            existing_words = set(existing_title.lower().split()) - common_words

            # Check for high similarity
            if title_words and existing_words:
                intersection = len(title_words & existing_words)
                union = len(title_words | existing_words)
                similarity = intersection / union if union > 0 else 0

                if similarity > 0.8:  # 80% similar words
                    return True

        return False

    def sanitize_recipe(self, recipe_data: Dict) -> Dict:
        """Sanitize recipe data for safe storage."""
        sanitized = {}

        for key, value in recipe_data.items():
            if isinstance(value, str):
                # Remove excessive whitespace
                value = ' '.join(value.split())
                # Basic HTML entity encoding
                value = value.replace('<', '&lt;').replace('>', '&gt;')
                sanitized[key] = value
            elif isinstance(value, list):
                if all(isinstance(item, str) for item in value):
                    sanitized[key] = [' '.join(item.split()) for item in value]
                else:
                    sanitized[key] = value
            else:
                sanitized[key] = value

        return sanitized