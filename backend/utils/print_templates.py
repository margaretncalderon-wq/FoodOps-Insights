"""
Shared branded print/HTML template helper.

Provides a single wrapper that all "Download PDF" endpoints across the app
use so branding is 100% consistent (logo, colors, company name, footer)
and per-tenant configurable via the Settings → Branding module.

Usage:
    from utils.print_templates import render_branded_html, get_company_branding

    branding = await get_company_branding(company_id)
    return HTMLResponse(render_branded_html(
        branding=branding,
        title="Receta — Ravioles de Setas",
        body_html="<div>...</div>",
    ))
"""
from datetime import datetime, timezone
from typing import Optional


async def get_company_branding(company_id: str) -> dict:
    """Fetch branding settings for a given company_id (per-tenant).

    Returns safe defaults if the company is missing or has no branding config.
    Reads from `companies` collection populated by Settings → Branding.
    """
    from config import db
    doc = await db.companies.find_one({"company_id": company_id}, {"_id": 0}) or {}
    return {
        "company_id": company_id,
        "company_name": doc.get("company_name") or doc.get("name") or "",
        "logo_url": doc.get("logo_url") or "",
        "primary_color": doc.get("primary_color") or "#4f46e5",
        "phone": doc.get("phone") or "",
        "email": doc.get("email") or "",
        "address": doc.get("address") or "",
        "rnc": doc.get("rnc") or doc.get("tax_id") or "",
        "website": doc.get("website") or "",
    }


def render_branded_html(
    branding: dict,
    title: str,
    body_html: str,
    subtitle: Optional[str] = None,
    document_type: Optional[str] = None,
    footer_extra: Optional[str] = None,
    page_size: str = "A4",
) -> str:
    """Wrap `body_html` with a branded header + footer + print CSS.

    Includes a floating "Print / Save PDF" button that is hidden in the
    printed output via the `.noprint` class.
    """
    company_name = branding.get("company_name", "")
    logo_url = branding.get("logo_url", "")
    primary = branding.get("primary_color", "#4f46e5")
    phone = branding.get("phone", "")
    email = branding.get("email", "")
    website = branding.get("website", "")
    rnc = branding.get("rnc", "")
    address = branding.get("address", "")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    logo_html = ""
    if logo_url:
        logo_html = f'<img src="{logo_url}" alt="{company_name}" style="height:56px;max-width:180px;object-fit:contain" />'
    else:
        logo_html = f'<div style="font-size:22px;font-weight:800;color:{primary}">{company_name or "&nbsp;"}</div>'

    contact_lines = []
    if address: contact_lines.append(address)
    contact_bits = []
    if phone: contact_bits.append(phone)
    if email: contact_bits.append(email)
    if website: contact_bits.append(website)
    if contact_bits: contact_lines.append(" · ".join(contact_bits))
    if rnc: contact_lines.append(f"RNC/Tax ID: {rnc}")
    contact_html = "<br/>".join(contact_lines) if contact_lines else ""

    doctype_pill = ""
    if document_type:
        doctype_pill = (
            f'<span style="display:inline-block;padding:3px 10px;font-size:10px;'
            f'text-transform:uppercase;letter-spacing:.08em;background:{primary};'
            f'color:white;border-radius:4px;margin-bottom:8px">{document_type}</span>'
        )

    subtitle_html = f'<div style="color:#64748b;font-size:12px;margin-top:2px">{subtitle}</div>' if subtitle else ""
    footer_extra_html = f'<div style="margin-top:8px">{footer_extra}</div>' if footer_extra else ""

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    @page {{ size: {page_size}; margin: 15mm 12mm; }}
    * {{ box-sizing: border-box; }}
    body {{ font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }}
    .brand-header {{ display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid {primary}; margin-bottom: 20px; gap: 20px; }}
    .brand-header .contact {{ text-align: right; font-size: 10px; color: #64748b; line-height: 1.5; }}
    .doc-title {{ margin-bottom: 20px; }}
    .doc-title h1 {{ font-size: 20px; margin: 0; color: #0f172a; }}
    .doc-body table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
    .doc-body table th, .doc-body table td {{ padding: 6px 8px; text-align: left; font-size: 11px; border-bottom: 1px solid #e2e8f0; }}
    .doc-body table th {{ background: #f8fafc; text-transform: uppercase; font-size: 9px; letter-spacing: .05em; color: #64748b; }}
    .doc-body h2 {{ font-size: 14px; margin: 18px 0 8px; color: {primary}; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }}
    .doc-body .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    .doc-body .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
    .doc-body .box {{ border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }}
    .doc-body .box .label {{ font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-bottom: 3px; }}
    .doc-body .box .val {{ font-size: 14px; font-weight: 700; }}
    .brand-footer {{ margin-top: 32px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; }}
    .noprint-bar {{ position: fixed; top: 0; left: 0; right: 0; background: white; border-bottom: 1px solid #e2e8f0; padding: 10px 20px; text-align: right; z-index: 100; }}
    .noprint-bar button {{ background: {primary}; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; }}
    body {{ padding-top: 60px; }}
    @media print {{
      .noprint-bar {{ display: none; }}
      body {{ padding-top: 20px; }}
    }}
  </style>
</head>
<body>
  <div class="noprint-bar"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>

  <div class="brand-header">
    <div>{logo_html}</div>
    <div class="contact">{contact_html}</div>
  </div>

  <div class="doc-title">
    {doctype_pill}
    <h1>{title}</h1>
    {subtitle_html}
  </div>

  <div class="doc-body">{body_html}</div>

  <div class="brand-footer">
    Generado {now} · {company_name}
    {footer_extra_html}
  </div>
</body>
</html>"""
