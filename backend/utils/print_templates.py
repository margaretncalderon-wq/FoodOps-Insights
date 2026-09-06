"""
Shared branded print/HTML template helper.

Provides a single wrapper that all "Download PDF" endpoints across the app
use so branding is 100% consistent (logo, colors, company name, footer)
and per-tenant configurable via:
  1. Settings → Branding module (companies collection)
  2. Settings → Document Templates (document_templates collection)

Usage:
    from utils.print_templates import render_branded_html, get_company_branding

    branding = await get_company_branding(company_id, template_type="KitchenSheet")
    return HTMLResponse(render_branded_html(
        branding=branding,
        title="Receta — Ravioles de Setas",
        body_html="<div>...</div>",
    ))
"""
from datetime import datetime, timezone
from typing import Optional


# CSS derived from Settings → Document Templates
_LOGO_SIZE_PX = {"small": 40, "medium": 56, "large": 80}
_DENSITY_PADDING = {"compact": "10mm 10mm", "normal": "15mm 12mm", "airy": "22mm 18mm"}
_DENSITY_FONT_SIZE = {"compact": "10.5px", "normal": "12px", "airy": "13.5px"}
_DENSITY_ROW_PAD = {"compact": "3px 6px", "normal": "6px 8px", "airy": "9px 10px"}


async def get_company_branding(
    company_id: str,
    template_type: Optional[str] = None,
    lang: str = "es",
) -> dict:
    """Fetch branding + document-template overrides for a given company.

    - Reads from `companies` collection populated by Settings → Branding.
    - If `template_type` is provided, layers on top the ACTIVE
      `document_templates` config for that template type (custom colors,
      header/footer text, style variant, density, logo prefs, T&C, etc).
    - Returns safe defaults if none are configured.
    """
    from config import db

    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0}) or {}

    branding = {
        "company_id": company_id,
        "company_name": company.get("company_name") or company.get("name") or "",
        "logo_url": company.get("logo_url") or "",
        "primary_color": company.get("primary_color") or "#4f46e5",
        "phone": company.get("phone") or "",
        "email": company.get("email") or "",
        "address": company.get("address") or "",
        "rnc": company.get("rnc") or company.get("tax_id") or "",
        "website": company.get("website") or "",
        # template-layer defaults
        "template_type": template_type,
        "header_text": None,
        "footer_text": None,
        "tagline": None,
        "terms_and_conditions": None,
        "payment_instructions": None,
        "bank_details": None,
        "style_variant": "classic",
        "show_logo": True,
        "logo_size": "medium",
        "logo_position": "left",
        "pdf_density": "normal",
        "show_company_address": True,
        "show_tax_id": True,
    }

    if template_type:
        tpl = await db.document_templates.find_one(
            {"company_id": company_id, "template_type": template_type, "is_active": True},
            {"_id": 0},
        )
        if tpl:
            lang_suffix = "es" if lang == "es" else "en"
            branding["primary_color"] = tpl.get("primary_color") or branding["primary_color"]
            branding["header_text"] = tpl.get(f"header_text_{lang_suffix}") or tpl.get("header_text_es") or tpl.get("header_text_en")
            branding["footer_text"] = tpl.get(f"footer_text_{lang_suffix}") or tpl.get("footer_text_es") or tpl.get("footer_text_en")
            branding["tagline"] = tpl.get(f"tagline_{lang_suffix}") or tpl.get("tagline_es") or tpl.get("tagline_en")
            branding["terms_and_conditions"] = tpl.get(f"terms_and_conditions_{lang_suffix}") or tpl.get("terms_and_conditions_es") or tpl.get("terms_and_conditions_en")
            branding["payment_instructions"] = tpl.get(f"payment_instructions_{lang_suffix}") or tpl.get("payment_instructions_es") or tpl.get("payment_instructions_en")
            branding["bank_details"] = tpl.get("bank_details")
            branding["style_variant"] = tpl.get("style_variant") or "classic"
            branding["show_logo"] = tpl.get("show_logo", True)
            branding["logo_size"] = tpl.get("logo_size") or "medium"
            branding["logo_position"] = tpl.get("logo_position") or "left"
            branding["pdf_density"] = tpl.get("pdf_density") or "normal"
            branding["show_company_address"] = tpl.get("show_company_address", True)
            branding["show_tax_id"] = tpl.get("show_tax_id", True)
            branding["template_id"] = tpl.get("template_id")
            branding["template_name"] = tpl.get("name") or template_type

    return branding


def _style_variant_css(variant: str, primary: str) -> str:
    """Return CSS overrides for the given style variant.

    Variants aligned with SettingsPage (Document Templates section):
      classic   — clean B/W with primary accent
      minimal   — Notion-style, warm, light borders
      editorial — magazine gourmet, serif headings, wider tracking
      luxury    — dark hotel 5-star vibe
    """
    if variant == "minimal":
        return (
            f".brand-header {{ border-bottom: 1px solid #e2e8f0; }} "
            f".doc-body h2 {{ border-bottom: 0; color: #334155; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }} "
            f"body {{ background: #fdfcfa; }} "
            f".doc-body .box {{ background: #fdfcfa; border-color: #e7e2d9; }} "
        )
    if variant == "editorial":
        return (
            f"body {{ font-family: Georgia, 'Times New Roman', serif; }} "
            f".doc-title h1 {{ font-family: Georgia, serif; font-weight: 400; letter-spacing: -0.02em; font-size: 26px; }} "
            f".doc-body h2 {{ font-family: Georgia, serif; font-weight: 600; font-style: italic; border-bottom: 1px double {primary}; }} "
            f".brand-header {{ border-bottom: 1px double {primary}; }} "
        )
    if variant == "luxury":
        return (
            f"body {{ background: #0f172a; color: #e2e8f0; }} "
            f".brand-header {{ border-bottom: 2px solid {primary}; }} "
            f".brand-header .contact {{ color: #94a3b8; }} "
            f".doc-title h1 {{ color: #f8fafc; letter-spacing: .02em; }} "
            f".doc-body h2 {{ color: {primary}; border-bottom: 1px solid #334155; }} "
            f".doc-body table th {{ background: #1e293b; color: #94a3b8; }} "
            f".doc-body table td {{ border-bottom-color: #1e293b; color: #e2e8f0; }} "
            f".doc-body .box {{ background: #1e293b; border-color: #334155; }} "
            f".doc-body .box .label {{ color: #94a3b8; }} "
            f".doc-body .box .val {{ color: #f8fafc; }} "
            f".brand-footer {{ border-top-color: #1e293b; color: #64748b; }} "
            f"@media print {{ body {{ background: white; color: #0f172a; }} .doc-title h1 {{ color: #0f172a; }} }} "
        )
    # classic — default (already applied)
    return ""


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

    Honors the active document template from Settings when present
    (colors, style_variant, logo prefs, density, header/footer text,
    terms & conditions, payment instructions).
    """
    company_name = branding.get("company_name", "")
    logo_url = branding.get("logo_url", "") if branding.get("show_logo", True) else ""
    primary = branding.get("primary_color", "#4f46e5")
    phone = branding.get("phone", "")
    email = branding.get("email", "")
    website = branding.get("website", "")
    rnc = branding.get("rnc", "") if branding.get("show_tax_id", True) else ""
    address = branding.get("address", "") if branding.get("show_company_address", True) else ""

    variant = branding.get("style_variant", "classic")
    density = branding.get("pdf_density", "normal")
    logo_size_key = branding.get("logo_size", "medium")
    logo_position = branding.get("logo_position", "left")

    logo_px = _LOGO_SIZE_PX.get(logo_size_key, 56)
    page_padding = _DENSITY_PADDING.get(density, "15mm 12mm")
    body_font_size = _DENSITY_FONT_SIZE.get(density, "12px")
    row_padding = _DENSITY_ROW_PAD.get(density, "6px 8px")

    header_text = branding.get("header_text") or ""
    footer_text = branding.get("footer_text") or ""
    tagline = branding.get("tagline") or ""
    terms = branding.get("terms_and_conditions") or ""
    payment_instructions = branding.get("payment_instructions") or ""
    bank_details = branding.get("bank_details") or ""

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    if logo_url:
        # Operational docs (kitchen sheets, packing lists, mise en place, BEO)
        # should NOT have a huge branded header — the chef needs the content
        # front and center. Cap the logo aggressively for those doc types.
        _op_docs = {"kitchen_sheet", "packing_list", "mise_en_place", "beo", "timeline"}
        if (document_type or "").lower() in _op_docs:
            _op_size = {"small": 20, "medium": 26, "large": 34}
            eff_px = _op_size.get(logo_size_key, 26)
        else:
            eff_px = logo_px
        logo_html = f'<img src="{logo_url}" alt="{company_name}" style="height:{eff_px}px;max-width:{int(eff_px * 3.2)}px;object-fit:contain" />'
    else:
        logo_html = f'<div style="font-size:{max(16, logo_px // 3)}px;font-weight:800;color:{primary}">{company_name or "&nbsp;"}</div>'

    if tagline:
        logo_html += f'<div style="font-size:10px;color:#64748b;margin-top:4px;font-style:italic">{tagline}</div>'

    contact_lines = []
    if address:
        contact_lines.append(address)
    contact_bits = []
    if phone:
        contact_bits.append(phone)
    if email:
        contact_bits.append(email)
    if website:
        contact_bits.append(website)
    if contact_bits:
        contact_lines.append(" · ".join(contact_bits))
    if rnc:
        contact_lines.append(f"RNC/Tax ID: {rnc}")
    contact_html = "<br/>".join(contact_lines) if contact_lines else ""

    doctype_pill = ""
    if document_type:
        doctype_pill = (
            f'<span style="display:inline-block;padding:3px 10px;font-size:10px;'
            f'text-transform:uppercase;letter-spacing:.08em;background:{primary};'
            f'color:white;border-radius:4px;margin-bottom:8px">{document_type}</span>'
        )

    subtitle_html = f'<div style="color:#64748b;font-size:12px;margin-top:2px">{subtitle}</div>' if subtitle else ""

    # Header/footer text blocks from document template
    header_text_html = f'<div style="text-align:center;font-size:11px;color:#475569;padding:6px 0;margin-bottom:12px;border-radius:4px;background:#f1f5f9">{header_text}</div>' if header_text else ""

    # Extra blocks appended before the footer: T&C, payment instructions, bank details
    extra_blocks_html = ""
    if terms:
        extra_blocks_html += f'<div style="margin-top:22px;padding-top:12px;border-top:1px dashed #cbd5e1"><h2 style="font-size:12px;color:#334155;border-bottom:0;margin-bottom:6px">Términos y Condiciones</h2><div style="font-size:10px;color:#475569;line-height:1.5;white-space:pre-wrap">{terms}</div></div>'
    if payment_instructions:
        extra_blocks_html += f'<div style="margin-top:16px"><h2 style="font-size:12px;color:#334155;border-bottom:0;margin-bottom:6px">Instrucciones de Pago</h2><div style="font-size:10px;color:#475569;line-height:1.5;white-space:pre-wrap">{payment_instructions}</div></div>'
    if bank_details:
        extra_blocks_html += f'<div style="margin-top:12px;padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:4px">Datos Bancarios</div><div style="font-size:10px;color:#475569;line-height:1.5;white-space:pre-wrap">{bank_details}</div></div>'

    footer_extra_html = f'<div style="margin-top:8px">{footer_extra}</div>' if footer_extra else ""
    footer_text_html = f'<div style="margin-top:6px;color:#64748b">{footer_text}</div>' if footer_text else ""

    # Adjust header alignment based on logo_position
    if logo_position == "center":
        header_layout = f'<div class="brand-header" style="flex-direction:column;align-items:center;text-align:center"><div>{logo_html}</div><div class="contact" style="text-align:center;margin-top:8px">{contact_html}</div></div>'
    elif logo_position == "right":
        header_layout = f'<div class="brand-header"><div class="contact" style="text-align:left">{contact_html}</div><div>{logo_html}</div></div>'
    else:  # left
        header_layout = f'<div class="brand-header"><div>{logo_html}</div><div class="contact">{contact_html}</div></div>'

    variant_css = _style_variant_css(variant, primary)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    @page {{ size: {page_size}; margin: {page_padding}; }}
    * {{ box-sizing: border-box; }}
    body {{ font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: {body_font_size}; line-height: 1.4; }}
    .brand-header {{ display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid {primary}; margin-bottom: 20px; gap: 20px; }}
    .brand-header .contact {{ text-align: right; font-size: 10px; color: #64748b; line-height: 1.5; }}
    .doc-title {{ margin-bottom: 20px; }}
    .doc-title h1 {{ font-size: 20px; margin: 0; color: #0f172a; }}
    .doc-body table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
    .doc-body table th, .doc-body table td {{ padding: {row_padding}; text-align: left; font-size: 11px; border-bottom: 1px solid #e2e8f0; }}
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
    {variant_css}
    @media print {{
      .noprint-bar {{ display: none; }}
      body {{ padding-top: 20px; }}
    }}
  </style>
</head>
<body>
  <div class="noprint-bar"><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></div>

  {header_layout}
  {header_text_html}

  <div class="doc-title">
    {doctype_pill}
    <h1>{title}</h1>
    {subtitle_html}
  </div>

  <div class="doc-body">{body_html}</div>

  {extra_blocks_html}

  <div class="brand-footer">
    Generado {now} · {company_name}
    {footer_text_html}
    {footer_extra_html}
  </div>
</body>
</html>"""
