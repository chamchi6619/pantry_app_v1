"""Main FastAPI application."""
import os
import json
import time
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from dotenv import load_dotenv

from .database import init_db, get_db, verify_fts5, get_db_stats
from .auth import (
    create_user, authenticate_user, create_access_token, create_refresh_token,
    save_refresh_token, verify_refresh_token, get_current_user
)
from .schemas import (
    UserRegister, UserLogin, AuthResponse, Token, UserResponse,
    Recipe, RecipeMatch, SearchResponse, MatchResponse, PantryMatchRequest,
    ReceiptUpload, ReceiptResponse, ReceiptUpdateItems, ReceiptItem,
    Ingredient, IngredientSearchResponse,
    HealthCheck, Metrics, ErrorResponse
)
from .utils.pantry_matcher import match_recipes
from .utils.rate_limiter import RateLimiter
from .api.receipts import router as receipts_router
from .api.gemini_test import router as gemini_test_router

load_dotenv()

# App startup/shutdown
startup_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # Startup
    await init_db()
    print("✓ FastAPI server started")
    yield
    # Shutdown
    print("FastAPI server shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Pantry Pal Local Backend",
    description="Local backend for Pantry Pal mobile app",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "[]")
try:
    allowed_origins = json.loads(ALLOWED_ORIGINS)
except:
    allowed_origins = ["http://localhost:19006", "http://localhost:8081"]

# Add dynamic LAN IP support
import socket
try:
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    allowed_origins.extend([
        f"http://{local_ip}:19006",
        f"http://{local_ip}:8081",
        f"exp://{local_ip}:8081"
    ])
except:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(receipts_router)
app.include_router(gemini_test_router)

# Rate limiter
rate_limiter = RateLimiter(
    requests_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "300"))
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting."""
    client_ip = request.client.host if request.client else "unknown"

    # Skip rate limiting for health checks
    if request.url.path in ["/healthz", "/metrics"]:
        return await call_next(request)

    if not rate_limiter.allow(client_ip):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded"}
        )

    return await call_next(request)


# ========== Auth Endpoints ==========
@app.post("/auth/register", response_model=AuthResponse, tags=["auth"])
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user and household."""
    # Create user and household
    user = await create_user(
        email=user_data.email,
        password=user_data.password,
        username=user_data.username,
        household_name=user_data.household_name,
        db=db
    )

    # Create tokens
    access_token = create_access_token(data={"sub": user["id"]})
    refresh_token, expires_at = create_refresh_token(data={"sub": user["id"]})

    # Save refresh token
    await save_refresh_token(user["id"], refresh_token, expires_at, db)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(**user)
    )


@app.post("/auth/login", response_model=AuthResponse, tags=["auth"])
async def login(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """Login with email and password."""
    user = await authenticate_user(credentials.email, credentials.password, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create tokens
    access_token = create_access_token(data={"sub": user["id"]})
    refresh_token, expires_at = create_refresh_token(data={"sub": user["id"]})

    # Save refresh token
    await save_refresh_token(user["id"], refresh_token, expires_at, db)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(**user)
    )


@app.post("/auth/refresh", response_model=Token, tags=["auth"])
async def refresh_token(
    refresh_token: str,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token."""
    user_id = await verify_refresh_token(refresh_token, db)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    # Create new access token
    access_token = create_access_token(data={"sub": user_id})

    return Token(
        access_token=access_token,
        refresh_token=refresh_token
    )


@app.get("/auth/me", response_model=UserResponse, tags=["auth"])
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user."""
    return UserResponse(**current_user)


# ========== Recipe Endpoints ==========
@app.get("/recipes/search", response_model=SearchResponse, tags=["recipes"])
async def search_recipes(
    q: str = "",
    diet: Optional[str] = None,
    max_time: Optional[int] = None,
    cursor: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """Search recipes with filters."""
    # Build query
    query_parts = ["SELECT * FROM recipes WHERE takedown = 0"]
    params = {}

    # Add search filter
    if q:
        # Use FTS5 for text search (match by title)
        query_parts.append("""
            AND title IN (
                SELECT title FROM recipes_fts
                WHERE recipes_fts MATCH :search_query
            )
        """)
        params["search_query"] = q

    # Add time filter
    if max_time:
        query_parts.append("AND total_time_min <= :max_time")
        params["max_time"] = max_time

    # Add diet filter
    if diet:
        query_parts.append("""
            AND id IN (
                SELECT recipe_id FROM recipe_tags
                WHERE tag_id IN (
                    SELECT id FROM tags WHERE name = :diet AND type = 'diet'
                )
            )
        """)
        params["diet"] = diet

    # Add pagination
    if cursor:
        query_parts.append("AND id > :cursor")
        params["cursor"] = cursor

    query_parts.append("ORDER BY id LIMIT :limit")
    params["limit"] = limit

    # Execute query
    query = text(" ".join(query_parts))
    result = await db.execute(query, params)
    recipes = result.fetchall()

    # Format response
    items = []
    for recipe in recipes:
        items.append({
            "id": recipe.id,
            "slug": recipe.slug if hasattr(recipe, 'slug') else recipe.id,
            "title": recipe.title,
            "summary": recipe.summary,
            "total_time_min": recipe.total_time_min,
            "servings": recipe.servings,
            "image_url": recipe.image_url,
            "attribution_text": recipe.attribution_text,
            "license_code": recipe.license_code,
            "instructions_allowed": bool(recipe.instructions_allowed) if hasattr(recipe, 'instructions_allowed') else True
        })

    next_cursor = items[-1]["id"] if len(items) == limit else None

    return SearchResponse(
        items=items,
        next_cursor=next_cursor
    )


@app.post("/recipes/match", response_model=MatchResponse, tags=["recipes"])
async def match_pantry(
    request: PantryMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Match recipes based on pantry ingredients."""
    matches = await match_recipes(
        pantry_items=request.pantry,
        limit=request.limit,
        min_match_percentage=request.min_match_percentage,
        include_partial=request.include_partial,
        db=db
    )

    return MatchResponse(items=matches)


@app.get("/recipes/{recipe_id}", response_model=Recipe, tags=["recipes"])
async def get_recipe(
    recipe_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get recipe details by ID."""
    # Get recipe
    query = text("""
        SELECT r.*, s.name as source_name
        FROM recipes r
        LEFT JOIN sources s ON r.source_id = s.id
        WHERE r.id = :recipe_id AND r.takedown = 0
    """)
    result = await db.execute(query, {"recipe_id": recipe_id})
    recipe = result.first()

    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Get ingredients
    ing_query = text("""
        SELECT ri.*, i.canonical_name as ingredient_name
        FROM recipe_ingredients ri
        LEFT JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = :recipe_id
        ORDER BY ri.display_order
    """)
    ing_result = await db.execute(ing_query, {"recipe_id": recipe_id})
    ingredients = ing_result.fetchall()

    # Get tags
    tag_query = text("""
        SELECT t.name
        FROM recipe_tags rt
        JOIN tags t ON rt.tag_id = t.id
        WHERE rt.recipe_id = :recipe_id
    """)
    tag_result = await db.execute(tag_query, {"recipe_id": recipe_id})
    tags = [row.name for row in tag_result.fetchall()]

    # Parse ingredients_flat if no structured ingredients
    ingredient_list = []
    if ingredients:
        ingredient_list = [
            {
                "ingredient_name": ing.ingredient_name,
                "qty_value": ing.qty_value,
                "qty_unit": ing.qty_unit,
                "raw_text": ing.raw_text,
                "optional": bool(ing.optional)
            }
            for ing in ingredients
        ]
    elif recipe.ingredients_flat:
        # Parse comma-separated ingredients
        ingredient_list = recipe.ingredients_flat.split(',') if recipe.ingredients_flat else []

    # Format response
    return Recipe(
        id=recipe.id,
        slug=recipe.slug,
        title=recipe.title,
        summary=recipe.summary,
        instructions=recipe.instructions if recipe.instructions_allowed else None,
        total_time_min=recipe.total_time_min,
        prep_time_min=recipe.prep_time_min,
        servings=recipe.servings,
        image_url=recipe.image_url,
        ingredients=ingredient_list if (ingredient_list and len(ingredient_list) > 0 and isinstance(ingredient_list[0], dict)) else [{"raw_text": ing.strip()} for ing in ingredient_list] if ingredient_list else [],
        ingredients_flat=recipe.ingredients_flat,
        tags=tags,
        source_name=recipe.source_name,
        attribution_text=recipe.attribution_text,
        license_code=recipe.license_code,
        instructions_allowed=bool(recipe.instructions_allowed)
    )


# ========== System Endpoints ==========
@app.get("/healthz", response_model=HealthCheck, tags=["system"])
async def health_check():
    """Health check endpoint."""
    fts5_enabled = await verify_fts5()

    return HealthCheck(
        status="healthy",
        fts5_enabled=fts5_enabled,
        timestamp=datetime.utcnow()
    )


@app.get("/metrics", response_model=Metrics, tags=["system"])
async def get_metrics():
    """Get system metrics."""
    stats = await get_db_stats()

    return Metrics(
        recipes_count=stats.get("recipes_count", 0),
        ingredients_count=stats.get("ingredients_count", 0),
        users_count=stats.get("users_count", 0),
        households_count=stats.get("households_count", 0),
        receipts_count=stats.get("receipts_count", 0),
        db_size_bytes=stats.get("db_size_bytes", 0),
        uptime_seconds=time.time() - startup_time
    )


@app.get("/", tags=["system"])
async def root():
    """Root endpoint."""
    return {
        "message": "Pantry Pal Local Backend",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/healthz"
    }


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    import traceback
    print(f"Unhandled exception: {exc}")
    traceback.print_exc()

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )