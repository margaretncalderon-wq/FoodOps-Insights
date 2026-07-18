import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { 
  Calendar, RefreshCw, CheckCircle, XCircle, ExternalLink, 
  Plus, Link2, Unlink, Settings2, RotateCcw
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Kora stages the color mapping (`_stage_to_calendar_meta` in backend) knows
// about. Keys are the canonical snake_case forms the backend normalises to,
// so no matter what Title-Case string is stored in Mongo the icon still maps.
// The `colorHint` mirrors the Google Calendar colorId chosen by the backend
// (10=green, 5=yellow, 8=gray, 11=red, 7=blue) so the settings UI visually
// matches what the user will see on Google Calendar.
const STAGE_PRESETS = [
  { key: "inquiry_received", label: { es: "Solicitud Recibida", en: "Inquiry Received" }, colorHint: "bg-slate-400" },
  { key: "context_captured", label: { es: "Contexto Capturado", en: "Context Captured" }, colorHint: "bg-slate-400" },
  { key: "scope_drafted", label: { es: "Alcance Borrador", en: "Scope Drafted" }, colorHint: "bg-yellow-400" },
  { key: "definition_in_review", label: { es: "En Definición / Revisión", en: "Definition In Review" }, colorHint: "bg-yellow-400" },
  { key: "committed", label: { es: "Confirmado", en: "Confirmed" }, colorHint: "bg-emerald-600" },
  { key: "in_progress", label: { es: "En Curso", en: "In Progress" }, colorHint: "bg-blue-500" },
  { key: "closed", label: { es: "Cerrado", en: "Closed" }, colorHint: "bg-emerald-800" },
  { key: "cancelled", label: { es: "Cancelado", en: "Cancelled" }, colorHint: "bg-red-500" },
  { key: "archived", label: { es: "Archivado", en: "Archived" }, colorHint: "bg-red-400" },
];

// Curated palette of emojis that read well next to catering / event titles.
// Grouped roughly: status (row 1), event types (row 2), operations (row 3),
// escalations (row 4). 40 emojis total — enough variety without overwhelming.
const EMOJI_PALETTE = [
  "✅", "⏳", "📝", "🟢", "🟡", "🔴", "🔵", "⚪", "⚫", "✨",
  "🎉", "🎊", "🎂", "🍽️", "🥂", "🍾", "☕", "🍰", "🎁", "💐",
  "📅", "📌", "🚀", "🔥", "⭐", "💼", "📞", "✉️", "🧾", "💰",
  "⚠️", "❗", "❓", "🚫", "❌", "🛑", "🔒", "🔑", "🏆", "👑",
];

// One-click emoji templates. Each preset writes its full `icons` map into
// `contentCfg.status_icons`, replacing whatever was there. This gives users
// a sensible starting point instead of asking them to assign 9 emojis by hand.
const ICON_TEMPLATES = {
  recommended: {
    label: { es: "Recomendada", en: "Recommended" },
    hint: { es: "Balance profesional + expresivo", en: "Balanced pro + expressive" },
    icons: {
      inquiry_received: "📝",
      context_captured: "📝",
      scope_drafted: "⏳",
      definition_in_review: "⏳",
      committed: "✅",
      in_progress: "🚀",
      closed: "🏆",
      cancelled: "🔴",
      archived: "🚫",
    },
  },
  festive: {
    label: { es: "Festiva", en: "Festive" },
    hint: { es: "Ideal para catering / bodas / celebraciones", en: "Great for catering / weddings / celebrations" },
    icons: {
      inquiry_received: "💐",
      context_captured: "📝",
      scope_drafted: "🎁",
      definition_in_review: "🥂",
      committed: "🎉",
      in_progress: "🍾",
      closed: "🏆",
      cancelled: "❌",
      archived: "🚫",
    },
  },
  minimalist: {
    label: { es: "Minimalista", en: "Minimalist" },
    hint: { es: "Solo estados críticos", en: "Only critical states" },
    icons: {
      committed: "✅",
      in_progress: "🔵",
      closed: "⚫",
      cancelled: "❌",
    },
  },
};

// Mirror of backend `_stage_to_calendar_meta` — computes the Google Calendar
// colorId a given stage will receive so the preview matches production.
// Kept intentionally simple; if the backend mapping changes, update here too.
const stageToColorId = (stageKey) => {
  const s = (stageKey || "").toLowerCase();
  if (["cancelled", "archived", "lost"].includes(s)) return "11";
  if (s === "closed") return "10";
  if (s === "in_progress") return "7";
  if (["committed", "won", "confirmed", "approved"].includes(s)) return "10";
  if (["scope_drafted", "definition_in_review", "definition_review", "proposal", "negotiation", "quoted"].includes(s)) return "5";
  if (["inquiry_received", "context_captured", "lead", "contacted", "discovery", "draft"].includes(s)) return "8";
  return "7";
};

// Google Calendar color IDs → tailwind classes that visually approximate
// how the event will render in the user's Google Calendar. Left border
// mimics Google's colored strip on event chips.
const CAL_COLOR_STYLES = {
  "5":  { bg: "bg-yellow-50",   border: "border-l-yellow-500",   dot: "bg-yellow-400" },
  "7":  { bg: "bg-blue-50",     border: "border-l-blue-500",     dot: "bg-blue-500" },
  "8":  { bg: "bg-slate-100",   border: "border-l-slate-500",    dot: "bg-slate-500" },
  "10": { bg: "bg-emerald-50",  border: "border-l-emerald-600",  dot: "bg-emerald-600" },
  "11": { bg: "bg-red-50",      border: "border-l-red-500",      dot: "bg-red-500" },
};

export default function GoogleCalendarSettingsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [searchParams] = useSearchParams();
  
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calendars, setCalendars] = useState([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [selectCalendarOpen, setSelectCalendarOpen] = useState(false);
  const [createCalendarOpen, setCreateCalendarOpen] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState("");
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  // Content-template config (title, description blocks, status icons)
  const [contentCfg, setContentCfg] = useState(null);
  const [savingContent, setSavingContent] = useState(false);
  const [newIconKey, setNewIconKey] = useState("");
  const [newIconValue, setNewIconValue] = useState("");
  // Which preset row is currently expanded showing the emoji palette.
  // `null` = collapsed, keeps the settings section compact.
  const [focusedIconKey, setFocusedIconKey] = useState(null);
  // Name input for the "save current config as custom template" flow.
  const [newTemplateName, setNewTemplateName] = useState("");

  const fetchContentCfg = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/oauth/calendar/content-config`, { withCredentials: true });
      setContentCfg(res.data);
    } catch {
      // silent — endpoint may not be available yet, defaults will apply
    }
  }, []);

  const saveContentCfg = async () => {
    if (!contentCfg) return;
    setSavingContent(true);
    try {
      const res = await axios.put(
        `${API}/api/oauth/calendar/content-config`,
        contentCfg,
        { withCredentials: true }
      );
      setContentCfg(res.data);
      toast.success(isEs ? "Plantilla guardada" : "Template saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al guardar" : "Save error"));
    } finally {
      setSavingContent(false);
    }
  };

  const addStatusIcon = () => {
    if (!newIconKey.trim() || !newIconValue.trim()) return;
    setContentCfg((prev) => ({
      ...prev,
      status_icons: { ...(prev?.status_icons || {}), [newIconKey.trim().toLowerCase()]: newIconValue.trim() },
    }));
    setNewIconKey("");
    setNewIconValue("");
  };

  const removeStatusIcon = (key) => {
    setContentCfg((prev) => {
      const next = { ...(prev?.status_icons || {}) };
      delete next[key];
      return { ...prev, status_icons: next };
    });
  };

  // Live preview using a fake sample record
  const renderPreview = () => {
    const cfg = contentCfg;
    if (!cfg) return "";
    const sample = {
      primary_record: isEs ? "Boda Ana & Carlos" : "Ana & Carlos Wedding",
      status: isEs ? "Confirmado" : "Confirmed",
      location: "Casa Vieja",
      status_icon: cfg.status_icons?.committed || cfg.status_icons?.confirmed || "",
    };
    let out = (cfg.title_template || "{{primary_record}}").replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_, k) => sample[k] ?? ""
    );
    // Same cleanup rules as backend renderer
    out = out.replace(/[·\-|]+\s*(?=[·\-|]|$)/g, "").replace(/^\s*[·\-|]+\s*/, "").replace(/\s*[·\-|]+\s*$/, "").replace(/\s{2,}/g, " ").trim();
    return out;
  };

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/oauth/calendar/sync-status`, { withCredentials: true });
      setSyncStatus(res.data);
    } catch (err) {
      // silent — endpoint is best-effort diagnostic
    }
  }, []);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/api/oauth/calendar/sync-all`, {}, { withCredentials: true });
      const d = res.data || {};
      if (d.status === "already_running") {
        toast.info(
          isEs
            ? "Ya hay una sincronización en progreso. Sigue el avance abajo."
            : "A sync is already in progress. Watch the progress below."
        );
      } else {
        toast.success(
          isEs
            ? "Sincronización iniciada en segundo plano. Esto puede tardar unos minutos."
            : "Sync started in background. This can take a few minutes."
        );
      }
      // Poll sync-status immediately so the UI reflects the running state.
      await fetchSyncStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al sincronizar" : "Sync error"));
      setSyncing(false);
    }
  };

  const handleResetAndSync = async () => {
    // Destructive: wipes existing Google events for this tenant. Require
    // explicit confirmation before firing — this is the "clean slate" tool
    // to apply new templates/colors when a plain resync isn't reflecting.
    const confirmed = window.confirm(
      isEs
        ? "⚠ Esta acción BORRARÁ todos los eventos actuales en Google Calendar (los que Kora creó) y los volverá a crear con los colores, emojis y plantilla actuales.\n\nEsto es útil cuando cambiaste la plantilla y los cambios no se reflejan.\n\n¿Continuar?"
        : "⚠ This will DELETE all current Google Calendar events that Kora created, and recreate them with the current colors, emojis and template.\n\nUse this when template changes aren't applying.\n\nContinue?"
    );
    if (!confirmed) return;
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/api/oauth/calendar/reset-and-sync-all`, {}, { withCredentials: true });
      const d = res.data || {};
      if (d.status === "already_running") {
        toast.info(isEs
          ? "Ya hay una sincronización en progreso. Espera a que termine."
          : "A sync is already in progress. Wait for it to finish.");
      } else {
        toast.success(isEs
          ? "Borrado + re-sincronización iniciado. Esto puede tardar varios minutos."
          : "Reset + resync started. This may take several minutes.");
      }
      await fetchSyncStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al reiniciar sincronización" : "Reset failed"));
      setSyncing(false);
    }
  };

  // Poll every 4s while a background sync is running.
  // When it finishes we stop the loop and show the final toast once.
  useEffect(() => {
    const bg = syncStatus?.background_sync;
    if (!bg) return;
    if (bg.status === "running") {
      setSyncing(true);
      const id = setInterval(() => { fetchSyncStatus(); }, 4000);
      return () => clearInterval(id);
    }
    // Transitioned out of running → clear the syncing flag and notify once.
    if (syncing && (bg.status === "completed" || bg.status === "failed")) {
      setSyncing(false);
      if (bg.status === "completed") {
        const total = (bg.events_pushed || 0) + (bg.leads_pushed || 0) + (bg.clients_pushed || 0);
        const failed = (bg.events_failed || 0) + (bg.leads_failed || 0) + (bg.clients_failed || 0);
        toast.success(
          isEs
            ? `Sincronización completa: ${total} registro(s) publicado(s)${failed > 0 ? ` — ${failed} fallaron` : ""}`
            : `Sync complete: ${total} record(s) pushed${failed > 0 ? ` — ${failed} failed` : ""}`
        );
      } else {
        toast.error(
          isEs
            ? `Sincronización falló: ${bg.last_error || "error desconocido"}`
            : `Sync failed: ${bg.last_error || "unknown error"}`
        );
      }
    }
  }, [syncStatus?.background_sync, syncStatus?.background_sync?.status, syncing, fetchSyncStatus, isEs]);

  // Check for OAuth callback params
  useEffect(() => {
    const calendarConnected = searchParams.get("calendar_connected");
    const calendarError = searchParams.get("calendar_error");
    
    if (calendarConnected === "true") {
      toast.success(isEs ? "Google Calendar conectado exitosamente" : "Google Calendar connected successfully");
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (calendarError) {
      toast.error(`Error: ${calendarError}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [searchParams, isEs]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/oauth/calendar/status`, { withCredentials: true });
      setStatus(res.data);
    } catch (err) {
      console.error("Error fetching calendar status:", err);
      setStatus({ is_connected: false });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => {
    if (status?.is_connected && status?.shared_calendar_id) fetchSyncStatus();
    if (status?.is_connected) fetchContentCfg();
  }, [status?.is_connected, status?.shared_calendar_id, fetchSyncStatus, fetchContentCfg]);

  const handleConnect = async () => {
    try {
      const res = await axios.get(`${API}/api/oauth/calendar/connect`, { withCredentials: true });
      // Redirect to Google OAuth
      window.location.href = res.data.authorization_url;
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al conectar" : "Connection error"));
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(isEs ? "¿Desconectar Google Calendar?" : "Disconnect Google Calendar?")) return;
    try {
      await axios.delete(`${API}/api/oauth/calendar/disconnect`, { withCredentials: true });
      toast.success(isEs ? "Calendario desconectado" : "Calendar disconnected");
      setStatus({ is_connected: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const fetchCalendars = async () => {
    setLoadingCalendars(true);
    try {
      const res = await axios.get(`${API}/api/oauth/calendar/calendars`, { withCredentials: true });
      setCalendars(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al cargar calendarios" : "Error loading calendars"));
    }
    setLoadingCalendars(false);
  };

  const handleOpenSelectCalendar = async () => {
    setSelectCalendarOpen(true);
    await fetchCalendars();
  };

  const handleSelectCalendar = async (calendarId) => {
    try {
      const res = await axios.post(
        `${API}/api/oauth/calendar/calendars/select?calendar_id=${calendarId}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs 
        ? `Calendario seleccionado: ${res.data.calendar_name}` 
        : `Calendar selected: ${res.data.calendar_name}`
      );
      setSelectCalendarOpen(false);
      fetchStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleCreateCalendar = async () => {
    if (!newCalendarName.trim()) return;
    setCreating(true);
    try {
      const res = await axios.post(
        `${API}/api/oauth/calendar/calendars/create?name=${encodeURIComponent(newCalendarName)}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs 
        ? `Calendario creado: ${res.data.calendar_name}` 
        : `Calendar created: ${res.data.calendar_name}`
      );
      setCreateCalendarOpen(false);
      setNewCalendarName("");
      fetchStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="google-calendar-settings">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Google Calendar</CardTitle>
              <CardDescription>
                {isEs 
                  ? "Sincroniza follow-ups del CRM con tu calendario compartido"
                  : "Sync CRM follow-ups with your shared calendar"}
              </CardDescription>
            </div>
          </div>
          {status?.is_connected ? (
            <Badge className="bg-green-100 text-green-700">
              <CheckCircle className="w-3 h-3 mr-1" />
              {isEs ? "Conectado" : "Connected"}
            </Badge>
          ) : (
            <Badge variant="secondary">
              <XCircle className="w-3 h-3 mr-1" />
              {isEs ? "Desconectado" : "Disconnected"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.is_connected ? (
          <>
            {/* Connection Info */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{isEs ? "Cuenta conectada:" : "Connected account:"}</span>
                <span className="font-medium">{status.connected_email}</span>
              </div>
              
              {status.shared_calendar_name ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{isEs ? "Calendario compartido:" : "Shared calendar:"}</span>
                  <span className="font-medium text-blue-600">{status.shared_calendar_name}</span>
                </div>
              ) : (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    {isEs 
                      ? "Selecciona o crea un calendario compartido para sincronizar los follow-ups del CRM."
                      : "Select or create a shared calendar to sync CRM follow-ups."}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleOpenSelectCalendar} data-testid="select-calendar-btn">
                <Settings2 className="w-4 h-4 mr-2" />
                {isEs ? "Seleccionar Calendario" : "Select Calendar"}
              </Button>
              <Button variant="outline" onClick={() => setCreateCalendarOpen(true)} data-testid="create-calendar-btn">
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Crear Nuevo" : "Create New"}
              </Button>
              {status.shared_calendar_id && (
                <Button
                  variant="outline"
                  onClick={handleSyncAll}
                  disabled={syncing}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  data-testid="sync-all-calendar-btn"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                  {syncing
                    ? (isEs ? "Sincronizando en segundo plano…" : "Syncing in background…")
                    : (isEs ? "Sincronizar Todo Ahora" : "Sync Everything Now")}
                </Button>
              )}
              {status.shared_calendar_id && (
                <Button
                  variant="outline"
                  onClick={handleResetAndSync}
                  disabled={syncing}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  data-testid="reset-and-sync-btn"
                  title={isEs
                    ? "Borra los eventos actuales en Google y los recrea con los colores/emojis/plantillas actuales. Úsalo cuando cambies la plantilla o los colores no se actualicen."
                    : "Deletes current Google events and recreates them with the current colors/emojis/templates. Use when template changes don't apply."}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {isEs ? "Borrar y Re-sincronizar" : "Reset & Resync"}
                </Button>
              )}
              <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDisconnect}>
                <Unlink className="w-4 h-4 mr-2" />
                {isEs ? "Desconectar" : "Disconnect"}
              </Button>
            </div>

            {/* Sync diagnostic panel — shows why events might not appear */}
            {status.shared_calendar_id && syncStatus && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm space-y-1" data-testid="sync-status-panel">
                <p className="font-medium text-slate-700">
                  {isEs ? "Estado de Sincronización" : "Sync Status"}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{isEs ? "Eventos con fecha" : "Events with date"}: </span>
                    <span className="font-medium">{syncStatus.events?.synced ?? 0} / {syncStatus.events?.with_date ?? 0}</span>
                    {(syncStatus.events?.pending ?? 0) > 0 && (
                      <span className="ml-1 text-amber-600">
                        ({syncStatus.events.pending} {isEs ? "sin sincronizar" : "unsynced"})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isEs ? "Follow-ups Leads" : "Lead follow-ups"}: </span>
                    <span className="font-medium">{syncStatus.follow_ups?.leads_synced ?? 0} / {syncStatus.follow_ups?.leads_upcoming ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isEs ? "Follow-ups Clientes" : "Client follow-ups"}: </span>
                    <span className="font-medium">{syncStatus.follow_ups?.clients_synced ?? 0} / {syncStatus.follow_ups?.clients_upcoming ?? 0}</span>
                  </div>
                </div>
                {syncStatus.last_backfill_at && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {isEs ? "Última sincronización manual" : "Last manual sync"}: {new Date(syncStatus.last_backfill_at).toLocaleString()}
                  </p>
                )}
                {syncStatus.background_sync && syncStatus.background_sync.status === "running" && (
                  <div className="mt-2 p-2 rounded bg-blue-50 border border-blue-200 space-y-1" data-testid="sync-progress-panel">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-blue-900">
                        {isEs ? "Sincronizando en segundo plano…" : "Syncing in background…"}
                      </span>
                      <span className="text-blue-700">
                        {syncStatus.background_sync.processed || 0} / {syncStatus.background_sync.total || 0}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-blue-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{
                          width: `${
                            syncStatus.background_sync.total > 0
                              ? Math.min(100, ((syncStatus.background_sync.processed || 0) / syncStatus.background_sync.total) * 100)
                              : 5
                          }%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-blue-700">
                      {isEs
                        ? "Puedes cerrar esta ventana; el proceso continúa en el servidor."
                        : "You can close this page; the process keeps running on the server."}
                    </p>
                  </div>
                )}
                {syncStatus.background_sync && syncStatus.background_sync.status === "failed" && (
                  <p className="text-xs text-red-700 pt-1" data-testid="sync-failed-msg">
                    {isEs ? "Última sincronización falló" : "Last sync failed"}: {syncStatus.background_sync.last_error || (isEs ? "error desconocido" : "unknown error")}
                  </p>
                )}
                {/* Post-completion detail: if the last backfill finished but
                    some records failed silently against Google, list the
                    first N so the operator can debug without needing server
                    logs (which they can't access in production). */}
                {syncStatus.background_sync
                  && syncStatus.background_sync.status === "completed"
                  && (
                    (syncStatus.background_sync.events_failed || 0)
                    + (syncStatus.background_sync.leads_failed || 0)
                    + (syncStatus.background_sync.clients_failed || 0)
                  ) > 0 && (
                  <details className="mt-2 p-2 rounded bg-amber-50 border border-amber-200" data-testid="sync-errors-panel">
                    <summary className="text-xs font-medium text-amber-800 cursor-pointer">
                      {isEs
                        ? `⚠️ Detalles: ${
                            (syncStatus.background_sync.events_pushed || 0)
                            + (syncStatus.background_sync.leads_pushed || 0)
                            + (syncStatus.background_sync.clients_pushed || 0)
                          } publicado(s), ${
                            (syncStatus.background_sync.events_failed || 0)
                            + (syncStatus.background_sync.leads_failed || 0)
                            + (syncStatus.background_sync.clients_failed || 0)
                          } falló/fallaron`
                        : `⚠️ Details: ${
                            (syncStatus.background_sync.events_pushed || 0)
                            + (syncStatus.background_sync.leads_pushed || 0)
                            + (syncStatus.background_sync.clients_pushed || 0)
                          } pushed, ${
                            (syncStatus.background_sync.events_failed || 0)
                            + (syncStatus.background_sync.leads_failed || 0)
                            + (syncStatus.background_sync.clients_failed || 0)
                          } failed`}
                    </summary>
                    <ul className="mt-2 space-y-0.5 text-[11px] font-mono text-amber-900 max-h-40 overflow-y-auto">
                      {(syncStatus.background_sync.errors || []).map((err, i) => (
                        <li key={i} className="truncate">• {err}</li>
                      ))}
                      {(syncStatus.background_sync.errors || []).length === 0 && (
                        <li className="italic text-amber-700">
                          {isEs
                            ? "Sin detalles capturados (el servidor no reportó errores individuales)."
                            : "No details captured (server didn't report per-record errors)."}
                        </li>
                      )}
                    </ul>
                  </details>
                )}
                {((syncStatus.events?.pending ?? 0) > 0 ||
                  (syncStatus.follow_ups?.leads_upcoming ?? 0) > (syncStatus.follow_ups?.leads_synced ?? 0)) && (
                  <p className="text-xs text-amber-700 pt-1">
                    {isEs
                      ? "💡 Tip: presiona 'Sincronizar Todo Ahora' para publicar los registros existentes en el calendario."
                      : "💡 Tip: click 'Sync Everything Now' to push existing records to the calendar."}
                  </p>
                )}
              </div>
            )}

            {/* Color legend — helps user understand what each color means on their calendar */}
            {status.shared_calendar_id && (
              <div className="p-3 rounded-lg border border-slate-200 bg-white text-sm space-y-2" data-testid="calendar-color-legend">
                <p className="font-medium text-slate-700">
                  {isEs ? "Leyenda de Colores en el Calendario" : "Calendar Color Legend"}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#0b8043" }} />
                    <span>{isEs ? "Confirmado / Cerrado" : "Confirmed / Closed"}</span>
                    <span className="text-muted-foreground">— [CONFIRMADO]</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#039be5" }} />
                    <span>{isEs ? "En Curso" : "In Progress"}</span>
                    <span className="text-muted-foreground">— [EN CURSO]</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f6c026" }} />
                    <span>{isEs ? "Cotizado / En Negociación" : "Quoted / Negotiating"}</span>
                    <span className="text-muted-foreground">— [COTIZADO]</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#616161" }} />
                    <span>{isEs ? "Borrador / Consulta Inicial" : "Draft / Inquiry"}</span>
                    <span className="text-muted-foreground">— [BORRADOR]</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#d60000" }} />
                    <span>{isEs ? "Cancelado / Archivado" : "Cancelled / Lost"}</span>
                    <span className="text-muted-foreground">— [CANCELADO]</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#7986cb" }} />
                    <span>{isEs ? "Follow-up de Lead" : "Lead Follow-up"}</span>
                    <span className="text-muted-foreground">— 📞</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#8e24aa" }} />
                    <span>{isEs ? "Follow-up de Cliente" : "Client Follow-up"}</span>
                    <span className="text-muted-foreground">— 📞</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic pt-1">
                  {isEs
                    ? "El color se actualiza automáticamente cuando cambia el estado del evento en Kora."
                    : "The color updates automatically when the event stage changes in Kora."}
                </p>
              </div>
            )}

            {/* Content template editor — controls title, description blocks
                and per-status icons pushed to Google Calendar. */}
            {status.is_connected && contentCfg && (
              <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-4" data-testid="calendar-content-template">
                <div>
                  <p className="font-medium text-slate-700">
                    {isEs ? "Plantilla de Contenido del Evento" : "Event Content Template"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isEs
                      ? "Personaliza cómo se ven los eventos que Kora publica en tu Google Calendar."
                      : "Customize how events pushed to your Google Calendar look."}
                  </p>
                </div>

                {/* Title template */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {isEs ? "Título del Evento" : "Event Title"}
                  </Label>
                  <Input
                    value={contentCfg.title_template || ""}
                    onChange={(e) => setContentCfg({ ...contentCfg, title_template: e.target.value })}
                    placeholder="{{primary_record}}"
                    className="font-mono text-sm"
                    data-testid="title-template-input"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {isEs ? "Variables:" : "Variables:"}{" "}
                    <code>{"{{primary_record}}"}</code>{" · "}
                    <code>{"{{status}}"}</code>{" · "}
                    <code>{"{{location}}"}</code>{" · "}
                    <code>{"{{status_icon}}"}</code>
                  </p>
                  {renderPreview() && (
                    <div className="mt-2 p-2 rounded bg-slate-50 border border-slate-200 text-sm" data-testid="template-preview">
                      <span className="text-[10px] text-muted-foreground mr-2">
                        {isEs ? "Vista previa:" : "Preview:"}
                      </span>
                      <span className="font-medium">{renderPreview()}</span>
                    </div>
                  )}
                </div>

                {/* Multi-day suffix */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {isEs ? "Sufijo Multi-día" : "Multi-day suffix"}
                  </Label>
                  <Input
                    value={contentCfg.multiday_suffix || ""}
                    onChange={(e) => setContentCfg({ ...contentCfg, multiday_suffix: e.target.value })}
                    placeholder=" (Día {{day_index}}/{{day_total}})"
                    className="font-mono text-sm"
                    data-testid="multiday-suffix-input"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {isEs
                      ? "Se agrega al título de eventos de más de 1 día. Variables: "
                      : "Appended to titles of events longer than 1 day. Variables: "}
                    <code>{"{{day_index}}"}</code>{" · "}
                    <code>{"{{day_total}}"}</code>{" · "}
                    <code>{"{{day_short}}"}</code>
                  </p>
                </div>

                {/* Description blocks */}
                <div>
                  <Label className="text-xs font-medium mb-2 block">
                    {isEs ? "Bloques de la Descripción" : "Description Blocks"}
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { k: "client_name", label: isEs ? "Nombre del Cliente" : "Client Name" },
                      { k: "guests", label: isEs ? "Cantidad de Invitados" : "Guest Count" },
                      { k: "location", label: isEs ? "Ubicación" : "Location" },
                      { k: "status", label: isEs ? "Estado / Etapa" : "Status" },
                      { k: "open_in_kora_link", label: isEs ? "Link \"Abrir en Kora\"" : "\"Open in Kora\" link" },
                    ].map(({ k, label }) => (
                      <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!(contentCfg.description_blocks || {})[k]}
                          onChange={(e) => setContentCfg({
                            ...contentCfg,
                            description_blocks: { ...(contentCfg.description_blocks || {}), [k]: e.target.checked },
                          })}
                          className="rounded border-slate-300"
                          data-testid={`block-toggle-${k}`}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Status icons */}
                <div>
                  <Label className="text-xs font-medium mb-2 block">
                    {isEs ? "Iconos por Estado" : "Status Icons"}
                  </Label>

                  {/* One-click templates. Replaces the whole `status_icons`
                      map so users don't have to build it from scratch. */}
                  <div className="mb-3 p-2.5 rounded-lg bg-gradient-to-r from-primary/5 to-transparent border border-primary/20">
                    <p className="text-[11px] font-medium text-primary mb-2">
                      {isEs ? "Aplicar plantilla rápida" : "Apply quick template"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(ICON_TEMPLATES).map(([key, tpl]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setContentCfg((prev) => ({ ...prev, status_icons: { ...tpl.icons } }));
                            setFocusedIconKey(null);
                            toast.success(
                              isEs
                                ? `Plantilla "${tpl.label.es}" aplicada — recuerda guardar`
                                : `Template "${tpl.label.en}" applied — remember to save`
                            );
                          }}
                          className="flex-1 min-w-[110px] p-2 rounded border border-slate-200 bg-white hover:border-primary hover:bg-primary/5 transition-all text-left"
                          data-testid={`icon-template-${key}`}
                        >
                          <div className="text-sm font-medium text-slate-800">
                            {isEs ? tpl.label.es : tpl.label.en}
                          </div>
                          <div className="text-base leading-tight my-1">
                            {Object.values(tpl.icons).slice(0, 5).join(" ")}
                          </div>
                          <div className="text-[10px] text-muted-foreground leading-tight">
                            {isEs ? tpl.hint.es : tpl.hint.en}
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setContentCfg((prev) => ({ ...prev, status_icons: {} }));
                          setFocusedIconKey(null);
                          toast.info(isEs ? "Iconos limpiados — recuerda guardar" : "Icons cleared — remember to save");
                        }}
                        className="p-2 rounded border border-slate-200 bg-white hover:border-red-400 hover:bg-red-50 transition-all text-sm text-slate-600 hover:text-red-600"
                        data-testid="icon-template-clear"
                      >
                        {isEs ? "Limpiar" : "Clear"}
                      </button>
                    </div>

                    {/* User-saved custom templates. Live inline once the user
                        clicks "Save current as template". Chip-shaped so
                        many of them can coexist without dominating the UI. */}
                    {(contentCfg.custom_icon_templates || []).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-primary/10">
                        <p className="text-[11px] font-medium text-primary/80 mb-1.5">
                          {isEs ? "Mis plantillas" : "My templates"}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(contentCfg.custom_icon_templates || []).map((tpl) => (
                            <div
                              key={tpl.id}
                              className="group flex items-center gap-1 pl-2 pr-1 py-1 rounded-full border border-slate-200 bg-white hover:border-primary transition-colors"
                              data-testid={`custom-tpl-${tpl.id}`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setContentCfg((prev) => ({ ...prev, status_icons: { ...tpl.icons } }));
                                  setFocusedIconKey(null);
                                  toast.success(
                                    isEs
                                      ? `Plantilla "${tpl.name}" aplicada — recuerda guardar`
                                      : `Template "${tpl.name}" applied — remember to save`
                                  );
                                }}
                                className="text-xs font-medium text-slate-700 hover:text-primary flex items-center gap-1.5"
                              >
                                <span className="text-sm">{Object.values(tpl.icons || {}).slice(0, 3).join("")}</span>
                                <span>{tpl.name}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setContentCfg((prev) => ({
                                    ...prev,
                                    custom_icon_templates: (prev.custom_icon_templates || []).filter((t) => t.id !== tpl.id),
                                  }));
                                }}
                                className="w-5 h-5 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`custom-tpl-remove-${tpl.id}`}
                                aria-label="delete template"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Save current status_icons as a named custom template.
                        Only enabled when there's actually something to save
                        and the user typed a name. */}
                    <div className="mt-2 pt-2 border-t border-primary/10 flex items-center gap-2">
                      <Input
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder={isEs ? "Nombre de plantilla…" : "Template name…"}
                        maxLength={60}
                        className="flex-1 h-8 text-xs"
                        data-testid="new-template-name-input"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/5"
                        disabled={
                          !newTemplateName.trim() ||
                          Object.keys(contentCfg.status_icons || {}).length === 0 ||
                          (contentCfg.custom_icon_templates || []).length >= 20
                        }
                        onClick={() => {
                          const nid = `tpl_${Date.now().toString(36)}`;
                          setContentCfg((prev) => ({
                            ...prev,
                            custom_icon_templates: [
                              ...(prev.custom_icon_templates || []),
                              { id: nid, name: newTemplateName.trim(), icons: { ...(prev.status_icons || {}) } },
                            ],
                          }));
                          setNewTemplateName("");
                          toast.success(isEs ? "Plantilla guardada — recuerda guardar cambios" : "Template saved — remember to save changes");
                        }}
                        data-testid="save-as-template-btn"
                      >
                        {isEs ? "Guardar actual" : "Save current"}
                      </Button>
                    </div>
                  </div>

                  {/* Preset grid: one row per Kora stage. Click a stage to
                      focus its slot, then click an emoji from the palette to
                      assign it. Also supports typing a custom emoji.
                      This replaces the old "type the snake_case key" flow
                      which was error-prone (users typed "confirmado" instead
                      of "committed" and the icon never rendered). */}
                  <div className="space-y-1.5 mb-2">
                    {STAGE_PRESETS.map(({ key, label, colorHint }) => {
                      const current = (contentCfg.status_icons || {})[key] || "";
                      const isFocused = focusedIconKey === key;
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-2 text-sm p-2 rounded border transition-colors ${
                            isFocused ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50"
                          }`}
                          data-testid={`icon-preset-${key}`}
                        >
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${colorHint}`}
                            aria-hidden="true"
                          />
                          <span className="flex-1 font-medium text-slate-700">
                            {isEs ? label.es : label.en}
                            <span className="ml-2 text-[11px] font-mono text-muted-foreground">
                              {key}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setFocusedIconKey(isFocused ? null : key)}
                            className={`min-w-[2.5rem] h-9 rounded border text-lg flex items-center justify-center transition-all ${
                              isFocused
                                ? "border-primary bg-white"
                                : "border-slate-300 bg-white hover:border-slate-400"
                            }`}
                            data-testid={`icon-slot-${key}`}
                          >
                            {current || <span className="text-slate-300 text-sm">+</span>}
                          </button>
                          {current && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                              onClick={() => removeStatusIcon(key)}
                              data-testid={`icon-remove-${key}`}
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Emoji palette — only visible when a preset slot is focused.
                      Keeps the UI compact for users who don't want to touch
                      icons at all. */}
                  {focusedIconKey && (
                    <div className="p-3 rounded-lg border border-primary/30 bg-white space-y-2 mb-2" data-testid="emoji-palette">
                      <p className="text-xs text-muted-foreground">
                        {isEs
                          ? `Elige un emoji para "${STAGE_PRESETS.find(s => s.key === focusedIconKey)?.label.es}"`
                          : `Pick an emoji for "${STAGE_PRESETS.find(s => s.key === focusedIconKey)?.label.en}"`}
                      </p>
                      <div className="grid grid-cols-10 gap-1">
                        {EMOJI_PALETTE.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setContentCfg((prev) => ({
                                ...prev,
                                status_icons: { ...(prev?.status_icons || {}), [focusedIconKey]: emoji },
                              }));
                              setFocusedIconKey(null);
                            }}
                            className="h-9 w-9 rounded hover:bg-slate-100 text-xl flex items-center justify-center transition-colors"
                            data-testid={`emoji-option-${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <Input
                          value={newIconValue}
                          onChange={(e) => setNewIconValue(e.target.value)}
                          placeholder={isEs ? "O escribe uno personalizado" : "Or type a custom one"}
                          className="flex-1 text-sm h-8"
                          maxLength={8}
                          data-testid="custom-emoji-input"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            const v = newIconValue.trim();
                            if (!v) return;
                            setContentCfg((prev) => ({
                              ...prev,
                              status_icons: { ...(prev?.status_icons || {}), [focusedIconKey]: v },
                            }));
                            setNewIconValue("");
                            setFocusedIconKey(null);
                          }}
                          disabled={!newIconValue.trim()}
                          data-testid="apply-custom-emoji-btn"
                        >
                          {isEs ? "Aplicar" : "Apply"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => { setFocusedIconKey(null); setNewIconValue(""); }}
                          data-testid="cancel-emoji-btn"
                        >
                          {isEs ? "Cancelar" : "Cancel"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    {isEs
                      ? "Toca un estado para asignarle un emoji. Aparecerá antes del nombre del evento en Google Calendar."
                      : "Click a status to assign an emoji. It'll appear before the event name in Google Calendar."}
                  </p>

                  {/* Live preview: renders a mini Google Calendar chip for each
                      key stage so the user can *see* how their configuration
                      will look before syncing. Colors are pulled from
                      `stageToColorId` which mirrors the backend logic. */}
                  <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200" data-testid="calendar-preview-panel">
                    <p className="text-[11px] font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {isEs ? "Vista previa en Google Calendar" : "Google Calendar preview"}
                    </p>
                    <div className="space-y-1.5">
                      {[
                        // Ordered by hour ascending — mimics how Google Calendar
                        // stacks events in the day view. Times chosen so each
                        // sample sits at a distinct, realistic catering slot.
                        { key: "inquiry_received",     stage: isEs ? "Solicitud" : "Inquiry",      sample: isEs ? "Cumpleaños Sofía"    : "Sofia's Birthday",   time: "09:00", multiday: false },
                        { key: "definition_in_review", stage: isEs ? "En Revisión" : "In Review",  sample: isEs ? "Corporate — Banco X" : "Corporate — Bank X", time: "12:30", multiday: false },
                        { key: "committed",            stage: isEs ? "Confirmado" : "Confirmed",   sample: isEs ? "Boda Ana & Carlos"   : "Ana & Carlos Wedding", time: "17:00", multiday: false },
                        { key: "committed",            stage: isEs ? "Confirmado" : "Confirmed",   sample: isEs ? "Retiro Corporativo"  : "Corporate Retreat",   time: "18:00", multiday: true, day: 2, total: 3 },
                        { key: "cancelled",            stage: isEs ? "Cancelado" : "Cancelled",    sample: isEs ? "Evento Corporativo"  : "Corporate Event",     time: "20:00", multiday: false },
                      ].map(({ key, stage, sample, time, multiday, day, total }, idx) => {
                        const colorId = stageToColorId(key);
                        const style = CAL_COLOR_STYLES[colorId] || CAL_COLOR_STYLES["7"];
                        const icon = (contentCfg.status_icons || {})[key] || "";
                        // Build the title exactly as the backend would render it.
                        // Substitute the same template variables used server-side.
                        let raw = (contentCfg.title_template || "{{primary_record}}")
                          .replace(/\{\{\s*primary_record\s*\}\}/g, sample)
                          .replace(/\{\{\s*status\s*\}\}/g, stage)
                          .replace(/\{\{\s*location\s*\}\}/g, "Casa Vieja")
                          .replace(/\{\{\s*status_icon\s*\}\}/g, icon);
                        // Same cleanup as `_render_title` on the backend.
                        let rendered = raw
                          .replace(/[·\-|]+\s*(?=[·\-|]|$)/g, "")
                          .replace(/^\s*[·\-|]+\s*/, "")
                          .replace(/\s*[·\-|]+\s*$/, "")
                          .replace(/\s{2,}/g, " ")
                          .trim();
                        // Multi-day: append the configured suffix (same
                        // {{day}}/{{total}} substitution rules as backend).
                        if (multiday) {
                          const suffix = (contentCfg.multiday_suffix || "· Day {{day}} of {{total}}")
                            .replace(/\{\{\s*day\s*\}\}/g, String(day))
                            .replace(/\{\{\s*total\s*\}\}/g, String(total));
                          rendered = `${rendered} ${suffix}`.trim();
                        }
                        return (
                          <div
                            key={`${key}-${idx}`}
                            className={`flex items-center gap-2 py-1.5 px-2 rounded ${style.bg} border-l-4 ${style.border} shadow-sm`}
                            data-testid={`preview-chip-${key}-${idx}`}
                          >
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${style.dot} flex-shrink-0`} aria-hidden="true" />
                            <span className="text-xs text-slate-500 font-mono w-16 flex-shrink-0">{time}</span>
                            <span className="text-sm text-slate-800 truncate">{rendered}</span>
                            {multiday && (
                              <span className="ml-auto text-[10px] font-medium text-slate-500 uppercase bg-white/70 px-1.5 py-0.5 rounded-sm flex-shrink-0">
                                {isEs ? "multi-día" : "multi-day"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {isEs
                        ? "Así se verán tus eventos en Google Calendar tras la próxima sincronización."
                        : "This is how your events will appear on Google Calendar after the next sync."}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <Button
                    onClick={saveContentCfg}
                    disabled={savingContent}
                    className="bg-primary hover:bg-primary/90"
                    data-testid="save-content-template-btn"
                  >
                    {savingContent ? (isEs ? "Guardando..." : "Saving...") : (isEs ? "Guardar Plantilla" : "Save Template")}
                  </Button>
                </div>
              </div>
            )}

            {/* Sync preferences */}
            {status.shared_calendar_id && (
              <div className="pt-4 border-t space-y-3">
                <p className="text-sm font-medium">{isEs ? "Sincronización Automática" : "Auto-Sync"}</p>
                <SyncToggle
                  label={isEs ? "Eventos / Engagements" : "Events / Engagements"}
                  description={isEs ? "Crear automáticamente eventos del catering en Google Calendar." : "Auto-create catering events in Google Calendar."}
                  testId="sync-events-toggle"
                  value={status.auto_sync_events !== false}
                  onChange={async (v) => {
                    try {
                      await axios.put(`${API}/api/oauth/calendar/preferences`, { auto_sync_events: v }, { withCredentials: true });
                      setStatus({ ...status, auto_sync_events: v });
                      toast.success(isEs ? "Preferencia actualizada" : "Preference updated");
                    } catch (err) {
                      toast.error(err.response?.data?.detail || "Error");
                    }
                  }}
                />
                <SyncToggle
                  label={isEs ? "Follow-ups del CRM" : "CRM Follow-ups"}
                  description={isEs ? "Crear automáticamente eventos para los próximos seguimientos de clientes/leads." : "Auto-create events for upcoming client/lead follow-ups."}
                  testId="sync-followups-toggle"
                  value={status.auto_sync_follow_ups !== false}
                  onChange={async (v) => {
                    try {
                      await axios.put(`${API}/api/oauth/calendar/preferences`, { auto_sync_follow_ups: v }, { withCredentials: true });
                      setStatus({ ...status, auto_sync_follow_ups: v });
                      toast.success(isEs ? "Preferencia actualizada" : "Preference updated");
                    } catch (err) {
                      toast.error(err.response?.data?.detail || "Error");
                    }
                  }}
                />

                {/* Per-stage filter. `sync_stages: null` = sync everything
                    (default). When the user disables a stage the backend will
                    ALSO delete those events from Google on the next auto-sync
                    tick, so the calendar mirrors the toggles exactly. */}
                <div className="pt-3 mt-2 border-t border-slate-100" data-testid="sync-stages-panel">
                  <p className="text-sm font-medium mb-1">
                    {isEs ? "¿Cuáles estados sincronizar?" : "Which stages to sync?"}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {isEs
                      ? "Solo los estados marcados se publicarán en Google Calendar. Al desmarcar uno, esos eventos se eliminan automáticamente del calendario en la próxima sincronización."
                      : "Only checked stages will publish to Google Calendar. Unchecking a stage removes those events on the next sync."}
                  </p>
                  {(() => {
                    // Stage list mirrors the backend `_stage_to_calendar_meta`.
                    // Uses the same emoji language as the color mapping so the
                    // toggle UI feels consistent with what the operator sees
                    // on Google.
                    const STAGE_OPTIONS = [
                      { key: "inquiry_received", labelEs: "Solicitud Recibida", labelEn: "Inquiry Received", color: "bg-slate-400" },
                      { key: "context_captured", labelEs: "Contexto Capturado", labelEn: "Context Captured", color: "bg-slate-400" },
                      { key: "scope_drafted", labelEs: "Alcance Borrador", labelEn: "Scope Drafted", color: "bg-yellow-400" },
                      { key: "definition_in_review", labelEs: "En Definición / Revisión", labelEn: "Definition In Review", color: "bg-yellow-400" },
                      { key: "committed", labelEs: "Confirmado", labelEn: "Confirmed", color: "bg-emerald-600" },
                      { key: "in_progress", labelEs: "En Curso", labelEn: "In Progress", color: "bg-blue-500" },
                      { key: "closed", labelEs: "Cerrado", labelEn: "Closed", color: "bg-emerald-800" },
                      { key: "cancelled", labelEs: "Cancelado", labelEn: "Cancelled", color: "bg-red-500" },
                      { key: "archived", labelEs: "Archivado", labelEn: "Archived", color: "bg-red-400" },
                    ];
                    // `null` in DB means "sync all" — reflect that by
                    // treating every stage as enabled by default.
                    const cur = status.sync_stages;
                    const isAllEnabled = cur === null || cur === undefined;
                    const isEnabled = (k) => isAllEnabled || (Array.isArray(cur) && cur.includes(k));
                    const persist = async (next) => {
                      try {
                        await axios.put(
                          `${API}/api/oauth/calendar/preferences`,
                          { sync_stages: next },
                          { withCredentials: true }
                        );
                        setStatus({ ...status, sync_stages: next });
                      } catch (err) {
                        toast.error(err.response?.data?.detail || "Error");
                      }
                    };
                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {STAGE_OPTIONS.map((s) => {
                            const on = isEnabled(s.key);
                            return (
                              <label
                                key={s.key}
                                className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer text-xs transition-colors ${
                                  on ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"
                                }`}
                                data-testid={`sync-stage-${s.key}`}
                              >
                                <input
                                  type="checkbox"
                                  className="accent-emerald-600"
                                  checked={on}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    // Materialize current selection into a
                                    // concrete list before mutating so
                                    // "unchecking one" starting from "all"
                                    // switches from null → explicit list.
                                    const base = Array.isArray(cur)
                                      ? [...cur]
                                      : STAGE_OPTIONS.map((x) => x.key);
                                    const next = checked
                                      ? Array.from(new Set([...base, s.key]))
                                      : base.filter((k) => k !== s.key);
                                    persist(next);
                                  }}
                                />
                                <span className={`inline-block w-2 h-2 rounded-full ${s.color}`} aria-hidden="true" />
                                <span className="flex-1">{isEs ? s.labelEs : s.labelEn}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => persist(null)}
                            className="text-emerald-700 hover:underline"
                            data-testid="sync-stages-select-all"
                          >
                            {isEs ? "Todos" : "All"}
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => persist([])}
                            className="text-red-600 hover:underline"
                            data-testid="sync-stages-select-none"
                          >
                            {isEs ? "Ninguno" : "None"}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">{isEs ? "¿Cómo funciona?" : "How it works?"}</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {isEs 
                  ? "Los eventos de catering con fecha confirmada se publican automáticamente en el calendario"
                  : "Catering events with confirmed dates auto-publish to the calendar"}</li>
                <li>• {isEs 
                  ? "Los follow-ups del CRM se programan a las 9am del día indicado"
                  : "CRM follow-ups are scheduled at 9am of the indicated day"}</li>
                <li>• {isEs 
                  ? "Al editar o eliminar el evento en Kora, se actualiza/elimina en Google Calendar"
                  : "When you edit or delete the event in Kora, it's also updated/removed in Google Calendar"}</li>
                <li>• {isEs 
                  ? "Los eventos sin fecha (TBD) no se publican hasta confirmar fecha"
                  : "TBD events are not published until a date is confirmed"}</li>
              </ul>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              {isEs 
                ? "Conecta Google Calendar para sincronizar automáticamente eventos de catering y follow-ups del CRM"
                : "Connect Google Calendar to auto-sync catering events and CRM follow-ups"}
            </p>
            <Button onClick={handleConnect} data-testid="connect-calendar-btn">
              <Link2 className="w-4 h-4 mr-2" />
              {isEs ? "Conectar Google Calendar" : "Connect Google Calendar"}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Select Calendar Dialog */}
      <Dialog open={selectCalendarOpen} onOpenChange={setSelectCalendarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Seleccionar Calendario Compartido" : "Select Shared Calendar"}</DialogTitle>
          </DialogHeader>
          {loadingCalendars ? (
            <div className="py-8 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {calendars.map((cal) => (
                <button
                  key={cal.id}
                  onClick={() => handleSelectCalendar(cal.id)}
                  className={`w-full p-3 text-left rounded-lg border transition-colors hover:bg-muted/50 ${
                    cal.id === status?.shared_calendar_id ? 'border-blue-500 bg-blue-50' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{cal.name}</p>
                      {cal.primary && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          {isEs ? "Principal" : "Primary"}
                        </Badge>
                      )}
                    </div>
                    {cal.id === status?.shared_calendar_id && (
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectCalendarOpen(false)}>
              {isEs ? "Cerrar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Calendar Dialog */}
      <Dialog open={createCalendarOpen} onOpenChange={setCreateCalendarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Crear Nuevo Calendario" : "Create New Calendar"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre del calendario" : "Calendar name"}</Label>
              <Input
                value={newCalendarName}
                onChange={(e) => setNewCalendarName(e.target.value)}
                placeholder={isEs ? "Ej: Follow-ups CRM Kora" : "E.g.: Kora CRM Follow-ups"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCalendarOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateCalendar} disabled={creating || !newCalendarName.trim()}>
              {creating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


function SyncToggle({ label, description, value, onChange, testId }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40 border">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        data-testid={testId}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${value ? "bg-violet-600" : "bg-muted"}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${value ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}
