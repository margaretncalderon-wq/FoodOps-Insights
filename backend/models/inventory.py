"""Inventory & Ingredient data models — extracted from server.py. LOGIC UNCHANGED."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class IngredientCreate(BaseModel):
    name: str
    brand: Optional[str] = None
    category: str  # protein, dairy, produce, dry_goods, beverage, packaging, etc.
    inventory_type: str = "food"  # food, packaging, disposable, equipment, event_supply
    unit: str  # g, kg, ml, L, oz, lb, unit
    cost_per_unit: float = 0.0
    stock_quantity: float = 0.0
    min_stock_level: float = 0.0
    par_level: float = 0.0
    yield_waste_percent: float = 0.0
    allergens: List[str] = []
    storage_location: str = "dry"  # dry, fridge, freezer
    reorder_threshold: float = 0.0
    preferred_supplier_id: Optional[str] = None
    alternate_supplier_ids: List[str] = []
    pack_size: float = 1.0
    pack_unit: str = "unit"  # case, bag, box, gallon
    replacement_cost: float = 0.0  # For equipment - cost to replace if lost/damaged
    # Operations Supplies specific fields
    cost_center: str = "operations"  # operations, kitchen, service, logistics, admin
    purchase_date: Optional[str] = None  # For depreciation tracking
    useful_life_years: int = 5  # Expected lifespan for depreciation
    depreciation_rate: float = 20.0  # Annual depreciation percentage
    sku: Optional[str] = None  # Código de producto
    barcode: Optional[str] = None  # Código de barras
    notes: Optional[str] = None  # Notas adicionales
    # === New unit system fields (v2) ===
    base_unit: Optional[str] = None
    cost_per_base_unit: Optional[float] = None
    density_g_per_ml: Optional[float] = None
    purchase_unit: Optional[str] = None
    purchase_quantity_per_unit: Optional[float] = None
    purchase_cost: Optional[float] = None
    custom_conversions: Optional[Dict[str, float]] = None
    is_discrete_unit: Optional[bool] = None  # True for items that should be rounded up when scaled
    # === New rich fields (UI parity with legacy product editor) ===
    description: Optional[str] = None  # Long description for product card / catalog
    image_url: Optional[str] = None    # Product photo
    non_yieldable: Optional[bool] = None  # True = merma no aprovechable (cannot be reused)


class Ingredient(BaseModel):
    ingredient_id: str
    company_id: str
    name: str
    brand: Optional[str] = None
    category: str
    inventory_type: str = "food"
    item_type: str = "RAW"  # RAW or PREPARED
    linked_recipe_id: Optional[str] = None  # For PREPARED items
    unit: str
    cost_per_unit: float
    stock_quantity: float
    reserved_quantity: float = 0.0  # Reserved for events (logical allocation)
    min_stock_level: float
    par_level: float = 0.0
    yield_waste_percent: float = 0.0
    allergens: List[str] = []
    storage_location: str = "dry"
    reorder_threshold: float = 0.0
    preferred_supplier_id: Optional[str] = None
    alternate_supplier_ids: List[str] = []
    pack_size: float = 1.0
    pack_unit: str = "unit"
    average_cost: float = 0.0
    price_history: List[Dict[str, Any]] = []
    replacement_cost: float = 0.0
    cost_center: str = "operations"
    purchase_date: Optional[str] = None
    useful_life_years: int = 5
    depreciation_rate: float = 20.0
    sku: Optional[str] = None
    barcode: Optional[str] = None
    notes: Optional[str] = None
    base_unit: Optional[str] = None
    cost_per_base_unit: Optional[float] = None
    density_g_per_ml: Optional[float] = None
    purchase_unit: Optional[str] = None
    purchase_quantity_per_unit: Optional[float] = None
    purchase_cost: Optional[float] = None
    custom_conversions: Optional[Dict[str, float]] = None
    is_discrete_unit: Optional[bool] = None
    needs_review: bool = False
    description: Optional[str] = None
    image_url: Optional[str] = None
    non_yieldable: Optional[bool] = None
    created_at: datetime


class InventoryItemCreate(BaseModel):
    name: str
    inventory_type: str = "Food"
    category: Optional[str] = None
    unit: str = "unit"
    pack_size: float = 1.0
    pack_unit: Optional[str] = None
    current_stock: float = 0.0
    par_level: float = 0.0
    preferred_supplier_id: Optional[str] = None
    cost_per_unit: float = 0.0
    status: str = "Active"


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    inventory_type: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    pack_size: Optional[float] = None
    pack_unit: Optional[str] = None
    current_stock: Optional[float] = None
    par_level: Optional[float] = None
    preferred_supplier_id: Optional[str] = None
    cost_per_unit: Optional[float] = None
    status: Optional[str] = None


class InventoryItem(BaseModel):
    item_id: str
    company_id: str
    name: str
    inventory_type: str
    category: Optional[str] = None
    unit: str
    pack_size: float = 1.0
    pack_unit: Optional[str] = None
    current_stock: float = 0.0
    reserved_quantity: float = 0.0
    par_level: float = 0.0
    preferred_supplier_id: Optional[str] = None
    cost_per_unit: float = 0.0
    status: str = "Active"
    created_at: datetime
    updated_at: datetime

    @property
    def available_quantity(self) -> float:
        """Available = On Hand - Reserved"""
        return max(0, self.current_stock - self.reserved_quantity)


class InventoryTransactionCreate(BaseModel):
    inventory_item_id: str
    event_id: Optional[str] = None
    transaction_type: str  # Purchase, Usage, Adjustment, Waste
    quantity: float
    unit_cost: Optional[float] = None
    notes: Optional[str] = None


class InventoryTransaction(BaseModel):
    transaction_id: str
    company_id: str
    inventory_item_id: str
    event_id: Optional[str] = None
    transaction_type: str
    quantity: float
    unit_cost: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    created_by: str


class InventoryItemExtendedUpdate(BaseModel):
    secondary_supplier_id: Optional[str] = None
    purchase_unit: Optional[str] = None  # case, box, pack
    purchase_pack_size: Optional[float] = None  # units per case
    min_order_qty: Optional[float] = None
    lead_time_days: Optional[int] = None


class InventoryPriceHistoryCreate(BaseModel):
    supplier_id: Optional[str] = None
    unit_cost: float
    purchase_unit: str
    source: str = "Manual"  # Manual, PO, Invoice
    notes: Optional[str] = None


class InventoryPriceHistory(BaseModel):
    history_id: str
    inventory_item_id: str
    company_id: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    effective_date: datetime
    unit_cost: float
    purchase_unit: str
    source: str  # Manual, PO, Invoice
    notes: Optional[str] = None
