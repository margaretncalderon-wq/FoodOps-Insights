import { useEffect, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  Calendar, CalendarClock, AlertOctagon, Users, Package, RefreshCw, ArrowRight,
} from "lucide-react";
import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { fmtNum } from "../../utils/format";

/** Sprint H — Upcoming Commitments (7-14-30 days horizon). */
export function UpcomingCommitmentsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [horizon, setHorizon] = useState("14");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/inventory/upcoming-commitments?days=${horizon}`, {
        withCredentials: true,
      });
      setData(r.data);
    } catch (_) { setData(null); }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, [horizon]);

  const events = data?.events || [];
  const pressure = data?.stock_pressure || [];

  return (
    <div className="space-y-4" data-testid="upcoming-commitments-section">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5" />
                {t("Compromisos entrantes", "Upcoming Commitments")}
              </CardTitle>
              <CardDescription>
                {t(
                  "Timeline de eventos próximos con el inventario comprometido para cada uno.",
                  "Timeline of upcoming events with the inventory committed to each."
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={horizon} onValueChange={setHorizon}>
                <SelectTrigger className="w-32" data-testid="horizon-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t("7 días", "7 days")}</SelectItem>
                  <SelectItem value="14">{t("14 días", "14 days")}</SelectItem>
                  <SelectItem value="30">{t("30 días", "30 days")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stock pressure alert */}
      {pressure.length > 0 && (
        <Card className="border-red-200 bg-red-50/40" data-testid="stock-pressure-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-900">
              <AlertOctagon className="w-5 h-5 text-red-600" />
              {t(
                `Presión de stock — ${pressure.length} items en riesgo`,
                `Stock pressure — ${pressure.length} items at risk`
              )}
            </CardTitle>
            <CardDescription>
              {t(
                "Los eventos entrantes piden más de lo que tienes disponible. Compra, alquila o reagenda.",
                "Upcoming events demand more than what's on hand. Buy, rent, or reschedule."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Item", "Item")}</TableHead>
                    <TableHead className="text-right">{t("Stock", "Stock")}</TableHead>
                    <TableHead className="text-right">{t("Demanda", "Demand")}</TableHead>
                    <TableHead className="text-right">{t("Faltante", "Shortfall")}</TableHead>
                    <TableHead>{t("Origen", "Origin")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pressure.slice(0, 10).map((p) => (
                    <TableRow key={p.inventory_item_id} data-testid={`pressure-${p.inventory_item_id}`}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(p.stock)} {p.unit}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(p.upcoming_demand)}</TableCell>
                      <TableCell className="text-right font-mono text-red-700 font-semibold">
                        -{fmtNum(p.shortfall)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.origin === "Alquilado" ? "bg-purple-50 text-purple-700" : "bg-slate-50"}>
                          {p.origin}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pressure.length > 10 && (
                <div className="p-2 text-xs text-center text-muted-foreground">
                  + {pressure.length - 10} más
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline of upcoming events */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {t(`Próximos ${horizon} días`, `Next ${horizon} days`)}
            <Badge variant="outline" className="text-xs ml-2">{events.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">{t("Cargando…", "Loading…")}</div>
          ) : events.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <Calendar className="w-8 h-8 mx-auto text-slate-400" />
              <p className="font-medium">{t("No hay eventos en este rango", "No events in this range")}</p>
              <p className="text-xs text-slate-500">
                {t("Amplía el horizonte o crea nuevos eventos", "Widen the horizon or create new events")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div
                  key={ev.event_id}
                  className="border rounded-lg p-3 hover:bg-slate-50 transition"
                  data-testid={`commitment-event-${ev.event_id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{ev.event_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {ev.status || "confirmed"}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {ev.event_date ? formatDateOnly(ev.event_date, language) : "TBD"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {fmtNum(ev.guest_count)} {t("invitados", "guests")}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {ev.reserved_items_count} {t("items reservados", "reserved items")}
                        </span>
                      </div>
                      {ev.reserved_items_count > 0 && (
                        <div className="mt-2 text-xs text-slate-500 truncate">
                          {ev.reserved_items.slice(0, 4).map((i) => `${i.name} (${i.qty})`).join(" · ")}
                          {ev.reserved_items_count > 4 && ` +${ev.reserved_items_count - 4}`}
                        </div>
                      )}
                    </div>
                    <a
                      href={`/event-orchestration/${ev.event_id}`}
                      className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1"
                    >
                      {t("Abrir", "Open")}
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default UpcomingCommitmentsSection;
