"""Legacy unit conversion helpers.

Small table used by recipe/inventory cost logic. `utils.units` has a more
comprehensive engine — this file exists so `convert_units` can be imported
without pulling in server.py.
"""


UNIT_CONVERSIONS = {
    "g": {"kg": 0.001, "oz": 0.035274, "lb": 0.00220462},
    "kg": {"g": 1000, "oz": 35.274, "lb": 2.20462},
    "oz": {"g": 28.3495, "kg": 0.0283495, "lb": 0.0625},
    "lb": {"g": 453.592, "kg": 0.453592, "oz": 16},
    "ml": {"L": 0.001, "oz": 0.033814},
    "L": {"ml": 1000, "oz": 33.814},
    "unit": {"each": 1, "piece": 1},
    "each": {"unit": 1, "piece": 1},
}


def convert_units(quantity: float, from_unit: str, to_unit: str) -> float:
    """Convert quantity from one unit to another. Falls back to identity."""
    if from_unit == to_unit:
        return quantity
    if from_unit in UNIT_CONVERSIONS and to_unit in UNIT_CONVERSIONS.get(from_unit, {}):
        return quantity * UNIT_CONVERSIONS[from_unit][to_unit]
    return quantity  # Return as-is if no conversion found
