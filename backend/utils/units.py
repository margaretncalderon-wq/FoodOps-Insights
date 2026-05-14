"""
Unit conversion system for Culinary Intelligence.

Three layers:
1. SYSTEM conversions (this file) — physical standards (g↔kg, ml↔L, etc.)
2. INGREDIENT custom conversions (cup↔g via density, pack↔base via pack_size)
3. RECIPE override (future, not implemented in v1)

Public API:
  - normalize_unit(unit) -> canonical lowercase
  - convert(quantity, from_unit, to_unit, ingredient=None) -> (float | None)
  - cost_for_recipe_line(quantity, unit, ingredient) -> float
  - is_compatible(unit_a, unit_b, ingredient=None) -> bool
"""
from typing import Optional, Dict

# Canonical unit groups with conversion factors to the BASE unit of each group.
# All values are multipliers: 1 unit = factor * base_unit
# Base for weight: gram
# Base for volume: milliliter
# Base for count: unit
WEIGHT_UNITS: Dict[str, float] = {
    "g": 1.0,
    "gram": 1.0,
    "gramo": 1.0,
    "gramos": 1.0,
    "kg": 1000.0,
    "kilo": 1000.0,
    "kilogramo": 1000.0,
    "kilogramos": 1000.0,
    "mg": 0.001,
    "oz": 28.3495,
    "lb": 453.592,
    "libra": 453.592,
    "libras": 453.592,
}

VOLUME_UNITS: Dict[str, float] = {
    "ml": 1.0,
    "mililitro": 1.0,
    "mililitros": 1.0,
    "l": 1000.0,
    "lt": 1000.0,
    "litro": 1000.0,
    "litros": 1000.0,
    "oz_fl": 29.5735,
    "fl_oz": 29.5735,
    "cup": 240.0,            # US cup
    "taza": 240.0,
    "tazas": 240.0,
    "tbsp": 15.0,            # tablespoon
    "cda": 15.0,             # cucharada
    "cucharada": 15.0,
    "tsp": 5.0,              # teaspoon
    "cdta": 5.0,
    "cucharadita": 5.0,
    "gal": 3785.41,          # US gallon
    "galon": 3785.41,
    "galón": 3785.41,
    "pt": 473.176,           # US pint
    "qt": 946.353,           # US quart
}

COUNT_UNITS: Dict[str, float] = {
    "unit": 1.0,
    "unidad": 1.0,
    "u": 1.0,
    "pz": 1.0,
    "pieza": 1.0,
    "dozen": 12.0,
    "docena": 12.0,
    "case": None,            # case requires pack_size (per-ingredient)
    "caja": None,
    "bag": None,
    "saco": None,
    "box": None,
    "carton": None,
    "pack": None,
    "paquete": None,
    "portion": 1.0,
    "porcion": 1.0,
    "porción": 1.0,
    "serving": 1.0,
}

ALL_UNITS = {**WEIGHT_UNITS, **VOLUME_UNITS, **COUNT_UNITS}

# Default densities (g/ml) for common ingredients — used to convert weight↔volume.
# Match by lowercase substring on ingredient name.
DEFAULT_DENSITIES: Dict[str, float] = {
    "agua": 1.00, "water": 1.00,
    "leche": 1.03, "milk": 1.03,
    "crema": 1.00, "cream": 1.00,
    "aceite": 0.92, "oil": 0.92, "olivo": 0.92,
    "vinagre": 1.01, "vinegar": 1.01,
    "vino": 0.99, "wine": 0.99,
    "miel": 1.42, "honey": 1.42,
    "limon": 1.03, "lemon": 1.03, "limón": 1.03,
    "harina": 0.53, "flour": 0.53,
    "azucar": 0.85, "azúcar": 0.85, "sugar": 0.85,
    "sal": 1.20, "salt": 1.20,
    "arroz": 0.85, "rice": 0.85,
    "mantequilla": 0.91, "butter": 0.91,
    "yogur": 1.04, "yogurt": 1.04, "yogurth": 1.04,
    "queso crema": 1.04, "cream cheese": 1.04,
    "salsa": 1.05, "sauce": 1.05,
    "jugo": 1.05, "juice": 1.05,
}


def normalize_unit(unit: Optional[str]) -> str:
    if not unit:
        return ""
    u = unit.strip().lower().replace(" ", "_")
    aliases = {"liters": "l", "milliliters": "ml", "grams": "g", "kilograms": "kg",
               "pounds": "lb", "ounces": "oz", "cups": "cup", "tablespoons": "tbsp",
               "teaspoons": "tsp", "dozens": "dozen", "units": "unit"}
    return aliases.get(u, u)


def unit_kind(unit: str) -> Optional[str]:
    """Returns 'weight' | 'volume' | 'count' | None"""
    u = normalize_unit(unit)
    if u in WEIGHT_UNITS:
        return "weight"
    if u in VOLUME_UNITS:
        return "volume"
    if u in COUNT_UNITS:
        return "count"
    return None


def detect_density(ingredient: Optional[dict]) -> Optional[float]:
    """Return g/ml density. From ingredient.density if set, else from name lookup."""
    if not ingredient:
        return None
    explicit = ingredient.get("density_g_per_ml")
    if explicit and explicit > 0:
        return float(explicit)
    name = (ingredient.get("name") or "").lower()
    for key, density in DEFAULT_DENSITIES.items():
        if key in name:
            return density
    return None


def _pack_size_for(unit: str, ingredient: Optional[dict]) -> Optional[float]:
    """Resolve a custom pack unit (caja, saco, etc.) using ingredient.pack_size."""
    if not ingredient:
        return None
    u = normalize_unit(unit)
    pack_unit = normalize_unit(ingredient.get("pack_unit") or "")
    pack_size = ingredient.get("pack_size") or 0
    if u == pack_unit and pack_size and pack_size > 0:
        return float(pack_size)
    return None


def convert(quantity: float, from_unit: str, to_unit: str, ingredient: Optional[dict] = None) -> Optional[float]:
    """
    Convert a quantity from one unit to another.
    Returns None if conversion is not possible.

    Strategy:
    - Same kind (weight↔weight, volume↔volume, count↔count) → direct factor
    - Cross kind (weight↔volume) → use density of the ingredient
    - Pack unit (caja, saco) → use ingredient.pack_size if pack_unit matches
    """
    if quantity is None:
        return None
    from_u = normalize_unit(from_unit)
    to_u = normalize_unit(to_unit)
    if from_u == to_u:
        return float(quantity)

    from_kind = unit_kind(from_u)
    to_kind = unit_kind(to_u)

    # If from_unit is a pack unit defined on the ingredient, expand to base first
    pack_factor_from = _pack_size_for(from_u, ingredient)
    pack_factor_to = _pack_size_for(to_u, ingredient)

    if pack_factor_from is not None:
        # 1 caja = pack_size base_units (base_unit set on ingredient)
        base_qty = quantity * pack_factor_from
        return convert(base_qty, normalize_unit(ingredient.get("base_unit") or ""), to_u, ingredient)
    if pack_factor_to is not None:
        base_unit = normalize_unit(ingredient.get("base_unit") or "")
        if not base_unit:
            return None
        base_qty = convert(quantity, from_u, base_unit, ingredient)
        if base_qty is None:
            return None
        return base_qty / pack_factor_to

    if from_kind == to_kind and from_kind in ("weight", "volume", "count"):
        units_map = {"weight": WEIGHT_UNITS, "volume": VOLUME_UNITS, "count": COUNT_UNITS}[from_kind]
        if units_map.get(from_u) is None or units_map.get(to_u) is None:
            return None
        return quantity * units_map[from_u] / units_map[to_u]

    # Cross-kind conversion needs density (only weight↔volume)
    if (from_kind == "weight" and to_kind == "volume") or (from_kind == "volume" and to_kind == "weight"):
        density = detect_density(ingredient)
        if density is None or density <= 0:
            return None
        # First normalize to base of from_kind
        if from_kind == "weight":
            grams = quantity * WEIGHT_UNITS[from_u]
            ml = grams / density
            return ml / VOLUME_UNITS[to_u]
        else:
            ml = quantity * VOLUME_UNITS[from_u]
            grams = ml * density
            return grams / WEIGHT_UNITS[to_u]

    return None


def is_compatible(unit_a: str, unit_b: str, ingredient: Optional[dict] = None) -> bool:
    """Returns True if a conversion from unit_a → unit_b is possible for this ingredient."""
    return convert(1.0, unit_a, unit_b, ingredient) is not None


def cost_for_recipe_line(quantity: float, line_unit: str, ingredient: dict) -> float:
    """
    Compute the cost in $ for a recipe line using an ingredient.
    Strategy:
    - Get ingredient base_unit + cost_per_base_unit (the canonical pricing axis)
    - Convert line quantity → base_unit
    - Multiply by cost_per_base_unit
    """
    if not ingredient or quantity is None or quantity == 0:
        return 0.0
    base_unit = normalize_unit(ingredient.get("base_unit") or ingredient.get("unit") or "")
    cost_per_base = ingredient.get("cost_per_base_unit")
    # Backwards-compat: derive from cost_per_unit if not set
    if cost_per_base is None:
        legacy_unit = normalize_unit(ingredient.get("unit") or "")
        legacy_cost = ingredient.get("cost_per_unit") or 0
        if legacy_unit and base_unit:
            # cost_per_base = legacy_cost * (1 base_unit equivalent in legacy_unit)
            converted = convert(1.0, base_unit, legacy_unit, ingredient)
            if converted is not None:
                cost_per_base = legacy_cost * converted
            else:
                cost_per_base = legacy_cost
        else:
            cost_per_base = legacy_cost
    cost_per_base = float(cost_per_base or 0)

    if not base_unit:
        return float(quantity) * cost_per_base

    qty_in_base = convert(quantity, line_unit, base_unit, ingredient)
    if qty_in_base is None:
        # Fall back: assume same unit (best effort, won't surprise the user with $0)
        qty_in_base = float(quantity)
    return qty_in_base * cost_per_base


def derive_base_unit(category: str) -> str:
    """Suggest base_unit from ingredient category."""
    c = (category or "").lower()
    weight_cats = {"protein", "proteins", "meat", "fish", "poultry",
                   "produce", "vegetables", "fruit", "fruits",
                   "dry_goods", "grain", "grains", "flour",
                   "spices", "spice", "especias",
                   "dairy_solid", "cheese"}
    volume_cats = {"liquid", "liquids", "oil", "oils", "vinegar", "vinegars",
                   "beverage", "beverages", "dairy_liquid", "sauces"}
    count_cats = {"egg", "eggs", "packaging", "disposable", "equipment", "event_supply", "supplies"}
    if c in weight_cats or "produce" in c or "dry" in c or "spice" in c or "especia" in c or "protein" in c or "meat" in c:
        return "g"
    if c in volume_cats or "liquid" in c or "oil" in c or "aceite" in c or "vinagre" in c or "beverage" in c or "bebida" in c:
        return "ml"
    if c in count_cats or "package" in c or "disposable" in c or "equipment" in c or "supply" in c or "huevo" in c or "egg" in c:
        return "unit"
    # Default to gram (most common for food)
    return "g"
