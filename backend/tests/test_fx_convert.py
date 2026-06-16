"""Tests for FX live-conversion endpoints under /api/fx.
Covers: /convert (success, identity, invalid code), /rates (cache + structure), /refresh (admin gating).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"
NON_ADMIN_EMAIL = "team.test@staffdo.com"
NON_ADMIN_PASSWORD = "Test123!"


def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("Cannot get admin token")
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def non_admin_token():
    return _login(NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD)


# --- /convert ---

class TestFxConvert:
    def test_convert_usd_to_dop(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/fx/convert?amount=1000&from=USD&to=DOP",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["from"] == "USD"
        assert data["to"] == "DOP"
        assert data["source"] == "open.er-api.com"
        assert "as_of" in data
        assert 50000 <= data["converted"] <= 70000, f"Unexpected converted: {data['converted']}"
        assert 50 <= data["rate"] <= 70

    def test_convert_eur_to_dop(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/fx/convert?amount=500&from=EUR&to=DOP",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["converted"] > 20000, f"EUR->DOP converted too low: {data['converted']}"

    def test_convert_identity_same_currency(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/fx/convert?amount=100&from=DOP&to=DOP",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["converted"] == 100
        assert data["rate"] == 1.0
        assert data["source"] == "identity"

    def test_convert_invalid_currency(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/fx/convert?amount=100&from=XYZ&to=DOP",
            headers=admin_headers, timeout=20,
        )
        # 400 (invalid code) or 503 (upstream rejected) acceptable
        assert r.status_code in (400, 503), f"Expected 400/503 got {r.status_code}: {r.text}"

    def test_convert_requires_auth(self):
        r = requests.get(
            f"{BASE_URL}/api/fx/convert?amount=100&from=USD&to=DOP", timeout=20
        )
        assert r.status_code in (401, 403)


# --- /rates ---

class TestFxRates:
    def test_rates_usd_structure(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/fx/rates?base=USD", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["base"] == "USD"
        assert data["source"] == "open.er-api.com"
        assert "as_of" in data
        assert "rates" in data
        rates = data["rates"]
        assert "DOP" in rates and rates["DOP"] > 50, f"DOP rate looks wrong: {rates.get('DOP')}"
        assert "EUR" in rates
        assert "MXN" in rates

    def test_rates_cache_second_call_fast(self, admin_headers):
        # warm cache
        requests.get(f"{BASE_URL}/api/fx/rates?base=USD", headers=admin_headers, timeout=20)
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/api/fx/rates?base=USD", headers=admin_headers, timeout=20)
        elapsed = time.time() - t0
        assert r.status_code == 200
        # allow generous threshold for network jitter; cache should not refetch upstream
        assert elapsed < 2.0, f"Cached call too slow: {elapsed:.2f}s"


# --- /refresh (admin gating) ---

class TestFxRefresh:
    def test_refresh_admin_allowed(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/fx/refresh?base=USD", headers=admin_headers, timeout=20
        )
        # Admin: 200 expected (or 503 if upstream down)
        assert r.status_code in (200, 503), r.text
        if r.status_code == 200:
            data = r.json()
            assert data["base"] == "USD"

    def test_refresh_non_admin_forbidden(self, non_admin_token):
        if not non_admin_token:
            pytest.skip("Cannot login as non-admin")
        r = requests.post(
            f"{BASE_URL}/api/fx/refresh?base=USD",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=20,
        )
        assert r.status_code == 403, f"Expected 403 for non-admin, got {r.status_code}: {r.text}"
