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
  Plus, Link2, Unlink, Settings2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

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
      const totalPushed = (d.events_pushed || 0) + (d.leads_pushed || 0) + (d.clients_pushed || 0);
      const totalFailed = (d.events_failed || 0) + (d.leads_failed || 0) + (d.clients_failed || 0);
      toast.success(
        isEs
          ? `Sincronizados: ${totalPushed} registro(s) (${d.events_pushed} eventos, ${d.leads_pushed} leads, ${d.clients_pushed} clientes)${totalFailed > 0 ? ` — ${totalFailed} fallaron` : ""}`
          : `Synced ${totalPushed} record(s) — ${d.events_pushed} events, ${d.leads_pushed} leads, ${d.clients_pushed} clients${totalFailed > 0 ? ` — ${totalFailed} failed` : ""}`
      );
      await fetchSyncStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al sincronizar" : "Sync error"));
    } finally {
      setSyncing(false);
    }
  };

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
                    ? (isEs ? "Sincronizando…" : "Syncing…")
                    : (isEs ? "Sincronizar Todo Ahora" : "Sync Everything Now")}
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
                  <div className="space-y-1 mb-2">
                    {Object.entries(contentCfg.status_icons || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-sm p-1.5 rounded bg-slate-50" data-testid={`icon-row-${k}`}>
                        <span className="font-mono text-xs text-muted-foreground flex-1">{k}</span>
                        <span className="text-lg">{v}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          onClick={() => removeStatusIcon(k)}
                          data-testid={`icon-remove-${k}`}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    {Object.keys(contentCfg.status_icons || {}).length === 0 && (
                      <p className="text-xs text-muted-foreground italic">
                        {isEs
                          ? "Sin iconos configurados. Los eventos no mostrarán prefijo de icono."
                          : "No icons configured. Events won't show an icon prefix."}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newIconKey}
                      onChange={(e) => setNewIconKey(e.target.value)}
                      placeholder={isEs ? "stage_key (ej. committed)" : "stage_key (e.g. committed)"}
                      className="flex-1 text-sm"
                      data-testid="new-icon-key-input"
                    />
                    <Input
                      value={newIconValue}
                      onChange={(e) => setNewIconValue(e.target.value)}
                      placeholder="✅"
                      className="w-20 text-sm text-center"
                      maxLength={8}
                      data-testid="new-icon-value-input"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={addStatusIcon}
                      disabled={!newIconKey.trim() || !newIconValue.trim()}
                      data-testid="add-icon-btn"
                    >
                      {isEs ? "Agregar" : "Add"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {isEs
                      ? "Ejemplos: committed → ✅, definition_review → ⏳, inquiry_received → 📝"
                      : "Examples: committed → ✅, definition_review → ⏳, inquiry_received → 📝"}
                  </p>
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
                      await axios.put(`${API}/api/oauth/calendar/preferences?auto_sync_events=${v}`, {}, { withCredentials: true });
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
                      await axios.put(`${API}/api/oauth/calendar/preferences?auto_sync_follow_ups=${v}`, {}, { withCredentials: true });
                      setStatus({ ...status, auto_sync_follow_ups: v });
                      toast.success(isEs ? "Preferencia actualizada" : "Preference updated");
                    } catch (err) {
                      toast.error(err.response?.data?.detail || "Error");
                    }
                  }}
                />
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
