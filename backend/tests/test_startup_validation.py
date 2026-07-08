"""AUTO-2 & AUTO-6: Multi-tenant startup validation guard tests.

Verifies:
  * The startup_validate_critical_helpers coroutine PASSES with the real module state.
  * If any cross-module helper is missing (simulated by deleting the attribute),
    it FAILS LOUDLY with RuntimeError("Refusing to serve traffic ...").
  * This is the exact class of bug (ImportError on late-imports) that broke
    proposal_number generation and would silently 500 every tenant.
"""
import asyncio
import os
import sys
import pytest

# Ensure we can import backend modules
BACKEND_DIR = "/app/backend"
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _get_startup_fn():
    """Import server lazily and return the startup validation coroutine fn."""
    os.chdir(BACKEND_DIR)
    import server  # noqa: WPS433
    return server.startup_validate_critical_helpers


def test_startup_validation_passes_with_current_code():
    """AUTO-1: In the current healthy state, startup validation must succeed."""
    fn = _get_startup_fn()
    # Should not raise
    asyncio.get_event_loop().run_until_complete(fn()) if False else asyncio.run(fn())


def test_startup_validation_fails_when_helper_missing(monkeypatch):
    """AUTO-2: Simulate a broken helper — startup must refuse to serve traffic."""
    fn = _get_startup_fn()
    import routers.proposals as proposals_mod

    original = proposals_mod.generate_proposal_number
    # Simulate the exact bug class: symbol not exported / renamed
    monkeypatch.delattr(proposals_mod, "generate_proposal_number", raising=True)

    try:
        with pytest.raises(RuntimeError, match="Refusing to serve traffic"):
            asyncio.run(fn())
    finally:
        # Belt-and-suspenders restore (monkeypatch also restores on teardown)
        if not hasattr(proposals_mod, "generate_proposal_number"):
            proposals_mod.generate_proposal_number = original


def test_startup_validation_fails_when_module_scope_helper_missing(monkeypatch):
    """AUTO-2 variant: server-scope helper (check_usage_limit) missing."""
    fn = _get_startup_fn()
    import server as srv

    monkeypatch.delattr(srv, "check_usage_limit", raising=True)
    with pytest.raises(RuntimeError, match="Refusing to serve traffic"):
        asyncio.run(fn())


def test_startup_validation_restored_after_failure_tests():
    """After the two failure simulations, the healthy path must pass again
    (proves monkeypatch cleanup is working and validation is idempotent)."""
    fn = _get_startup_fn()
    asyncio.run(fn())
