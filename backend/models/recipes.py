"""Recipe data models — extracted from server.py in the refactor sprint. LOGIC UNCHANGED."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class RecipeIngredient(BaseModel):
    ingredient_id: Optional[str] = None  # legacy field
    item_id: Optional[str] = None        # new canonical field
    item_type: Optional[str] = "ingredient"  # 'ingredient' or 'recipe'
    name: Optional[str] = None
    quantity: float
    unit: str
    cost: float = 0.0
    waste_factor_pct: Optional[float] = None  # explicit override; None = use ingredient default
    model_config = {"extra": "allow"}


class RecipeCreate(BaseModel):
    name: str
    name_es: Optional[str] = None
    description: Optional[str] = None
    description_es: Optional[str] = None
    category: str
    yield_quantity: float = 1.0
    yield_unit: str = "portion"  # portion, kg, L, unit
    portion_size: Optional[float] = 1.0
    portion_unit: Optional[str] = "serving"
    portions_per_yield: Optional[float] = 1.0
    prep_time: int = 0  # minutes (legacy)
    cook_time: int = 0  # minutes (legacy)
    prep_time_minutes: Optional[int] = 0
    cook_time_minutes: Optional[int] = 0
    labor_minutes: Optional[int] = 0
    difficulty: str = "medium"  # easy, medium, hard
    ingredients: List[RecipeIngredient] = []
    instructions: Optional[Any] = None  # accepts str or list (legacy step arrays)
    instructions_es: Optional[str] = None
    presentation_notes: Optional[str] = None
    chef_notes: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    allergens: List[str] = []
    dietary_tags: List[str] = []  # vegetarian, vegan, gluten-free, etc.
    default_portion_price: float = 0.0  # Default selling price per portion
    sell_price: Optional[float] = 0.0
    recipe_type: str = "Final"  # Base, Component, Final - for recipe composition
    is_public: bool = False  # Can be used in menus
    is_on_menu: bool = False  # Mark this as part of the company's base / signature menu
    min_margin_pct: Optional[float] = None  # Per-recipe override for margin policy
    # Sub-recipes (composition)
    sub_recipes: List[Dict[str, Any]] = []  # [{recipe_id, quantity, unit}]
    # Allow other extra fields the FE may emit (work_category, recipe_code…) so saving never crashes
    model_config = {"extra": "allow"}


class Recipe(BaseModel):
    recipe_id: str
    company_id: str
    name: str
    name_es: Optional[str] = None
    description: Optional[str] = None
    description_es: Optional[str] = None
    category: str
    yield_quantity: float
    yield_unit: str
    prep_time: Optional[int] = 0
    cook_time: Optional[int] = 0
    difficulty: Optional[str] = "medium"
    ingredients: List[Dict[str, Any]] = []
    instructions: Optional[Any] = None  # str or legacy list of step dicts
    instructions_es: Optional[str] = None
    presentation_notes: Optional[str] = None
    chef_notes: Optional[str] = None
    photo_url: Optional[str] = None
    allergens: List[str] = []
    dietary_tags: List[str] = []
    default_portion_price: float = 0.0
    recipe_type: str = "Final"
    is_public: bool = False
    is_on_menu: bool = False
    sub_recipes: List[Dict[str, Any]] = []
    min_margin_pct: Optional[float] = None  # Per-recipe override for margin policy
    # Calculated fields
    total_cost: float = 0.0
    cost_per_portion: float = 0.0
    margin_percentage: float = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Allow extra fields from DB
    class Config:
        extra = "allow"


class RecipePortionFormatCreate(BaseModel):
    format_name: str  # "Plato", "Bowl 12oz", "Mini", "Tray 1/2"
    portions_obtained: float = 1.0
    portion_unit: str = "serving"  # serving, plate, bowl, tray, piece, ml, oz, g
    sell_price: float = 0.0
    sell_price_tax_included: bool = False
    target_margin_pct: Optional[float] = None
    is_default: bool = False
    notes: Optional[str] = None


class RecipePortionFormat(BaseModel):
    format_id: str
    recipe_id: str
    company_id: str
    format_name: str
    portions_obtained: float
    portion_unit: str
    sell_price: float
    sell_price_tax_included: bool = False
    target_margin_pct: Optional[float] = None
    suggested_price: float = 0.0  # Calculated from cost & target margin
    cost_per_portion: float = 0.0  # Calculated from recipe cost
    margin_pct: float = 0.0  # Calculated
    is_default: bool = False
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RecipePackagingFormatCreate(BaseModel):
    packaging_inventory_item_id: str
    qty_per_portion: float = 1.0
    notes: Optional[str] = None


class RecipePackagingFormat(BaseModel):
    format_id: str
    recipe_id: str
    company_id: str
    packaging_inventory_item_id: str
    packaging_item_name: Optional[str] = None
    qty_per_portion: float
    notes: Optional[str] = None


class RecipeExtendedUpdate(BaseModel):
    allergens: Optional[List[str]] = None  # allergen_ids
    work_category: Optional[str] = None  # Partida de trabajo (prep station)
    recipe_code: Optional[str] = None  # Optional internal code
    verified_status: Optional[str] = None  # Draft, Verified


class RecipeScalePreview(BaseModel):
    target_portions: float
    # Optional event_id used by the UI to default target_portions to guest_count
    event_id: Optional[str] = None


class SaveScaledMenuRequest(BaseModel):
    name: str
    description: Optional[str] = None
    event_id: Optional[str] = None
    recipes: List[Dict[str, Any]]  # [{recipe_id, target_portions, unit_price?}]
