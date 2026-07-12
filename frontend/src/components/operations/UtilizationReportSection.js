import { useEffect, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  BarChart3, TrendingUp, PackageX, Building2, RefreshCw, ShoppingCart,
} from "lucide-react";
import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { fmtNum } from "../../utils/format";

/** Sprint I — Utilization Report */
export function UtilizationReportSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [days, setDays] = useState("90");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/inventory/utilization-report?days=${days}`, {
        withCredentials: true,
      });
      setData(r.data);
    } catch (_) { setData(null); }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, [days]);

  const topUsed = data?.top_used || [];
  const neverMoved = data?.never_moved || [];
  const alwaysRented = data?.always_rented || [];

  return (
    <div className="space-y-4" data-testid="utilization-report-section">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                {t("Reporte de Utilización", "Utilization Report")}
              </CardTitle>
              <CardDescription>
                {t(
                  "Qué activos usas mucho (invertir más), cuáles no mueves (venderlos) y cuáles siempre alquilas (candidatos para comprar).",
                  "Which assets pull their weight, which never move, and which you always rent (buy candidates)."
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-40" data-testid="window-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">{t("Últimos 30 días", "Last 30 days")}</SelectItem>
                  <SelectItem value="90">{t("Últimos 90 días", "Last 90 days")}</SelectItem>
                  <SelectItem value="180">{t("Últimos 180 días", "Last 180 days")}</SelectItem>
                  <SelectItem value="365">{t("Último año", "Last year")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="top">
            <TabsList>
              <TabsTrigger value="top" data-testid="tab-top-used">
                <TrendingUp className="w-4 h-4 mr-1" />
                {t("Más usados", "Top used")}
                <Badge variant="outline" className="ml-2 text-xs">{topUsed.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="unused" data-testid="tab-never-moved">
                <PackageX className="w-4 h-4 mr-1" />
                {t("Sin movimiento", "Never moved")}
                <Badge variant="outline" className="ml-2 text-xs">{neverMoved.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="rented" data-testid="tab-always-rented">
                <Building2 className="w-4 h-4 mr-1" />
                {t("Siempre alquilas", "Always rented")}
                <Badge variant="outline" className="ml-2 text-xs">{alwaysRented.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="top" className="pt-4">
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("Cargando…", "Loading…")}</div>
              ) : topUsed.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("Sin datos de uso en este período", "No usage data in this period")}
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Item", "Item")}</TableHead>
                        <TableHead className="text-right">{t("Veces usado", "Times used")}</TableHead>
                        <TableHead className="text-right">{t("Cantidad total", "Total qty")}</TableHead>
                        <TableHead>{t("Último uso", "Last used")}</TableHead>
                        <TableHead>{t("Origen", "Origin")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topUsed.map((r) => (
                        <TableRow key={r.inventory_item_id} data-testid={`top-used-${r.inventory_item_id}`}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right font-mono">{fmtNum(r.times_used)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtNum(r.total_qty)}</TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {r.last_used_at ? formatDateOnly(r.last_used_at, language) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={r.origin === "Alquilado" ? "bg-purple-50 text-purple-700" : "bg-slate-50"}>
                              {r.origin}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="unused" className="pt-4">
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("Cargando…", "Loading…")}</div>
              ) : neverMoved.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("¡Todos tus items se están usando! 👏", "All your items are being used!")}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t(
                      "Estos items no salieron en ningún conduce durante el período. Considera venderlos, ajustar stock o mover a bodega secundaria.",
                      "These items didn't leave the warehouse during the period. Consider selling, adjusting stock, or moving to secondary storage."
                    )}
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("Item", "Item")}</TableHead>
                          <TableHead className="text-right">{t("Stock", "Stock")}</TableHead>
                          <TableHead className="text-right">{t("Costo", "Cost")}</TableHead>
                          <TableHead>{t("Origen", "Origin")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {neverMoved.map((r) => (
                          <TableRow key={r.inventory_item_id} data-testid={`never-moved-${r.inventory_item_id}`}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-right font-mono">{fmtNum(r.stock)}</TableCell>
                            <TableCell className="text-right">
                              {r.cost_per_unit > 0 ? `$${fmtNum(r.cost_per_unit)}` : (
                                <span className="text-amber-600 text-xs">{t("sin costo", "no cost")}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={r.origin === "Alquilado" ? "bg-purple-50 text-purple-700" : "bg-slate-50"}>
                                {r.origin}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="rented" className="pt-4">
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("Cargando…", "Loading…")}</div>
              ) : alwaysRented.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("Sin items alquilados con uso frecuente (>3 veces)", "No rentals with frequent use (>3 times)")}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    <ShoppingCart className="w-4 h-4 inline mr-1" />
                    {t(
                      "Alquilas estos items a menudo. A este ritmo, comprarlos podría pagarse solo en unos meses.",
                      "You rent these often. At this pace, buying them could pay off in a few months."
                    )}
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("Item", "Item")}</TableHead>
                          <TableHead className="text-right">{t("Veces alquilado", "Times rented")}</TableHead>
                          <TableHead className="text-right">{t("Costo/día", "Cost/day")}</TableHead>
                          <TableHead className="text-right">{t("Gasto estimado", "Est. spend")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alwaysRented.map((r) => {
                          const estSpend = (r.rental_cost_per_unit_day || 0) * (r.total_qty || 0);
                          return (
                            <TableRow key={r.inventory_item_id} data-testid={`always-rented-${r.inventory_item_id}`}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              <TableCell className="text-right font-mono">{fmtNum(r.times_used)}</TableCell>
                              <TableCell className="text-right">
                                ${fmtNum(r.rental_cost_per_unit_day || 0)}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-purple-700">
                                ${fmtNum(estSpend)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default UtilizationReportSection;
