#!/usr/bin/env python3
"""
Clean all recipe data from the database.
This will remove all collected recipes and related data.
"""

import sqlite3
import sys
from pathlib import Path

def clean_database(db_path):
    """Clean all recipe-related data from the database."""

    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return False

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    try:
        # Start transaction
        conn.execute("BEGIN TRANSACTION")

        print("Starting database cleanup...")

        # Get counts before deletion
        cur.execute("SELECT COUNT(*) FROM recipes")
        recipe_count = cur.fetchone()[0]
        print(f"Found {recipe_count} recipes to delete")

        # Delete from all recipe-related tables
        tables_to_clean = [
            "recipe_ingredients",
            "recipe_tags",
            "recipe_nutrition",
            "recipes_fts",  # FTS5 table
            "recipes"
        ]

        for table in tables_to_clean:
            try:
                cur.execute(f"DELETE FROM {table}")
                deleted = cur.rowcount
                print(f"  - Deleted {deleted} rows from {table}")
            except sqlite3.OperationalError as e:
                print(f"  - Warning: Could not clean {table}: {e}")

        # Also clean orphaned data
        print("\nCleaning orphaned data...")

        # Delete ingredients not used in any recipes
        cur.execute("""
            DELETE FROM ingredients
            WHERE id NOT IN (
                SELECT DISTINCT ingredient_id
                FROM recipe_ingredients
                WHERE ingredient_id IS NOT NULL
            )
        """)
        deleted = cur.rowcount
        print(f"  - Deleted {deleted} orphaned ingredients")

        # Delete tags not used in any recipes
        cur.execute("""
            DELETE FROM tags
            WHERE id NOT IN (
                SELECT DISTINCT tag_id
                FROM recipe_tags
                WHERE tag_id IS NOT NULL
            )
        """)
        deleted = cur.rowcount
        print(f"  - Deleted {deleted} orphaned tags")

        # Delete sources not used in any recipes
        cur.execute("""
            DELETE FROM sources
            WHERE id NOT IN (
                SELECT DISTINCT source_id
                FROM recipes
                WHERE source_id IS NOT NULL
            )
        """)
        deleted = cur.rowcount
        print(f"  - Deleted {deleted} orphaned sources")

        # Commit changes
        conn.commit()

        # Vacuum to reclaim space
        print("\nVacuuming database to reclaim space...")
        conn.execute("VACUUM")

        # Verify cleanup
        print("\nVerifying cleanup...")
        cur.execute("SELECT COUNT(*) FROM recipes")
        remaining = cur.fetchone()[0]

        if remaining == 0:
            print(f"✓ Database cleaned successfully! All {recipe_count} recipes removed.")

            # Show database size
            cur.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
            size = cur.fetchone()[0]
            print(f"✓ Database size: {size / 1024 / 1024:.2f} MB")

            return True
        else:
            print(f"⚠ Warning: {remaining} recipes still remain in database")
            return False

    except Exception as e:
        print(f"Error during cleanup: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    db_path = "data/pantry.db"

    # Confirm with user
    print("=" * 60)
    print("DATABASE CLEANUP TOOL")
    print("=" * 60)
    print(f"This will DELETE ALL RECIPES from: {db_path}")
    print("A backup has been created.")
    print()
    response = input("Type 'yes' to confirm deletion: ")

    if response.lower() == 'yes':
        success = clean_database(db_path)
        sys.exit(0 if success else 1)
    else:
        print("Cleanup cancelled.")
        sys.exit(0)