"""
Focused UI verification for agency terminology regression (iteration 249).
Executed via mcp_browser_automation; uses the same backend endpoints the UI calls for setup/cleanup,
then validates the real React UI for Payables and Reports in Spanish.
"""

import re

FRONTEND = "https://foodops-insights.preview.emergentagent.com"
# Must match /app/frontend/.env REACT_APP_BACKEND_URL because the React UI uses this backend.
API = "https://foodops-insights.preview.emergentagent.com/api"
SUPER_EMAIL = "demo.agency@kora.com"
SUPER_PASSWORD = "Evoque2024!"
TEST_EMAIL = "termtest_agency_v5@kora.com"
TEST_PASSWORD = "Test1234!"
ORG_NAME = "TermTest Agency V5"

async def assert_response_ok(resp, label):
    if resp.status >= 400:
        try:
            body = await resp.text()
        except Exception:
            body = "<unreadable>"
        raise AssertionError(f"{label} failed with HTTP {resp.status}: {body}")

async def run(page):
    try:
        await page.set_viewport_size({"width": 1920, "height": 1080})
        request = page.context.request
        print("Step 1: Login super admin via auth API for test setup")
        super_login = await request.post(f"{API}/auth/login", data={"email": SUPER_EMAIL, "password": SUPER_PASSWORD})
        await assert_response_ok(super_login, "super admin login")
        super_token = (await super_login.json())["access_token"]
        super_headers = {"Authorization": f"Bearer {super_token}"}
        print("PASS: Super admin authenticated")

        print("Step 2: Remove any stale demo account for test email")
        accounts_resp = await request.get(f"{API}/super-admin/demo-accounts", headers=super_headers)
        await assert_response_ok(accounts_resp, "list demo accounts")
        accounts = (await accounts_resp.json()).get("accounts", [])
        for acct in accounts:
            owner = acct.get("owner") or {}
            if owner.get("email", "").lower() == TEST_EMAIL.lower() or acct.get("name") == ORG_NAME:
                del_resp = await request.delete(f"{API}/super-admin/demo-accounts/{acct['company_id']}", headers=super_headers)
                await assert_response_ok(del_resp, f"delete stale {acct['company_id']}")
                print(f"PASS: Deleted stale account {acct['company_id']}")

        print("Step 3: Create demo agency account with required modules")
        create_payload = {
            "email": TEST_EMAIL,
            "name": "Term Test Agency V5",
            "password": TEST_PASSWORD,
            "organization_name": ORG_NAME,
            "industry_type": "agency",
            "account_type": "demo",
            "modules_to_activate": ["module_program_orchestration", "module_demand_studio"],
            "trial_days": 365,
            "notes": "Automated terminology regression test"
        }
        create_resp = await request.post(f"{API}/super-admin/demo-accounts", data=create_payload, headers=super_headers)
        await assert_response_ok(create_resp, "create demo agency account")
        create_data = await create_resp.json()
        company_id = create_data["account"]["company_id"]
        print(f"PASS: Created agency account {company_id}")

        try:
            print("Step 4: Login as agency account via API and seed unassigned payable")
            agency_login = await request.post(f"{API}/auth/login", data={"email": TEST_EMAIL, "password": TEST_PASSWORD})
            await assert_response_ok(agency_login, "agency login API")
            agency_token = (await agency_login.json())["access_token"]
            agency_headers = {"Authorization": f"Bearer {agency_token}"}

            org_config_resp = await request.get(f"{API}/org-config", headers=agency_headers)
            await assert_response_ok(org_config_resp, "agency org-config")
            org_config = await org_config_resp.json()
            assert org_config.get("industry_template") == "professional_services", f"Expected professional_services, got {org_config.get('industry_template')}"
            print("PASS: Agency org config resolves to professional_services terminology")

            payable_payload = {
                "supplier_name": "QA Terminology Vendor",
                "description": "QA unassigned cost for margin leakage terminology",
                "amount": 123.45,
                "invoice_number": "QA-TERM-V5",
                "due_date": "2026-07-31",
                "event_id": None,
                "fixed_cost_category_id": None,
                "cost_center_id": None
            }
            payable_resp = await request.post(f"{API}/business-clarity/supplier-payables", data=payable_payload, headers=agency_headers)
            await assert_response_ok(payable_resp, "create unassigned payable")
            print("PASS: Created unassigned payable to trigger margin leakage warning")

            print("Step 5: Login through real UI in Spanish")
            await page.goto(f"{FRONTEND}/login", wait_until="domcontentloaded")
            await page.evaluate("""() => { localStorage.clear(); localStorage.setItem('eep_language', 'es'); }""")
            await page.reload(wait_until="domcontentloaded")
            await page.get_by_test_id("login-email-input").fill(TEST_EMAIL)
            await page.get_by_test_id("login-password-input").fill(TEST_PASSWORD)
            await page.get_by_test_id("login-submit-btn").click()
            await page.wait_for_timeout(1500)
            print(f"Current URL after login: {page.url}")
            if "/login" in page.url:
                raise AssertionError("UI login remained on /login")
            print("PASS: Agency user logged in via UI")

            print("Step 6: Verify Payables warning card uses Proyecto, never Evento")
            await page.goto(f"{FRONTEND}/business-clarity/payables", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            await page.get_by_text("Cuentas por Pagar", exact=True).wait_for(timeout=10000)
            await page.get_by_text("Fuga de Margen Detectada", exact=True).wait_for(timeout=10000)
            payables_text = await page.locator("body").inner_text()
            expected_card = "Asigna a: Proyecto (afecta margen)"
            if expected_card not in payables_text:
                raise AssertionError(f"Missing expected Payables card copy: {expected_card}\nBody snippet: {payables_text[:2000]}")
            if "Asigna a: Evento" in payables_text:
                raise AssertionError("Forbidden Payables card copy still present: 'Asigna a: Evento'")
            print("PASS: Payables warning card says 'Asigna a: Proyecto (afecta margen)' and not Evento")

            print("Step 7: Verify Fuga de Margen badge tooltip uses proyecto/proyectos")
            await page.get_by_text("Fuga de Margen", exact=True).first.hover()
            await page.wait_for_timeout(700)
            tooltip_text = ""
            tooltip_locator = page.locator('[role="tooltip"]').first
            if await tooltip_locator.count() > 0:
                tooltip_text = await tooltip_locator.inner_text(timeout=3000)
            if not tooltip_text:
                tooltip_text = await page.locator("body").inner_text()
            expected_tooltip = "Los costos sin proyecto asignado afectan el margen global pero no aparecen en la rentabilidad de proyectos específicos."
            if expected_tooltip not in tooltip_text:
                raise AssertionError(f"Missing expected tooltip copy. Got: {tooltip_text}")
            lower_tooltip = tooltip_text.lower()
            if "sin evento asignado" in lower_tooltip or "eventos específicos" in lower_tooltip:
                raise AssertionError(f"Forbidden Evento tooltip terminology found: {tooltip_text}")
            print("PASS: Payables badge tooltip uses proyecto/proyectos and not evento/eventos")

            print("Step 8: Verify Reports P&L info card uses proyectos, never eventos")
            await page.goto(f"{FRONTEND}/business-clarity/reports", wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            await page.get_by_text("La utilidad operativa muestra", exact=False).wait_for(timeout=10000)
            reports_text = await page.locator("body").inner_text()
            expected_reports = "pagar todos los costos: proyectos, costos fijos y nómina"
            forbidden_reports = "pagar todos los costos: eventos, costos fijos y nómina"
            if expected_reports not in reports_text:
                raise AssertionError(f"Missing expected Reports P&L copy: {expected_reports}\nBody snippet: {reports_text[:2000]}")
            if forbidden_reports in reports_text:
                raise AssertionError("Forbidden Reports P&L copy still present: eventos, costos fijos y nómina")
            print("PASS: Reports P&L info card says proyectos and not eventos")

            # Required exact error selector check
            error_text = await page.evaluate("""() => {
                const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
                return errorElements.map(el => el.textContent).join(", ");
            }""")
            if error_text:
                print(f"Found error message: {error_text}")
            else:
                print("No error messages found on the page")

            print("TEST_RESULT: PASS fixed")
        finally:
            print("Step 9: Cleanup demo agency account")
            cleanup_resp = await request.delete(f"{API}/super-admin/demo-accounts/{company_id}", headers=super_headers)
            if cleanup_resp.status >= 400:
                print(f"WARNING: cleanup failed HTTP {cleanup_resp.status}: {await cleanup_resp.text()}")
            else:
                print(f"PASS: Cleanup deleted demo account {company_id}")
    except Exception as exc:
        print(f"TEST_RESULT: FAIL {type(exc).__name__}: {exc}")
        raise

# mcp_browser_automation executes script inside an async function with `page` available.
await run(page)