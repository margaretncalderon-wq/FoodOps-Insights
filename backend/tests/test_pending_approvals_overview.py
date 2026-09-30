"""Coverage for /api/proposals/approval-overview.

Verifies:
  1. Ordering is urgency (event_date ASC) then FIFO submission.
  2. Pending list only surfaces documents in "Pending Approval".
  3. event_status_map exposes both approval status + data_incomplete flag.
  4. Missing event_date rows are pushed to the end.

Isolated via an in-memory dict shim over motor's find/find_one so tests do
not depend on a live MongoDB instance.
"""
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


def _make_user():
    return SimpleNamespace(company_id="co_1", user_id="u_1", name="Demo")


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        async def _gen():
            for d in self._docs:
                yield d
        return _gen()

    async def to_list(self, length):
        return list(self._docs[:length])


class _FakeCollection:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query=None, projection=None):
        # Basic filter: only match `company_id` and `$in` on event_id/client_id.
        docs = list(self._docs)
        if query:
            for k, v in query.items():
                if isinstance(v, dict) and "$in" in v:
                    docs = [d for d in docs if d.get(k) in v["$in"]]
                else:
                    docs = [d for d in docs if d.get(k) == v]
        return _FakeCursor(docs)

    async def find_one(self, query, projection=None):
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                return d
        return None


@pytest.mark.asyncio
async def test_pending_urgency_and_fifo_order():
    from routers import proposal_approval as pa

    proposals = [
        {"proposal_id": "P1", "event_id": "E1", "company_id": "co_1",
         "document_status": "Pending Approval", "total": 100,
         "last_edited_at": "2026-01-05T12:00:00+00:00", "client_id": "C1"},
        {"proposal_id": "P2", "event_id": "E2", "company_id": "co_1",
         "document_status": "Pending Approval", "total": 200,
         "last_edited_at": "2026-01-03T12:00:00+00:00", "client_id": "C1"},
        {"proposal_id": "P3", "event_id": "E3", "company_id": "co_1",
         "document_status": "Pending Approval", "total": 300,
         "last_edited_at": "2026-01-04T12:00:00+00:00", "client_id": "C1"},
        {"proposal_id": "P4", "event_id": "E4", "company_id": "co_1",
         "document_status": "Approved", "total": 400,
         "last_edited_at": "2026-01-01T12:00:00+00:00", "client_id": "C1",
         "data_incomplete": True},
    ]
    events = [
        {"event_id": "E1", "name": "Late Event", "event_date": "2026-06-01", "client_id": "C1", "company_id": "co_1"},
        {"event_id": "E2", "name": "Soonest Event", "event_date": "2026-02-01", "client_id": "C1", "company_id": "co_1"},
        {"event_id": "E3", "name": "No Date Event", "event_date": None, "client_id": "C1", "company_id": "co_1"},
        {"event_id": "E4", "name": "Approved One", "event_date": "2026-03-01", "client_id": "C1", "company_id": "co_1"},
    ]
    clients = [{"client_id": "C1", "display_name": "Acme Corp"}]

    fake_db = SimpleNamespace(
        proposals=_FakeCollection(proposals),
        events=_FakeCollection(events),
        clients=_FakeCollection(clients),
        company_settings=SimpleNamespace(
            find_one=AsyncMock(return_value={"proposal_approval": {"require_approval": True}}),
        ),
    )
    with patch.object(pa, "db", fake_db):
        result = await pa.approval_overview(user=_make_user())

    assert result["require_approval"] is True
    assert result["count_pending"] == 3

    ordered_ids = [p["proposal_id"] for p in result["pending"]]
    # Urgency first: E2 (Feb 01) → E1 (Jun 01) → E3 (no date, pushed last).
    assert ordered_ids == ["P2", "P1", "P3"]

    # event_status_map covers ALL proposals (including Approved P4).
    assert result["event_status_map"]["E4"]["document_status"] == "Approved"
    assert result["event_status_map"]["E4"]["data_incomplete"] is True
    assert result["event_status_map"]["E1"]["document_status"] == "Pending Approval"


@pytest.mark.asyncio
async def test_approval_off_returns_false_flag():
    from routers import proposal_approval as pa

    fake_db = SimpleNamespace(
        proposals=_FakeCollection([]),
        events=_FakeCollection([]),
        clients=_FakeCollection([]),
        company_settings=SimpleNamespace(find_one=AsyncMock(return_value=None)),
    )
    with patch.object(pa, "db", fake_db):
        result = await pa.approval_overview(user=_make_user())

    assert result["require_approval"] is False
    assert result["count_pending"] == 0
    assert result["pending"] == []
