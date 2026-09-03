import json, requests
from dotenv import dotenv_values
BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": "terminology_v6@kora.com", "password": "Test1234!"})
tok = r.json().get("access_token") or r.json().get("token")
s.headers.update({"Authorization": f"Bearer {tok}"})
for ep in ["/api/modules", "/api/modules/my-modules", "/api/organization/modules", "/api/company/modules"]:
    r = s.get(f"{BASE}{ep}")
    print(ep, r.status_code, r.text[:1500])
    print()
