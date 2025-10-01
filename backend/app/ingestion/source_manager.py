"""Source and attribution management for recipes."""
import sqlite3
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass


@dataclass
class RecipeSource:
    """Recipe source information."""
    id: str
    name: str
    url: Optional[str]
    territory: str
    license_code: str
    license_url: Optional[str]
    requires_attribution: bool
    allows_instructions: bool
    attribution_template: Optional[str]


class SourceManager:
    """Manage recipe sources and attribution requirements."""

    # License compatibility matrix
    LICENSE_ATTRIBUTES = {
        'PUBLIC': {
            'requires_attribution': False,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': False
        },
        'CC0': {
            'requires_attribution': False,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': False
        },
        'CC-BY': {
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': False
        },
        'CC-BY-SA': {
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': True
        },
        'CC-BY-NC': {
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': False,
            'share_alike': False
        },
        'CC-BY-NC-SA': {
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': False,
            'share_alike': True
        },
        'OGL': {  # UK Open Government License
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': False
        },
        'KOGL-1': {  # Korea Open Government License Type 1
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': False
        },
        'GOJ-2': {  # Government of Japan Standard Terms v2.0
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': False
        },
        'API': {  # Commercial API with terms
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': True,  # With proper license/subscription
            'share_alike': False
        },
        'ETALAB-2': {  # France Open License v2.0
            'requires_attribution': True,
            'allows_instructions': True,
            'allows_commercial': True,
            'share_alike': False
        },
        'RESTRICTED': {  # Needs permission or facts-only
            'requires_attribution': True,
            'allows_instructions': False,  # Facts only unless verified
            'allows_commercial': False,
            'share_alike': False
        },
        'ODbL': {
            'requires_attribution': True,
            'allows_instructions': False,  # Database license, not content
            'allows_commercial': True,
            'share_alike': True
        }
    }

    # Attribution templates by license type
    ATTRIBUTION_TEMPLATES = {
        'PUBLIC': None,  # No attribution required
        'CC0': None,  # No attribution required
        'CC-BY': "{title} from {source_name} ({source_url}), CC BY {version}",
        'CC-BY-SA': "{title} from {source_name} ({source_url}), CC BY-SA {version}",
        'CC-BY-NC': "{title} from {source_name} ({source_url}), CC BY-NC {version}",
        'CC-BY-NC-SA': "{title} from {source_name} ({source_url}), CC BY-NC-SA {version}",
        'ODbL': "Data from {source_name} ({source_url}), licensed under ODbL"
    }

    # Known sources configuration
    KNOWN_SOURCES = {
        'usda_myplate': {
            'name': 'USDA MyPlate Kitchen',
            'url': 'https://www.myplate.gov/myplate-kitchen',
            'territory': 'US',
            'license_code': 'PUBLIC',
            'license_url': None,
            'attribution_template': None  # Public domain - no attribution required
        },
        'mfds_korea': {
            'name': 'Korea MFDS Food Safety',
            'url': 'https://www.foodsafetykorea.go.kr',
            'territory': 'KR',
            'license_code': 'KOGL-1',
            'license_url': 'https://www.kogl.or.kr/info/license.do',
            'attribution_template': 'Recipe from Korea Food Safety (식품안전나라), KOGL Type 1'
        },
        'nhs_healthier_families': {
            'name': 'NHS Healthier Families',
            'url': 'https://www.nhs.uk/healthier-families/recipes/',
            'territory': 'UK',
            'license_code': 'OGL',
            'license_url': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
            'attribution_template': '© Crown copyright, recipe from NHS Healthier Families'
        },
        'maff_japan': {
            'name': 'Japan MAFF Regional Cuisines',
            'url': 'https://www.maff.go.jp/j/keikaku/syokubunka/',
            'territory': 'JP',
            'license_code': 'GOJ-2',
            'license_url': 'https://www.kantei.go.jp/jp/singi/it2/densi/',
            'attribution_template': 'Recipe from MAFF Japan, GoJ Standard Terms v2.0'
        },
        'canada_food_guide': {
            'name': 'Canada Food Guide',
            'url': 'https://food-guide.canada.ca/en/recipes/',
            'territory': 'CA',
            'license_code': 'RESTRICTED',  # Many GC materials require permission
            'license_url': 'https://www.canada.ca/en/transparency/terms.html',
            'attribution_template': 'Recipe from Health Canada - permission pending'
        },
        'ireland_psi': {
            'name': 'Ireland PSI',
            'url': 'https://data.gov.ie',
            'territory': 'IE',
            'license_code': 'CC-BY',
            'license_url': 'https://creativecommons.org/licenses/by/4.0/',
            'attribution_template': 'Recipe from Ireland PSI, CC BY 4.0'
        },
        'france_etalab': {
            'name': 'France Etalab',
            'url': 'https://www.data.gouv.fr',
            'territory': 'FR',
            'license_code': 'ETALAB-2',
            'license_url': 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
            'attribution_template': 'Recipe from data.gouv.fr, Licence Ouverte v2.0'
        },
        'ba_argentina': {
            'name': 'Buenos Aires City Recipes',
            'url': 'https://www.buenosaires.gob.ar',
            'territory': 'AR',
            'license_code': 'CC-BY',
            'license_url': 'https://creativecommons.org/licenses/by/2.5/ar/',
            'attribution_template': 'Recipe from Buenos Aires City Government, CC BY 2.5 AR'
        },
        'inda_uruguay': {
            'name': 'Uruguay INDA Sabores Andantes',
            'url': 'https://www.gub.uy/ministerio-desarrollo-social/inda',
            'territory': 'UY',
            'license_code': 'CC-BY',
            'license_url': 'https://creativecommons.org/licenses/by/4.0/',
            'attribution_template': 'Recipe from INDA Uruguay, CC BY 4.0'
        },
        'themealdb': {
            'name': 'TheMealDB',
            'url': 'https://www.themealdb.com',
            'territory': 'INT',
            'license_code': 'API',
            'license_url': 'https://www.themealdb.com/api.php',
            'attribution_template': 'Recipe data from TheMealDB'
        },
        'wikibooks_cookbook': {
            'name': 'Wikibooks Cookbook',
            'url': 'https://en.wikibooks.org/wiki/Cookbook',
            'territory': 'INT',
            'license_code': 'CC-BY-SA',
            'license_url': 'https://creativecommons.org/licenses/by-sa/3.0/',
            'attribution_template': 'From Wikibooks Cookbook, available under CC BY-SA 3.0'
        }
    }

    def __init__(self, db_path: str):
        """Initialize source manager with database connection."""
        self.db_path = db_path
        self.sources_cache: Dict[str, RecipeSource] = {}
        self._load_sources()

    def _load_sources(self):
        """Load existing sources from database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, name, url, territory, license_code, license_url
            FROM sources
        """)

        for row in cursor.fetchall():
            source_id, name, url, territory, license_code, license_url = row

            license_attrs = self.LICENSE_ATTRIBUTES.get(license_code, {})

            self.sources_cache[source_id] = RecipeSource(
                id=source_id,
                name=name,
                url=url,
                territory=territory,
                license_code=license_code,
                license_url=license_url,
                requires_attribution=license_attrs.get('requires_attribution', True),
                allows_instructions=license_attrs.get('allows_instructions', False),
                attribution_template=self.ATTRIBUTION_TEMPLATES.get(license_code)
            )

        conn.close()

    def register_source(self, source_key: str) -> RecipeSource:
        """Register a known source or create a new one."""
        # Check if already registered
        if source_key in self.sources_cache:
            return self.sources_cache[source_key]

        # Check if it's a known source
        if source_key in self.KNOWN_SOURCES:
            source_config = self.KNOWN_SOURCES[source_key]
            return self.create_source(
                id=source_key,
                **source_config
            )

        raise ValueError(f"Unknown source: {source_key}")

    def create_source(self, id: str, name: str, territory: str,
                     license_code: str, url: Optional[str] = None,
                     license_url: Optional[str] = None,
                     attribution_template: Optional[str] = None) -> RecipeSource:
        """Create a new source in the database."""
        # Validate license code
        if license_code not in self.LICENSE_ATTRIBUTES:
            raise ValueError(f"Invalid license code: {license_code}")

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Check if exists
        cursor.execute("SELECT id FROM sources WHERE id = ?", (id,))
        if cursor.fetchone():
            conn.close()
            return self.sources_cache[id]

        # Insert new source
        cursor.execute("""
            INSERT INTO sources (id, name, url, territory, license_code, license_url)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (id, name, url, territory, license_code, license_url))

        conn.commit()
        conn.close()

        # Create source object
        license_attrs = self.LICENSE_ATTRIBUTES[license_code]
        source = RecipeSource(
            id=id,
            name=name,
            url=url,
            territory=territory,
            license_code=license_code,
            license_url=license_url,
            requires_attribution=license_attrs['requires_attribution'],
            allows_instructions=license_attrs['allows_instructions'],
            attribution_template=attribution_template or self.ATTRIBUTION_TEMPLATES.get(license_code)
        )

        # Cache it
        self.sources_cache[id] = source
        return source

    def format_attribution(self, recipe_title: str, source_id: str,
                          source_url: Optional[str] = None,
                          version: str = "4.0") -> Optional[str]:
        """Format attribution text for a recipe."""
        if source_id not in self.sources_cache:
            return None

        source = self.sources_cache[source_id]

        if not source.requires_attribution:
            return None

        if source.attribution_template:
            return source.attribution_template.format(
                title=recipe_title,
                source_name=source.name,
                source_url=source_url or source.url or '',
                version=version,
                year=datetime.now().year
            )

        # Fallback generic attribution
        return f"{recipe_title} from {source.name}"

    def check_license_compatibility(self, source_id: str,
                                   store_instructions: bool = True) -> bool:
        """Check if we can legally store recipe with given requirements."""
        if source_id not in self.sources_cache:
            return False

        source = self.sources_cache[source_id]

        # Check if instructions storage is allowed
        if store_instructions and not source.allows_instructions:
            return False

        return True

    def get_sources_by_license(self, license_codes: List[str]) -> List[RecipeSource]:
        """Get all sources with specific license codes."""
        return [
            source for source in self.sources_cache.values()
            if source.license_code in license_codes
        ]

    def get_public_domain_sources(self) -> List[RecipeSource]:
        """Get all public domain sources (no attribution required)."""
        return self.get_sources_by_license(['PUBLIC', 'CC0'])

    def get_attribution_required_sources(self) -> List[RecipeSource]:
        """Get all sources that require attribution."""
        return [
            source for source in self.sources_cache.values()
            if source.requires_attribution
        ]

    def validate_recipe_license(self, recipe_data: Dict) -> Dict[str, any]:
        """Validate and enhance recipe data with proper licensing."""
        validation = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'attribution_text': None,
            'instructions_allowed': True
        }

        # Check required fields
        if 'source_id' not in recipe_data:
            validation['errors'].append("Missing source_id")
            validation['valid'] = False
            return validation

        source_id = recipe_data['source_id']
        if source_id not in self.sources_cache:
            validation['errors'].append(f"Unknown source: {source_id}")
            validation['valid'] = False
            return validation

        source = self.sources_cache[source_id]

        # Check if instructions can be stored
        if not source.allows_instructions and recipe_data.get('instructions'):
            validation['instructions_allowed'] = False
            validation['warnings'].append(
                f"License {source.license_code} doesn't allow full instruction storage"
            )

        # Generate attribution if required
        if source.requires_attribution:
            validation['attribution_text'] = self.format_attribution(
                recipe_title=recipe_data.get('title', 'Recipe'),
                source_id=source_id,
                source_url=recipe_data.get('source_url')
            )

        # Add license code
        validation['license_code'] = source.license_code

        return validation

    def get_stats(self) -> Dict:
        """Get statistics about registered sources."""
        stats = {
            'total_sources': len(self.sources_cache),
            'by_license': {},
            'by_territory': {},
            'public_domain': 0,
            'requires_attribution': 0
        }

        for source in self.sources_cache.values():
            # Count by license
            if source.license_code not in stats['by_license']:
                stats['by_license'][source.license_code] = 0
            stats['by_license'][source.license_code] += 1

            # Count by territory
            if source.territory not in stats['by_territory']:
                stats['by_territory'][source.territory] = 0
            stats['by_territory'][source.territory] += 1

            # Count public domain
            if source.license_code in ['PUBLIC', 'CC0']:
                stats['public_domain'] += 1

            # Count attribution required
            if source.requires_attribution:
                stats['requires_attribution'] += 1

        return stats