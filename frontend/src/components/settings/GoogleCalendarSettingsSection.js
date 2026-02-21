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
              <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDisconnect}>
                <Unlink className="w-4 h-4 mr-2" />
                {isEs ? "Desconectar" : "Disconnect"}
              </Button>
            </div>

            {/* How it works */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">{isEs ? "¿Cómo funciona?" : "How it works?"}</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {isEs 
                  ? "Los follow-ups programados se crean automáticamente en el calendario compartido"
                  : "Scheduled follow-ups are automatically created in the shared calendar"}</li>
                <li>• {isEs 
                  ? "Al completar o reprogramar un follow-up, el evento se actualiza/elimina"
                  : "When completing or rescheduling a follow-up, the event is updated/deleted"}</li>
                <li>• {isEs 
                  ? "Todos los vendedores ven los eventos en el calendario compartido"
                  : "All salespeople see events in the shared calendar"}</li>
              </ul>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              {isEs 
                ? "Conecta Google Calendar para sincronizar automáticamente los follow-ups del CRM"
                : "Connect Google Calendar to automatically sync CRM follow-ups"}
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
