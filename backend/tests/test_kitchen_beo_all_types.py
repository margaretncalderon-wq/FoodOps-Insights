"""
Regression: Kitchen sheets must include items of ALL item_types — not just
Food and Beverage. Disposables (Desechables) and Rentals (Alquileres) used
to be silently dropped because they typically lack a recipe link AND have
empty event_date / section_time.

User report (Feb 2026): "las hojas de cocina me estan saliendo sin
desechable y alquileres solo bebida y comida"
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
API = f"{BASE_URL.rstrip('/')}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def client_id(session):
    r = session.get(f"{API}/clients?limit=5", timeout=15)
    if r.status_code != 200:
        pytest.skip("Cannot list clients")
    data = r.json()
    if isinstance(data, dict):
        data = data.get("clients") or data.get("items") or []
    if not data:
        pytest.skip("No clients available")
    return data[0]["client_id"]


@pytest.fixture(scope="module")
def all_types_event(session, client_id):
    r = session.post(f"{API}/events", json={
        "name": "TEST_AllItemTypes_KitchenSheet",
        "client_id": client_id,
        "event_date": "2026-04-20",
        "guest_count": 30,
        "stage": "Won",
    }, timeout=15)
    assert r.status_code in (200, 201), r.text
    event_id = r.json()["event_id"]

    r = session.get(f"{API}/proposals/event/{event_id}", timeout=15)
    proposal_id = r.json()["proposal_id"]

    # Add items: one of each type, all on 2026-04-20 at 12:00
    for item_type, desc in [
        ("Food", "Pollo asado con vegetales"),
        ("Beverage", "Jugos naturales surtidos"),
        ("Disposable", "Vasos plásticos × 30"),
        ("Rental", "Mantelería blanca × 5 mesas"),
    ]:
        r = session.post(f"{API}/proposals/{proposal_id}/items", json={
            "section_title": "Servicio Principal",
            "section_time": "12:00",
            "event_date": "2026-04-20",
            "description": desc,
            "quantity": 30,
            "unit_price": 50.0,
            "item_type": item_type,
        }, timeout=15)
        assert r.status_code in (200, 201), f"Failed {item_type}: {r.text}"

    yield event_id

    try:
        session.delete(f"{API}/events/{event_id}", timeout=15)
    except Exception:
        pass


def test_kitchen_beo_includes_all_item_types(session, all_types_event):
    """Disposables and Rentals must appear on the kitchen sheet alongside
    Food and Beverage (in extras_out since they have no recipe link)."""
    r = session.get(f"{API}/kitchen-beo/event/{all_types_event}", timeout=15)
    assert r.status_code == 200, r.text
    payload = r.json()
    days = payload.get("days") or []
    assert len(days) >= 1, f"No days returned: {payload}"

    # Collect every extra item across all tandas
    extra_descs = []
    extra_types = set()
    for day in days:
        for tanda in day.get("tandas") or []:
            for ex in tanda.get("extras") or []:
                extra_descs.append(ex.get("description") or "")
                if ex.get("item_type"):
                    extra_types.add(ex["item_type"])

    # All four item types should be present somewhere (Food may be in recipes
    # if it linked a recipe, but with no recipe link it goes to extras).
    full_text = " | ".join(extra_descs)
    assert "Vasos plásticos" in full_text, (
        f"Disposable item missing from kitchen sheet extras! Got: {full_text}"
    )
    assert "Mantelería" in full_text, (
        f"Rental item missing from kitchen sheet extras! Got: {full_text}"
    )
    # Both Disposable and Rental should have item_type preserved
    assert {"Disposable", "Rental"}.issubset(extra_types), (
        f"item_type missing on extras. Got types: {extra_types}"
    )


@pytest.fixture(scope="module")
def event_with_floating_items(session, client_id):
    """Real-world scenario: Food has date+time, but Disposables/Rentals have
    NO date AND NO time — exactly the user's situation."""
    r = session.post(f"{API}/events", json={
        "name": "TEST_FloatingItems_KitchenSheet",
        "client_id": client_id,
        "event_date": "2026-04-21",
        "guest_count": 30,
        "stage": "Won",
    }, timeout=15)
    assert r.status_code in (200, 201), r.text
    event_id = r.json()["event_id"]

    r = session.get(f"{API}/proposals/event/{event_id}", timeout=15)
    proposal_id = r.json()["proposal_id"]

    # Food + Beverage: properly scheduled
    for item_type, desc in [("Food", "Lasaña"), ("Beverage", "Sodas")]:
        session.post(f"{API}/proposals/{proposal_id}/items", json={
            "section_title": "Almuerzo",
            "section_time": "12:00",
            "event_date": "2026-04-21",
            "description": desc,
            "quantity": 30,
            "unit_price": 50.0,
            "item_type": item_type,
        }, timeout=15)
    # Disposable + Rental: NO event_date AND NO section_time (this is how the
    # user actually creates them — they're not "tied" to a specific service slot)
    for item_type, desc in [("Disposable", "Servilletas premium"), ("Rental", "Sillas Tiffany × 30")]:
        session.post(f"{API}/proposals/{proposal_id}/items", json={
            "description": desc,
            "quantity": 30,
            "unit_price": 10.0,
            "item_type": item_type,
        }, timeout=15)

    yield event_id

    try:
        session.delete(f"{API}/events/{event_id}", timeout=15)
    except Exception:
        pass


def test_floating_items_still_visible_on_kitchen_sheet(session, event_with_floating_items):
    """Items WITHOUT date/time should still appear on the kitchen sheet —
    they get attached to the event's primary date (calendar_dates[0]).
    Reproduces the exact user bug."""
    r = session.get(f"{API}/kitchen-beo/event/{event_with_floating_items}", timeout=15)
    assert r.status_code == 200, r.text
    payload = r.json()
    days = payload.get("days") or []

    # Aggregate ALL extras from ALL days/tandas
    all_extras = []
    for day in days:
        for t in day.get("tandas") or []:
            for ex in t.get("extras") or []:
                all_extras.append((ex.get("description"), ex.get("item_type")))

    descs = [d for d, _ in all_extras]
    types = {t for _, t in all_extras if t}
    full = " | ".join(descs)
    assert "Servilletas premium" in full, (
        f"Floating Disposable missing! Got days={days}"
    )
    assert "Sillas Tiffany" in full, (
        f"Floating Rental missing! Got days={days}"
    )
    assert {"Disposable", "Rental"}.issubset(types), (
        f"Floating item types missing. Got: {types}"
    )
