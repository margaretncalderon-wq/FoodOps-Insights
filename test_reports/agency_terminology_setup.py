import json
import os
import sys
import time

import requests


BASE_URL = os.environ.get("KORA_BASE_URL", "https://foodops-insights.preview.emergentagent.com")
SUPER_EMAIL = "demo.agency@kora.com"
SUPER_PASSWORD = "Evoque2024!"
TEST_EMAIL = "termtest_agency_v3@kora.com"
TEST_PASSWORD = "Test1234!"
ORG_NAME = f"Terminology Agency V3 {int(time.time())}"


def request(session, method, path, **kwargs):
    url = f"{BASE_URL}{path}"
    resp = session.request(method, url, timeout=30, **kwargs)
    try:
        payload = resp.json()
    except Exception:
        payload = resp.text[:1000]
    if resp.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {resp.status_code}: {payload}")
    return payload


def main():
    s = requests.Session()
    login = request(s, "POST", "/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD})
    token = login.get("access_token")
    if not token:
        raise RuntimeError("Super admin login did not return access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})

    deleted_existing = []
    demos = request(s, "GET", "/api/super-admin/demo-accounts")
    for acc in demos.get("accounts", []):
        owner_email = (acc.get("owner") or {}).get("email")
        if owner_email and owner_email.lower() == TEST_EMAIL.lower():
            request(s, "DELETE", f"/api/super-admin/demo-accounts/{acc['company_id']}")
            deleted_existing.append(acc["company_id"])

    created = request(
        s,
        "POST",
        "/api/super-admin/demo-accounts",
        json={
            "name": "Term Test Agency V3",
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "organization_name": ORG_NAME,
            "industry_type": "agency",
            "account_type": "demo",
            "modules_to_activate": ["module_program_orchestration", "module_demand_studio"],
            "trial_days": 365,
            "notes": "Automated bug verification for agency terminology Eventos->Proyectos",
        },
    )
    company_id = created["account"]["company_id"]

    # Log in as the newly created agency account and capture backend truth.
    agency = requests.Session()
    agency_login = request(agency, "POST", "/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    agency.headers.update({"Authorization": f"Bearer {agency_login['access_token']}"})
    modules = request(agency, "GET", "/api/addons/enabled-modules")
    clients = request(agency, "GET", "/api/crm/clients-with-events")

    result = {
        "base_url": BASE_URL,
        "deleted_existing_company_ids": deleted_existing,
        "created_account": created.get("account"),
        "seed_counts": created.get("seed_counts"),
        "enabled_modules": modules,
        "clients_count": len(clients) if isinstance(clients, list) else None,
        "first_client": (clients[0] if isinstance(clients, list) and clients else None),
    }
    out_path = "/app/test_reports/agency_terminology_setup_result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"SETUP_FAILED: {exc}", file=sys.stderr)
        raise