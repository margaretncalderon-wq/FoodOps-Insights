import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { ChefHat, Printer, Loader2, AlertTriangle, Info, Sparkles } from "lucide-react";
import { API_BASE as API } from "../utils/api";

/**
 * KitchenBEO — Feature 2 dialog.
 *
 * Select an event → fetch /api/kitchen-beo/event/{event_id} → preview + Print.
 * Printing opens a new window with a print-ready HTML and triggers window.print(),
 * matching the pattern already used in Mise en Place (ProductionSection).
 */
export default function KitchenBEO({ open, onOpenChange, events = [] }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [eventId, setEventId] = useState("");
  const [beo, setBeo] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!eventId) {
      toast.error(isEs ? "Selecciona un evento" : "Pick an event");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/kitchen-beo/event/${eventId}`, { withCredentials: true });
      setBeo(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail || (isEs ? "Error al generar BEO" : "BEO generation failed");
      toast.error(typeof msg === "string" ? msg : "Error");
      setBeo(null);
    } finally {
      setLoading(false);
    }
  };

  const print = () => {
    if (!beo) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error(isEs ? "Permite ventanas emergentes" : "Allow pop-ups");
      return;
    }
    const html = buildPrintHtml(beo, isEs);
    w.document.write(html);
    w.document.close();
  };

  const reset = () => {
    setBeo(null);
    setEventId("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="kitchen-beo-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-primary" />
            {isEs ? "BEO de Cocina" : "Kitchen BEO"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {isEs
              ? "Documento de orden de banquete con recetas escaladas y alertas de alérgenos para cocina."
              : "Banquet event order with scaled recipes and allergen alerts for the kitchen."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">{isEs ? "Evento" : "Event"}</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger data-testid="beo-event-select">
                <SelectValue placeholder={isEs ? "Elige un evento..." : "Pick an event..."} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {events.map((e) => (
                  <SelectItem key={e.event_id} value={e.event_id}>
                    {e.name}{e.guest_count ? ` — ${e.guest_count} ${isEs ? "invitados" : "guests"}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={loading || !eventId} data-testid="beo-generate-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span className="ml-1.5">{isEs ? "Generar" : "Generate"}</span>
          </Button>
        </div>

        {beo && (
          <div className="space-y-3 mt-3" data-testid="beo-result">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{isEs ? "Evento" : "Event"}</p>
                    <p className="font-semibold">{beo.event_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {beo.event_date ? new Date(beo.event_date).toLocaleDateString() : "—"} · {beo.guest_count} {isEs ? "invitados" : "guests"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">{isEs ? "Menú" : "Menu"}</p>
                    <p className="font-semibold">{beo.menu_name || "—"}</p>
                    <Badge variant="outline" className="text-[10px]">{beo.menu_type}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {beo.allergens_aggregate?.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50/60 dark:bg-red-950/20 p-3 flex gap-2" data-testid="beo-allergens-aggregate">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wide">
                    {isEs ? "Alérgenos en este evento" : "Allergens in this event"}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {beo.allergens_aggregate.map((a) => (
                      <Badge key={a} className="bg-red-100 text-red-800 border-red-300 text-[11px]">{a}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {beo.dietary_tags_aggregate?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground mr-1">{isEs ? "Dieta:" : "Dietary:"}</span>
                {beo.dietary_tags_aggregate.map((d) => (
                  <Badge key={d} variant="secondary" className="text-[10px]">{d}</Badge>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {beo.courses?.map((c) => (
                <div key={c.course_id || c.course_name} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold capitalize">{c.course_name}</p>
                    {c.service_time && (
                      <Badge variant="outline" className="font-mono text-xs bg-amber-50 border-amber-300 text-amber-800">
                        🕐 {c.service_time}{c.service_end_time ? ` – ${c.service_end_time}` : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {c.recipes?.map((r) => (
                      <div key={r.recipe_id} className="text-xs border-l-2 border-primary/40 pl-2">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="font-medium text-sm">{r.recipe_name}</span>
                          <span className="font-mono text-muted-foreground">
                            {r.portions_required} {r.yield_unit}
                            {r.consumption_factor !== 1 && <Badge variant="outline" className="text-[9px] ml-1 h-4 px-1">×{r.consumption_factor}</Badge>}
                          </span>
                        </div>
                        {(r.allergens?.length > 0 || r.dietary_tags?.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.allergens?.map((a) => (
                              <Badge key={a} className="bg-red-100 text-red-800 border-red-300 text-[9px] h-4 px-1">⚠ {a}</Badge>
                            ))}
                            {r.dietary_tags?.map((d) => (
                              <Badge key={d} variant="secondary" className="text-[9px] h-4 px-1">{d}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {isEs ? "Total recetas" : "Total recipes"}: {beo.totals?.recipes_count} · {isEs ? "Costo insumos" : "Input cost"}: ${(beo.totals?.total_input_cost || 0).toFixed(2)}
            </p>
          </div>
        )}

        <DialogFooter>
          {beo && (
            <Button onClick={print} className="gap-1.5 bg-amber-600 hover:bg-amber-700" data-testid="beo-print-btn">
              <Printer className="w-4 h-4" />
              {isEs ? "Imprimir / Guardar PDF" : "Print / Save PDF"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="beo-close-btn">
            {isEs ? "Cerrar" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Build a self-contained print-friendly HTML document. Uses inline styles to avoid
// loading anything from the parent app. Triggers window.print() on load.
function buildPrintHtml(beo, isEs) {
  const fmtDate = beo.event_date ? new Date(beo.event_date).toLocaleDateString() : "—";
  const allergensHtml = (beo.allergens_aggregate || []).map((a) => `<span class="allergen">${a}</span>`).join(" ");
  const dietHtml = (beo.dietary_tags_aggregate || []).map((d) => `<span class="diet">${d}</span>`).join(" ");

  const coursesHtml = (beo.courses || []).map((c) => `
    <h2 class="course-header">
      <span>${escapeHtml(c.course_name || "")}</span>
      ${c.service_time ? `<span class="course-time">🕐 ${escapeHtml(c.service_time)}${c.service_end_time ? ` – ${escapeHtml(c.service_end_time)}` : ""}</span>` : ""}
    </h2>
    ${(c.recipes || []).map((r) => `
      <div class="recipe">
        <div class="recipe-head">
          <h3>${escapeHtml(r.recipe_name)}</h3>
          <div class="qty"><strong>${r.portions_required}</strong> ${escapeHtml(r.yield_unit || "")}${r.consumption_factor !== 1 ? ` <span class="factor">×${r.consumption_factor}</span>` : ""}</div>
        </div>
        ${(r.allergens?.length || r.dietary_tags?.length) ? `
          <div class="recipe-tags">
            ${(r.allergens || []).map((a) => `<span class="allergen">⚠ ${escapeHtml(a)}</span>`).join(" ")}
            ${(r.dietary_tags || []).map((d) => `<span class="diet">${escapeHtml(d)}</span>`).join(" ")}
          </div>
        ` : ""}
        ${(r.ingredients || []).length > 0 ? `
          <table>
            <thead><tr><th class="cb">✓</th><th>${isEs ? "Ingrediente" : "Ingredient"}</th><th class="num">${isEs ? "Cantidad" : "Quantity"}</th><th>${isEs ? "Unidad" : "Unit"}</th></tr></thead>
            <tbody>
              ${(r.ingredients || []).map((i) => `<tr><td class="cb">☐</td><td>${escapeHtml(i.name)}</td><td class="num"><strong>${i.quantity}</strong></td><td>${escapeHtml(i.unit)}</td></tr>`).join("")}
            </tbody>
          </table>
        ` : ""}
        ${r.chef_notes ? `<div class="note"><strong>${isEs ? "Notas chef:" : "Chef notes:"}</strong> ${escapeHtml(r.chef_notes)}</div>` : ""}
        ${r.presentation_notes ? `<div class="note"><strong>${isEs ? "Presentación:" : "Presentation:"}</strong> ${escapeHtml(r.presentation_notes)}</div>` : ""}
      </div>
    `).join("")}
  `).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>BEO - ${escapeHtml(beo.event_name || "")}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #222; }
  h1 { border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 6px; }
  h2.course-header { background: #f3f4f6; padding: 8px 12px; margin-top: 24px; border-left: 4px solid #333; display: flex; justify-content: space-between; align-items: center; }
  .course-time { font-size: 14px; background: #fef3c7; color: #92400e; padding: 2px 10px; border-radius: 6px; border: 1px solid #fcd34d; font-weight: 600; }
  h3 { margin: 0; font-size: 16px; }
  .meta { display: flex; justify-content: space-between; flex-wrap: wrap; font-size: 13px; color: #555; }
  .meta strong { color: #222; }
  .alert-strip { background: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; margin: 16px 0; border-radius: 6px; }
  .alert-strip .label { display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; color: #991b1b; margin-bottom: 4px; }
  .allergen { display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 999px; font-size: 11px; margin-right: 4px; }
  .diet { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 999px; font-size: 11px; margin-right: 4px; }
  .recipe { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-top: 10px; page-break-inside: avoid; }
  .recipe-head { display: flex; justify-content: space-between; align-items: baseline; }
  .qty { font-size: 16px; color: #1f2937; }
  .factor { background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
  .recipe-tags { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
  th { background: #f9fafb; }
  .num { text-align: right; font-family: 'Courier New', monospace; }
  .cb { width: 24px; text-align: center; }
  .note { margin-top: 8px; font-size: 12px; color: #4b5563; background: #f9fafb; padding: 6px 8px; border-radius: 4px; }
  .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 13px; }
  @media print {
    .no-print { display: none; }
    h2.course-header { page-break-before: auto; }
  }
</style>
</head>
<body>
  <h1>🍳 ${isEs ? "BEO de Cocina" : "Kitchen BEO"}</h1>
  <div class="meta">
    <div>
      <div><strong>${isEs ? "Evento" : "Event"}:</strong> ${escapeHtml(beo.event_name || "")}</div>
      <div><strong>${isEs ? "Fecha" : "Date"}:</strong> ${fmtDate}${beo.start_time ? " · " + escapeHtml(beo.start_time) : ""}</div>
      ${beo.venue ? `<div><strong>${isEs ? "Lugar" : "Venue"}:</strong> ${escapeHtml(beo.venue)}</div>` : ""}
    </div>
    <div style="text-align:right;">
      <div><strong>${isEs ? "Invitados" : "Guests"}:</strong> ${beo.guest_count}</div>
      <div><strong>${isEs ? "Menú" : "Menu"}:</strong> ${escapeHtml(beo.menu_name || "—")} (${escapeHtml(beo.menu_type || "")})</div>
      <div><strong>${isEs ? "Recetas" : "Recipes"}:</strong> ${beo.totals?.recipes_count || 0}</div>
    </div>
  </div>

  ${(beo.allergens_aggregate || []).length > 0 ? `
    <div class="alert-strip">
      <span class="label">⚠ ${isEs ? "Alérgenos en este evento" : "Allergens in this event"}</span>
      ${allergensHtml}
    </div>
  ` : ""}
  ${(beo.dietary_tags_aggregate || []).length > 0 ? `
    <div style="margin: 8px 0;">
      <span style="font-size:11px; color:#555; text-transform:uppercase; font-weight:600;">${isEs ? "Etiquetas dietéticas" : "Dietary tags"}: </span>
      ${dietHtml}
    </div>
  ` : ""}

  ${coursesHtml}

  <div class="footer">
    <p><strong>${isEs ? "Chef responsable" : "Responsible Chef"}:</strong> _________________________</p>
    <p><strong>${isEs ? "Hora de inicio" : "Start time"}:</strong> ________ &nbsp; <strong>${isEs ? "Hora de fin" : "End time"}:</strong> ________</p>
    <p style="color:#9ca3af; font-size:11px; margin-top:14px;">
      ${isEs ? "Generado" : "Generated"}: ${new Date(beo.generated_at).toLocaleString()}
    </p>
  </div>

  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
