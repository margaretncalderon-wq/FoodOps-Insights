import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Package, CheckCircle2, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API_BASE as API } from "../utils/api";

/** Sprint J — Landing page shown when a QR is scanned.
 * Compact, mobile-first: shows the item + a big "count" input + Save.
 */
export default function InventoryScanPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [item, setItem] = useState(null);
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/inventory/ingredients/${id}`, { withCredentials: true });
      setItem(r.data);
      setCount(String(r.data?.stock_quantity ?? ""));
    } catch (_) { setItem(null); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const saveCount = async () => {
    setSaving(true);
    try {
      const res = await axios.post(
        `${API}/api/inventory/scan/${id}/count`,
        { counted_qty: Number(count), note },
        { withCredentials: true }
      );
      toast.success(t(
        `Contado ${res.data.counted_qty}. Diferencia: ${res.data.diff > 0 ? "+" : ""}${res.data.diff}`,
        `Counted ${res.data.counted_qty}. Diff: ${res.data.diff > 0 ? "+" : ""}${res.data.diff}`
      ));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error al guardar", "Save failed"));
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/inventory")} data-testid="back-to-inventory">
          <ArrowLeft className="w-4 h-4 mr-1" />
          {t("Volver al inventario", "Back to inventory")}
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-100">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <CardTitle>{loading ? t("Cargando…", "Loading…") : item?.name || t("No encontrado", "Not found")}</CardTitle>
                <CardDescription>
                  {item ? (
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-1">
                      <span>{item.category || "—"}</span>
                      <span>·</span>
                      <span>{t("Stock actual", "Current stock")}: <span className="font-mono">{item.stock_quantity} {item.unit}</span></span>
                      {item.status && <><span>·</span><Badge variant="outline" className="text-xs">{item.status}</Badge></>}
                    </span>
                  ) : null}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          {item && (
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="scan-count">{t("Cantidad contada", "Counted quantity")}</Label>
                <Input
                  id="scan-count"
                  type="number"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="text-2xl h-14 font-mono text-center"
                  data-testid="scan-count-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scan-note">{t("Nota (opcional)", "Note (optional)")}</Label>
                <Input
                  id="scan-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("Ej: Caja verificada en bodega A", "e.g. Verified in Warehouse A")}
                />
              </div>
              <Button
                onClick={saveCount}
                disabled={saving || count === ""}
                className="w-full h-12"
                data-testid="scan-save-btn"
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                {saving ? t("Guardando…", "Saving…") : t("Guardar conteo", "Save count")}
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
