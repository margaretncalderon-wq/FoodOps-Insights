import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": "terminology_v6@kora.com", "password": "Test1234!"})
print("login", r.status_code)
tok = r.json().get("access_token") or r.json().get("token")
s.headers.update({"Authorization": f"Bearer {tok}"})
r = s.get(f"{BASE}/api/packing-templates")
print("templates GET", r.status_code, r.text[:300])
payload = {
    "name": "TEST_Plantilla QA",
    "description": "QA terminology test",
    "items": [{"item_name": "Mesa", "quantity_per_guest": 0.1, "unit": "unidad"}],
}
r = s.post(f"{BASE}/api/packing-templates", json=payload)
print("create", r.status_code, r.text[:400])
