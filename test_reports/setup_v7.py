import requests, sys
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
t = requests.Session()
r = t.post(f"{BASE}/api/auth/login", json={"email": "terminology_v6@kora.com", "password": "Test1234!"})
print("tenant login", r.status_code)
tok = r.json().get("access_token") or r.json().get("token")
t.headers.update({"Authorization": f"Bearer {tok}"})
r = t.get(f"{BASE}/api/events")
evs = r.json() if isinstance(r.json(), list) else r.json().get("events", [])
print("events", len(evs))
for e in evs[:3]:
    eid = e.get("event_id") or e.get("id")
    u = t.put(f"{BASE}/api/events/{eid}", json={"stage": "Committed"})
    print("promote", eid, e.get("name"), u.status_code, u.text[:120])
