"""QA audit tests for the Google Calendar multi-tenant integration.

Locks in the security + isolation guarantees discovered during the audit so
future changes can't regress them silently.
"""
import os
import sys
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers.google_calendar import (  # noqa: E402
    _encrypt_tokens,
    _decrypt_tokens,
    _sanitize_error,
    CALENDAR_SCOPES,
    CALENDAR_CONFIG_COLLECTION,
    CALENDAR_AUDIT_COLLECTION,
)


# ------------------------------------------------------------------
# TEST 2 / 17 — Token encryption at rest
# ------------------------------------------------------------------
def test_tokens_are_encrypted_at_rest():
    plain = {
        "access_token": "ya29.testtoken",
        "refresh_token": "1//testrefresh",
        "expiry": "2030-01-01",
        "scope": "calendar.events",
    }
    enc = _encrypt_tokens(plain)
    assert enc.get("_v") == 1, "encrypted blob must carry a version tag"
    assert "ct" in enc, "encrypted blob must expose only ciphertext"
    # Ciphertext must not contain any plaintext substring
    blob = json.dumps(enc)
    for secret in [plain["access_token"], plain["refresh_token"], "ya29.", "1//test"]:
        assert secret not in blob, f"plaintext leaked in ciphertext: {secret}"


def test_encryption_round_trip():
    plain = {"access_token": "a", "refresh_token": "b"}
    assert _decrypt_tokens(_encrypt_tokens(plain)) == plain


def test_legacy_plaintext_still_readable():
    """Existing tenants connected before the migration keep working."""
    legacy = {"access_token": "old_plain", "refresh_token": "old_ref"}
    assert _decrypt_tokens(legacy) == legacy


# ------------------------------------------------------------------
# TEST 17 / 16 — Error sanitization
# ------------------------------------------------------------------
def test_sanitize_error_redacts_secrets():
    for bad in ["access_token=abc", "refresh_token=xyz", "client_secret=123", "authorization_code=aaa"]:
        assert "[error contained sensitive token" in _sanitize_error(bad)


def test_sanitize_error_truncates_long_messages():
    long_msg = "x" * 5000
    assert len(_sanitize_error(long_msg)) <= 200


def test_sanitize_error_passes_normal_messages():
    assert _sanitize_error("Calendar not found") == "Calendar not found"


# ------------------------------------------------------------------
# TEST 18 — OAuth scopes are the minimum required
# ------------------------------------------------------------------
def test_oauth_scopes_are_minimum():
    """Locks the least-privilege posture. If future work needs a broader
    scope this test intentionally fails so the reviewer must consciously
    widen the surface."""
    assert "https://www.googleapis.com/auth/calendar.events" in CALENDAR_SCOPES
    assert "https://www.googleapis.com/auth/calendar.calendarlist.readonly" in CALENDAR_SCOPES
    assert "https://www.googleapis.com/auth/userinfo.email" in CALENDAR_SCOPES
    # The broad legacy scope MUST NOT be requested anymore.
    assert "https://www.googleapis.com/auth/calendar" not in CALENDAR_SCOPES
    # Guard against accidental over-scoping to unrelated Google APIs.
    for bad in ("bigquery", "drive", "gmail", "cloud-platform", "storage", "logging"):
        assert not any(bad in s for s in CALENDAR_SCOPES), f"scope must not include {bad}"


# ------------------------------------------------------------------
# TEST 16 — Audit log collection name is stable
# ------------------------------------------------------------------
def test_audit_collection_name():
    assert CALENDAR_AUDIT_COLLECTION == "calendar_audit"
    assert CALENDAR_CONFIG_COLLECTION == "calendar_config"


# ------------------------------------------------------------------
# TEST 1 — Tenant isolation via API (integration test, needs live server)
# ------------------------------------------------------------------
def test_no_endpoint_accepts_company_id_from_client():
    """Static guarantee: no endpoint in the router should accept a
    company_id / tenant_id from the request. Tenant is always derived from
    the JWT via Depends(get_current_user)."""
    import routers.google_calendar as gc
    import inspect

    for name, fn in inspect.getmembers(gc, inspect.isfunction):
        sig = inspect.signature(fn)
        for pname, param in sig.parameters.items():
            if pname in ("company_id", "tenant_id"):
                # Internal helpers may receive company_id derived from the
                # authenticated user upstream. Public endpoints (registered
                # on `router`) must NEVER accept company_id from the client.
                assert name.startswith("_") or name in (
                    "get_calendar_service", "auto_sync_event", "auto_sync_follow_up",
                ), (
                    f"Public endpoint '{name}' must not accept '{pname}' as parameter — "
                    f"it must come from the authenticated user."
                )
