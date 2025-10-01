#!/usr/bin/env python3
"""Populate the FTS5 search index with recipe data."""
import sqlite3
from pathlib import Path

# Database path
db_path = Path(__file__).parent.parent / "data" / "pantry.db"

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# Clear existing FTS5 data
cursor.execute("DELETE FROM recipes_fts")

# Populate FTS5 table with all recipes
cursor.execute("""
    INSERT INTO recipes_fts (title, ingredients_vec)
    SELECT title, ingredients_flat
    FROM recipes
""")

rows_added = cursor.rowcount
conn.commit()

print(f"✅ Populated FTS5 index with {rows_added} recipes")

# Test the search
cursor.execute("""
    SELECT COUNT(*) FROM recipes_fts
    WHERE recipes_fts MATCH 'chicken'
""")
chicken_count = cursor.fetchone()[0]
print(f"   Test search 'chicken': {chicken_count} results")

cursor.execute("""
    SELECT COUNT(*) FROM recipes_fts
    WHERE recipes_fts MATCH 'pasta'
""")
pasta_count = cursor.fetchone()[0]
print(f"   Test search 'pasta': {pasta_count} results")

conn.close()