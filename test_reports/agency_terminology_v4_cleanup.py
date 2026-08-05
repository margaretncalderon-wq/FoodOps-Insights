import json
import os

import requests


BASE_URL = os.environ.get("KORA_BASE_URL", "https://foodops-insights.preview.emergentagent.com")
SUPER_EMAIL = "demo.agency@kora.com"
SUPER_PASSWORD = "Evoque2024!"
TEST_EMAIL = "termtest_agency_v4@kora.com"


def main():
    s = requests.Session()
    login = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD}, timeout=45)
    login.raise_for_status()
    s.headers.update({"Authorization": f"Bearer {login.json()['access_token']}"})
    demos = s.get(f"{BASE_URL}/api/super-admin/demo-accounts", timeout=45)
    demos.raise_for_status()
    deleted = []
    for acc in demos.json().get("accounts", []):
        if ((acc.get("owner") or {}).get("email") or "").lower() == TEST_EMAIL.lower():
            resp = s.delete(f"{BASE_URL}/api/super-admin/demo-accounts/{acc['company_id']}", timeout=45)
            resp.raise_for_status()
            deleted.append(acc["company_id"])
    result = {"target_email": TEST_EMAIL, "deleted_company_ids": deleted}
    with open("/app/test_reports/agency_terminology_v4_cleanup_result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()