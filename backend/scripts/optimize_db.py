#!/usr/bin/env python3
"""Optimize SQLite database for performance."""
import sys
import os
import sqlite3
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def optimize_database(db_path: str):
    """Optimize SQLite database."""
    print(f"🔧 Optimizing database: {db_path}")

    if not Path(db_path).exists():
        print(f"❌ Database not found: {db_path}")
        return False

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Get initial size
        cursor.execute("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()")
        initial_size = cursor.fetchone()[0]
        print(f"   Initial size: {initial_size / (1024*1024):.2f} MB")

        # 1. Update statistics for query planner
        print("\n📊 Analyzing tables...")
        cursor.execute("ANALYZE")
        print("   ✅ Table statistics updated")

        # 2. Optimize FTS5 index
        print("\n🔍 Optimizing FTS5 index...")
        try:
            cursor.execute("INSERT INTO recipes_fts(recipes_fts) VALUES('optimize')")
            print("   ✅ FTS5 index optimized")
        except Exception as e:
            print(f"   ⚠️ FTS5 optimization skipped: {e}")

        # 3. Rebuild indexes
        print("\n📇 Rebuilding indexes...")
        cursor.execute("REINDEX")
        print("   ✅ Indexes rebuilt")

        # 4. Update precomputed fields
        print("\n🔢 Updating precomputed fields...")

        # Update required_count
        cursor.execute("""
            UPDATE recipes
            SET required_count = (
                SELECT COUNT(DISTINCT value)
                FROM (
                    SELECT trim(value) as value
                    FROM (
                        SELECT value FROM json_each(
                            CASE
                                WHEN ingredients_vec LIKE '%,%'
                                THEN '["' || replace(ingredients_vec, ',', '","') || '"]'
                                ELSE '["' || ingredients_vec || '"]'
                            END
                        )
                        WHERE value != ''
                    )
                )
            )
            WHERE required_count IS NULL
              AND ingredients_vec IS NOT NULL
              AND ingredients_vec != ''
        """)
        updated = cursor.rowcount
        if updated > 0:
            print(f"   ✅ Updated required_count for {updated} recipes")

        # 5. Clean up soft-deleted records
        print("\n🗑️ Cleaning up deleted records...")
        cursor.execute("SELECT COUNT(*) FROM recipes WHERE takedown = 1")
        deleted_count = cursor.fetchone()[0]
        if deleted_count > 0:
            print(f"   Found {deleted_count} soft-deleted recipes")
            # Keep them for now (can be restored)
        else:
            print("   No deleted records found")

        # 6. Vacuum database (reclaim space)
        print("\n🧹 Vacuuming database...")
        conn.execute("VACUUM")
        print("   ✅ Database vacuumed")

        # Get final size
        cursor.execute("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()")
        final_size = cursor.fetchone()[0]
        print(f"\n   Final size: {final_size / (1024*1024):.2f} MB")

        saved = initial_size - final_size
        if saved > 0:
            print(f"   Space saved: {saved / (1024*1024):.2f} MB ({saved * 100 / initial_size:.1f}%)")

        # 7. Database integrity check
        print("\n🔍 Running integrity check...")
        cursor.execute("PRAGMA integrity_check")
        result = cursor.fetchone()[0]
        if result == "ok":
            print("   ✅ Database integrity verified")
        else:
            print(f"   ⚠️ Integrity check warning: {result}")

        # 8. Update optimization metadata
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS maintenance_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    details TEXT
                )
            """)

            cursor.execute("""
                INSERT INTO maintenance_log (action, details)
                VALUES ('optimize', ?)
            """, (f"Size: {final_size/(1024*1024):.2f}MB, Saved: {saved/(1024*1024):.2f}MB",))
        except:
            pass  # Maintenance log is optional

        conn.commit()
        print("\n✅ Database optimization complete!")

        # Print quick stats
        print("\n📈 Database Statistics:")
        cursor.execute("SELECT COUNT(*) FROM recipes WHERE takedown = 0")
        print(f"   Active recipes: {cursor.fetchone()[0]}")

        cursor.execute("SELECT COUNT(DISTINCT source_key) FROM recipes WHERE takedown = 0")
        print(f"   Sources: {cursor.fetchone()[0]}")

        cursor.execute("SELECT COUNT(*) FROM ingredients")
        print(f"   Ingredients: {cursor.fetchone()[0]}")

        # Performance hints
        print("\n💡 Performance Tips:")
        print("   - Ensure WAL mode is enabled (PRAGMA journal_mode=WAL)")
        print("   - Use prepared statements for queries")
        print("   - Keep required_count updated for fast matching")
        print("   - Run optimization weekly or after large imports")

        return True

    except Exception as e:
        print(f"❌ Error during optimization: {e}")
        return False

    finally:
        conn.close()


def main():
    """Main optimization script."""
    # Database path
    db_path = Path(__file__).parent.parent / "data" / "pantry.db"

    # Handle command line arguments
    if len(sys.argv) > 1:
        db_path = Path(sys.argv[1])

    if not db_path.exists():
        print(f"❌ Database not found: {db_path}")
        print("\nUsage:")
        print("  python optimize_db.py              # Use default database")
        print("  python optimize_db.py <db_path>    # Specify database path")
        sys.exit(1)

    # Run optimization
    success = optimize_database(str(db_path))

    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()