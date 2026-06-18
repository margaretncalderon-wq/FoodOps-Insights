"""
Tests for iteration 192:
- Bilingual departments (name_en, name_es)
- Employee compensation update (base_salary, currency, payment_frequency, weekly_hours_regular, job_title)
"""
import os
import requests
import pytest

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Fallback: read from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.strip().startswith("REACT_APP_BACKEND_URL="):
                        url = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL is not set"
    return url.rstrip("/")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_dept_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_headers, created_dept_ids):
    yield
    for dept_id in created_dept_ids:
        try:
            requests.delete(f"{BASE_URL}/api/people-ops/departments/{dept_id}",
                            headers=auth_headers, timeout=10)
        except Exception:
            pass


# ---------- Departments: bilingual name_en / name_es ----------
class TestDepartmentBilingual:
    def test_create_department_with_name_en_and_name_es(self, auth_headers, created_dept_ids):
        payload = {
            "name": "TEST_Ventas",
            "name_es": "TEST_Ventas",
            "name_en": "TEST_Sales",
            "code": "TST-SAL",
            "description": "Bilingual dept test"
        }
        r = requests.post(f"{BASE_URL}/api/people-ops/departments",
                          headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("name") == "TEST_Ventas"
        assert body.get("name_es") == "TEST_Ventas"
        assert body.get("name_en") == "TEST_Sales"
        assert "department_id" in body
        created_dept_ids.append(body["department_id"])

    def test_get_departments_returns_bilingual_names(self, auth_headers, created_dept_ids):
        # Ensure at least 1 created
        if not created_dept_ids:
            pytest.skip("Prior create test did not create a dept")
        r = requests.get(f"{BASE_URL}/api/people-ops/departments", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        # API may return list or {departments: [...]}
        depts = body if isinstance(body, list) else body.get("departments", [])
        match = next((d for d in depts if d.get("department_id") == created_dept_ids[0]), None)
        assert match is not None, "Newly created dept not in list"
        assert match.get("name_es") == "TEST_Ventas"
        assert match.get("name_en") == "TEST_Sales"

    def test_update_department_name_en_name_es(self, auth_headers, created_dept_ids):
        if not created_dept_ids:
            pytest.skip("No dept to update")
        dept_id = created_dept_ids[0]
        payload = {"name_en": "TEST_SalesUpdated", "name_es": "TEST_VentasActualizado"}
        r = requests.put(f"{BASE_URL}/api/people-ops/departments/{dept_id}",
                         headers=auth_headers, json=payload)
        assert r.status_code == 200, f"{r.status_code} {r.text}"

        # Verify persistence via GET
        r2 = requests.get(f"{BASE_URL}/api/people-ops/departments/{dept_id}",
                          headers=auth_headers)
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("name_en") == "TEST_SalesUpdated"
        assert d.get("name_es") == "TEST_VentasActualizado"

    def test_create_department_without_bilingual_names_still_works(self, auth_headers, created_dept_ids):
        payload = {"name": "TEST_LegacyDept"}
        r = requests.post(f"{BASE_URL}/api/people-ops/departments",
                          headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        body = r.json()
        # Optional fields should be None (legacy support)
        assert body.get("name") == "TEST_LegacyDept"
        assert body.get("name_en") in (None, "")
        assert body.get("name_es") in (None, "")
        created_dept_ids.append(body["department_id"])


# ---------- Employee: compensation update regression ----------
class TestEmployeeCompensationUpdate:
    @pytest.fixture(scope="class")
    def first_employee_id(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/people-ops/employees", headers=auth_headers)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        emps = body if isinstance(body, list) else body.get("employees", [])
        if not emps:
            pytest.skip("No employees exist")
        return emps[0]["employee_id"]

    def test_update_employee_salary_currency_freq_hours_jobtitle(self, auth_headers, first_employee_id):
        payload = {
            "base_salary": 55000.0,
            "currency": "DOP",
            "payment_frequency": "monthly",
            "weekly_hours_regular": 44.0,
            "job_title": "TEST_JobTitleFreeText"
        }
        r = requests.put(f"{BASE_URL}/api/people-ops/employees/{first_employee_id}",
                         headers=auth_headers, json=payload)
        assert r.status_code == 200, f"{r.status_code} {r.text}"

        # Verify via GET
        r2 = requests.get(f"{BASE_URL}/api/people-ops/employees/{first_employee_id}",
                          headers=auth_headers)
        assert r2.status_code == 200
        emp = r2.json()
        assert emp.get("base_salary") == 55000.0
        assert emp.get("currency") == "DOP"
        assert emp.get("payment_frequency") == "monthly"
        assert emp.get("weekly_hours_regular") == 44.0
        assert emp.get("job_title") == "TEST_JobTitleFreeText"

    def test_update_employee_partial_salary_only(self, auth_headers, first_employee_id):
        payload = {"base_salary": 60000.0}
        r = requests.put(f"{BASE_URL}/api/people-ops/employees/{first_employee_id}",
                         headers=auth_headers, json=payload)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/people-ops/employees/{first_employee_id}",
                          headers=auth_headers)
        assert r2.json().get("base_salary") == 60000.0
