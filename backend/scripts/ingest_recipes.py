#!/usr/bin/env python3
"""Batch ingestion script for recipes into SQLite database."""
import sys
import os
import asyncio
import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Optional
import uuid
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion import (
    IngredientNormalizer,
    RecipeValidator,
    SourceManager
)
from app.ingestion.scrapers.usda_scraper import USDARecipeScraper


class RecipeIngestionPipeline:
    """Pipeline for ingesting recipes into database."""

    def __init__(self, db_path: str):
        """Initialize ingestion pipeline."""
        self.db_path = db_path
        self.normalizer = IngredientNormalizer(db_path)
        self.validator = RecipeValidator()
        self.source_manager = SourceManager(db_path)

        # Statistics
        self.stats = {
            'total_processed': 0,
            'successfully_ingested': 0,
            'validation_failed': 0,
            'duplicates': 0,
            'errors': 0,
            'new_ingredients': 0
        }

    def connect_db(self):
        """Create database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    async def ingest_from_source(self, source_key: str, recipes: List[Dict]):
        """Ingest recipes from a specific source."""
        print(f"\n📥 Ingesting recipes from {source_key}...")

        # Register source
        source = self.source_manager.register_source(source_key)
        print(f"   Source: {source.name} (License: {source.license_code})")

        conn = self.connect_db()
        cursor = conn.cursor()

        # Get existing titles for duplicate check
        cursor.execute("SELECT title FROM recipes")
        existing_titles = [row[0] for row in cursor.fetchall()]

        for recipe_data in recipes:
            self.stats['total_processed'] += 1

            try:
                # Add source information
                recipe_data['source_id'] = source.id

                # Validate recipe
                validation = self.validator.validate_recipe(recipe_data)
                if not validation.is_valid:
                    print(f"   ❌ Validation failed for '{recipe_data.get('title', 'Unknown')}': {validation.errors}")
                    self.stats['validation_failed'] += 1
                    continue

                # Check for duplicates
                if self.validator.check_duplicate(recipe_data, existing_titles):
                    self.stats['duplicates'] += 1
                    continue

                # Validate license
                license_validation = self.source_manager.validate_recipe_license(recipe_data)
                if not license_validation['valid']:
                    print(f"   ❌ License validation failed: {license_validation['errors']}")
                    self.stats['validation_failed'] += 1
                    continue

                # Process and store recipe
                recipe_id = self._store_recipe(conn, recipe_data, source, license_validation)
                if recipe_id:
                    self.stats['successfully_ingested'] += 1
                    existing_titles.append(recipe_data['title'])

                    # Show progress every 10 recipes
                    if self.stats['successfully_ingested'] % 10 == 0:
                        print(f"   ✓ Ingested {self.stats['successfully_ingested']} recipes...")

            except Exception as e:
                print(f"   ❌ Error processing recipe: {e}")
                self.stats['errors'] += 1
                conn.rollback()
                continue

        # Commit all changes
        conn.commit()
        conn.close()

        print(f"\n✅ Ingestion complete for {source_key}")
        self._print_stats()

    def _store_recipe(self, conn, recipe_data: Dict, source, license_validation: Dict) -> Optional[str]:
        """Store a recipe in the database."""
        cursor = conn.cursor()

        # Generate recipe ID
        recipe_id = str(uuid.uuid4())
        slug = self._generate_slug(recipe_data['title'])

        # Normalize ingredients
        ingredients_list = recipe_data.get('ingredients', [])
        normalized_ingredients = self.normalizer.parse_recipe_ingredients(ingredients_list)

        # Generate ingredients vector (CSV of ingredient IDs)
        ing_ids = []
        ing_names = []
        for norm_ing in normalized_ingredients:
            # Get or create ingredient
            if norm_ing.canonical_name:
                ing_id = self.normalizer.get_or_create_ingredient(
                    norm_ing.canonical_name,
                    norm_ing.category
                )
                ing_ids.append(ing_id)
                ing_names.append(norm_ing.canonical_name)

        ingredients_vec = ','.join(ing_ids) if ing_ids else ''
        ingredients_flat = ' '.join(ing_names)

        # Prepare recipe data
        recipe_record = {
            'id': recipe_id,
            'slug': slug,
            'title': recipe_data['title'],
            'summary': recipe_data.get('summary', ''),
            'instructions': recipe_data.get('instructions', ''),
            'ingredients_json': json.dumps(ingredients_list),
            'ingredients_vec': ingredients_vec,
            'required_count': len(ing_ids),
            'prep_time_min': recipe_data.get('prep_time_min'),
            'cook_time_min': recipe_data.get('cook_time_min'),
            'total_time_min': recipe_data.get('total_time_min'),
            'servings': recipe_data.get('servings', 4),
            'difficulty': recipe_data.get('difficulty'),
            'cost_per_serving': recipe_data.get('cost_per_serving'),
            'nutrition_json': recipe_data.get('nutrition_json'),
            'image_url': recipe_data.get('image_url'),
            'video_url': recipe_data.get('video_url'),
            'source_id': source.id,
            'source_url': recipe_data.get('source_url'),
            'license_code': license_validation['license_code'],
            'attribution_text': license_validation['attribution_text'],
            'instructions_allowed': 1 if license_validation['instructions_allowed'] else 0,
            'takedown': 0
        }

        # Insert recipe
        cursor.execute("""
            INSERT INTO recipes (
                id, slug, title, summary, instructions,
                ingredients_json, ingredients_vec, required_count,
                prep_time_min, cook_time_min, total_time_min,
                servings, difficulty, cost_per_serving,
                nutrition_json, image_url, video_url,
                source_id, source_url, license_code,
                attribution_text, instructions_allowed, takedown
            ) VALUES (
                :id, :slug, :title, :summary, :instructions,
                :ingredients_json, :ingredients_vec, :required_count,
                :prep_time_min, :cook_time_min, :total_time_min,
                :servings, :difficulty, :cost_per_serving,
                :nutrition_json, :image_url, :video_url,
                :source_id, :source_url, :license_code,
                :attribution_text, :instructions_allowed, :takedown
            )
        """, recipe_record)

        # Update FTS index
        cursor.execute("""
            INSERT INTO recipes_fts (rowid, title, ingredients_flat)
            VALUES (:id, :title, :ingredients)
        """, {
            'id': recipe_id,
            'title': recipe_data['title'],
            'ingredients': ingredients_flat
        })

        return recipe_id

    def _generate_slug(self, title: str) -> str:
        """Generate URL-friendly slug from title."""
        import re
        slug = title.lower()
        slug = re.sub(r'[^a-z0-9\s-]', '', slug)
        slug = re.sub(r'[\s-]+', '-', slug)
        return slug.strip('-')[:100]  # Limit length

    def _print_stats(self):
        """Print ingestion statistics."""
        print("\n📊 Ingestion Statistics:")
        print(f"   Total processed: {self.stats['total_processed']}")
        print(f"   Successfully ingested: {self.stats['successfully_ingested']}")
        print(f"   Validation failed: {self.stats['validation_failed']}")
        print(f"   Duplicates skipped: {self.stats['duplicates']}")
        print(f"   Errors: {self.stats['errors']}")
        print(f"   New ingredients created: {self.stats['new_ingredients']}")

    async def ingest_usda_recipes(self, limit: int = 100):
        """Ingest recipes from USDA sources."""
        print("\n🍲 Starting USDA recipe ingestion...")

        async with USDARecipeScraper() as scraper:
            recipes = await scraper.fetch_recipes(limit=limit)
            await self.ingest_from_source('usda_myplate', recipes)

    async def ingest_from_file(self, filepath: str):
        """Ingest recipes from a JSON file."""
        print(f"\n📂 Loading recipes from {filepath}...")

        with open(filepath, 'r') as f:
            data = json.load(f)

        recipes = data.get('recipes', [])
        source = data.get('source', 'unknown')

        await self.ingest_from_source(source, recipes)

    def optimize_database(self):
        """Optimize database after bulk ingestion."""
        print("\n🔧 Optimizing database...")
        conn = self.connect_db()

        # Analyze tables for query planner
        conn.execute("ANALYZE")

        # Optimize FTS index
        conn.execute("INSERT INTO recipes_fts(recipes_fts) VALUES('optimize')")

        # Vacuum to reclaim space
        conn.execute("VACUUM")

        conn.close()
        print("   ✓ Database optimized")

    def get_database_stats(self):
        """Get statistics about the database."""
        conn = self.connect_db()
        cursor = conn.cursor()

        stats = {}

        # Recipe count
        cursor.execute("SELECT COUNT(*) FROM recipes")
        stats['total_recipes'] = cursor.fetchone()[0]

        # Ingredient count
        cursor.execute("SELECT COUNT(*) FROM ingredients")
        stats['total_ingredients'] = cursor.fetchone()[0]

        # Source count
        cursor.execute("SELECT COUNT(*) FROM sources")
        stats['total_sources'] = cursor.fetchone()[0]

        # Recipes by source
        cursor.execute("""
            SELECT s.name, COUNT(r.id) as count
            FROM recipes r
            JOIN sources s ON r.source_id = s.id
            GROUP BY s.id
            ORDER BY count DESC
        """)
        stats['by_source'] = cursor.fetchall()

        # Database size
        cursor.execute("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()")
        size_bytes = cursor.fetchone()[0]
        stats['size_mb'] = round(size_bytes / (1024 * 1024), 2)

        conn.close()

        print("\n📈 Database Statistics:")
        print(f"   Total recipes: {stats['total_recipes']}")
        print(f"   Total ingredients: {stats['total_ingredients']}")
        print(f"   Total sources: {stats['total_sources']}")
        print(f"   Database size: {stats['size_mb']} MB")

        if stats['by_source']:
            print("\n   Recipes by source:")
            for source_name, count in stats['by_source']:
                print(f"     - {source_name}: {count} recipes")

        return stats


async def main():
    """Main ingestion script."""
    # Database path
    db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    # Ensure database exists and is initialized
    if not db_path.exists():
        print("❌ Database not found. Please run init_db.py first.")
        sys.exit(1)

    # Create pipeline
    pipeline = RecipeIngestionPipeline(str(db_path))

    # Command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "usda":
            limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100
            await pipeline.ingest_usda_recipes(limit=limit)

        elif command == "file":
            if len(sys.argv) < 3:
                print("Usage: python ingest_recipes.py file <filepath>")
                sys.exit(1)
            filepath = sys.argv[2]
            await pipeline.ingest_from_file(filepath)

        elif command == "stats":
            pipeline.get_database_stats()

        elif command == "optimize":
            pipeline.optimize_database()

        else:
            print(f"Unknown command: {command}")
            print("\nUsage:")
            print("  python ingest_recipes.py usda [limit]  # Ingest from USDA")
            print("  python ingest_recipes.py file <path>   # Ingest from JSON file")
            print("  python ingest_recipes.py stats         # Show database stats")
            print("  python ingest_recipes.py optimize      # Optimize database")

    else:
        # Default: Ingest sample USDA recipes
        print("🚀 Starting recipe ingestion pipeline...")
        print("   This will ingest sample USDA recipes.")
        print("   Use 'python ingest_recipes.py --help' for more options.\n")

        await pipeline.ingest_usda_recipes(limit=50)
        pipeline.optimize_database()
        pipeline.get_database_stats()


if __name__ == "__main__":
    asyncio.run(main())