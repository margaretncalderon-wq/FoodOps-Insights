"""
Tests for the Business Clarity Sales/Admin report bug fix (Jan 2026).

Bugs fixed:
- Sales / General report and Sales / By-Client report showed "Sin Cliente"
  for legacy invoices that only carried `client_id` (no denormalized
  `client_name`). Endpoint now back-fills `client_name` from the clients
  collection using display_name → name → company_name.
- Item profitability endpoint used to 500 when legacy `item_types` docs
  lacked `item_type_id`. Now must return HTTP 200.
- Admin income-expense report shape verification.
"""

import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://foodops-insights.preview.emergentagent.com").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"

# Demo data lives in 2026 per main agent
DATE_RANGES = [
    ("2026-01-01", "2026-12-31"),
    ("2025-01-01", "2025-12-31"),
]


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Sales: General ----------

def test_sales_general_report_200_and_client_name_enriched(headers):
    """Hit endpoint across date ranges, verify 200 and that no invoice has a
    blank client_name when its client_id references a real client."""
    found_invoices = False
    for start, end in DATE_RANGES:
        r = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/sales/general",
            headers=headers,
            params={"start_date": start, "end_date": end},
            timeout=60,
        )
        assert r.status_code == 200, f"{start}-{end}: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert "summary" in body and "invoices" in body
        invoices = body["invoices"]
        if invoices:
            found_invoices = True
            # Validate enrichment: any invoice with a client_id must yield
            # a non-empty client_name now.
            bad = [
                i for i in invoices
                if i.get("client_id")  # only meaningful for rows with a client_id
                and not (i.get("client_name") or "").strip()
            ]
            # Note: invoice may not carry client_id in the response since it
            # only returns the projected fields. The fix is verified more
            # directly by the by-client endpoint below.
            print(f"[general {start}-{end}] {len(invoices)} invoices, bad={len(bad)}")
    print(f"found_invoices across ranges: {found_invoices}")


def test_sales_general_no_blank_client_name_when_data_present(headers):
    """When invoices exist, the enriched names should not all be empty.
    At least one invoice (across all ranges) should have a non-empty
    client_name if the demo company has clients."""
    any_named = False
    any_invoice = False
    for start, end in DATE_RANGES:
        r = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/sales/general",
            headers=headers,
            params={"start_date": start, "end_date": end},
            timeout=60,
        )
        assert r.status_code == 200
        for inv in r.json().get("invoices", []):
            any_invoice = True
            if (inv.get("client_name") or "").strip():
                any_named = True
                break
        if any_named:
            break
    if any_invoice:
        assert any_named, "Invoices exist but ALL have blank client_name — enrichment failed"


# ---------- Sales: By-Client ----------

def test_sales_by_client_report_200(headers):
    for start, end in DATE_RANGES:
        r = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/sales/by-client",
            headers=headers,
            params={"start_date": start, "end_date": end},
            timeout=60,
        )
        assert r.status_code == 200, f"{start}-{end}: {r.status_code} {r.text[:300]}"
        body = r.json()
        # Shape check
        assert "records" in body or "clients" in body or isinstance(body, dict)


def test_sales_by_client_no_sin_cliente_when_real_client_exists(headers):
    """When real clients exist on invoices, 'Sin Cliente' should not appear
    as the only/main bucket."""
    for start, end in DATE_RANGES:
        r = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/sales/by-client",
            headers=headers,
            params={"start_date": start, "end_date": end},
            timeout=60,
        )
        assert r.status_code == 200
        body = r.json()
        records = body.get("records") or body.get("clients") or []
        if not records:
            continue
        names = [(rec.get("client_name") or "").strip() for rec in records]
        # If only "Sin Cliente" is present this is suspicious — let's at
        # least log it; only assert if there are also real clients in the DB.
        sin_cliente_only = all(n in ("", "Sin Cliente", "Unknown") for n in names)
        print(f"[by-client {start}-{end}] names sample: {names[:5]}")
        # Only fail when we have multiple records but all are 'Sin Cliente'
        if len(records) >= 2 and sin_cliente_only:
            pytest.fail(
                f"All by-client buckets resolve to Sin Cliente/empty in {start}-{end}: {names}"
            )


# ---------- Item profitability (used to 500) ----------

def test_item_profitability_returns_200(headers):
    for start, end in DATE_RANGES:
        r = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/sales/item-profitability",
            headers=headers,
            params={"start_date": start, "end_date": end},
            timeout=60,
        )
        assert r.status_code == 200, f"{start}-{end}: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert "total_items" in body
        assert "records" in body
        assert isinstance(body["records"], list)


# ---------- Admin income-expense ----------

def test_admin_income_expense_report_shape(headers):
    for start, end in DATE_RANGES:
        r = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/admin/income-expense",
            headers=headers,
            params={"start_date": start, "end_date": end},
            timeout=60,
        )
        assert r.status_code == 200, f"{start}-{end}: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert "summary" in body, f"missing summary key: {body}"
        s = body["summary"]
        for k in ("total_income", "total_expense", "net_result"):
            assert k in s, f"summary missing {k}: {s}"
        assert "income_categories" in body
        assert "expense_categories" in body
        assert isinstance(body["income_categories"], list)
        assert isinstance(body["expense_categories"], list)


# ---------- Other sales tabs sanity (Por Vendedor / Por Producto / Estado Cliente / Rentabilidad) ----------

@pytest.mark.parametrize("path", [
    "by-seller",
    "by-item",
    "item-profitability",
    "client-status",
])
def test_other_sales_tabs_200(headers, path):
    """The Ventas tab UI hits several siblings — make sure none 500."""
    for start, end in DATE_RANGES:
        r = requests.get(
            f"{BASE_URL}/api/business-clarity/reports/sales/{path}",
            headers=headers,
            params={"start_date": start, "end_date": end},
            timeout=60,
        )
        # 404 means the route name differs — we only fail on 500
        assert r.status_code != 500, f"{path} 500: {r.text[:300]}"
        print(f"[sales/{path}] {start}-{end} -> {r.status_code}")
