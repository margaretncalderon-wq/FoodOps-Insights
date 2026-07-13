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
import { ChefHat, Printer, AlertTriangle, Info, Sparkles, Clock, CheckCircle2 } from "lucide-react";
import { KoraLoader } from "./KoraLoader";
import { API_BASE as API } from "../utils/api";
import { buildBeoPrintHtml, escapeHtml } from "./KitchenBEOPrint";

// re-export for the batch page so it can call us
export { buildBeoPrintHtml, escapeHtml };

const formatRelative = (iso, isEs) => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return isEs ? "ahora" : "now";
  if (mins < 60) return isEs ? `hace ${mins} min` : `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return isEs ? `hace ${h} h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return isEs ? `hace ${d} día(s)` : `${d}d ago`;
};

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

  const print = async () => {
    if (!beo) return;
    const html = buildBeoPrintHtml([beo], isEs);
    // Synchronous iframe print — same pattern as DocumentPreview.handlePrint
    // so Safari doesn't block it. Hidden, write+print+cleanup.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden",
    });
    document.body.appendChild(iframe);
    const cleanup = () => setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 1200);
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) { cleanup(); return; }
      doc.open(); doc.write(html); doc.close();
      const win = iframe.contentWindow;
      if (win) { try { win.focus(); } catch (_e) { /* iOS */ } win.print(); }
    } catch (_e) { /* swallow */ } finally { cleanup(); }

    // Tell the backend we printed — non-blocking, fire & forget
    try {
      await axios.post(
        `${API}/api/kitchen-beo/event/${beo.event_id}/mark-printed`,
        { snapshot_hash: beo.snapshot_hash, scope: "single" },
        { withCredentials: true }
      );
      setBeo((prev) => prev && ({
        ...prev,
        changed_since_print: false,
        last_print: {
          printed_at: new Date().toISOString(),
          printed_by_name: prev.last_print?.printed_by_name || "—",
          snapshot_hash: prev.snapshot_hash,
        },
      }));
    } catch (_e) { /* ignore */ }
  };

  const reset = () => { setBeo(null); setEventId(""); };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="kitchen-beo-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-primary" />
            {isEs ? "Hoja de Cocina (BEO)" : "Kitchen BEO"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {isEs
              ? "Una hoja separada por cada tanda de servicio y cada día. Sin precios."
              : "One sheet per service batch and per day. No prices."}
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
            {loading ? <KoraLoader size={16} /> : <Sparkles className="w-4 h-4" />}
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
                      {(beo.calendar_dates || []).join(", ") || "—"} · {beo.guest_count} {isEs ? "invitados" : "guests"}
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

            {/* Last-printed banner */}
            {beo.last_print && (
              beo.changed_since_print ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-2" data-testid="beo-changed-banner">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold text-amber-900">
                      {isEs ? "⚠ Cambios después de la última impresión" : "⚠ Changes since last print"}
                    </p>
                    <p className="text-amber-800">
                      {isEs ? "Última impresión" : "Last printed"}: {formatRelative(beo.last_print.printed_at, isEs)} · {beo.last_print.printed_by_name}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-green-200 bg-green-50 p-2 flex items-center gap-2 text-xs" data-testid="beo-uptodate-banner">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-green-800">
                    {isEs ? "Última impresión" : "Last printed"}: {formatRelative(beo.last_print.printed_at, isEs)} · {beo.last_print.printed_by_name} · {isEs ? "sin cambios" : "no changes"}
                  </span>
                </div>
              )
            )}

            {beo.allergens_aggregate?.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50/60 p-3 flex gap-2" data-testid="beo-allergens-aggregate">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">
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

            {/* Days → tandas */}
            <div className="space-y-3">
              {(beo.days || []).map((day) => (
                <div key={day.date || "tbd"} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {day.date || (isEs ? "Sin fecha" : "TBD")} — {day.tanda_count} {isEs ? "tanda(s)" : "service(s)"}
                  </p>
                  {(day.tandas || []).map((t) => (
                    <div key={t.tanda_key} className="border rounded-md p-3" data-testid={`beo-tanda-${t.tanda_key}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold capitalize flex items-center gap-2">
                          {t.section_title || (isEs ? "Sin sección" : "No section")}
                          {t.section_time && (
                            <Badge variant="outline" className="font-mono text-xs bg-amber-50 border-amber-300 text-amber-800">
                              <Clock className="w-3 h-3 mr-1" />{t.section_time}{t.section_end_time ? ` – ${t.section_end_time}` : ""}
                            </Badge>
                          )}
                        </p>
                        <span className="text-xs text-muted-foreground">{t.guest_count} {isEs ? "invitados" : "guests"}</span>
                      </div>
                      <div className="space-y-1.5">
                        {(t.recipes || []).map((r, i) => (
                          <div key={i} className="text-xs border-l-2 border-primary/40 pl-2">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="font-medium text-sm">{r.recipe_name || r.description}</span>
                              <span className="font-mono text-muted-foreground">{r.portions_required} {r.yield_unit}</span>
                            </div>
                          </div>
                        ))}
                        {(t.extras || []).map((ex, i) => (
                          <div key={`ex-${i}`} className="text-xs border-l-2 border-gray-300 pl-2">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="font-medium text-sm">{ex.description}</span>
                              <span className="font-mono text-muted-foreground">×{ex.quantity}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {isEs ? "Total" : "Total"}: {beo.totals?.days_count} {isEs ? "día(s)" : "day(s)"} · {beo.totals?.tandas_count} {isEs ? "tanda(s)" : "service(s)"} · {beo.totals?.recipes_count} {isEs ? "recetas" : "recipes"}
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
