import json, requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": "demo.agency@kora.com", "password": "Evoque2024!"})
tok = r.json().get("access_token") or r.json().get("token")
s.headers.update({"Authorization": f"Bearer {tok}"})
r = s.get(f"{BASE}/api/super-admin/demo-accounts")
data = r.json()
print(r.status_code, type(data))
accts = data if isinstance(data, list) else (data.get("demo_accounts") or data.get("accounts") or [])
print("total", len(accts))
for a in accts:
    if "terminology_v6" in json.dumps(a):
        print("FOUND:", json.dumps(a)[:400])
        cid = a.get("company_id") or a.get("id") or a.get("_id")
        d = s.delete(f"{BASE}/api/super-admin/demo-accounts/{cid}")
        print("delete", cid, d.status_code, d.text[:200])
