// KitchenBEOPrint.js — shared print template for single + batch Kitchen BEO.
// Each (day, tanda) gets its OWN printed page via page-break-after: always.

export const escapeHtml = (s) => (s == null ? "" : String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;"));

const renderTandaPage = (beo, day, tanda, isEs) => {
  // Tanda header — operational docs show day + time, not a category name.
  // E.g. "Lun, 25/05/2026 — 08:15". If we still have a section_title (legacy
  // data) we keep it as a small sub-label.
  const tandaLabel = (() => {
    const parts = [];
    if (day.date) {
      try {
        const d = new Date(day.date + "T12:00:00");
        const opts = { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" };
        parts.push(d.toLocaleDateString(isEs ? "es" : "en", opts));
      } catch (_e) {
        parts.push(day.date);
      }
    }
    if (tanda.section_time) {
      parts.push(tanda.section_time + (tanda.section_end_time ? ` – ${tanda.section_end_time}` : ""));
    }
    return parts.join(" — ") || (isEs ? "Sin horario" : "No time");
  })();

  const recipesRows = (tanda.recipes || []).map((r) => `
    <tr>
      <td class="qty">${r.portions_required} ${escapeHtml(r.yield_unit || "")}</td>
      <td>
        <div class="recipe-name">${escapeHtml(r.recipe_name || r.description || "")}</div>
        ${r.allergens?.length ? `<div class="badges">${r.allergens.map(a => `<span class="all">⚠ ${escapeHtml(a)}</span>`).join("")}</div>` : ""}
        ${r.dietary_tags?.length ? `<div class="badges">${r.dietary_tags.map(d => `<span class="diet">${escapeHtml(d)}</span>`).join("")}</div>` : ""}
        ${r.presentation_notes ? `<div class="notes"><b>${isEs ? "Presentación" : "Presentation"}:</b> ${escapeHtml(r.presentation_notes)}</div>` : ""}
        ${r.chef_notes ? `<div class="notes"><b>${isEs ? "Notas del chef" : "Chef notes"}:</b> ${escapeHtml(r.chef_notes)}</div>` : ""}
      </td>
      <td class="time">
        ${r.prep_time_minutes ? `<div>${isEs ? "Prep" : "Prep"}: ${r.prep_time_minutes}m</div>` : ""}
        ${r.cook_time_minutes ? `<div>${isEs ? "Cocción" : "Cook"}: ${r.cook_time_minutes}m</div>` : ""}
      </td>
    </tr>
    ${r.ingredients?.length ? `
      <tr class="ingredients-row">
        <td></td>
        <td colspan="2">
          <div class="ing-title">${isEs ? "Ingredientes" : "Ingredients"} (${isEs ? "para esta tanda" : "for this batch"}):</div>
          <ul class="ings">
            ${r.ingredients.map(ing => `<li>${ing.quantity} ${escapeHtml(ing.unit)} — ${escapeHtml(ing.name)}</li>`).join("")}
          </ul>
        </td>
      </tr>` : ""}
  `).join("");

  const extrasRows = (tanda.extras || []).map((ex) => `
    <tr class="extra">
      <td class="qty">×${ex.quantity}</td>
      <td><div class="recipe-name">${escapeHtml(ex.description || "")}</div>
          <div class="notes">${isEs ? "Sin receta — preparación manual" : "No recipe — manual prep"}</div></td>
      <td></td>
    </tr>
  `).join("");

  return `
    <section class="sheet">
      <header class="sheet-header">
        <div>
          <h1>${escapeHtml(beo.event_name || "")}</h1>
          <div class="meta">
            <span>👥 ${tanda.guest_count} ${isEs ? "invitados" : "guests"}</span>
            ${beo.menu_name ? `<span>🍽 ${escapeHtml(beo.menu_name)}</span>` : ""}
            ${beo.venue ? `<span>📍 ${escapeHtml(beo.venue)}</span>` : ""}
          </div>
        </div>
        <div class="tanda-box">
          <div class="tanda-title">${escapeHtml(tandaLabel)}</div>
          ${tanda.section_title ? `<div class="tanda-sub">${escapeHtml(tanda.section_title)}</div>` : ""}
        </div>
      </header>

      ${(tanda.allergens?.length || tanda.dietary_tags?.length) ? `
        <div class="alerts">
          ${tanda.allergens?.length ? `<div class="alert-row"><b>${isEs ? "⚠ Alérgenos" : "⚠ Allergens"}:</b> ${tanda.allergens.map(a => `<span class="all">${escapeHtml(a)}</span>`).join(" ")}</div>` : ""}
          ${tanda.dietary_tags?.length ? `<div class="alert-row"><b>${isEs ? "Dieta" : "Dietary"}:</b> ${tanda.dietary_tags.map(d => `<span class="diet">${escapeHtml(d)}</span>`).join(" ")}</div>` : ""}
        </div>
      ` : ""}

      <table class="dishes">
        <thead>
          <tr>
            <th class="qty">${isEs ? "Cant." : "Qty"}</th>
            <th>${isEs ? "Plato / Producto" : "Dish / Product"}</th>
            <th class="time">${isEs ? "Tiempo" : "Time"}</th>
          </tr>
        </thead>
        <tbody>
          ${recipesRows}
          ${extrasRows}
          ${(!recipesRows && !extrasRows) ? `<tr><td colspan="3" class="empty">${isEs ? "Sin ítems en esta tanda" : "No items in this service"}</td></tr>` : ""}
        </tbody>
      </table>

      <footer class="sheet-footer">
        <div>${isEs ? "Generado" : "Generated"}: ${new Date().toLocaleString()}</div>
        <div>${isEs ? "Hoja" : "Sheet"}: ${escapeHtml(day.date || "TBD")} ${escapeHtml(tanda.section_time || "")}</div>
      </footer>
    </section>
  `;
};

export const buildBeoPrintHtml = (beos, isEs = true) => {
  const allPages = [];
  // Brand color from the first BEO. Defaults to neutral dark.
  const rawBrand = (beos?.[0]?.primary_color) || "#1a1a1a";
  const brand = /^#[0-9a-fA-F]{3,8}$/.test(rawBrand) ? rawBrand : "#1a1a1a";
  for (const beo of beos) {
    for (const day of (beo.days || [])) {
      for (const tanda of (day.tandas || [])) {
        allPages.push(renderTandaPage(beo, day, tanda, isEs));
      }
    }
    // Defensive: if an event has zero tandas, still emit a placeholder sheet.
    if (!(beo.days || []).some((d) => (d.tandas || []).length > 0)) {
      allPages.push(`
        <section class="sheet"><header class="sheet-header"><div><h1>${escapeHtml(beo.event_name || "")}</h1></div></header>
        <p class="empty">${isEs ? "Este evento no tiene tandas/ítems definidos." : "This event has no service slots defined."}</p></section>
      `);
    }
  }

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${isEs ? "Hojas de Cocina" : "Kitchen Sheets"}</title>
<style>
  @page { size: Letter portrait; margin: 14mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.45; }
  .sheet { padding: 0; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid ${brand}; padding-bottom: 10px; margin-bottom: 14px; }
  .sheet-header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: ${brand}; }
  .meta { display: flex; flex-wrap: wrap; gap: 12px; color: #4b5563; font-size: 11px; }
  .tanda-box { text-align: right; min-width: 200px; }
  .tanda-title { font-size: 14px; font-weight: 600; color: ${brand}; letter-spacing: 0.02em; }
  .tanda-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }

  .alerts { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
  .alert-row { font-size: 11px; margin: 2px 0; color: #374151; }
  .alert-row b { color: #111827; }
  .all { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 4px; padding: 1px 6px; font-size: 10px; margin-right: 4px; }
  .diet { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; border-radius: 4px; padding: 1px 6px; font-size: 10px; margin-right: 4px; }

  table.dishes { width: 100%; border-collapse: collapse; }
  table.dishes thead th { background: #f3f4f6; color: #111827; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid ${brand}; }
  table.dishes thead th.qty { width: 90px; }
  table.dishes thead th.time { width: 90px; text-align: right; }
  table.dishes tbody td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.dishes tbody td.qty { font-family: ui-monospace, monospace; font-weight: 700; font-size: 14px; color: #111827; }
  table.dishes tbody td.time { text-align: right; color: #6b7280; font-size: 11px; }
  .recipe-name { font-weight: 600; font-size: 13px; }
  .badges { margin-top: 3px; }
  .notes { margin-top: 4px; font-size: 11px; color: #4b5563; }
  .ingredients-row td { background: #fafafa; padding-top: 4px !important; padding-bottom: 8px !important; }
  .ing-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 3px; }
  .ings { margin: 0; padding-left: 18px; font-size: 11px; column-count: 2; }
  .ings li { break-inside: avoid; }
  .extra td { background: #fff; }
  .empty { text-align: center; color: #9ca3af; padding: 20px 0; }

  .sheet-footer { margin-top: 18px; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; border-top: 1px dashed #d1d5db; padding-top: 6px; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
${allPages.join("\n")}
</body></html>`;
};
