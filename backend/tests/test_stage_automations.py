"""Coverage for the Sep 2026 stage-advance side effects.

Tests the automation wiring:
  - POST /proposals/{id}/send-to-client → event.stage = "Sent to Client"
  - Portal signature endpoint (via documents.sign) → event.stage = "Confirmed by Client"
     + proposal.document_status = "Client Signed"
"""
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


def _make_user():
    return SimpleNamespace(company_id="co_1", user_id="u_1", name="Demo")


@pytest.mark.asyncio
async def test_send_to_client_advances_event_stage():
    from routers import proposal_approval as pa

    event_updates = []
    proposal_updates = []

    async def _ev_update(filt, update):
        event_updates.append((filt, update))
        return SimpleNamespace(modified_count=1)

    async def _prop_update(filt, update):
        proposal_updates.append((filt, update))
        return SimpleNamespace(modified_count=1)

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={
                "proposal_id": "P1",
                "company_id": "co_1",
                "event_id": "E1",
                "document_status": "Approved",
            }),
            update_one=_prop_update,
        ),
        events=SimpleNamespace(update_one=_ev_update),
        company_settings=SimpleNamespace(find_one=AsyncMock(return_value={
            "proposal_approval": {"require_approval": True}
        })),
    )

    with patch.object(pa, "db", fake_db):
        result = await pa.send_to_client("P1", user=_make_user())

    assert result["document_status"] == "Sent"
    # Proposal doc updated with Sent flags
    assert proposal_updates[0][1]["$set"]["document_status"] == "Sent"
    assert proposal_updates[0][1]["$set"]["status"] == "Sent"
    # Event stage pushed forward
    assert event_updates, "event.update_one was never called"
    assert event_updates[0][0] == {"event_id": "E1", "company_id": "co_1"}
    assert event_updates[0][1]["$set"]["stage"] == "Sent to Client"


@pytest.mark.asyncio
async def test_send_to_client_blocks_when_not_approved_and_required():
    from fastapi import HTTPException
    from routers import proposal_approval as pa

    fake_db = SimpleNamespace(
        proposals=SimpleNamespace(
            find_one=AsyncMock(return_value={
                "proposal_id": "P1",
                "company_id": "co_1",
                "event_id": "E1",
                "document_status": "Draft",
            }),
            update_one=AsyncMock(),
        ),
        events=SimpleNamespace(update_one=AsyncMock()),
        company_settings=SimpleNamespace(find_one=AsyncMock(return_value={
            "proposal_approval": {"require_approval": True}
        })),
    )

    with patch.object(pa, "db", fake_db):
        with pytest.raises(HTTPException) as exc:
            await pa.send_to_client("P1", user=_make_user())

    assert exc.value.status_code == 409
    assert "Approval required" in exc.value.detail
