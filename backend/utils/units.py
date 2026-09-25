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


class UnitConversionError(ValueError):
    """
    Raised when a conversion cannot be resolved (unknown unit, missing
    density for weight↔volume, missing weight_per_unit_g for count↔weight,
    etc.). Callers MUST catch this and surface a visible error to the user
    instead of silently falling back to $0.
    """
    def __init__(self, from_unit: str, to_unit: str, reason: str,
                 ingredient_name: str = ""):
        self.from_unit = from_unit
        self.to_unit = to_unit
        self.reason = reason
        self.ingredient_name = ingredient_name
        super().__init__(
            f"Cannot convert {from_unit!r} → {to_unit!r} "
            f"for {ingredient_name or 'ingredient'}: {reason}",
        )

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

    Semantics:
    - If either unit is empty/None → returns None (soft-skip, caller decides).
    - If conversion is IMPOSSIBLE (unknown unit, missing density,
      missing weight_per_unit_g, dimension mismatch without bridge)
      → raises UnitConversionError. Callers must handle this — never
      silently produce $0 costs.

    Bridges supported:
    - weight↔weight, volume↔volume, count↔count → direct factors
    - weight↔volume → ingredient.density_g_per_ml (explicit) OR legacy
      DEFAULT_DENSITIES name whitelist (fallback only, deprecated as
      source of truth — logs a warning).
    - count↔weight → ingredient.weight_per_unit_g (explicit).
    - pack unit (caja, saco, etc.) → ingredient.pack_size + pack_unit.
    """
    if quantity is None or from_unit is None or to_unit is None:
        return None
    from_u = normalize_unit(from_unit)
    to_u = normalize_unit(to_unit)
    if not from_u or not to_u:
        return None
    if from_u == to_u:
        return float(quantity)

    ing_name = (ingredient or {}).get("name", "") if ingredient else ""

    from_kind = unit_kind(from_u)
    to_kind = unit_kind(to_u)

    # Pack unit resolution first
    pack_factor_from = _pack_size_for(from_u, ingredient)
    pack_factor_to = _pack_size_for(to_u, ingredient)
    if pack_factor_from is not None:
        base_qty = quantity * pack_factor_from
        return convert(base_qty, normalize_unit((ingredient or {}).get("base_unit") or ""), to_u, ingredient)
    if pack_factor_to is not None:
        base_unit = normalize_unit((ingredient or {}).get("base_unit") or "")
        if not base_unit:
            raise UnitConversionError(from_unit, to_unit,
                "pack unit target requires ingredient.base_unit", ing_name)
        base_qty = convert(quantity, from_u, base_unit, ingredient)
        return base_qty / pack_factor_to  # base_qty raised if impossible

    # Unknown unit on either side → explicit
    if from_kind is None:
        raise UnitConversionError(from_unit, to_unit,
            f"unknown unit {from_unit!r}", ing_name)
    if to_kind is None:
        raise UnitConversionError(from_unit, to_unit,
            f"unknown unit {to_unit!r}", ing_name)

    # Same-dimension conversion
    if from_kind == to_kind and from_kind in ("weight", "volume", "count"):
        units_map = {"weight": WEIGHT_UNITS, "volume": VOLUME_UNITS, "count": COUNT_UNITS}[from_kind]
        f_from = units_map.get(from_u)
        f_to = units_map.get(to_u)
        if f_from is None or f_to is None:
            raise UnitConversionError(from_unit, to_unit,
                f"custom {from_kind} unit not defined on ingredient", ing_name)
        return quantity * f_from / f_to

    # weight ↔ volume via density
    if {from_kind, to_kind} == {"weight", "volume"}:
        density = detect_density(ingredient)
        if density is None or density <= 0:
            raise UnitConversionError(from_unit, to_unit,
                "missing density_g_per_ml (set it explicitly on the ingredient)",
                ing_name)
        if from_kind == "weight":
            grams = quantity * WEIGHT_UNITS[from_u]
            ml = grams / density
            return ml / VOLUME_UNITS[to_u]
        else:
            ml = quantity * VOLUME_UNITS[from_u]
            grams = ml * density
            return grams / WEIGHT_UNITS[to_u]

    # count ↔ weight via weight_per_unit_g
    if {from_kind, to_kind} == {"count", "weight"}:
        wpu = None
        if ingredient:
            wpu = ingredient.get("weight_per_unit_g") or ingredient.get("weight_per_unit")
        if not wpu or float(wpu) <= 0:
            raise UnitConversionError(from_unit, to_unit,
                "missing weight_per_unit_g (set the average weight per unit)",
                ing_name)
        wpu = float(wpu)
        # Some count units (case, box, pack) have factor=None because they
        # depend on the ingredient's pack_size. If the caller has arrived here
        # without going through the pack-unit fast path, we cannot resolve.
        from_factor = COUNT_UNITS.get(from_u) if from_kind == "count" else WEIGHT_UNITS.get(from_u)
        to_factor = COUNT_UNITS.get(to_u) if to_kind == "count" else WEIGHT_UNITS.get(to_u)
        if from_factor is None or to_factor is None:
            raise UnitConversionError(from_unit, to_unit,
                f"custom pack unit requires pack_size + pack_unit on ingredient",
                ing_name)
        if from_kind == "count":
            grams = quantity * from_factor * wpu
            return grams / to_factor
        else:
            grams = quantity * from_factor
            count = grams / wpu
            return count / to_factor

    # count ↔ volume: not supported (would need density AND weight_per_unit_g)
    raise UnitConversionError(from_unit, to_unit,
        f"no bridge between {from_kind} and {to_kind} for this ingredient",
        ing_name)


def is_compatible(unit_a: str, unit_b: str, ingredient: Optional[dict] = None) -> bool:
    """Returns True if a conversion from unit_a → unit_b is possible for this ingredient."""
    try:
        return convert(1.0, unit_a, unit_b, ingredient) is not None
    except UnitConversionError:
        return False


def cost_for_recipe_line(quantity: float, line_unit: str, ingredient: dict) -> float:
    """
    Compute the cost in $ for a recipe line using an ingredient.

    Raises `UnitConversionError` when the requested `line_unit` cannot be
    converted to the ingredient's `base_unit`. Callers MUST catch this and
    surface a visible error to the user — never fall back silently to $0.
    """
    if not ingredient or quantity is None or quantity == 0:
        return 0.0
    # PASE A: if the ingredient has not yet been given a complete Purchase
    # Format & Price, refuse to compute a cost with ambiguous legacy data —
    # surface it through the same "Costo incompleto" pipeline used for unit
    # conversion failures. Callers already handle UnitConversionError.
    if ingredient.get("purchase_incomplete"):
        raise UnitConversionError(
            line_unit or "?", (ingredient.get("base_unit") or ingredient.get("unit") or "?"),
            "purchase format incomplete (falta capturar formato/cantidad/total de compra)",
            ingredient.get("name") or "",
        )
    base_unit = normalize_unit(ingredient.get("base_unit") or ingredient.get("unit") or "")
    cost_per_base = ingredient.get("cost_per_base_unit")
    if cost_per_base is None or cost_per_base == 0:
        legacy_unit = normalize_unit(ingredient.get("unit") or "")
        legacy_cost = ingredient.get("cost_per_unit") or 0
        if legacy_unit and base_unit:
            try:
                converted = convert(1.0, base_unit, legacy_unit, ingredient)
                cost_per_base = legacy_cost * converted if converted is not None else legacy_cost
            except UnitConversionError:
                cost_per_base = legacy_cost
        else:
            cost_per_base = legacy_cost
    cost_per_base = float(cost_per_base or 0)

    if not base_unit or normalize_unit(line_unit) == base_unit:
        return float(quantity) * cost_per_base

    qty_in_base = convert(quantity, line_unit, base_unit, ingredient)
    if qty_in_base is None:
        # Both units resolved but conversion returned None with no exception
        # (happens only when either side was empty; treated as same unit).
        return float(quantity) * cost_per_base
    return qty_in_base * cost_per_base


def resolve_cost_per_base_unit(ingredient: dict) -> Optional[float]:
    """
    Compute the cost per single unit of the ingredient's `base_unit` (g / ml /
    unit) using the CANONICAL formula:

        cost_per_base_unit = purchase_cost / (purchase_quantity_per_unit
                                              expressed in base_unit)

    Example — a 2.27 kg flour bag bought at RD$175:
        purchase_cost                = 175
        purchase_unit                = "kg"
        purchase_quantity_per_unit   = 2.27
        base_unit                    = "g"
        → normalized 2.27 kg = 2270 g
        → cost_per_base_unit = 175 / 2270 = 0.07709 RD$/g

    Returns None when any required field is missing OR when the purchase unit
    cannot be converted to the base_unit (e.g. "case" without pack_size). In
    those cases the caller MUST mark the ingredient as `purchase_incomplete`
    so downstream recipe costing shows "Costo incompleto" instead of a
    hallucinated number.

    NEVER falls back to `purchase_cost` alone — that would recreate the exact
    "$175 per gram" bug we are fixing.
    """
    if not ingredient:
        return None
    purchase_cost = ingredient.get("purchase_cost")
    purchase_qty = ingredient.get("purchase_quantity_per_unit")
    purchase_unit = normalize_unit(ingredient.get("purchase_unit") or "")
    base_unit = normalize_unit(ingredient.get("base_unit") or ingredient.get("unit") or "")
    if purchase_cost is None or purchase_qty is None:
        return None
    try:
        purchase_cost = float(purchase_cost)
        purchase_qty = float(purchase_qty)
    except (TypeError, ValueError):
        return None
    if purchase_cost <= 0 or purchase_qty <= 0 or not base_unit:
        return None
    # If purchase_unit is empty, assume purchase_qty is already in base_unit.
    if not purchase_unit:
        return round(purchase_cost / purchase_qty, 8)
    if purchase_unit == base_unit:
        return round(purchase_cost / purchase_qty, 8)
    # Convert 1 purchase_unit → base_unit. That gives us "how many base units
    # in one purchase unit"; total base units in the pack = purchase_qty *
    # that factor.
    try:
        base_units_per_purchase_unit = convert(1.0, purchase_unit, base_unit, ingredient)
    except UnitConversionError:
        return None
    if base_units_per_purchase_unit is None or base_units_per_purchase_unit <= 0:
        return None
    total_base_units = purchase_qty * base_units_per_purchase_unit
    if total_base_units <= 0:
        return None
    return round(purchase_cost / total_base_units, 8)


def apply_purchase_format(ingredient: dict) -> dict:
    """
    Mutates `ingredient` in place: recomputes `cost_per_base_unit` from the
    (purchase_cost, purchase_qty, purchase_unit) tuple whenever the tuple is
    complete, and flips `purchase_incomplete` accordingly.

    Returns the same dict for chaining. This is the ONLY place in the codebase
    that should own the "how do I know a purchase format is complete" rule —
    call it from every ingredient create/update path.
    """
    cost_per_base = resolve_cost_per_base_unit(ingredient)
    has_purchase_bundle = all(
        ingredient.get(k) not in (None, "", 0) for k in
        ("purchase_cost", "purchase_quantity_per_unit", "purchase_unit")
    )
    if cost_per_base is not None:
        ingredient["cost_per_base_unit"] = cost_per_base
        ingredient["purchase_incomplete"] = False
    elif has_purchase_bundle:
        # User provided all 3 fields but the conversion still failed
        # (e.g. purchase_unit = "case" without pack_size). Keep the flag.
        ingredient["cost_per_base_unit"] = None
        ingredient["purchase_incomplete"] = True
    else:
        # Legacy ingredient with just cost_per_unit + unit — respect the
        # existing cost_per_base_unit only when it was derived correctly
        # (base_unit == unit). Otherwise flag as incomplete.
        base_unit = normalize_unit(ingredient.get("base_unit") or "")
        legacy_unit = normalize_unit(ingredient.get("unit") or "")
        legacy_cost = ingredient.get("cost_per_unit")
        if legacy_cost and base_unit and legacy_unit == base_unit:
            ingredient.setdefault("cost_per_base_unit", float(legacy_cost))
            ingredient["purchase_incomplete"] = False
        else:
            ingredient["cost_per_base_unit"] = None
            ingredient["purchase_incomplete"] = True
    return ingredient


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
