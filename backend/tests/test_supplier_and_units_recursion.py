"""
Regression tests for the two supplier/ingredient bugs found Feb 26, 2026:
1. PUT /api/suppliers/{id} rejected partial updates (required all Create fields)
2. utils.units.convert recursed infinitely when pack_unit == base_unit
"""
import pytest
from utils.units import (
    convert, apply_purchase_format, resolve_cost_per_base_unit,
    _pack_size_for, UnitConversionError,
)


# ---------------------------------------------------------------------------
# Bug 2 — infinite recursion when pack_unit == base_unit
# ---------------------------------------------------------------------------

def test_pack_unit_equal_base_unit_no_recursion():
    """If a legacy ingredient has pack_unit==base_unit (nonsense config), the
    unit converter must NOT recurse indefinitely — it should either resolve
    the conversion or fail explicitly."""
    ing = {
        "name": "Legacy Item",
        "unit": "kg",
        "base_unit": "kg",
        "pack_unit": "kg",     # ← historically triggered infinite recursion
        "pack_size": 25,
    }
    # Any convert path through this ingredient should terminate.
    # kg → g (bridge weight)
    assert convert(1, "kg", "g", ing) == 1000
    # kg → kg (same unit, trivial)
    assert convert(2, "kg", "kg", ing) == 2

def test_pack_size_for_returns_none_when_pack_unit_equals_base():
    """The guard now returns None instead of the pack_size to break the loop."""
    ing = {"pack_unit": "unit", "base_unit": "unit", "pack_size": 12}
    assert _pack_size_for("unit", ing) is None

def test_apply_purchase_format_with_pack_unit_equal_base_no_crash():
    """apply_purchase_format used to recurse until stack overflow whenever
    resolve_cost_per_base_unit called convert() on a bad legacy config.
    Verify it completes cleanly regardless of the outcome."""
    ing = {
        "name": "Legacy Corrupt",
        "purchase_cost": 100.0,
        "purchase_quantity_per_unit": 5.0,
        "purchase_unit": "kg",
        "base_unit": "kg",
        "pack_unit": "kg",
        "pack_size": 5,
    }
    apply_purchase_format(ing)
    # purchase_unit == base_unit → simple divide
    assert ing["cost_per_base_unit"] == 20.0  # 100 / 5


# ---------------------------------------------------------------------------
# Bug 1 — supplier PUT accepted partial updates
# ---------------------------------------------------------------------------

def test_supplier_update_body_whitelist():
    """The PUT endpoint whitelists updates against SupplierCreate fields.
    This test asserts the whitelist contains the fields the FE actually sends."""
    from models.suppliers import SupplierCreate
    fields = set(SupplierCreate.model_fields.keys())
    # The FE sends at least these on partial edits
    assert "phone" in fields
    assert "name" in fields
    assert "email" in fields
    assert "payment_terms" in fields
    assert "notes" in fields
