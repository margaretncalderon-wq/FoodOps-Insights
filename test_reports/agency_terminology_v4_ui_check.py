"""
Playwright body for mcp_browser_automation.
Focused bug verification: agency tenant in Spanish must use Proyecto(s) terminology
instead of Evento(s) in CRM and Business Clarity labels involved in the user report.
"""

import json
import re

BASE_URL = "https://foodops-insights.preview.emergentagent.com"
EMAIL = "termtest_agency_v4@kora.com"
PASSWORD = "Test1234!"

results = []


def record(name, ok, details=""):
    results.append({"check": name, "ok": bool(ok), "details": str(details)[:2000]})
    print(f"{'PASS' if ok else 'FAIL'} - {name}: {details}")


async def visible_text(timeout=10000):
    try:
        return await page.locator("body").inner_text(timeout=timeout)
    except Exception as exc:
        return f"<unable to read body: {exc}>"


async def goto_and_text(path, wait_ms=2500):
    await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
    await page.wait_for_timeout(wait_ms)
    return await visible_text()


def check_text(name, text, expected=None, forbidden=None):
    expected = expected or []
    forbidden = forbidden or []
    missing = [e for e in expected if e not in text]
    present_forbidden = [f for f in forbidden if f in text]
    ok = not missing and not present_forbidden
    record(name, ok, json.dumps({"missing": missing, "forbidden_present": present_forbidden}, ensure_ascii=False))
    return ok


async def hover_last_icon_near_exact_text(label):
    point = await page.evaluate(
        """(label) => {
        const el = Array.from(document.querySelectorAll('span, p, div')).find(n => n.textContent.trim() === label);
        if (!el) throw new Error('label not found: ' + label);
        const container = el.parentElement;
        const icons = Array.from(container.querySelectorAll('svg'));
        const icon = icons[icons.length - 1];
        if (!icon) throw new Error('icon not found near: ' + label);
        const r = icon.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }""",
        label,
    )
    await page.mouse.move(point["x"], point["y"])
    await page.wait_for_timeout(800)


async def open_client_details(client_name):
    await page.goto(f"{BASE_URL}/client-engagement/crm/clients", wait_until="domcontentloaded")
    await page.wait_for_timeout(3000)
    await page.get_by_text(client_name, exact=True).wait_for(timeout=15000)
    action_point = await page.evaluate(
        """(clientName) => {
        const candidates = Array.from(document.querySelectorAll('p, span, div')).filter(el => el.textContent.trim() === clientName);
        const name = candidates[0];
        if (!name) throw new Error('client text not found: ' + clientName);
        const row = name.closest('div.cursor-pointer') || name.closest('[class*="cursor-pointer"]') || name.closest('tr') || name.parentElement;
        if (!row) throw new Error('client row not found');
        const buttons = Array.from(row.querySelectorAll('button'));
        const btn = buttons[buttons.length - 1];
        if (!btn) throw new Error('client row actions button not found');
        const rect = btn.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }""",
        client_name,
    )
    await page.mouse.click(action_point["x"], action_point["y"])
    await page.wait_for_timeout(500)
    await page.get_by_text("Ver Detalles", exact=True).click(force=True)
    await page.wait_for_timeout(1000)


try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.evaluate(
        """() => {
        localStorage.clear();
        localStorage.setItem('eep_language', 'es');
        localStorage.setItem('kora_app_version', '2.0.2');
    }"""
    )
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

    # CRM client with no projects: KPI and empty state must be Proyecto(s), not Evento(s).
    await open_client_details("Cliente Sin Proyectos QA V4")
    crm_info_text = await visible_text()
    check_text(
        "CRM client detail KPI and labels use Proyecto terminology",
        crm_info_text,
        expected=["Último Proyecto", "Proyectos"],
        forbidden=["Último Evento", "Historial de Eventos"],
    )
    await page.get_by_role("tab", name="Proyectos", exact=True).click()
    await page.wait_for_timeout(700)
    crm_projects_text = await visible_text()
    check_text(
        "CRM no-project empty state says No hay proyectos",
        crm_projects_text,
        expected=["Historial de Proyectos", "No hay proyectos"],
        forbidden=["Historial de Eventos", "No hay eventos"],
    )

    # Business Clarity Dashboard including tooltip description.
    dash_text = await goto_and_text("/business-clarity/dashboard", 3000)
    check_text(
        "Dashboard negative margin metric label",
        dash_text,
        expected=["Proyectos con Margen Negativo"],
        forbidden=["Eventos con Margen Negativo"],
    )
    try:
        await hover_last_icon_near_exact_text("Costos Sin Asignar")
    except Exception as exc:
        record("Dashboard cost allocation tooltip hover", False, f"Could not hover tooltip icon: {exc}")
    dash_tooltip_text = await visible_text()
    check_text(
        "Dashboard cost allocation tooltip uses proyectos",
        dash_tooltip_text,
        expected=["Costos no asignados a proyectos distorsionan la rentabilidad real."],
        forbidden=["Costos no asignados a eventos distorsionan la rentabilidad real."],
    )

    # Close / Reconciliation page, visible COGS cards, allocation table, and fix modal.
    close_text = await goto_and_text("/business-clarity/close", 3500)
    check_text(
        "Close/Reconciliation visible COGS project labels",
        close_text,
        expected=[
            "Separación de COGS directo (proyectos) vs overhead",
            "COGS de Proyectos (Directo)",
            "Asignado a proyectos específicos",
            "Ajustes + uso sin proyecto",
            "Vista Previa de Asignación por Proyecto",
        ],
        forbidden=[
            "Separación de COGS directo (eventos) vs overhead",
            "COGS de Eventos (Directo)",
            "Asignado a eventos específicos",
            "Ajustes + uso sin evento",
            "Vista Previa de Asignación por Evento",
        ],
    )
    await page.get_by_text("Vista Previa de Asignación por Proyecto", exact=True).click(force=True)
    await page.wait_for_timeout(700)
    close_alloc_text = await visible_text()
    check_text(
        "Close/Reconciliation allocation table headers and totals",
        close_alloc_text,
        expected=["Proyecto", "COGS Proyecto", "Total proyectos"],
        forbidden=["Evento", "COGS Evento", "Total eventos"],
    )
    try:
        await page.get_by_role("button", name="Arreglar").first.click(force=True)
        await page.wait_for_timeout(800)
        close_modal_text = await visible_text()
        check_text(
            "Close/Reconciliation fix modal assignment labels",
            close_modal_text,
            expected=["Asignar a Proyecto", "Seleccionar Proyecto", "Selecciona un proyecto..."],
            forbidden=["Asignar a Evento", "Seleccionar Evento", "Selecciona un evento..."],
        )
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
    except Exception as exc:
        record("Close/Reconciliation fix modal assignment labels", False, f"Could not open fix modal: {exc}")

    # Reports / export terminology.
    reports_text = await goto_and_text("/business-clarity/reports", 3000)
    check_text(
        "Business Clarity reports tab label",
        reports_text,
        expected=["Por Proyecto"],
        forbidden=["Por Evento"],
    )
    await page.get_by_role("button", name="Por Proyecto", exact=True).click(force=True)
    await page.wait_for_timeout(2500)
    reports_project_text = await visible_text()
    check_text(
        "Business Clarity reports project table text",
        reports_project_text,
        expected=["Proyecto"],
        forbidden=["Evento"],
    )
    try:
        async with page.expect_download(timeout=10000) as download_info:
            await page.get_by_role("button", name="CSV").click(force=True)
        download = await download_info.value
        csv_path = "/app/test_reports/reports_project_export_v4.csv"
        await download.save_as(csv_path)
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            csv_content = f.read(500)
        record("Business Clarity reports CSV uses Proyecto header", "Proyecto" in csv_content and "Evento" not in csv_content, csv_content)
    except Exception as exc:
        record("Business Clarity reports CSV uses Proyecto header", False, f"CSV export failed: {exc}")

    # Fixed costs / expense categories.
    fixed_text = await goto_and_text("/business-clarity/fixed-costs", 3000)
    check_text(
        "Fixed costs project labels",
        fixed_text,
        expected=["Promedio por Proyecto", "Break-even por Proyecto"],
        forbidden=["Promedio por Evento", "Break-even por Evento"],
    )

    # Payables page and New Expense dialog. Also checks margin leakage tooltip/warning because code review found hardcoded strings here.
    payables_text = await goto_and_text("/business-clarity/payables", 3000)
    check_text(
        "Payables visible warning uses proyectos",
        payables_text,
        expected=["Asigna a: Proyecto"],
        forbidden=["Asigna a: Evento", "eventos específicos", "evento asignado"],
    )
    try:
        await page.get_by_text("Fuga de Margen", exact=True).first.hover()
        await page.wait_for_timeout(700)
        payables_tooltip_text = await visible_text()
        check_text(
            "Payables margin leakage tooltip uses proyectos",
            payables_tooltip_text,
            expected=["proyectos específicos"],
            forbidden=["eventos específicos", "sin evento asignado"],
        )
    except Exception as exc:
        record("Payables margin leakage tooltip uses proyectos", False, f"Could not hover tooltip: {exc}")
    await page.get_by_test_id("new-expense-btn").click(force=True)
    await page.wait_for_timeout(800)
    expense_text = await visible_text()
    check_text(
        "Payables New Expense default assignment labels",
        expense_text,
        expected=["Nuevo Gasto", "Asignar a"],
        forbidden=["Evento"],
    )
    await page.get_by_test_id("expense-assignment-type-select").click(force=True)
    await page.wait_for_timeout(300)
    await page.get_by_text("Proyecto", exact=True).click(force=True)
    await page.wait_for_timeout(800)
    expense_project_text = await visible_text()
    check_text(
        "Payables New Expense project assignment labels",
        expense_project_text,
        expected=["Proyecto"],
        forbidden=["Evento", "Selecciona evento...", "rentabilidad del evento"],
    )
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(500)

    # Payments table header.
    payments_text = await goto_and_text("/business-clarity/payments", 3000)
    check_text(
        "Payments table header uses Pedido / Proyecto",
        payments_text,
        expected=["Pedido / Proyecto"],
        forbidden=["Pedido / Evento"],
    )

    # Sales Reports and CSV.
    sales_text = await goto_and_text("/business-clarity/sales-reports", 3000)
    try:
        await page.get_by_role("button", name="Ventas por Vendedor", exact=True).click(force=True)
        await page.wait_for_timeout(2500)
    except Exception:
        pass
    sales_text = await visible_text()
    check_text(
        "Sales Reports table uses Proyectos",
        sales_text,
        expected=["Proyectos"],
        forbidden=["Eventos"],
    )
    try:
        async with page.expect_download(timeout=10000) as download_info:
            await page.get_by_role("button", name="Exportar CSV", exact=True).click(force=True)
        download = await download_info.value
        csv_path = "/app/test_reports/sales_report_export_v4.csv"
        await download.save_as(csv_path)
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            csv_content = f.read(500)
        record("Sales Reports CSV header uses Proyectos", "Proyectos" in csv_content and "Eventos" not in csv_content, csv_content)
    except Exception as exc:
        record("Sales Reports CSV header uses Proyectos", False, f"CSV export failed: {exc}")

    # Marketing ROI.
    marketing_text = await goto_and_text("/business-clarity/marketing-roi", 3000)
    check_text(
        "Marketing ROI project labels",
        marketing_text,
        expected=["Activaciones + Proyectos", "Proyectos Internos:", "Costo Proyectos:"],
        forbidden=["Activaciones + Eventos", "Eventos Internos:", "Costo Eventos:"],
    )

    out = {"results": results, "failed": [r for r in results if not r["ok"]]}
    print("UI_CHECK_RESULTS=" + json.dumps(out, ensure_ascii=False, indent=2))
except Exception as exc:
    print(f"UI_TEST_EXCEPTION: {exc}")
    try:
        await page.screenshot(path="/app/test_reports/agency_terminology_v4_ui_exception.jpg", quality=40, full_page=False)
    except Exception:
        pass
    raise