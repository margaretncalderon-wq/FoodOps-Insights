import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Loader2, Printer, RefreshCw, ChefHat, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";
import { API_BASE as API } from "../utils/api";
import { buildBeoPrintHtml } from "./KitchenBEOPrint";

const todayIso = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const plusDaysIso = (days) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function KitchenSheetsBatch() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(plusDaysIso(7));
  const [sheets, setSheets] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);

  const fetchSheets = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/kitchen-beo/batch?start_date=${startDate}&end_date=${endDate}&include_stages=Won,Committed,Confirmed`,
        { withCredentials: true }
      );
      setSheets(res.data?.sheets || []);
      // Auto-select everything by default — admin can uncheck what she doesn't need
      setSelected(new Set((res.data?.sheets || []).map((s) => s.event_id)));
    } catch (err) {
      toast.error(isEs ? "Error al cargar hojas" : "Error loading sheets");
    }
    setLoading(false);
  };

  useEffect(() => { fetchSheets(); /* eslint-disable-next-line */ }, []);

  const toggle = (eid) => {
    const next = new Set(selected);
    if (next.has(eid)) next.delete(eid); else next.add(eid);
    setSelected(next);
  };
  const toggleAll = () => {
    setSelected(selected.size === sheets.length ? new Set() : new Set(sheets.map((s) => s.event_id)));
  };

  const summary = useMemo(() => {
    const sel = sheets.filter((s) => selected.has(s.event_id));
    return {
      sheets: sel.length,
      pages: sel.reduce((acc, s) => acc + (s.totals?.tandas_count || 0), 0),
      withChanges: sel.filter((s) => s.changed_since_print).length,
    };
  }, [sheets, selected]);

  const printSelected = async () => {
    const sel = sheets.filter((s) => selected.has(s.event_id));
    if (sel.length === 0) {
      toast.error(isEs ? "Selecciona al menos una hoja" : "Pick at least one sheet");
      return;
    }
    const html = buildBeoPrintHtml(sel, isEs);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, { position: "fixed", right: 0, bottom: 0, width: 0, height: 0, border: 0, visibility: "hidden" });
    document.body.appendChild(iframe);
    const cleanup = () => setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 1500);
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      doc.open(); doc.write(html); doc.close();
      const win = iframe.contentWindow;
      if (win) { try { win.focus(); } catch (_e) { /* */ } win.print(); }
    } catch (_e) { /* */ } finally { cleanup(); }

    // Mark each selected event as printed
    Promise.all(sel.map((s) =>
      axios.post(
        `${API}/api/kitchen-beo/event/${s.event_id}/mark-printed`,
        { snapshot_hash: s.snapshot_hash, scope: "batch" },
        { withCredentials: true }
      ).catch(() => null)
    )).then(() => {
      toast.success(isEs ? `${sel.length} hoja(s) impresas y marcadas` : `${sel.length} sheet(s) printed and marked`);
      fetchSheets();
    });
  };

  return (
    <div className="space-y-4 p-6 max-w-6xl mx-auto" data-testid="kitchen-sheets-batch">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ChefHat className="w-6 h-6" />
          {isEs ? "Hojas de Cocina — Imprimir en lote" : "Kitchen Sheets — Batch print"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEs
            ? "Selecciona el rango y la herramienta saca un PDF con todas las tandas de cada evento confirmado."
            : "Pick a range — every confirmed event's services come out on separate pages."}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{isEs ? "Desde" : "From"}</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="batch-start-date" />
          </div>
          <div>
            <Label className="text-xs">{isEs ? "Hasta" : "To"}</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="batch-end-date" />
          </div>
          <Button onClick={fetchSheets} variant="outline" disabled={loading} data-testid="batch-refresh">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">{isEs ? "Recargar" : "Reload"}</span>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{summary.sheets} {isEs ? "selecc." : "selected"}</Badge>
            <Badge variant="outline">{summary.pages} {isEs ? "hojas" : "pages"}</Badge>
            {summary.withChanges > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                <AlertTriangle className="w-3 h-3 mr-1" />{summary.withChanges} {isEs ? "con cambios" : "with changes"}
              </Badge>
            )}
            <Button onClick={printSelected} className="bg-amber-600 hover:bg-amber-700" disabled={summary.sheets === 0} data-testid="batch-print-btn">
              <Printer className="w-4 h-4 mr-2" />
              {isEs ? "Imprimir seleccionadas" : "Print selected"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sheets table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {isEs ? "Eventos confirmados en el rango" : "Confirmed events in range"} ({sheets.length})
            </CardTitle>
            {sheets.length > 0 && (
              <Button variant="ghost" size="sm" onClick={toggleAll} data-testid="batch-toggle-all">
                {selected.size === sheets.length ? (isEs ? "Deseleccionar" : "Deselect all") : (isEs ? "Seleccionar todo" : "Select all")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-muted-foreground py-6 text-center">Cargando…</div>}
          {!loading && sheets.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {isEs ? "No hay eventos confirmados en este rango." : "No confirmed events in this range."}
            </div>
          )}
          <div className="space-y-2">
            {sheets.map((s) => (
              <div
                key={s.event_id}
                className={`flex items-start gap-3 p-3 border rounded-md ${selected.has(s.event_id) ? "bg-blue-50/60 border-blue-300" : "bg-background"}`}
                data-testid={`batch-row-${s.event_id}`}
              >
                <Checkbox checked={selected.has(s.event_id)} onCheckedChange={() => toggle(s.event_id)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{s.event_name}</p>
                    {s.changed_since_print ? (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                        <AlertTriangle className="w-3 h-3 mr-1" />{isEs ? "cambios desde impresión" : "changes since print"}
                      </Badge>
                    ) : s.last_print ? (
                      <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50">
                        <CheckCircle2 className="w-3 h-3 mr-1" />{isEs ? "impresa" : "printed"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {isEs ? "nunca impresa" : "never printed"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-1">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{(s.calendar_dates || []).join(", ") || "—"}</span>
                    <span>{s.guest_count} {isEs ? "invitados" : "guests"}</span>
                    <span>{s.totals?.tandas_count} {isEs ? "tanda(s)" : "service(s)"}</span>
                    <span>{s.totals?.recipes_count} {isEs ? "recetas" : "recipes"}</span>
                  </div>
                  {s.last_print && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {isEs ? "Última impresión" : "Last print"}: {new Date(s.last_print.printed_at).toLocaleString()} · {s.last_print.printed_by_name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
