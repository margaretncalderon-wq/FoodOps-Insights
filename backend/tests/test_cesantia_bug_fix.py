"""Regression tests for the cesantía / preaviso day-count bug.

Before the fix, `calculate_cesantia_days` computed `int(years_worked *
days_per_year)` for the 6-12 month bracket, which returned 10 days for a
9.9-month tenure (Agustina Reyes case) — should be a FLAT 13 days per Art.
80.2 of the Dominican Labor Code.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.people_ops import (  # noqa: E402
    calculate_cesantia_days,
    calculate_preaviso_days,
    calculate_liquidation_rd,
    TerminationType,
)


def test_preaviso_under_3_months_is_zero():
    assert calculate_preaviso_days(0) == 0
    assert calculate_preaviso_days(2.9) == 0


def test_preaviso_brackets_match_law():
    assert calculate_preaviso_days(3) == 7      # Art. 76.1
    assert calculate_preaviso_days(5.99) == 7
    assert calculate_preaviso_days(6) == 14     # Art. 76.2
    assert calculate_preaviso_days(11.99) == 14
    assert calculate_preaviso_days(12) == 28    # Art. 76.3
    assert calculate_preaviso_days(120) == 28


def test_cesantia_under_3_months_is_zero():
    assert calculate_cesantia_days(0) == 0
    assert calculate_cesantia_days(2.9) == 0


def test_cesantia_3_to_6_months_flat_6_days():
    assert calculate_cesantia_days(3) == 6
    assert calculate_cesantia_days(5.99) == 6


def test_cesantia_6_to_12_months_flat_13_days():
    """The specific bug: was returning `int(years * 13)` — 9.9 months → 10 days.
    Now must return a flat 13 for all values in [6, 12)."""
    assert calculate_cesantia_days(6) == 13
    assert calculate_cesantia_days(9.9) == 13
    assert calculate_cesantia_days(11.99) == 13


def test_cesantia_1_to_5_years_progressive():
    # ceil(1)*21 = 21
    assert calculate_cesantia_days(12) == 21
    # ceil(1.5)*21 = 42
    assert calculate_cesantia_days(18) == 42
    # ceil(2)*21 = 42
    assert calculate_cesantia_days(24) == 42
    # ceil(3.5)*21 = 84
    assert calculate_cesantia_days(42) == 84


def test_cesantia_5_plus_years_23_days_per_year():
    # ceil(5)*23 = 115
    assert calculate_cesantia_days(60) == 115
    # ceil(8)*23 = 184
    assert calculate_cesantia_days(96) == 184


def test_agustina_reyes_scenario_matches_ministry():
    """End-to-end test: Agustina Reyes case documented against Ministerio.

    Salary: RD$20,000; Hire: 2025-09-01; Term: 2026-06-30; Desahucio.
    Ministerio expected: RD$41,946.34. Kora accepts ±$100 due to regalía
    being prorated by integer months (6) vs Ministerio using days (6.033).
    """
    result = calculate_liquidation_rd(
        termination_type=TerminationType.DISMISSAL_UNJUSTIFIED,
        hire_date="2025-09-01",
        termination_date="2026-06-30",
        base_salary=20000,
        vacation_days_owed=11,
        regalia_months_worked=6,
    )
    assert result["preaviso_days"] == 14
    assert round(result["preaviso_amount"], 2) == 11749.90
    assert result["cesantia_days"] == 13
    assert round(result["cesantia_amount"], 2) == 10910.62
    assert round(result["vacation_amount"], 2) == 9232.06
    assert result["regalia_proportion"] == 10000.0
    # Total should be within $100 of Ministry's calculation
    assert abs(result["gross_liquidation"] - 41946.34) < 100
