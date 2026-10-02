"""Integration-level coverage for the auto-revoke wiring.

Simulates: proposal is in Approved → user edits item/discount/tax →
document_status rolls back to Pending Approval with the auto reason."""
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_auto_revoke_fires_on_item_crud_sentinels():
    from routers import proposal_approval as pa

    captured = {}
    async def _update_one(filt, update):
        captured.setdefault("calls", []).append(update)
        return SimpleNamespace(modified_count=1)

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={"document_status": "Approved"}),
            update_one=_update_one,
        ),
    )
    with patch.object(pa, "db", fake_db):
        # Each of these sentinels represents a different write path.
        for sentinel in ("item_added", "item_removed", "item_bulk_import", "day_duplicated"):
            captured.clear()
            revoked = await pa.maybe_revoke_on_material_change(
                "P1", "co_1", {sentinel}
            )
            assert revoked is True, f"{sentinel} failed to revoke"
            update = captured["calls"][0]["$set"]
            assert update["document_status"] == "Pending Approval"
            assert "auto" in update["approval_revoked_reason"]


@pytest.mark.asyncio
async def test_auto_revoke_fires_on_financials_fields():
    from routers import proposal_approval as pa

    captured = {}
    async def _update_one(filt, update):
        captured["update"] = update
        return SimpleNamespace(modified_count=1)

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={"document_status": "Approved"}),
            update_one=_update_one,
        ),
    )
    with patch.object(pa, "db", fake_db):
        # discount/tax/payment_terms are all material.
        for fld in ("discount_value", "discount_type", "tax_details", "payment_terms"):
            captured.clear()
            revoked = await pa.maybe_revoke_on_material_change(
                "P1", "co_1", {fld}
            )
            assert revoked is True, f"{fld} should revoke"


@pytest.mark.asyncio
async def test_text_only_keys_still_pass_through():
    from routers import proposal_approval as pa

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={"document_status": "Approved"}),
            update_one=AsyncMock(),
        ),
    )
    with patch.object(pa, "db", fake_db):
        for fld in ("client_notes", "internal_notes", "presentation_notes"):
            revoked = await pa.maybe_revoke_on_material_change(
                "P1", "co_1", {fld}
            )
            assert revoked is False, f"{fld} should NOT revoke"
