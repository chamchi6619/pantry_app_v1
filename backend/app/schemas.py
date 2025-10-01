"""Pydantic models for request/response schemas."""
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ========== Auth Schemas ==========
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    username: Optional[str] = None
    household_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    username: Optional[str]
    household_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserResponse


# ========== Recipe Schemas ==========
class RecipeBase(BaseModel):
    title: str
    summary: Optional[str] = None
    instructions: Optional[str] = None
    total_time_min: Optional[int] = None
    prep_time_min: Optional[int] = None
    cook_time_min: Optional[int] = None
    yields: Optional[str] = None
    servings: Optional[int] = None
    image_url: Optional[str] = None


class RecipeIngredient(BaseModel):
    id: Optional[str] = None
    ingredient_id: Optional[str] = None
    ingredient_name: Optional[str] = None
    qty_value: Optional[float] = None
    qty_unit: Optional[str] = None
    raw_text: str
    optional: bool = False


class RecipeNutrition(BaseModel):
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    fat_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    sodium_mg: Optional[float] = None


class Recipe(RecipeBase):
    id: str
    slug: Optional[str]
    ingredients: List[RecipeIngredient] = []
    ingredients_flat: Optional[str] = None
    nutrition: Optional[RecipeNutrition] = None
    tags: List[str] = []
    source_name: Optional[str] = None
    attribution_text: str
    license_code: str
    instructions_allowed: bool = True

    model_config = ConfigDict(from_attributes=True)


class RecipeMatch(BaseModel):
    recipe: Recipe
    score: float
    match_percentage: int
    present: List[str]
    missing: List[str]


class SearchResponse(BaseModel):
    items: List[Recipe]
    next_cursor: Optional[str] = None
    total: Optional[int] = None


class MatchResponse(BaseModel):
    items: List[RecipeMatch]


class PantryMatchRequest(BaseModel):
    pantry: List[str] = Field(..., description="List of ingredient names in pantry")
    limit: int = Field(50, le=100)
    include_partial: bool = True
    min_match_percentage: int = Field(0, ge=0, le=100)


# ========== Receipt Schemas ==========
class ReceiptItemBase(BaseModel):
    raw_text: str
    parsed_name: str
    quantity: float = 1
    unit: str = "item"
    price: Optional[float] = None
    confidence: float = 1.0
    needs_review: bool = False


class ReceiptItem(ReceiptItemBase):
    id: str
    matched_ingredient_id: Optional[str] = None
    category: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ReceiptUpload(BaseModel):
    store_name: Optional[str] = None
    date: Optional[str] = None


class ReceiptResponse(BaseModel):
    id: str
    status: str  # processing|needs_review|reviewed|processed
    confidence: float
    store_name: Optional[str]
    date: Optional[str]
    items: List[ReceiptItem]
    total: Optional[float]
    tax: Optional[float]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReceiptUpdateItems(BaseModel):
    items: List[ReceiptItemBase]


# ========== Ingredient Schemas ==========
class Ingredient(BaseModel):
    id: str
    canonical_name: str
    display_name: Optional[str]
    category: Optional[str]
    aliases: List[str] = []

    model_config = ConfigDict(from_attributes=True)


class IngredientSearchResponse(BaseModel):
    items: List[Ingredient]


# ========== System Schemas ==========
class HealthCheck(BaseModel):
    status: str
    fts5_enabled: bool
    timestamp: datetime


class Metrics(BaseModel):
    recipes_count: int
    ingredients_count: int
    users_count: int
    households_count: int
    receipts_count: int
    db_size_bytes: int
    uptime_seconds: float


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None