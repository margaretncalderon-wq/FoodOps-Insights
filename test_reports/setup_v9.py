import sys, json, requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": "demo.agency@kora.com", "password": "Evoque2024!"})
print("admin login", r.status_code)
tok = r.json().get("access_token") or r.json().get("token")
s.headers.update({"Authorization": f"Bearer {tok}"})

action = sys.argv[1] if len(sys.argv) > 1 else "create"
EMAIL = "terminology_v6@kora.com"

r = s.get(f"{BASE}/api/super-admin/demo-accounts")
data = r.json()
accts = data if isinstance(data, list) else (data.get("demo_accounts") or data.get("accounts") or [])
existing = [a for a in accts if EMAIL in json.dumps(a)]
print("existing:", [(a.get('company_id'), a.get('owner_email') or a.get('email')) for a in existing])

if action == "delete":
    for a in existing:
        cid = a.get("company_id") or a.get("id")
        d = s.delete(f"{BASE}/api/super-admin/demo-accounts/{cid}")
        print("delete", cid, d.status_code, d.text[:200])
    sys.exit()

if not existing:
    r = s.post(f"{BASE}/api/super-admin/demo-accounts", json={
        "email": EMAIL, "name": "Terminology V6", "password": "Test1234!",
        "organization_name": "Terminology V6 Agency",
        "industry_type": "agency", "account_type": "demo",
        "modules_to_activate": ["module_program_orchestration", "module_demand_studio",
                                "module_resource_management"],
        "trial_days": 365,
    })
    print("create", r.status_code, r.text[:600])
    cid = r.json().get("company_id")
else:
    cid = existing[0].get("company_id") or existing[0].get("id")
print("company_id", cid)

t = requests.Session()
r = t.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": "Test1234!"})
print("tenant login", r.status_code)
ttok = r.json().get("access_token") or r.json().get("token")
t.headers.update({"Authorization": f"Bearer {ttok}"})

r = t.get(f"{BASE}/api/organization/config")
print("org config", r.status_code, r.text[:400])

r = t.get(f"{BASE}/api/events")
j = r.json()
evs = j if isinstance(j, list) else j.get("events", [])
print("events", len(evs), [(e.get("name"), e.get("stage")) for e in evs][:6])

if action == "promote":
    for e in evs[:3]:
        eid = e.get("id") or e.get("event_id")
        u = t.put(f"{BASE}/api/events/{eid}", json={"stage": "Committed"})
        print("promote", eid, e.get("name"), u.status_code, u.text[:120])

r = t.get(f"{BASE}/api/addons/enabled-modules")
print("enabled modules", r.status_code, r.text[:600])
