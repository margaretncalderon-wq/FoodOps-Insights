"""Regression tests for the calendar content-template renderer + multi-day.

Locks in the guarantees that keep sync backwards-compatible for tenants
that never touched the config:
  - Default title template = "{{primary_record}}" only.
  - Empty variable → cleaned up (no orphan separators).
  - Multi-day events split into one body per day with a `Día X/N` suffix.
"""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers.google_calendar import (  # noqa: E402
    _render_template,
    DEFAULT_TITLE_TEMPLATE,
    DEFAULT_DESCRIPTION_BLOCKS,
    DEFAULT_MULTIDAY_SUFFIX,
)


# ------------------------------------------------------------------
# Renderer
# ------------------------------------------------------------------
def test_render_replaces_simple_vars():
    assert _render_template("{{primary_record}}", {"primary_record": "Ana & Carlos"}) == "Ana & Carlos"


def test_render_multiple_vars():
    ctx = {"status_icon": "✅", "primary_record": "Boda", "location": "Casa Vieja"}
    assert _render_template("{{status_icon}} {{primary_record}} · {{location}}", ctx) == "✅ Boda · Casa Vieja"


def test_render_missing_variable_removes_orphan_separator():
    """When location is empty the trailing ` · ` must be cleaned up."""
    ctx = {"status_icon": "✅", "primary_record": "Boda", "location": ""}
    assert _render_template("{{status_icon}} {{primary_record}} · {{location}}", ctx) == "✅ Boda"


def test_render_missing_leading_variable():
    """Empty status_icon must not leave a leading space or separator."""
    ctx = {"status_icon": "", "primary_record": "Boda"}
    assert _render_template("{{status_icon}} {{primary_record}}", ctx) == "Boda"


def test_render_all_empty_returns_empty_string():
    assert _render_template("{{a}} · {{b}}", {"a": "", "b": ""}) == ""


def test_render_never_raises_on_unknown_var():
    assert _render_template("{{unknown}}", {}) == ""


def test_render_preserves_literal_text():
    ctx = {"primary_record": "Boda"}
    assert _render_template("Evento: {{primary_record}}", ctx) == "Evento: Boda"


def test_render_ignores_malformed_placeholders():
    ctx = {"a": "X"}
    assert _render_template("{{a}} {broken} {{ a }}", ctx) == "X {broken} X"


def test_defaults_match_phase_1_behaviour():
    """The default template must be JUST `{{primary_record}}` so a tenant
    with no content-config keeps the pre-templates output."""
    assert DEFAULT_TITLE_TEMPLATE == "{{primary_record}}"
    assert DEFAULT_MULTIDAY_SUFFIX == " (Día {{day_index}}/{{day_total}})"
    # All blocks default to ON.
    for k, v in DEFAULT_DESCRIPTION_BLOCKS.items():
        assert v is True, f"Block {k} must default to True"


# ------------------------------------------------------------------
# Multi-day rendering — end-to-end via _event_to_calendar_body
# ------------------------------------------------------------------
import pytest  # noqa: E402
import asyncio  # noqa: E402


@pytest.mark.asyncio
async def test_multiday_event_produces_one_body_per_day(monkeypatch):
    """A 3-day event yields 3 bodies with Día 1/3, Día 2/3, Día 3/3 suffixes."""
    from routers import google_calendar as gc

    # Bypass DB lookups entirely.
    async def fake_cfg(_cid):
        return {
            "title_template": "{{primary_record}}",
            "multiday_suffix": " (Día {{day_index}}/{{day_total}})",
            "description_blocks": DEFAULT_DESCRIPTION_BLOCKS,
            "status_icons": {},
        }
    monkeypatch.setattr(gc, "_get_content_config", fake_cfg)

    async def fake_stage_label(_cid, _key, lang="es"):
        return "Confirmado"
    monkeypatch.setattr(gc, "_resolve_stage_label", fake_stage_label)

    event = {
        "event_id": "evt_test",
        "company_id": "co_test",
        "name": "Bootcamp",
        "event_type": "Corporate",
        "stage": "committed",
        "event_date": datetime(2026, 6, 13).isoformat(),
        "end_date": datetime(2026, 6, 15).isoformat(),
        "start_time": "09:00",
        "end_time": "18:00",
        "venue": "Ciano HQ",
    }
    bodies = await gc._event_to_calendar_body(event)
    assert len(bodies) == 3, "3-day event must yield 3 bodies"
    titles = [b[1]["summary"] for b in bodies]
    assert titles == [
        "Bootcamp (Día 1/3)",
        "Bootcamp (Día 2/3)",
        "Bootcamp (Día 3/3)",
    ]
    # Day keys are the ISO dates in order
    assert [b[0] for b in bodies] == ["2026-06-13", "2026-06-14", "2026-06-15"]
    # Middle day is an all-day event
    assert "date" in bodies[1][1]["start"] and "dateTime" not in bodies[1][1]["start"]
    # First day honours start_time
    assert "dateTime" in bodies[0][1]["start"]
    # Last day honours end_time
    assert "dateTime" in bodies[2][1]["end"]


@pytest.mark.asyncio
async def test_singleday_event_still_produces_one_body(monkeypatch):
    """A single-day event must NOT get a day-counter suffix."""
    from routers import google_calendar as gc

    async def fake_cfg(_cid):
        return {
            "title_template": "{{primary_record}}",
            "multiday_suffix": " (Día {{day_index}}/{{day_total}})",
            "description_blocks": DEFAULT_DESCRIPTION_BLOCKS,
            "status_icons": {},
        }
    monkeypatch.setattr(gc, "_get_content_config", fake_cfg)

    async def fake_stage_label(_cid, _key, lang="es"):
        return "Cotizado"
    monkeypatch.setattr(gc, "_resolve_stage_label", fake_stage_label)

    event = {
        "event_id": "evt_test",
        "company_id": "co_test",
        "name": "Boda Ana",
        "event_type": "Wedding",
        "stage": "definition_review",
        "event_date": datetime(2026, 6, 13).isoformat(),
        "start_time": "18:00",
        "end_time": "23:00",
    }
    bodies = await gc._event_to_calendar_body(event)
    assert len(bodies) == 1
    assert bodies[0][1]["summary"] == "Boda Ana"
    # No day counter suffix
    assert "Día" not in bodies[0][1]["summary"]


@pytest.mark.asyncio
async def test_tbd_event_returns_no_bodies(monkeypatch):
    from routers import google_calendar as gc
    async def fake_cfg(_cid): return {"title_template": "{{primary_record}}",
                                       "multiday_suffix": "", "description_blocks": {}, "status_icons": {}}
    monkeypatch.setattr(gc, "_get_content_config", fake_cfg)
    event = {"event_id": "x", "company_id": "c", "name": "X", "event_date_tbd": True}
    bodies = await gc._event_to_calendar_body(event)
    assert bodies == []
