"""Compliance enforcement for recipe collection."""
import json
from typing import Dict, Optional
from datetime import datetime
import hashlib


class ComplianceEnforcer:
    """Enforce license compliance and data hygiene."""

    # Image license rules by source
    IMAGE_LICENSE_RULES = {
        'PUBLIC': True,     # Public domain - can use images
        'CC0': True,        # CC0 - can use images
        'CC-BY': True,      # CC BY - can use with attribution
        'CC-BY-SA': True,   # CC BY-SA - can use with share-alike
        'OGL': False,       # UK OGL - often excludes images/logos
        'KOGL-1': True,     # Korea OGL - typically includes images
        'GOJ-2': False,     # Japan GoJ - verify case-by-case
        'API': False,       # API - check specific terms
        'ETALAB-2': True,   # France - typically allows
        'RESTRICTED': False # Restricted - no images
    }

    def enforce_compliance(self, recipe: Dict, source: Dict) -> Dict:
        """Enforce license compliance at import time."""

        # Required fields validation
        if not recipe.get('license_code'):
            raise ValueError("Missing license_code")

        if not recipe.get('source_url'):
            raise ValueError("Missing source_url")

        # Handle restricted sources (like Canada)
        if recipe['license_code'] == 'RESTRICTED':
            # Facts only - no instructions
            recipe['instructions_allowed'] = 0
            recipe['instructions'] = None
            recipe['instructions_en'] = None
            recipe['image_licence_allowed'] = 0
            recipe['image_url'] = None

        # Set instructions_allowed based on license
        if 'instructions_allowed' not in recipe:
            license_attrs = source.get('allows_instructions', True)
            recipe['instructions_allowed'] = 1 if license_attrs else 0

        # Clear instructions if not allowed
        if not recipe.get('instructions_allowed'):
            recipe['instructions'] = None
            recipe['instructions_en'] = None

        # Set image license flag
        recipe['image_licence_allowed'] = self.IMAGE_LICENSE_RULES.get(
            recipe['license_code'],
            False  # Default to false for safety
        )

        # Clear image if not allowed
        if not recipe.get('image_licence_allowed'):
            # Keep URL for hotlinking reference but flag it
            recipe['image_hotlink_only'] = recipe.get('image_url')
            recipe['image_url'] = None  # Don't download/cache

        # Generate and store attribution at import time
        if source.get('requires_attribution'):
            recipe['attribution_text'] = self.format_attribution(recipe, source)
        else:
            recipe['attribution_text'] = ''

        # Handle share-alike
        if recipe.get('license_code') in ['CC-BY-SA', 'ODbL']:
            recipe['share_alike_required'] = 1
            recipe['open_collection'] = 1
        else:
            recipe['share_alike_required'] = 0
            recipe['open_collection'] = 0

        # Store original language data
        if recipe.get('lang'):
            # Preserve original title/instructions
            if 'title_orig' not in recipe:
                recipe['title_orig'] = recipe.get('title')
            if 'instructions_orig' not in recipe:
                recipe['instructions_orig'] = recipe.get('instructions')

        # Translation rules
        if recipe.get('instructions_allowed'):
            # Can translate if we're allowed to store instructions
            pass  # Translation happens in separate step
        else:
            # Don't translate restricted content
            recipe['title_en'] = None
            recipe['instructions_en'] = None

        # Sanitize takedown flag
        recipe['takedown'] = recipe.get('takedown', 0)

        # Add compliance timestamp
        recipe['compliance_checked_at'] = datetime.utcnow().isoformat()

        return recipe

    def format_attribution(self, recipe: Dict, source: Dict) -> str:
        """Format attribution text at import time."""
        template = source.get('attribution_template', '')

        if not template:
            return f"Recipe from {source.get('name', 'Unknown Source')}"

        # Replace placeholders
        attribution = template.format(
            title=recipe.get('title', 'Recipe'),
            source_name=source.get('name', ''),
            source_url=recipe.get('source_url', ''),
            year=datetime.now().year
        )

        return attribution

    def validate_import_batch(self, recipes: list) -> tuple:
        """Validate a batch of recipes before import."""
        valid = []
        rejected = []

        for recipe in recipes:
            try:
                # Check required fields
                assert recipe.get('license_code'), "Missing license_code"
                assert recipe.get('source_url'), "Missing source_url"
                assert recipe.get('title'), "Missing title"
                assert len(recipe.get('ingredients', [])) >= 2, "Too few ingredients"

                # Check license is acceptable
                if recipe['license_code'] in ['CC-BY-NC', 'CC-BY-ND']:
                    raise ValueError(f"Non-commercial license: {recipe['license_code']}")

                # Nutrition sanity checks
                if recipe.get('nutrition_json'):
                    nutrition = json.loads(recipe['nutrition_json'])
                    calories = nutrition.get('calories', 0)
                    if calories and not (20 <= calories <= 2000):
                        raise ValueError(f"Suspicious calories: {calories}")

                    sodium = nutrition.get('sodium', 0)
                    if sodium and sodium > 10000:
                        raise ValueError(f"Suspicious sodium: {sodium}mg")

                # Time sanity checks
                total_time = recipe.get('total_time_min')
                if total_time and not (5 <= total_time <= 480):
                    raise ValueError(f"Suspicious time: {total_time} minutes")

                prep_time = recipe.get('prep_time_min')
                if prep_time and total_time and prep_time > total_time:
                    raise ValueError(f"Prep time > total time")

                valid.append(recipe)

            except (AssertionError, ValueError) as e:
                rejected.append({
                    'recipe': recipe.get('title', 'Unknown'),
                    'reason': str(e)
                })

        return valid, rejected

    def check_robots_txt(self, url: str) -> bool:
        """Check if URL is allowed by robots.txt."""
        # TODO: Implement robots.txt checking
        # For now, return True but log for manual review
        return True

    def get_user_agent(self, collector_name: str) -> str:
        """Get appropriate user agent for collector."""
        return f"PantryPal-Collector/{collector_name} (Educational; +https://pantrypal.app/bot)"


class RateLimiter:
    """Per-host rate limiting for collectors."""

    def __init__(self):
        self.last_request = {}
        self.min_delays = {
            'default': 1.0,
            'myplate.gov': 1.0,
            'foodsafetykorea.go.kr': 2.0,
            'nhs.uk': 1.5,
            'maff.go.jp': 2.0,
            'themealdb.com': 0.5,
            'buenosaires.gob.ar': 1.5,
            'gub.uy': 2.0
        }

    async def wait_if_needed(self, hostname: str):
        """Wait if needed to respect rate limits."""
        import asyncio
        from urllib.parse import urlparse

        # Parse hostname if full URL provided
        if hostname.startswith('http'):
            hostname = urlparse(hostname).netloc

        # Get minimum delay for host
        min_delay = self.min_delays.get(hostname, self.min_delays['default'])

        # Check last request time
        if hostname in self.last_request:
            elapsed = datetime.now().timestamp() - self.last_request[hostname]
            if elapsed < min_delay:
                await asyncio.sleep(min_delay - elapsed)

        # Update last request time
        self.last_request[hostname] = datetime.now().timestamp()


def generate_fingerprint(recipe: Dict) -> str:
    """Generate deterministic fingerprint for deduplication."""
    # Sort ingredients
    ingredients = []

    if recipe.get('ingredients_vec'):
        ingredients = sorted(recipe['ingredients_vec'].split(','))
    elif recipe.get('ingredients'):
        ingredients = sorted([
            ing.lower().strip()
            for ing in recipe['ingredients']
        ])

    # Normalize title
    title = recipe.get('title', '')
    title_normalized = title[:48].lower().strip()
    title_normalized = ''.join(c for c in title_normalized if c.isalnum() or c.isspace())

    # Create fingerprint
    fp_string = ':'.join(ingredients) + ':' + title_normalized
    return hashlib.sha1(fp_string.encode()).hexdigest()