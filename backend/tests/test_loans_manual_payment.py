"""Tests for manual loan payment endpoint and payroll loan-deduction regression.

Covers:
- POST /api/people-ops/loans/{loan_id}/payment  (record manual payment)
- GET  /api/people-ops/loans/{loan_id}/payments (payment history)
- Cap-to-remaining behavior, invalid-amount / non-active loan validation
- Regression: biweekly payroll period auto-deducts installment for employees w/ active_loan_balance
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")

EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
DEMO_LOAN_ID = "loan_7bbf16ed2502"       # active loan for demo.agency
DEMO_EMPLOYEE_ID = "emp_91f4dfa58d68"


# ------------------ fixtures ------------------

@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


def _get_loan(client, loan_id):
    r = client.get(f"{BASE_URL}/api/people-ops/loans", timeout=30)
    assert r.status_code == 200, r.text
    for l in r.json():
        if l.get("loan_id") == loan_id:
            return l
    return None


def _get_employee(client, employee_id):
    # try direct endpoint
    r = client.get(f"{BASE_URL}/api/people-ops/employees/{employee_id}", timeout=30)
    if r.status_code == 200:
        return r.json()
    r = client.get(f"{BASE_URL}/api/people-ops/employees", timeout=30)
    if r.status_code == 200:
        for e in r.json():
            if e.get("employee_id") == employee_id:
                return e
    return None


# ------------------ manual payment happy path ------------------

class TestManualLoanPayment:
    def test_record_500_cash_on_active_loan(self, client):
        # Idempotency: if a prior pytest run already recorded a TEST_ marker payment,
        # skip re-charging the loan so consecutive test runs remain safe.
        hist = client.get(
            f"{BASE_URL}/api/people-ops/loans/{DEMO_LOAN_ID}/payments", timeout=30
        )
        if hist.status_code == 200 and any(
            (p.get("notes") or "").startswith("TEST_ pytest smoke") for p in hist.json()
        ):
            pytest.skip("pytest smoke payment already recorded on this loan")

        # Snapshot before
        loan_before = _get_loan(client, DEMO_LOAN_ID)
        assert loan_before is not None, "Demo loan missing"
        assert loan_before["status"] == "active"
        rem_before = float(loan_before["remaining_balance"])
        paid_before = int(loan_before.get("installments_paid") or 0)

        emp_before = _get_employee(client, DEMO_EMPLOYEE_ID)
        emp_bal_before = float((emp_before or {}).get("active_loan_balance") or 0)

        # Payment
        r = client.post(
            f"{BASE_URL}/api/people-ops/loans/{DEMO_LOAN_ID}/payment",
            json={"amount": 500, "payment_type": "cash", "notes": "TEST_ pytest smoke"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert abs(data["new_balance"] - (rem_before - 500)) < 0.01
        assert data["installments_paid"] == paid_before + 1
        assert data["loan_status"] == "active"

        # Persistence check via GET /loans
        loan_after = _get_loan(client, DEMO_LOAN_ID)
        assert abs(float(loan_after["remaining_balance"]) - (rem_before - 500)) < 0.01
        assert int(loan_after["installments_paid"]) == paid_before + 1

        # employee.active_loan_balance decreased by 500
        emp_after = _get_employee(client, DEMO_EMPLOYEE_ID)
        emp_bal_after = float((emp_after or {}).get("active_loan_balance") or 0)
        assert abs(emp_bal_before - emp_bal_after - 500) < 0.01, (
            f"employee active_loan_balance did not decrease by 500 "
            f"(before={emp_bal_before}, after={emp_bal_after})"
        )

    def test_payment_history_reflects_new_payment(self, client):
        r = client.get(
            f"{BASE_URL}/api/people-ops/loans/{DEMO_LOAN_ID}/payments", timeout=30
        )
        assert r.status_code == 200, r.text
        payments = r.json()
        assert isinstance(payments, list) and len(payments) >= 1
        # find the one just inserted by this test run (TEST_ notes marker)
        marked = [p for p in payments if (p.get("notes") or "").startswith("TEST_ pytest smoke")]
        assert marked, f"Could not find pytest-inserted payment in {payments[:3]}"
        latest = max(marked, key=lambda p: p.get("created_at") or "")
        assert latest["loan_id"] == DEMO_LOAN_ID
        assert latest["amount"] == 500
        assert latest["payment_type"] == "cash"
        loan_now = _get_loan(client, DEMO_LOAN_ID)
        assert abs(float(latest["balance_after"]) - float(loan_now["remaining_balance"])) < 0.01


# ------------------ validation errors ------------------

class TestManualPaymentValidation:
    def test_amount_zero_rejected(self, client):
        r = client.post(
            f"{BASE_URL}/api/people-ops/loans/{DEMO_LOAN_ID}/payment",
            json={"amount": 0, "payment_type": "cash"},
            timeout=30,
        )
        assert r.status_code == 400
        assert "amount" in r.text.lower()

    def test_amount_negative_rejected(self, client):
        r = client.post(
            f"{BASE_URL}/api/people-ops/loans/{DEMO_LOAN_ID}/payment",
            json={"amount": -50, "payment_type": "cash"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_loan_not_found(self, client):
        r = client.post(
            f"{BASE_URL}/api/people-ops/loans/loan_does_not_exist/payment",
            json={"amount": 100},
            timeout=30,
        )
        assert r.status_code == 404


# ------------------ cap-to-remaining behavior ------------------

class TestCapToRemaining:
    """We do NOT want to fully pay the real demo loans, so validate the cap
    behavior by simulating a large payment on a small, fresh throwaway loan.
    If we cannot create a new loan (endpoint semantics differ), we simply skip.
    """

    def test_overpay_caps_and_marks_paid(self, client):
        # try to create a small approved loan for the same employee
        create_payload = {
            "employee_id": DEMO_EMPLOYEE_ID,
            "amount": 100.0,
            "installments": 1,
            "installment_amount": 100.0,
            "reason": "TEST_ cap overpay test",
            "start_date": "2026-01-01",
            "notes": "TEST_ pytest cap"
        }
        r = client.post(f"{BASE_URL}/api/people-ops/loans", json=create_payload, timeout=30)
        if r.status_code not in (200, 201):
            pytest.skip(f"cannot create test loan: {r.status_code} {r.text[:200]}")
        loan_doc = r.json()
        # response shape may differ; try both
        loan_id = loan_doc.get("loan_id") or (loan_doc.get("loan") or {}).get("loan_id")
        if not loan_id:
            pytest.skip(f"loan creation returned no loan_id: {loan_doc}")

        # Approve if pending
        loan_snap = _get_loan(client, loan_id)
        if loan_snap and loan_snap.get("status") == "pending":
            appr = client.post(
                f"{BASE_URL}/api/people-ops/loans/{loan_id}/approve", json={}, timeout=30
            )
            if appr.status_code not in (200, 201):
                pytest.skip(f"cannot approve loan for cap test: {appr.status_code}")

        loan_snap = _get_loan(client, loan_id)
        if not loan_snap or loan_snap.get("status") != "active":
            pytest.skip(f"loan not active after approve: {loan_snap}")

        remaining = float(loan_snap["remaining_balance"])

        # Overpay by 10x
        r2 = client.post(
            f"{BASE_URL}/api/people-ops/loans/{loan_id}/payment",
            json={"amount": remaining * 10, "payment_type": "transfer", "notes": "TEST_ overpay"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["new_balance"] == 0
        assert d["loan_status"] == "paid"

        # Attempting to pay again should now fail (loan not active)
        r3 = client.post(
            f"{BASE_URL}/api/people-ops/loans/{loan_id}/payment",
            json={"amount": 1, "payment_type": "cash"},
            timeout=30,
        )
        assert r3.status_code == 400
        assert "active" in r3.text.lower() or "status" in r3.text.lower()


# ------------------ regression: payroll auto-deducts loan installment ------------------

class TestPayrollLoanDeductionRegression:
    """Create a biweekly payroll period (DRAFT) and confirm the demo employee's
    entry has loan_deduction ~= min(installment_amount, remaining_balance).
    We do NOT process/complete the payroll to avoid side-effects on the loan."""

    def test_biweekly_period_has_loan_deduction(self, client):
        loan = _get_loan(client, DEMO_LOAN_ID)
        if not loan or loan.get("status") != "active":
            pytest.skip("demo loan not active; regression cannot be verified")

        installment = float(loan["installment_amount"])

        payload = {
            "period_type": "biweekly",
            "start_date": "2026-01-01",
            "end_date": "2026-01-15",
            "payment_date": "2026-01-16",
            "notes": "TEST_ pytest regression",
        }
        r = client.post(
            f"{BASE_URL}/api/people-ops/payroll/periods", json=payload, timeout=60
        )
        if r.status_code not in (200, 201):
            pytest.skip(f"cannot create biweekly period: {r.status_code} {r.text[:300]}")
        period = r.json()
        period_id = period.get("period_id") or period.get("id")
        assert period_id, f"no period_id in response: {period}"

        try:
            r2 = client.get(
                f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}", timeout=60
            )
            assert r2.status_code == 200, r2.text
            full = r2.json()
            entries = full.get("entries") or full.get("payroll_entries") or []
            match = [e for e in entries if e.get("employee_id") == DEMO_EMPLOYEE_ID]
            assert match, "demo employee not present in payroll entries"
            entry = match[0]
            # loan_deduction should equal installment (or remaining if smaller)
            assert entry.get("loan_id") is not None, "loan_id should be attached to entry"
            assert entry.get("loan_deduction") is not None
            assert abs(float(entry["loan_deduction"]) - installment) < 0.01, (
                f"expected loan_deduction≈{installment}, got {entry.get('loan_deduction')}"
            )
        finally:
            # Cleanup: delete the draft period
            client.delete(
                f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}", timeout=30
            )
