import json
import os

import requests

BASE_URL = os.environ.get("KORA_BASE_URL", "https://foodops-insights.preview.emergentagent.com")
TEST_EMAIL = "termtest_agency_v3@kora.com"
TEST_PASSWORD = "Test1234!"


def main():
    s = requests.Session()
    login = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=30)
    login.raise_for_status()
    token = login.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})

    clients_res = s.get(f"{BASE_URL}/api/crm/clients-with-events", timeout=30)
    clients_res.raise_for_status()
    clients = clients_res.json()
    created = None
    if not clients:
        payload = {
            "client_type": "Company",
            "display_name": "Cliente Terminología QA",
            "email": "qa-client@example.com",
            "phone": "+1 809 555 0101",
            "source": "Direct",
            "industry": "marketing",
            "notes": "Cliente creado para verificar terminología Proyectos en CRM",
        }
        res = s.post(f"{BASE_URL}/api/crm/clients", json=payload, timeout=30)
        res.raise_for_status()
        created = res.json()
        clients_res = s.get(f"{BASE_URL}/api/crm/clients-with-events", timeout=30)
        clients_res.raise_for_status()
        clients = clients_res.json()

    result = {"created_client": created, "clients_count_after": len(clients), "first_client": clients[0] if clients else None}
    with open("/app/test_reports/agency_terminology_seed_client_result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()