"""Tests for OT period-aggregated report + CSV/XLSX export + email schedule config.

Covers iteration 188:
- GET /api/people-ops/overtime/report (weekly | biweekly | monthly)
- GET /api/people-ops/overtime/report/export?format=csv|xlsx
- GET /api/people-ops/overtime/email-schedule (default empty)
- PUT /api/people-ops/overtime/email-schedule (valid + invalid frequency)
"""
import os
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "demo.agency@kora.com"
LOGIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return s


REF_DATE = "2026-06-16"  # demo company has OT data in June 2026


# ─── /overtime/report ─────────────────────────────────────────────
class TestOvertimeReport:
    def test_biweekly(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/report", params={"period": "biweekly", "date": REF_DATE})
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("period", "label", "start_date", "end_date", "rows", "totals"):
            assert k in data, f"missing key {k}"
        assert data["period"] == "biweekly"
        # ref=2026-06-16 → Quincena 2 (16-30)
        assert data["start_date"] == "2026-06-16"
        assert data["end_date"] == "2026-06-30"
        assert isinstance(data["rows"], list)
        # Validate row schema
        if data["rows"]:
            row = data["rows"][0]
            for k in ("employee_id", "employee_name", "hours_35", "hours_night",
                     "hours_holiday", "hours_100", "total_hours", "estimated_amount"):
                assert k in row, f"row missing {k}: {row}"
            # base_salary / hourly_rate may be missing if employee not found, but if any OT exists the demo employees should match
            # Check at least one row has them
        # totals schema
        t = data["totals"]
        for k in ("ot_count", "employees", "hours_35", "total_hours", "estimated_amount"):
            assert k in t

    def test_weekly(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/report", params={"period": "weekly", "date": REF_DATE})
        assert r.status_code == 200, r.text
        d = r.json()
        # 2026-06-16 is a Tuesday → Monday 2026-06-15 .. Sunday 2026-06-21
        assert d["start_date"] == "2026-06-15"
        assert d["end_date"] == "2026-06-21"
        assert d["period"] == "weekly"

    def test_monthly(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/report", params={"period": "monthly", "date": REF_DATE})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["start_date"] == "2026-06-01"
        assert d["end_date"] == "2026-06-30"
        assert d["period"] == "monthly"

    def test_biweekly_first_half(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/report", params={"period": "biweekly", "date": "2026-06-10"})
        assert r.status_code == 200
        d = r.json()
        assert d["start_date"] == "2026-06-01"
        assert d["end_date"] == "2026-06-15"

    def test_invalid_period(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/report", params={"period": "daily", "date": REF_DATE})
        assert r.status_code == 400


# ─── /overtime/report/export ──────────────────────────────────────
class TestOvertimeReportExport:
    def test_csv(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/report/export", params={"period": "biweekly", "date": REF_DATE, "format": "csv"})
        assert r.status_code == 200, r.text[:300]
        assert "text/csv" in r.headers.get("content-type", "")
        text = r.text
        # Header content
        assert "Empleado" in text
        assert "Salario Base" in text
        assert "Horas 35" in text
        assert "Monto Estimado" in text
        # Range row
        assert "Rango: 2026-06-16 a 2026-06-30" in text
        assert "TOTALES" in text

    def test_xlsx(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/report/export", params={"period": "monthly", "date": REF_DATE, "format": "xlsx"})
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml" in ct or "xlsx" in ct, f"unexpected content-type {ct}"
        assert len(r.content) > 100, "XLSX body too small"
        # xlsx is zip → starts with PK
        assert r.content[:2] == b"PK", "Not a valid xlsx (no PK header)"


# ─── /overtime/email-schedule ─────────────────────────────────────
class TestEmailSchedule:
    def test_get_default(self, client):
        r = client.get(f"{BASE_URL}/api/people-ops/overtime/email-schedule")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("enabled", "frequency", "recipients"):
            assert k in d
        assert isinstance(d["recipients"], list)

    def test_put_valid_biweekly(self, client):
        payload = {"enabled": True, "frequency": "biweekly", "recipients": ["TEST_admin@example.com", "TEST_ops@example.com"]}
        r = client.put(f"{BASE_URL}/api/people-ops/overtime/email-schedule", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["enabled"] is True
        assert d["frequency"] == "biweekly"
        assert "TEST_admin@example.com" in d["recipients"]
        # GET to verify persistence
        r2 = client.get(f"{BASE_URL}/api/people-ops/overtime/email-schedule")
        d2 = r2.json()
        assert d2["frequency"] == "biweekly"
        assert d2["enabled"] is True
        assert "TEST_admin@example.com" in d2["recipients"]

    def test_put_change_to_weekly(self, client):
        r = client.put(f"{BASE_URL}/api/people-ops/overtime/email-schedule",
                       json={"enabled": False, "frequency": "weekly", "recipients": []})
        assert r.status_code == 200
        assert r.json()["frequency"] == "weekly"
        assert r.json()["enabled"] is False

    def test_put_invalid_frequency(self, client):
        r = client.put(f"{BASE_URL}/api/people-ops/overtime/email-schedule",
                       json={"enabled": True, "frequency": "daily", "recipients": ["x@y.com"]})
        assert r.status_code == 400

    def test_put_invalid_recipients_type(self, client):
        r = client.put(f"{BASE_URL}/api/people-ops/overtime/email-schedule",
                       json={"enabled": True, "frequency": "weekly", "recipients": "not-a-list"})
        assert r.status_code == 400
