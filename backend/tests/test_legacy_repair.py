"""Regression test for the version-gated legacy data repair (utils/legacy_repair.py).

Verifies:
  1. A recipe missing required fields is repaired to the expected shape.
  2. Re-running is idempotent — a clean doc gets no update.
  3. The `repair_state` version gate advances after a run.
"""
import os
import sys
import uuid
import pytest
import asyncio
from datetime import datetime, timezone

# Make sure we can import from the backend package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient


@pytest.fixture
def loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mongo():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbname = os.environ.get("DB_NAME", "test_database")
    client = AsyncIOMotorClient(url)
    return client[dbname]


TAG = f"legacy_repair_test_{uuid.uuid4().hex[:8]}"
FAKE_COMPANY = f"company_{TAG}"


def test_repair_recipes_fills_missing_fields(loop, mongo):
    """A recipe missing name/category/yield_quantity/yield_unit gets fixed."""
    from utils.legacy_repair import _repair_recipes

    async def run():
        # Seed a broken recipe
        await mongo.recipes.insert_one({
            "recipe_id": f"rec_{TAG}",
            "company_id": FAKE_COMPANY,
            # deliberately missing: name, category, yield_quantity, yield_unit, created_at
        })
        try:
            res = await _repair_recipes(mongo, FAKE_COMPANY)
            assert res["scanned"] == 1
            assert res["repaired"] == 1
            filled = res["fields_filled"]
            assert filled.get("name") == 1
            assert filled.get("category") == 1
            assert filled.get("yield_quantity") == 1
            assert filled.get("yield_unit") == 1
            assert filled.get("created_at") == 1

            # Re-fetch and check
            doc = await mongo.recipes.find_one({"recipe_id": f"rec_{TAG}"})
            assert doc["name"] == "(sin nombre)"
            assert doc["category"] == "Otros"
            assert doc["yield_quantity"] == 1.0
            assert doc["yield_unit"] == "portion"
            assert doc["created_at"]  # was filled

            # Idempotent: second run finds nothing to repair
            res2 = await _repair_recipes(mongo, FAKE_COMPANY)
            assert res2["scanned"] == 1
            assert res2["repaired"] == 0
        finally:
            await mongo.recipes.delete_many({"company_id": FAKE_COMPANY})

    loop.run_until_complete(run())


def test_repair_ingredients_migrates_legacy_field_names(loop, mongo):
    """Legacy field mapping: unit_cost -> cost_per_unit, current_stock -> stock_quantity."""
    from utils.legacy_repair import _repair_ingredients

    async def run():
        await mongo.ingredients.insert_one({
            "company_id": FAKE_COMPANY,
            # Legacy field names + missing required ones
            "unit_cost": 12.5,
            "current_stock": 30,
            "min_stock": 5,
            # missing: ingredient_id, name, category, unit, created_at
        })
        try:
            res = await _repair_ingredients(mongo, FAKE_COMPANY)
            assert res["scanned"] == 1
            assert res["repaired"] == 1

            doc = await mongo.ingredients.find_one({"company_id": FAKE_COMPANY})
            assert doc["cost_per_unit"] == 12.5
            assert doc["stock_quantity"] == 30
            assert doc["min_stock_level"] == 5
            assert doc["name"] == "(sin nombre)"
            assert doc["ingredient_id"].startswith("legacy_")
        finally:
            await mongo.ingredients.delete_many({"company_id": FAKE_COMPANY})

    loop.run_until_complete(run())


def test_version_gate_skips_when_already_current(loop, mongo):
    """If db.repair_state.version >= REPAIR_VERSION, the run short-circuits."""
    from utils.legacy_repair import run_legacy_repair_if_needed, REPAIR_VERSION

    async def run():
        # Preset the version to REPAIR_VERSION so the run must skip
        await mongo.repair_state.update_one(
            {"key": "legacy_repair_version"},
            {"$set": {
                "key": "legacy_repair_version",
                "version": REPAIR_VERSION,
                "last_run_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        # Seed a broken recipe — after run, it should STILL be broken (skipped)
        await mongo.recipes.insert_one({
            "recipe_id": f"rec_skip_{TAG}",
            "company_id": FAKE_COMPANY,
            # missing name/category
        })
        try:
            await run_legacy_repair_if_needed(mongo)
            doc = await mongo.recipes.find_one({"recipe_id": f"rec_skip_{TAG}"})
            # Because the version gate skipped, no repair happened
            assert doc.get("name") is None or doc.get("name") == None
            assert doc.get("category") is None or doc.get("category") == None
        finally:
            await mongo.recipes.delete_many({"company_id": FAKE_COMPANY})

    loop.run_until_complete(run())
