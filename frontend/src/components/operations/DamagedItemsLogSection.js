import { useEffect, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { AlertTriangle, XCircle, DollarSign, ChevronDown, ChevronUp, RefreshCw, Image as ImageIcon } from "lucide-react";
import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { fmtNum } from "../../utils/format";

/**
 * Damaged / Missing Items Log — feeds off `damaged_items_log`.
 * Items land here automatically when a delivery note is checked-in with
 * condition = "dañado" or "faltante" (Sprint C).
 *
 * Props:
 *   year, month — controlling AssetCountSection filter (already in that view).
 */
export function DamagedItemsLogSection({ year, month }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [data, setData] = useState({ entries: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (year && month) {
        params.set("year", year);
        params.set("month", month);
      }
      const r = await axios.get(`${API}/api/damaged-items-log?${params.toString()}`, {
        withCredentials: true,
      });
      setData(r.data || { entries: [], totals: {} });
    } catch (e) {
      console.warn("damaged items log failed", e?.message);
      setData({ entries: [], totals: {} });
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [year, month]);

  const totals = data?.totals || {};
  const entries = data?.entries || [];

  return (
    <Card className="border-amber-200 bg-amber-50/30" data-testid="damaged-items-log">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white shadow-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {t("Daños y Faltantes", "Damages & Missing")}
                <Badge variant="outline" className="text-xs">
                  {totals.count || 0}
                </Badge>
              </CardTitle>
              <p className="text-xs text-slate-600">
                {t(
                  `${totals.damaged || 0} dañados · ${totals.missing || 0} faltantes · $${fmtNum(totals.total_replacement_cost || 0)} en reposición`,
                  `${totals.damaged || 0} damaged · ${totals.missing || 0} missing · $${fmtNum(totals.total_replacement_cost || 0)} in replacement`
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={fetchData} data-testid="damaged-items-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              data-testid="damaged-items-toggle"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              {t("Cargando…", "Loading…")}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-6 text-center space-y-1">
              <p className="text-sm font-medium text-slate-700">
                {t("Sin daños ni faltantes en este período", "No damages or missing items this period")}
              </p>
              <p className="text-xs text-slate-500">
                {t(
                  'Los items marcados como "Dañado" o "Faltante" en el check-in de un conduce aparecerán aquí.',
                  'Items marked "Damaged" or "Missing" during delivery-note check-in will show up here.'
                )}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Fecha", "Date")}</TableHead>
                    <TableHead>{t("Item", "Item")}</TableHead>
                    <TableHead>{t("Condición", "Condition")}</TableHead>
                    <TableHead className="text-right">{t("Cantidad", "Qty")}</TableHead>
                    <TableHead>{t("Evento", "Event")}</TableHead>
                    <TableHead>{t("Conduce", "Note")}</TableHead>
                    <TableHead className="text-right">{t("Costo Reposición", "Replacement Cost")}</TableHead>
                    <TableHead>{t("Nota / Foto", "Note / Photo")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.log_id} data-testid={`damaged-row-${e.log_id}`}>
                      <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                        {e.reported_at ? formatDateOnly(e.reported_at, language) : "—"}
                      </TableCell>
                      <TableCell className="font-medium">{e.item_name || "—"}</TableCell>
                      <TableCell>
                        {e.condition === "dañado" ? (
                          <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                            {t("Dañado", "Damaged")}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                            <XCircle className="w-3 h-3 mr-1" />
                            {t("Faltante", "Missing")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(e.qty || 0)}</TableCell>
                      <TableCell className="text-sm">{e.event_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.note_number || "—"}</TableCell>
                      <TableCell className="text-right">
                        {e.total_cost > 0 ? (
                          <span className="text-red-700 font-medium">
                            <DollarSign className="inline w-3 h-3" />
                            {fmtNum(e.total_cost)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="flex items-center gap-2">
                          {e.photo_url && (
                            <a
                              href={e.photo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                              data-testid={`damaged-photo-${e.log_id}`}
                            >
                              <ImageIcon className="w-3 h-3" />
                              {t("Foto", "Photo")}
                            </a>
                          )}
                          <span className="text-xs text-slate-600 truncate">
                            {e.condition_note || ""}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default DamagedItemsLogSection;
