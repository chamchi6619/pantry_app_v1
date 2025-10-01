#!/usr/bin/env python3
"""Enhanced deduplication script using fingerprints and FTS5 similarity."""
import sys
import os
import sqlite3
import hashlib
import json
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion import IngredientNormalizer


@dataclass
class RecipeGroup:
    """Group of duplicate recipes."""
    fingerprint: str
    recipes: List[Dict]
    best_recipe_id: str
    similarity_score: float


class EnhancedDeduplicator:
    """Advanced deduplication using multiple strategies."""

    # License priority (lower = better)
    LICENSE_PRIORITY = {
        'PUBLIC': 1,
        'CC0': 1,
        'PD': 1,
        'CC-BY': 2,
        'OGL': 3,
        'KOGL-1': 3,
        'GOJ-2': 3,
        'KOGL': 3,
        'CC-BY-SA': 4,
        'CC-BY-NC': 5,
        'API': 6,
    }

    def __init__(self, db_path: str):
        """Initialize deduplicator with database path."""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.normalizer = IngredientNormalizer(db_path)

        # Enable FTS5 for similarity checking
        self.conn.execute("PRAGMA journal_mode=WAL")

        self.stats = {
            'total_recipes': 0,
            'duplicate_groups': 0,
            'recipes_removed': 0,
            'fingerprint_matches': 0,
            'title_similarity_matches': 0,
            'ingredient_similarity_matches': 0
        }

    def generate_fingerprint(self, recipe: Dict) -> str:
        """Generate deterministic fingerprint for a recipe."""
        # Get ingredients
        ingredients = []

        if recipe.get('ingredients_vec'):
            # Use normalized ingredient IDs if available
            ingredients = sorted(recipe['ingredients_vec'].split(','))
        elif recipe.get('ingredients_json'):
            # Parse from JSON
            try:
                ing_list = json.loads(recipe['ingredients_json'])
                for ing in ing_list:
                    normalized = self.normalizer.normalize(ing)
                    if normalized.canonical_name:
                        ingredients.append(normalized.canonical_name.lower())
            except:
                pass

        # Normalize title
        title = recipe.get('title', '')
        title_normalized = title[:48].lower().strip()
        title_normalized = ''.join(c for c in title_normalized if c.isalnum() or c.isspace())

        # Create fingerprint
        fp_string = ':'.join(sorted(ingredients)) + ':' + title_normalized
        return hashlib.sha1(fp_string.encode()).hexdigest()

    def find_duplicates_by_fingerprint(self) -> Dict[str, List[Dict]]:
        """Find recipes with identical fingerprints."""
        cursor = self.conn.cursor()

        # Get all recipes
        cursor.execute("""
            SELECT id, title, ingredients_vec, ingredients_json, fingerprint,
                   license_code, source_id, nutrition_json, image_url,
                   total_time_min, instructions, created_at
            FROM recipes
            WHERE takedown = 0
        """)

        recipes_by_fingerprint = {}
        for row in cursor.fetchall():
            recipe = dict(row)

            # Generate fingerprint if missing
            if not recipe.get('fingerprint'):
                recipe['fingerprint'] = self.generate_fingerprint(recipe)

                # Update in database
                cursor.execute(
                    "UPDATE recipes SET fingerprint = ? WHERE id = ?",
                    (recipe['fingerprint'], recipe['id'])
                )

            fp = recipe['fingerprint']
            if fp not in recipes_by_fingerprint:
                recipes_by_fingerprint[fp] = []
            recipes_by_fingerprint[fp].append(recipe)

        # Filter to groups with duplicates
        duplicates = {
            fp: recipes
            for fp, recipes in recipes_by_fingerprint.items()
            if len(recipes) > 1
        }

        self.stats['fingerprint_matches'] = len(duplicates)
        return duplicates

    def find_duplicates_by_title_similarity(self, threshold: float = 0.85) -> List[Tuple[str, str, float]]:
        """Find recipes with similar titles using FTS5."""
        cursor = self.conn.cursor()
        similar_pairs = []

        # Get all recipe titles
        cursor.execute("SELECT id, title FROM recipes WHERE takedown = 0")
        recipes = cursor.fetchall()

        for recipe in recipes:
            # Search for similar titles using FTS5
            query_title = recipe['title'].replace('"', '""')

            cursor.execute("""
                SELECT r.id, r.title,
                       (SELECT COUNT(*) FROM (
                           SELECT value FROM json_each(
                               json_array_split(?, ' ')
                           ) WHERE value IN (
                               SELECT value FROM json_each(
                                   json_array_split(r.title, ' ')
                               )
                           )
                       )) * 1.0 /
                       MAX(
                           json_array_length(json_array_split(?, ' ')),
                           json_array_length(json_array_split(r.title, ' '))
                       ) as similarity
                FROM recipes r
                WHERE r.id != ?
                  AND r.takedown = 0
                HAVING similarity > ?
            """, (recipe['title'], recipe['title'], recipe['id'], threshold))

            for match in cursor.fetchall():
                # Avoid duplicate pairs
                pair = tuple(sorted([recipe['id'], match['id']]))
                if pair not in [p[:2] for p in similar_pairs]:
                    similar_pairs.append((pair[0], pair[1], match['similarity']))

        self.stats['title_similarity_matches'] = len(similar_pairs)
        return similar_pairs

    def find_duplicates_by_ingredients(self, threshold: float = 0.8) -> List[Tuple[str, str, float]]:
        """Find recipes with similar ingredients."""
        cursor = self.conn.cursor()
        similar_pairs = []

        # Get recipes with ingredient vectors
        cursor.execute("""
            SELECT id, title, ingredients_vec
            FROM recipes
            WHERE takedown = 0 AND ingredients_vec IS NOT NULL
        """)

        recipes = cursor.fetchall()

        for i, recipe1 in enumerate(recipes):
            ing1 = set(recipe1['ingredients_vec'].split(','))

            for recipe2 in recipes[i+1:]:
                ing2 = set(recipe2['ingredients_vec'].split(','))

                # Calculate Jaccard similarity
                if ing1 or ing2:
                    intersection = len(ing1 & ing2)
                    union = len(ing1 | ing2)
                    similarity = intersection / union if union > 0 else 0

                    if similarity >= threshold:
                        similar_pairs.append((
                            recipe1['id'],
                            recipe2['id'],
                            similarity
                        ))

        self.stats['ingredient_similarity_matches'] = len(similar_pairs)
        return similar_pairs

    def choose_best_recipe(self, recipes: List[Dict]) -> Dict:
        """Choose the best recipe from a group of duplicates."""

        def recipe_score(recipe):
            # License priority (lower is better)
            license_priority = self.LICENSE_PRIORITY.get(
                recipe.get('license_code', 'UNKNOWN'),
                99
            )

            # Quality indicators
            has_nutrition = bool(recipe.get('nutrition_json'))
            has_image = bool(recipe.get('image_url'))
            has_instructions = bool(recipe.get('instructions'))
            instruction_length = len(recipe.get('instructions', ''))

            # Time information
            has_time = bool(recipe.get('total_time_min'))

            # Age (prefer newer)
            created_at = recipe.get('created_at', '')
            if created_at:
                try:
                    age_days = (datetime.now() - datetime.fromisoformat(created_at)).days
                except:
                    age_days = 365
            else:
                age_days = 365

            # Calculate composite score (lower is better)
            score = (
                license_priority * 1000 +  # License is most important
                (0 if has_nutrition else 100) +
                (0 if has_image else 50) +
                (0 if has_instructions else 200) +
                max(0, 100 - instruction_length // 10) +  # Longer instructions are better
                (0 if has_time else 25) +
                min(age_days, 365)  # Newer is better
            )

            return score

        # Sort recipes by score (lower is better)
        sorted_recipes = sorted(recipes, key=recipe_score)
        return sorted_recipes[0]

    def merge_duplicate_groups(self, groups: Dict[str, List[Dict]]):
        """Merge duplicate recipe groups, keeping the best version."""
        cursor = self.conn.cursor()

        for fingerprint, recipes in groups.items():
            if len(recipes) <= 1:
                continue

            # Choose the best recipe
            best = self.choose_best_recipe(recipes)
            others = [r for r in recipes if r['id'] != best['id']]

            print(f"\n📦 Duplicate group (fingerprint: {fingerprint[:8]}...)")
            print(f"   Keeping: {best['title']} (license: {best.get('license_code')})")

            for other in others:
                print(f"   Removing: {other['title']} (license: {other.get('license_code')})")

                # Mark as duplicate (soft delete)
                cursor.execute("""
                    UPDATE recipes
                    SET takedown = 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (other['id'],))

                self.stats['recipes_removed'] += 1

            self.stats['duplicate_groups'] += 1

        self.conn.commit()

    def run_deduplication(self):
        """Run complete deduplication process."""
        print("🔍 Starting enhanced deduplication...")

        # Count total recipes
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM recipes WHERE takedown = 0")
        self.stats['total_recipes'] = cursor.fetchone()[0]

        print(f"   Total active recipes: {self.stats['total_recipes']}")

        # 1. Find exact duplicates by fingerprint
        print("\n1️⃣ Finding duplicates by fingerprint...")
        fingerprint_duplicates = self.find_duplicates_by_fingerprint()
        print(f"   Found {len(fingerprint_duplicates)} groups with identical fingerprints")

        # 2. Find similar titles (fuzzy matching)
        print("\n2️⃣ Finding duplicates by title similarity...")
        title_similar = self.find_duplicates_by_title_similarity(threshold=0.85)
        print(f"   Found {len(title_similar)} similar title pairs")

        # 3. Find similar ingredient sets
        print("\n3️⃣ Finding duplicates by ingredient similarity...")
        ingredient_similar = self.find_duplicates_by_ingredients(threshold=0.8)
        print(f"   Found {len(ingredient_similar)} similar ingredient pairs")

        # 4. Merge duplicate groups
        print("\n4️⃣ Merging duplicate groups...")
        self.merge_duplicate_groups(fingerprint_duplicates)

        # 5. Handle similar recipes (optional manual review)
        if title_similar or ingredient_similar:
            print("\n⚠️ Found potentially similar recipes that may need manual review:")

            for id1, id2, similarity in title_similar[:5]:
                cursor.execute("SELECT title FROM recipes WHERE id IN (?, ?)", (id1, id2))
                titles = cursor.fetchall()
                if len(titles) == 2:
                    print(f"   - '{titles[0]['title']}' ~ '{titles[1]['title']}' (similarity: {similarity:.2f})")

        # 6. Update FTS index
        print("\n5️⃣ Updating FTS index...")
        cursor.execute("INSERT INTO recipes_fts(recipes_fts) VALUES('optimize')")
        self.conn.commit()

        print("\n✅ Deduplication complete!")
        self.print_stats()

    def print_stats(self):
        """Print deduplication statistics."""
        print("\n📊 Deduplication Statistics:")
        print(f"   Total recipes processed: {self.stats['total_recipes']}")
        print(f"   Duplicate groups found: {self.stats['duplicate_groups']}")
        print(f"   Recipes removed: {self.stats['recipes_removed']}")
        print(f"   Fingerprint matches: {self.stats['fingerprint_matches']}")
        print(f"   Title similarity matches: {self.stats['title_similarity_matches']}")
        print(f"   Ingredient similarity matches: {self.stats['ingredient_similarity_matches']}")

        # Final count
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM recipes WHERE takedown = 0")
        final_count = cursor.fetchone()[0]
        print(f"   Final recipe count: {final_count}")

    def restore_all(self):
        """Restore all soft-deleted recipes (undo deduplication)."""
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE recipes
            SET takedown = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE takedown = 1
        """)
        restored = cursor.rowcount
        self.conn.commit()
        print(f"✅ Restored {restored} recipes")


def main():
    """Main deduplication script."""
    # Database path
    db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    if not db_path.exists():
        print("❌ Database not found. Please run init_db.py first.")
        sys.exit(1)

    # Create deduplicator
    deduplicator = EnhancedDeduplicator(str(db_path))

    # Handle command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "restore":
            deduplicator.restore_all()
        elif command == "stats":
            deduplicator.print_stats()
        else:
            print(f"Unknown command: {command}")
            print("\nUsage:")
            print("  python deduplicate_enhanced.py         # Run deduplication")
            print("  python deduplicate_enhanced.py restore # Restore deleted recipes")
            print("  python deduplicate_enhanced.py stats   # Show statistics only")
    else:
        # Run deduplication
        deduplicator.run_deduplication()


if __name__ == "__main__":
    main()