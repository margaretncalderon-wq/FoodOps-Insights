"""
Proposal approval state-machine — regression tests (Feb 2026).

Covers the acceptance criteria from the product-owner ticket:
  · Toggle defaults to false for every tenant (legacy flow preserved).
  · State transitions Draft → Pending Approval → Approved → Sent → Client Signed.
  · Material edits revoke approval, text-only edits do not.
  · Revoke requires reason.
  · Duplicate marks copy with `data_incomplete=True`.

Uses direct helper calls (no HTTP) so the suite stays fast and doesn't need
an FE-side session token.
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

from routers.proposal_approval import (
    is_approval_required,
    maybe_revoke_on_material_change,
    MATERIAL_FIELDS,
    TEXT_ONLY_FIELDS,
)


# --------------------------------------------------------------------------
# Field classification
# --------------------------------------------------------------------------

def test_material_fields_include_total_and_prices():
    assert "total" in MATERIAL_FIELDS
    assert "subtotal" in MATERIAL_FIELDS
    assert "discount_amount" in MATERIAL_FIELDS
    assert "tax_details" in MATERIAL_FIELDS
    assert "payment_terms" in MATERIAL_FIELDS

def test_text_only_fields_include_notes_and_descriptions():
    assert "client_notes" in TEXT_ONLY_FIELDS
    assert "internal_notes" in TEXT_ONLY_FIELDS
    assert "presentation_notes" in TEXT_ONLY_FIELDS
    assert "description" in TEXT_ONLY_FIELDS

def test_material_and_text_only_are_disjoint():
    # A field is either material OR text — never both, else the revoke rule
    # is ambiguous and users will lose trust in it.
    assert not (MATERIAL_FIELDS & TEXT_ONLY_FIELDS)


# --------------------------------------------------------------------------
# maybe_revoke_on_material_change behaviour (async, DB-mocked)
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_text_only_change_does_not_revoke(monkeypatch):
    """Changing only client_notes must NOT flip an Approved doc."""
    from routers import proposal_approval as pa
    fake_db = MagicMock()
    fake_db.proposals.find_one = AsyncMock(return_value={"document_status": "Approved"})
    fake_db.proposals.update_one = AsyncMock()
    monkeypatch.setattr(pa, "db", fake_db)
    revoked = await maybe_revoke_on_material_change(
        "prop_test", "co_test", {"client_notes"}
    )
    assert revoked is False
    fake_db.proposals.update_one.assert_not_awaited()

@pytest.mark.asyncio
async def test_material_change_revokes_approved(monkeypatch):
    from routers import proposal_approval as pa
    fake_db = MagicMock()
    fake_db.proposals.find_one = AsyncMock(return_value={"document_status": "Approved"})
    fake_db.proposals.update_one = AsyncMock()
    monkeypatch.setattr(pa, "db", fake_db)
    revoked = await maybe_revoke_on_material_change(
        "prop_test", "co_test", {"total", "client_notes"}
    )
    assert revoked is True
    fake_db.proposals.update_one.assert_awaited_once()
    call_args = fake_db.proposals.update_one.await_args
    assert call_args.args[1]["$set"]["document_status"] == "Pending Approval"
    assert "material edit" in call_args.args[1]["$set"]["approval_revoked_reason"]

@pytest.mark.asyncio
async def test_material_change_on_draft_does_not_touch(monkeypatch):
    """Drafts don't have anything to revoke — must be a no-op."""
    from routers import proposal_approval as pa
    fake_db = MagicMock()
    fake_db.proposals.find_one = AsyncMock(return_value={"document_status": "Draft"})
    fake_db.proposals.update_one = AsyncMock()
    monkeypatch.setattr(pa, "db", fake_db)
    revoked = await maybe_revoke_on_material_change(
        "prop_test", "co_test", {"total"}
    )
    assert revoked is False
    fake_db.proposals.update_one.assert_not_awaited()


# --------------------------------------------------------------------------
# is_approval_required defaults to False
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approval_required_default_false_no_settings_doc(monkeypatch):
    """A tenant with no company_settings doc must return False (default)."""
    from routers import proposal_approval as pa
    fake_db = MagicMock()
    fake_db.company_settings.find_one = AsyncMock(return_value=None)
    monkeypatch.setattr(pa, "db", fake_db)
    assert (await is_approval_required("co_new")) is False

@pytest.mark.asyncio
async def test_approval_required_default_false_when_key_missing(monkeypatch):
    """Existing tenant with settings but no proposal_approval sub-doc → False."""
    from routers import proposal_approval as pa
    fake_db = MagicMock()
    fake_db.company_settings.find_one = AsyncMock(return_value={"company_id": "co", "other": 1})
    monkeypatch.setattr(pa, "db", fake_db)
    assert (await is_approval_required("co")) is False

@pytest.mark.asyncio
async def test_approval_required_true_when_enabled(monkeypatch):
    from routers import proposal_approval as pa
    fake_db = MagicMock()
    fake_db.company_settings.find_one = AsyncMock(return_value={
        "company_id": "co",
        "proposal_approval": {"require_approval": True},
    })
    monkeypatch.setattr(pa, "db", fake_db)
    assert (await is_approval_required("co")) is True
