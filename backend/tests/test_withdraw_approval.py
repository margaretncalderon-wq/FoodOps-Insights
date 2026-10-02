"""Coverage for POST /api/proposals/{id}/withdraw-approval.

Transitions tested:
  Pending Approval → Draft (ok, stamps withdrawn_by + withdrawn_at)
  Draft → 409 (nothing to withdraw)
  Approved → 409 (use /revoke-approval instead)
  missing proposal → 404
"""
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException


def _make_user():
    return SimpleNamespace(company_id="co_1", user_id="u_1", name="Demo")


@pytest.mark.asyncio
async def test_withdraw_from_pending_moves_to_draft_and_stamps_audit():
    from routers import proposal_approval as pa

    captured = {}
    async def _update_one(filt, update):
        captured["filter"] = filt
        captured["update"] = update
        return SimpleNamespace(modified_count=1)

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={
                "proposal_id": "P1",
                "company_id": "co_1",
                "document_status": "Pending Approval",
            }),
            update_one=_update_one,
        ),
    )
    with patch.object(pa, "db", fake_db):
        result = await pa.withdraw_approval("P1", user=_make_user())

    assert result["document_status"] == "Draft"
    assert result["withdrawn_by"]["user_id"] == "u_1"
    assert result["withdrawn_by"]["name"] == "Demo"
    # Audit fields written to Mongo
    update_set = captured["update"]["$set"]
    assert update_set["document_status"] == "Draft"
    assert "withdrawn_by" in update_set
    assert "withdrawn_at" in update_set


@pytest.mark.asyncio
async def test_withdraw_blocked_from_draft():
    from routers import proposal_approval as pa

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={
                "proposal_id": "P1",
                "company_id": "co_1",
                "document_status": "Draft",
            }),
            update_one=AsyncMock(),
        ),
    )
    with patch.object(pa, "db", fake_db):
        with pytest.raises(HTTPException) as exc:
            await pa.withdraw_approval("P1", user=_make_user())
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_withdraw_blocked_from_approved():
    from routers import proposal_approval as pa

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={
                "proposal_id": "P1",
                "company_id": "co_1",
                "document_status": "Approved",
            }),
            update_one=AsyncMock(),
        ),
    )
    with patch.object(pa, "db", fake_db):
        with pytest.raises(HTTPException) as exc:
            await pa.withdraw_approval("P1", user=_make_user())
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_withdraw_404_when_missing():
    from routers import proposal_approval as pa

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value=None),
            update_one=AsyncMock(),
        ),
    )
    with patch.object(pa, "db", fake_db):
        with pytest.raises(HTTPException) as exc:
            await pa.withdraw_approval("missing", user=_make_user())
    assert exc.value.status_code == 404
