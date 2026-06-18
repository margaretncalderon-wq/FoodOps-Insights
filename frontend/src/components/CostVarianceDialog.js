import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Label } from "./ui/label";
import { AlertTriangle, Loader2, Info, TrendingUp, TrendingDown } from "lucide-react";
import { API_BASE as API } from "../utils/api";
import { formatDateOnly } from "../utils/dates";

const SEVERITY_META = {
  ok: { cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300", labelEn: "OK", labelEs: "OK" },
  warn: { cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300", labelEn: "Warning", labelEs: "Aviso" },
  critical: { cls: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300", labelEn: "Critical", labelEs: "Crítico" },
};

/**
 * CostVarianceDialog — Feature 4.
 *
 * Calls GET /api/cost-variance to list events with their theoretical vs actual
 * cost gap. Bands: <5% OK, 5–10% WARN, >10% CRITICAL.
 */
export default function CostVarianceDialog({ open, onOpenChange, initialEventId = null }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [windowDays, setWindowDays] = useState(180);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focusedEvent, setFocusedEvent] = useState(null); // deeplinked event detail

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = { days: windowDays };
      if (severityFilter !== "all") params.severity_filter = severityFilter;
      const res = await axios.get(`${API}/api/cost-variance`, { params, withCredentials: true });
      setData(res.data);
    } catch (e) {
      toast.error(isEs ? "Error al cargar" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [windowDays, severityFilter, isEs]);

  useEffect(() => {
    if (open) fetch();
  }, [open, fetch]);

  // Deeplinked event — fetch its detail when dialog opens with initialEventId
  useEffect(() => {
    if (!open || !initialEventId) {
      setFocusedEvent(null);
      return;
    }
    let cancelled = false;
    axios.get(`${API}/api/cost-variance/event/${initialEventId}`, { withCredentials: true })
      .then((r) => { if (!cancelled) setFocusedEvent(r.data); })
      .catch(() => { if (!cancelled) setFocusedEvent(null); });
    return () => { cancelled = true; };
  }, [open, initialEventId]);

  const summary = data?.summary || {};
  const total = (summary.ok || 0) + (summary.warn || 0) + (summary.critical || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="cost-variance-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            {isEs ? "Variación de Costo (Teórico vs Real)" : "Cost Variance (Theoretical vs Actual)"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {isEs
              ? "Compara costo planificado vs lo que realmente se consumió (lotes de producción publicados). Umbrales: <5% OK, 5–10% aviso, >10% crítico."
              : "Compares planned cost vs what was actually consumed (POSTED production batches). Bands: <5% OK, 5–10% warning, >10% critical."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs">{isEs ? "Ventana (días)" : "Window (days)"}</Label>
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <SelectTrigger className="w-32" data-testid="cv-window-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="60">60</SelectItem>
                <SelectItem value="90">90</SelectItem>
                <SelectItem value="180">180</SelectItem>
                <SelectItem value="365">365</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{isEs ? "Severidad" : "Severity"}</Label>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-40" data-testid="cv-severity-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="warn">{isEs ? "Aviso" : "Warning"}</SelectItem>
                <SelectItem value="critical">{isEs ? "Crítico" : "Critical"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {total} {isEs ? "eventos con datos reales" : "events with actual data"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {Object.keys(SEVERITY_META).map((s) => (
            <Card key={s} className={`${SEVERITY_META[s].cls} border`} data-testid={`cv-sev-${s}`}>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase font-bold">{isEs ? SEVERITY_META[s].labelEs : SEVERITY_META[s].labelEn}</p>
                <p className="text-2xl font-bold">{summary[s] || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {focusedEvent && (
          <Card className={`border-2 ${SEVERITY_META[focusedEvent.severity]?.cls || ""}`} data-testid="cv-focused-event">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase opacity-70">{isEs ? "Evento enlazado" : "Linked event"}</p>
                  <p className="font-semibold text-base">{focusedEvent.event_name}</p>
                  <p className="text-xs opacity-80">
                    {focusedEvent.event_date ? formatDateOnly(focusedEvent.event_date, language) : "—"} · {focusedEvent.guest_count} {isEs ? "invitados" : "guests"}
                  </p>
                </div>
                <Badge className={`${SEVERITY_META[focusedEvent.severity]?.cls} text-xs`}>
                  {focusedEvent.is_overrun
                    ? <TrendingUp className="inline w-3 h-3 mr-0.5" />
                    : <TrendingDown className="inline w-3 h-3 mr-0.5" />}
                  {focusedEvent.variance_percent >= 0 ? "+" : ""}{focusedEvent.variance_percent}%
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="opacity-70">{isEs ? "Teórico" : "Theoretical"}:</span> <span className="font-mono font-semibold">${focusedEvent.theoretical_cost.toFixed(2)}</span></div>
                <div><span className="opacity-70">{isEs ? "Real" : "Actual"}:</span> <span className="font-mono font-semibold">${focusedEvent.actual_cost.toFixed(2)}</span></div>
                <div><span className="opacity-70">{isEs ? "Variación" : "Variance"}:</span> <span className="font-mono font-semibold">${focusedEvent.variance_amount.toFixed(2)}</span></div>
              </div>
              {focusedEvent.production_batches?.length > 0 && (
                <p className="text-xs opacity-80">
                  {focusedEvent.batches_count} {isEs ? "lote(s) de producción publicado(s)" : "POSTED production batch(es)"}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (data?.events || []).length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            {isEs ? "No hay eventos con lotes de producción publicados en esta ventana." : "No events with POSTED production batches in this window."}
          </p>
        ) : (
          <div className="border rounded-md max-h-96 overflow-y-auto" data-testid="cv-table">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Teórico" : "Theoretical"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Real" : "Actual"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Variación" : "Variance"}</TableHead>
                  <TableHead>{isEs ? "Severidad" : "Severity"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((e) => (
                  <TableRow key={e.event_id} data-testid={`cv-row-${e.event_id}`}>
                    <TableCell className="font-medium">{e.event_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.event_date ? formatDateOnly(e.event_date, language) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">${e.theoretical_cost.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">${e.actual_cost.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={e.is_overrun ? "text-rose-600 font-semibold" : "text-emerald-600 font-semibold"}>
                        {e.is_overrun ? <TrendingUp className="inline w-3 h-3 mr-0.5" /> : <TrendingDown className="inline w-3 h-3 mr-0.5" />}
                        {e.variance_percent >= 0 ? "+" : ""}{e.variance_percent}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${SEVERITY_META[e.severity]?.cls} text-[10px]`}>
                        {isEs ? SEVERITY_META[e.severity]?.labelEs : SEVERITY_META[e.severity]?.labelEn}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="cv-close-btn">
            {isEs ? "Cerrar" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
