"""Pantry matching utilities."""
from typing import List, Dict, Set
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def match_recipes(
    pantry_items: List[str],
    limit: int = 50,
    min_match_percentage: int = 0,
    include_partial: bool = True,
    db: AsyncSession = None
) -> List[Dict]:
    """
    Match recipes based on pantry ingredients.

    Uses precomputed ingredients_vec for fast matching.
    """
    if not pantry_items or not db:
        return []

    # Normalize pantry items
    pantry_normalized = [item.lower().strip() for item in pantry_items]

    # Get ingredient IDs for pantry items
    ing_query = text("""
        SELECT id, canonical_name
        FROM ingredients
        WHERE LOWER(canonical_name) IN :pantry_items
           OR id IN (
               SELECT id FROM ingredients
               WHERE json_extract(aliases, '$') LIKE :pantry_pattern
           )
    """)

    # For simplicity, we'll do exact matching first
    params = {
        "pantry_items": tuple(pantry_normalized),
        "pantry_pattern": f'%{"%".join(pantry_normalized)}%'
    }

    result = await db.execute(ing_query, params)
    ingredient_matches = result.fetchall()

    # Get ingredient IDs
    pantry_ing_ids = {row.id for row in ingredient_matches}
    pantry_ing_names = {row.canonical_name.lower() for row in ingredient_matches}

    if not pantry_ing_ids:
        return []  # No ingredients matched

    # Get staples for penalty calculation
    staples_query = text("SELECT ingredient_id, penalty_weight FROM staples")
    staples_result = await db.execute(staples_query)
    staples = {row.ingredient_id: row.penalty_weight for row in staples_result.fetchall()}

    # Get recipes with their ingredients
    recipes_query = text("""
        SELECT
            r.id, r.title, r.total_time_min, r.image_url,
            r.ingredients_vec, r.required_count,
            r.attribution_text, r.license_code
        FROM recipes r
        WHERE r.takedown = 0
        LIMIT 1000
    """)

    recipes_result = await db.execute(recipes_query)
    recipes = recipes_result.fetchall()

    # Calculate matches
    matches = []

    for recipe in recipes:
        if not recipe.ingredients_vec:
            continue

        # Parse ingredients vector (CSV of ingredient IDs)
        recipe_ing_ids = set(recipe.ingredients_vec.split(','))

        # Calculate intersection
        present_ids = pantry_ing_ids & recipe_ing_ids
        missing_ids = recipe_ing_ids - pantry_ing_ids

        # Skip if no ingredients match
        if not present_ids and not include_partial:
            continue

        # Calculate match percentage
        if recipe.required_count and recipe.required_count > 0:
            match_percentage = (len(present_ids) / recipe.required_count) * 100
        else:
            match_percentage = 0

        # Skip if below minimum threshold
        if match_percentage < min_match_percentage:
            continue

        # Calculate score with staples penalty
        score = len(present_ids)
        for missing_id in missing_ids:
            if missing_id in staples:
                score -= staples[missing_id]
            else:
                score -= 1

        # Get ingredient names for present/missing
        ing_names_query = text("""
            SELECT id, canonical_name
            FROM ingredients
            WHERE id IN :ing_ids
        """)

        # Get names for present ingredients
        if present_ids:
            present_result = await db.execute(
                ing_names_query,
                {"ing_ids": tuple(present_ids)}
            )
            present_names = [row.canonical_name for row in present_result.fetchall()]
        else:
            present_names = []

        # Get names for missing ingredients
        if missing_ids:
            missing_result = await db.execute(
                ing_names_query,
                {"ing_ids": tuple(missing_ids)}
            )
            missing_names = [row.canonical_name for row in missing_result.fetchall()]
        else:
            missing_names = []

        matches.append({
            "recipe": {
                "id": recipe.id,
                "title": recipe.title,
                "total_time_min": recipe.total_time_min,
                "image_url": recipe.image_url,
                "attribution_text": recipe.attribution_text,
                "license_code": recipe.license_code
            },
            "score": float(score),
            "match_percentage": int(match_percentage),
            "present": present_names,
            "missing": missing_names
        })

    # Sort by score (higher is better)
    matches.sort(key=lambda x: (x["score"], x["match_percentage"]), reverse=True)

    # Limit results
    return matches[:limit]


def normalize_ingredient_name(name: str) -> str:
    """Normalize ingredient name for matching."""
    # Remove common words and normalize
    stop_words = {'fresh', 'frozen', 'dried', 'ground', 'whole', 'chopped', 'diced'}

    name = name.lower().strip()

    # Remove quantities and units
    import re
    name = re.sub(r'\d+\s*(cup|tbsp|tsp|oz|lb|g|kg|ml|l)s?\b', '', name)

    # Remove stop words
    words = name.split()
    words = [w for w in words if w not in stop_words]

    return ' '.join(words).strip()