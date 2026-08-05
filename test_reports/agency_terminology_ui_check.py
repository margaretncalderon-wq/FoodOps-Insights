"""
Playwright body for mcp_browser_automation.
Focused bug verification: agency tenant in Spanish must show Proyectos, not Eventos,
for the affected CRM and Business Clarity labels.
"""

import json
import re

BASE_URL = "https://foodops-insights.preview.emergentagent.com"
EMAIL = "termtest_agency_v3@kora.com"
PASSWORD = "Test1234!"

results = []


def record(name, ok, details=""):
    results.append({"check": name, "ok": bool(ok), "details": details})
    print(f"{'PASS' if ok else 'FAIL'} - {name}: {details}")


async def visible_text():
    try:
        return await page.locator("body").inner_text(timeout=8000)
    except Exception as exc:
        return f"<unable to read body: {exc}>"


async def goto_and_text(path, wait_ms=1800):
    await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
    await page.wait_for_timeout(wait_ms)
    return await visible_text()


async def check_contains(name, text, expected=None, forbidden=None):
    expected = expected or []
    forbidden = forbidden or []
    missing = [e for e in expected if e not in text]
    present_forbidden = [f for f in forbidden if f in text]
    ok = not missing and not present_forbidden
    details = json.dumps({"missing": missing, "forbidden_present": present_forbidden}, ensure_ascii=False)
    record(name, ok, details)
    return ok


try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.evaluate("""() => {
        localStorage.clear();
        localStorage.setItem('eep_language', 'es');
        localStorage.setItem('kora_app_version', '2.0.2');
    }""")
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill(EMAIL)
    await page.get_by_test_id("login-password-input").fill(PASSWORD)
    await page.get_by_test_id("login-submit-btn").click()
    await page.wait_for_url(re.compile(r".*/dashboard.*"), timeout=30000)
    await page.wait_for_timeout(3500)
    print("PASS - Logged in as agency demo account")

    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

    sidebar_text = await page.locator("aside").inner_text(timeout=10000)
    record(
        "Sidebar program orchestration Spanish agency label",
        "Orquestación de Programas" in sidebar_text and "Event Orchestration" not in sidebar_text and "Program Orchestration" not in sidebar_text,
        sidebar_text,
    )

    # CRM -> Clientes -> detail dialog.
    await page.goto(f"{BASE_URL}/client-engagement/crm/clients", wait_until="domcontentloaded")
    await page.wait_for_timeout(3000)
    await page.get_by_text("Cliente Terminología QA", exact=True).wait_for(timeout=15000)
    action_point = await page.evaluate("""() => {
        const name = Array.from(document.querySelectorAll('p')).find(el => el.textContent.trim() === 'Cliente Terminología QA');
        if (!name) throw new Error('client text not found');
        const row = name.closest('div.cursor-pointer');
        if (!row) throw new Error('client row not found');
        const buttons = Array.from(row.querySelectorAll('button'));
        const btn = buttons[buttons.length - 1];
        if (!btn) throw new Error('client row actions button not found');
        const rect = btn.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }""")
    await page.mouse.click(action_point["x"], action_point["y"])
    await page.wait_for_timeout(400)
    await page.get_by_text("Ver Detalles", exact=True).click(force=True)
    await page.wait_for_timeout(800)
    crm_info_text = await visible_text()
    await check_contains(
        "CRM client detail info tab KPI uses Proyectos and no Último Evento",
        crm_info_text,
        expected=["Proyectos"],
        forbidden=["Último Evento", "Eventos"],
    )
    await page.get_by_role("tab", name="Proyectos").click()
    await page.wait_for_timeout(500)
    crm_events_tab_text = await visible_text()
    await check_contains(
        "CRM client detail projects tab title",
        crm_events_tab_text,
        expected=["Historial de Proyectos"],
        forbidden=["Historial de Eventos"],
    )

    # Business Clarity Dashboard.
    dash_text = await goto_and_text("/business-clarity/dashboard", 2500)
    await check_contains(
        "Business Clarity dashboard negative margin metric",
        dash_text,
        expected=["Proyectos con Margen Negativo"],
        forbidden=["Eventos con Margen Negativo"],
    )

    # Sales Reports table + CSV export header.
    sales_text = await goto_and_text("/business-clarity/sales-reports", 2500)
    await page.get_by_role("button", name="Ventas por Vendedor").click()
    await page.wait_for_timeout(2500)
    sales_text = await visible_text()
    await check_contains(
        "Sales Reports by salesperson table header",
        sales_text,
        expected=["Proyectos"],
        forbidden=["Eventos"],
    )
    csv_ok = False
    csv_details = ""
    try:
        async with page.expect_download(timeout=10000) as download_info:
            await page.get_by_role("button", name="Exportar CSV").click()
        download = await download_info.value
        csv_path = "/app/test_reports/sales_report_export.csv"
        await download.save_as(csv_path)
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            csv_content = f.read(500)
        csv_ok = "Proyectos" in csv_content and "Eventos" not in csv_content
        csv_details = csv_content
    except Exception as exc:
        csv_details = f"CSV export check failed: {exc}"
    record("Sales Reports CSV header uses Proyectos", csv_ok, csv_details)

    # Marketing ROI.
    marketing_text = await goto_and_text("/business-clarity/marketing-roi", 2500)
    await check_contains(
        "Marketing ROI project labels",
        marketing_text,
        expected=["Activaciones + Proyectos", "Proyectos Internos:", "Costo Proyectos:"],
        forbidden=["Activaciones + Eventos", "Eventos Internos:", "Costo Eventos:"],
    )

    # Executive Reports.
    reports_text = await goto_and_text("/business-clarity/reports", 2500)
    await check_contains(
        "Reports net profit direct costs label",
        reports_text,
        expected=["(-) Costos Directos (Proyectos)"],
        forbidden=["(-) Costos Directos (Eventos)"],
    )

    # Close / Reconciliation.
    close_text = await goto_and_text("/business-clarity/close", 3000)
    await check_contains(
        "Close reconciliation COGS project labels",
        close_text,
        expected=["COGS de Proyectos (Directo)", "COGS Total Proyectos", "COGS Proyectos"],
        forbidden=["COGS de Eventos (Directo)", "COGS Total Eventos", "COGS Eventos", "COGS Evento", "directo (eventos)"],
    )

    out = {"results": results, "failed": [r for r in results if not r["ok"]]}
    print("UI_CHECK_RESULTS=" + json.dumps(out, ensure_ascii=False, indent=2))
except Exception as exc:
    print(f"UI_TEST_EXCEPTION: {exc}")
    try:
        await page.screenshot(path="/app/test_reports/agency_terminology_ui_exception.jpg", quality=40, full_page=False)
    except Exception:
        pass
    raise