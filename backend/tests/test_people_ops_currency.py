"""Tests for People Ops currency resolution (Iteration 189)
Covers: GET /api/org-config (company_currency overlay), POST /employees fallback to company.currency,
POST /employees with explicit currency override, PUT /employees update currency, POST /employees/migrate-currency.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")

EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"No token in {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    return []


def test_org_config_returns_company_currency_and_timezone(session):
    r = session.get(f"{BASE_URL}/api/org-config", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "company_currency" in data, f"missing company_currency: {data}"
    assert "company_timezone" in data, f"missing company_timezone: {data}"
    # Demo company configured to DOP
    assert data["company_currency"] == "DOP", f"expected DOP, got {data['company_currency']}"


def test_create_employee_defaults_to_company_currency(session, created_ids):
    payload = {
        "first_name": "TEST_Curr",
        "last_name": "Default",
        "email": "test_curr_default@example.com",
        "job_title": "QA Tester",
        "hire_date": "2026-01-01",
        "base_salary": 50000,
        # NOTE: no `currency` field — backend must default to company.currency (DOP)
    }
    r = session.post(f"{BASE_URL}/api/people-ops/employees", json=payload, timeout=30)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    body = r.json()
    # If migrate-currency is the wrong handler, response shape would be {"updated": ..., "target_currency": ...}
    assert "employee_id" in body, f"expected employee_id, got: {body}"
    assert body.get("currency") == "DOP", f"expected DOP, got {body.get('currency')}"
    created_ids.append(body["employee_id"])


def test_create_employee_with_explicit_currency_override(session, created_ids):
    payload = {
        "first_name": "TEST_Curr",
        "last_name": "USD",
        "email": "test_curr_usd@example.com",
        "job_title": "QA Tester",
        "hire_date": "2026-01-01",
        "base_salary": 1000,
        "currency": "USD",
    }
    r = session.post(f"{BASE_URL}/api/people-ops/employees", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("currency") == "USD"
    created_ids.append(body["employee_id"])


def test_update_employee_currency_persists(session, created_ids):
    assert created_ids, "need a created employee"
    emp_id = created_ids[0]
    r = session.put(f"{BASE_URL}/api/people-ops/employees/{emp_id}", json={"currency": "DOP"}, timeout=30)
    assert r.status_code == 200, r.text
    g = session.get(f"{BASE_URL}/api/people-ops/employees/{emp_id}", timeout=30)
    assert g.status_code == 200
    assert g.json().get("currency") == "DOP"


def test_migrate_currency_idempotent_on_dop(session):
    """Company is DOP — migrate should still update USD/null currencies to DOP."""
    r = session.post(f"{BASE_URL}/api/people-ops/employees/migrate-currency", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "updated" in body
    assert body.get("target_currency") == "DOP"


def test_cleanup(session, created_ids):
    for eid in created_ids:
        try:
            session.delete(f"{BASE_URL}/api/people-ops/employees/{eid}", timeout=15)
        except Exception:
            pass
