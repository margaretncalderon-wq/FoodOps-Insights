import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests
from pymongo import MongoClient


BASE_URL = os.environ.get("KORA_BASE_URL", "https://foodops-insights.preview.emergentagent.com")
SUPER_EMAIL = "demo.agency@kora.com"
SUPER_PASSWORD = "Evoque2024!"
TEST_EMAIL = "termtest_agency_v4@kora.com"
TEST_PASSWORD = "Test1234!"
ORG_NAME = f"Terminology Agency V4 {int(time.time())}"


def request(session, method, path, **kwargs):
    url = f"{BASE_URL}{path}"
    resp = session.request(method, url, timeout=45, **kwargs)
    try:
        payload = resp.json()
    except Exception:
        payload = resp.text[:1500]
    if resp.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {resp.status_code}: {payload}")
    return payload


def read_env_value(path, key, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                m = re.match(rf"^{re.escape(key)}=(.*)$", line.strip())
                if m:
                    return m.group(1).strip().strip('"')
    except FileNotFoundError:
        pass
    return default


def seed_direct_db(company_id, user_id):
    mongo_url = read_env_value("/app/backend/.env", "MONGO_URL", "mongodb://localhost:27017")
    db_name = read_env_value("/app/backend/.env", "DB_NAME", "test_database")
    db = MongoClient(mongo_url)[db_name]
    now = datetime.now(timezone.utc)
    movement_id = f"qa_unassigned_{int(time.time())}"
    db.stock_movements.insert_one({
        "movement_id": movement_id,
        "company_id": company_id,
        "movement_type": "usage",
        "event_id": None,
        "ingredient_id": "qa_ingredient_v4",
        "ingredient_name": "QA Unassigned Usage V4",
        "name": "QA Unassigned Usage V4",
        "quantity": 2,
        "unit_cost": 12.5,
        "unit": "ud",
        "created_at": now.isoformat(),
        "created_by": user_id,
    })
    return {"stock_movement_id": movement_id, "db_name": db_name}


def main():
    super_session = requests.Session()
    login = request(super_session, "POST", "/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD})
    super_session.headers.update({"Authorization": f"Bearer {login['access_token']}"})

    deleted_existing = []
    demos = request(super_session, "GET", "/api/super-admin/demo-accounts")
    for acc in demos.get("accounts", []):
        owner_email = ((acc.get("owner") or {}).get("email") or "").lower()
        if owner_email == TEST_EMAIL.lower():
            request(super_session, "DELETE", f"/api/super-admin/demo-accounts/{acc['company_id']}")
            deleted_existing.append(acc["company_id"])

    created = request(
        super_session,
        "POST",
        "/api/super-admin/demo-accounts",
        json={
            "name": "Term Test Agency V4",
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "organization_name": ORG_NAME,
            "industry_type": "agency",
            "account_type": "demo",
            "modules_to_activate": ["module_program_orchestration", "module_demand_studio"],
            "trial_days": 365,
            "notes": "Automated bug verification for agency terminology Eventos->Proyectos, iteration 248",
        },
    )
    account = created["account"]
    company_id = account["company_id"]

    agency = requests.Session()
    agency_login = request(agency, "POST", "/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    token = agency_login["access_token"]
    agency.headers.update({"Authorization": f"Bearer {token}"})
    me = request(agency, "GET", "/api/auth/me")
    user_id = me.get("user_id") or me.get("id") or account.get("owner", {}).get("user_id")

    no_event_client = request(
        agency,
        "POST",
        "/api/crm/clients",
        json={
            "client_type": "Company",
            "display_name": "Cliente Sin Proyectos QA V4",
            "email": "qa-no-project-v4@example.com",
            "phone": "+1 809 555 0404",
            "source": "Direct",
            "industry": "marketing",
            "notes": "Cliente sin proyectos para verificar texto No hay proyectos",
        },
    )

    payable = request(
        agency,
        "POST",
        "/api/business-clarity/supplier-payables",
        json={
            "supplier_name": "Proveedor QA Terminología V4",
            "description": "Costo sin asignar para verificar terminología",
            "amount": 123.45,
            "invoice_number": f"QA-V4-{int(time.time())}",
            "event_id": None,
            "fixed_cost_category_id": None,
            "cost_center_id": None,
        },
    )
    db_seed = seed_direct_db(company_id, user_id)

    modules = request(agency, "GET", "/api/addons/enabled-modules")
    org_config = request(agency, "GET", "/api/org-config")
    clients = request(agency, "GET", "/api/crm/clients-with-events")
    accounts_payable = request(agency, "GET", "/api/business-clarity/accounts-payable")
    now = datetime.now(timezone.utc)
    allocation = request(agency, "GET", f"/api/business-clarity/period-close/{now.year}/{now.month}/event-allocation")
    exceptions = request(agency, "GET", f"/api/business-clarity/period-close/{now.year}/{now.month}/exceptions")

    result = {
        "base_url": BASE_URL,
        "deleted_existing_company_ids": deleted_existing,
        "created_account": account,
        "seed_counts": created.get("seed_counts"),
        "no_event_client": no_event_client,
        "created_payable": payable,
        "direct_db_seed": db_seed,
        "auth_me": {"email": me.get("email"), "company_id": me.get("company_id"), "industry_type": me.get("industry_type")},
        "enabled_modules": modules,
        "org_config_terminology": {
            "industry_template": org_config.get("industry_template"),
            "industry_type": org_config.get("industry_type"),
            "terminology": org_config.get("terminology"),
        },
        "clients_count": len(clients) if isinstance(clients, list) else None,
        "accounts_payable_summary": accounts_payable.get("summary") if isinstance(accounts_payable, dict) else None,
        "allocation_summary": allocation.get("summary") if isinstance(allocation, dict) else None,
        "exceptions_summary": exceptions.get("summary") if isinstance(exceptions, dict) else None,
    }
    out_path = "/app/test_reports/agency_terminology_v4_setup_result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"SETUP_FAILED: {exc}", file=sys.stderr)
        raise