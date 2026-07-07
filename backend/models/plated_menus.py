"""Plated Menu data models — extracted from server.py in the refactor sprint. LOGIC UNCHANGED."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class MenuCourse(BaseModel):
    """A course in a plated menu (Appetizer, Entree, Dessert, etc.)"""
    course_id: str
    course_name: str  # appetizer, salad, soup, entree, dessert
    course_order: int = 0
    items: List[Dict[str, Any]] = []  # [{recipe_id, recipe_name, portions_per_guest, notes}]
    # Buffet-style selection rules (Ciano-style "Choose 1 of 5")
    min_choices: Optional[int] = None  # Minimum dishes client picks (None = no rule)
    max_choices: Optional[int] = None  # Maximum dishes included in base price (None = all)
    extra_choice_price: float = 0.0  # Price per guest for each extra dish beyond max_choices


class PlatedMenuCreate(BaseModel):
    name: str
    description: Optional[str] = None
    menu_type: str = "plated"  # plated, buffet, cocktail, grab_and_go
    pricing_model: str = "per_guest"  # per_guest, fixed
    serving_style: str = "plated"  # plated, family_style, stations
    courses: List[MenuCourse] = []
    buffer_percentage: float = 0.0  # Extra % for prep loss/overage
    notes: Optional[str] = None
    base_price_per_guest: float = 0.0  # Fixed package price per guest (buffet-style); 0 = sum of recipe prices


class PlatedMenu(BaseModel):
    menu_id: str
    company_id: str
    name: str
    description: Optional[str] = None
    menu_type: str = "plated"
    pricing_model: str = "per_guest"
    serving_style: str = "plated"
    courses: List[MenuCourse] = []
    buffer_percentage: float = 0.0
    cost_per_guest: float = 0.0  # Calculated from recipe costs
    cost_with_buffer: float = 0.0  # cost_per_guest * (1 + buffer_percentage/100)
    base_price_per_guest: float = 0.0
    notes: Optional[str] = None
    status: str = "active"  # active, archived
    created_at: datetime
    updated_at: datetime


class PlatedMenuExtendedUpdate(BaseModel):
    default_guest_count: Optional[int] = None
    sell_price_per_guest: Optional[float] = None
    target_margin_pct: Optional[float] = None
    suggested_sell_price_per_guest: Optional[float] = None
    tax_included: Optional[bool] = None
