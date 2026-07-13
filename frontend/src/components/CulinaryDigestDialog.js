import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Mail, Bell, Save, Eye, Send, Clock, X, Info, History, Sparkles } from "lucide-react";
import { KoraLoader } from "./KoraLoader";
import { API_BASE as API } from "../utils/api";

const SECTION_META = [
  { key: "exec_summary", labelEs: "Resumen Ejecutivo", labelEn: "Executive Summary", descEs: "Total eventos, ingresos, margen", descEn: "Total events, revenue, margin" },
  { key: "stars_dogs", labelEs: "Estrellas y Dogs", labelEn: "Stars & Dogs", descEs: "Top 3 estrellas + Top 3 dogs (Menu Engineering)", descEn: "Top 3 stars + Top 3 dogs (Menu Engineering)" },
  { key: "staleness", labelEs: "Menús desactualizados", labelEn: "Stale Menus", descEs: "Menús con drift > 10%", descEn: "Menus with drift > 10%" },
  { key: "variance", labelEs: "Variación crítica", labelEn: "Critical Variance", descEs: "Eventos con variación > 10%", descEn: "Events with variance > 10%" },
  { key: "low_stock", labelEs: "Stock bajo", labelEn: "Low Stock", descEs: "Insumos que afectan próximos eventos", descEn: "Items affecting upcoming events" },
  { key: "mise_en_place_gap", labelEs: "Mise en place pendiente", labelEn: "Mise en Place Gap", descEs: "Eventos sin prep iniciada", descEn: "Events without started prep" },
  { key: "ai_recommendations", labelEs: "Recomendaciones IA", labelEn: "AI Recommendations", descEs: "Sugerencias generadas con IA (consume créditos)", descEn: "AI-generated suggestions (uses credits)" },
];

const DAYS = [
  { v: 0, es: "Lunes", en: "Mon" },
  { v: 1, es: "Martes", en: "Tue" },
  { v: 2, es: "Miércoles", en: "Wed" },
  { v: 3, es: "Jueves", en: "Thu" },
  { v: 4, es: "Viernes", en: "Fri" },
  { v: 5, es: "Sábado", en: "Sat" },
  { v: 6, es: "Domingo", en: "Sun" },
];

/**
 * CulinaryDigestDialog — Sprint 5 settings + preview + manual dispatch UI.
 */
export default function CulinaryDigestDialog({ open, onOpenChange }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [emailDraft, setEmailDraft] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        axios.get(`${API}/api/culinary-digest/settings`, { withCredentials: true }),
        axios.get(`${API}/api/culinary-digest/history?limit=10`, { withCredentials: true }),
      ]);
      setSettings(sRes.data);
      setHistory(hRes.data || []);
    } catch {
      toast.error(isEs ? "Error al cargar" : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => {
    if (open) {
      fetchAll();
      setPreview(null);
    }
  }, [open, fetchAll]);

  const updateSection = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      sections: { ...(prev.sections || {}), [key]: value },
    }));
  };

  const toggleRole = (role) => {
    setSettings((prev) => {
      const arr = prev.recipients_roles || [];
      return {
        ...prev,
        recipients_roles: arr.includes(role) ? arr.filter((r) => r !== role) : [...arr, role],
      };
    });
  };

  const addExtraEmail = () => {
    if (!emailDraft || !emailDraft.includes("@")) {
      toast.error(isEs ? "Email inválido" : "Invalid email");
      return;
    }
    setSettings((prev) => ({
      ...prev,
      recipient_emails_extra: [...(prev.recipient_emails_extra || []), emailDraft.trim().toLowerCase()],
    }));
    setEmailDraft("");
  };

  const removeExtraEmail = (e) => {
    setSettings((prev) => ({
      ...prev,
      recipient_emails_extra: (prev.recipient_emails_extra || []).filter((x) => x !== e),
    }));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await axios.put(`${API}/api/culinary-digest/settings`, settings, { withCredentials: true });
      toast.success(isEs ? "Preferencias guardadas" : "Settings saved");
      fetchAll();
    } catch (e) {
      const msg = e?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : (isEs ? "Error al guardar" : "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await axios.get(`${API}/api/culinary-digest/preview`, { withCredentials: true });
      setPreview(res.data);
    } catch {
      toast.error(isEs ? "Error al generar preview" : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const dispatch = async () => {
    setGenerating(true);
    try {
      const res = await axios.post(`${API}/api/culinary-digest/generate-now`, {}, { withCredentials: true });
      const er = res.data?.email_result || {};
      const recipientsCount = (res.data?.recipients || []).length;
      const notifiedCount = (res.data?.notified_user_ids || []).length;
      const msg = er.demo_mode
        ? (isEs
            ? `Digest creado (${notifiedCount} notificación in-app). Email en modo demo — configura SMTP para envío real.`
            : `Digest created (${notifiedCount} in-app). Email is demo mode — configure SMTP for real delivery.`)
        : (isEs
            ? `Digest enviado a ${recipientsCount} destinatario(s) + ${notifiedCount} notificación(es) in-app.`
            : `Digest sent to ${recipientsCount} recipient(s) + ${notifiedCount} in-app.`);
      toast.success(msg);
      fetchAll();
    } catch (e) {
      const m = e?.response?.data?.detail;
      toast.error(typeof m === "string" ? m : (isEs ? "Error al disparar" : "Dispatch failed"));
    } finally {
      setGenerating(false);
    }
  };

  if (!settings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="py-12 text-center">
            {loading ? <KoraLoader size={24} className="mx-auto" /> : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="culinary-digest-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            {isEs ? "Resumen Semanal de Culinary" : "Culinary Weekly Digest"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {isEs
              ? "Configura el resumen semanal que reciben los chefs/owners por email + notificación in-app."
              : "Configure the weekly digest chefs/owners receive via email + in-app notification."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="settings" data-testid="culinary-digest-tabs">
          <TabsList>
            <TabsTrigger value="settings" data-testid="cd-tab-settings">{isEs ? "Configuración" : "Settings"}</TabsTrigger>
            <TabsTrigger value="preview" data-testid="cd-tab-preview">{isEs ? "Vista previa" : "Preview"}</TabsTrigger>
            <TabsTrigger value="history" data-testid="cd-tab-history">{isEs ? "Historial" : "History"}</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 mt-3">
            <div className="flex items-center justify-between p-3 border rounded-md">
              <div>
                <p className="font-medium text-sm">{isEs ? "Resumen activo" : "Digest enabled"}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Activa para que se envíe automáticamente según el horario." : "Turn on to send automatically per schedule."}
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
                data-testid="cd-enabled-switch"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">{isEs ? "Frecuencia" : "Frequency"}</Label>
                <Select value={settings.frequency} onValueChange={(v) => setSettings({ ...settings, frequency: v })}>
                  <SelectTrigger data-testid="cd-frequency-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
                    <SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem>
                    <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{isEs ? "Día" : "Day"}</Label>
                <Select value={String(settings.day_of_week)} onValueChange={(v) => setSettings({ ...settings, day_of_week: Number(v) })}>
                  <SelectTrigger data-testid="cd-day-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{isEs ? d.es : d.en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{isEs ? "Hora (24h)" : "Hour (24h)"}</Label>
                <Select value={String(settings.hour)} onValueChange={(v) => setSettings({ ...settings, hour: Number(v) })}>
                  <SelectTrigger data-testid="cd-hour-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">{isEs ? "Destinatarios por rol" : "Recipients by role"}</Label>
              <div className="flex flex-wrap gap-2">
                {["owner", "admin", "manager"].map((r) => (
                  <Badge
                    key={r}
                    variant={(settings.recipients_roles || []).includes(r) ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleRole(r)}
                    data-testid={`cd-role-${r}`}
                  >
                    {r}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">{isEs ? "Emails adicionales" : "Extra emails"}</Label>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="chef@example.com"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtraEmail(); } }}
                  data-testid="cd-extra-email-input"
                />
                <Button size="sm" variant="outline" onClick={addExtraEmail} data-testid="cd-add-extra-btn">
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </div>
              {(settings.recipient_emails_extra || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {settings.recipient_emails_extra.map((e) => (
                    <Badge key={e} variant="secondary" className="gap-1">
                      {e}
                      <button onClick={() => removeExtraEmail(e)} className="hover:text-red-600" data-testid={`cd-remove-${e}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs mb-2 block uppercase tracking-wide text-muted-foreground">
                {isEs ? "Secciones del resumen" : "Digest sections"}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SECTION_META.map((s) => (
                  <div key={s.key} className="flex items-start justify-between gap-3 p-2.5 border rounded-md" data-testid={`cd-section-${s.key}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        {s.key === "ai_recommendations" && <Sparkles className="w-3 h-3 text-purple-600" />}
                        {isEs ? s.labelEs : s.labelEn}
                      </p>
                      <p className="text-xs text-muted-foreground">{isEs ? s.descEs : s.descEn}</p>
                    </div>
                    <Switch
                      checked={!!settings.sections?.[s.key]}
                      onCheckedChange={(v) => updateSection(s.key, v)}
                      data-testid={`cd-section-switch-${s.key}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-3 mt-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={loadPreview} disabled={previewLoading} data-testid="cd-load-preview-btn">
                {previewLoading ? <KoraLoader size={16} /> : <Eye className="w-4 h-4" />}
                <span className="ml-1.5">{isEs ? "Cargar vista previa" : "Load Preview"}</span>
              </Button>
            </div>
            {preview ? (
              <div className="border rounded-md overflow-hidden bg-white max-h-[60vh] overflow-y-auto" data-testid="cd-preview-iframe">
                <iframe
                  srcDoc={preview.html}
                  title="Digest Preview"
                  style={{ width: "100%", height: "560px", border: "0" }}
                />
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-12">
                {isEs ? 'Haz clic en "Cargar vista previa" para ver el resumen.' : 'Click "Load Preview" to see the digest.'}
              </p>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2 mt-3">
            {history.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                {isEs ? "Aún no hay envíos." : "No dispatches yet."}
              </p>
            ) : (
              <div className="space-y-1" data-testid="cd-history-list">
                {history.map((h) => (
                  <div key={h.history_id} className="flex items-center justify-between p-2 border rounded-md text-xs" data-testid={`cd-history-${h.history_id}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <History className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="font-mono">{new Date(h.dispatched_at).toLocaleString()}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="truncate">{h.window_label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {h.email_result?.demo_mode && <Badge variant="outline" className="text-[10px]">demo</Badge>}
                      {h.email_result?.success && <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">{isEs ? "enviado" : "sent"}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{(h.recipients || []).length} {isEs ? "emails" : "emails"}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{(h.notified_user_ids || []).length} <Bell className="w-2.5 h-2.5 ml-0.5 inline" /></Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 mt-2">
          <Button onClick={dispatch} disabled={generating} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" data-testid="cd-generate-now-btn">
            {generating ? <KoraLoader size={16} /> : <Send className="w-4 h-4" />}
            <span className="ml-1.5">{isEs ? "Enviar ahora" : "Send Now"}</span>
          </Button>
          <Button onClick={save} disabled={saving} data-testid="cd-save-btn">
            {saving ? <KoraLoader size={16} /> : <Save className="w-4 h-4" />}
            <span className="ml-1.5">{isEs ? "Guardar" : "Save"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
