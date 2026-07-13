/**
 * KeyDatesWidget — "Fechas Clave" for People Ops dashboard.
 *
 * Renders all upcoming HR alerts (birthdays, work anniversaries, probation ends,
 * contract/document expirations, vacation returns, TSS deadlines and custom
 * events added by the manager) grouped by time bucket.
 *
 * Mounted on the People Ops main page. Includes:
 *  - A gear icon → opens preferences dialog (days-ahead + toggles per type).
 *  - A "+" button → opens custom event dialog.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../../utils/api";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  Cake, Award, Clock, FileWarning, PlaneLanding, Calendar,
  ShieldCheck, Pin, Settings2, Plus, X, Trash2, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { KoraLoader } from "../KoraLoader";


const TYPE_META = {
  birthday:          { icon: Cake,         color: "text-pink-600 bg-pink-50 ring-pink-100" },
  work_anniversary:  { icon: Award,        color: "text-amber-600 bg-amber-50 ring-amber-100" },
  probation_end:     { icon: ShieldCheck,  color: "text-indigo-600 bg-indigo-50 ring-indigo-100" },
  contract_expiry:   { icon: FileWarning,  color: "text-red-600 bg-red-50 ring-red-100" },
  document_expiry:   { icon: FileWarning,  color: "text-orange-600 bg-orange-50 ring-orange-100" },
  vacation_return:   { icon: PlaneLanding, color: "text-sky-600 bg-sky-50 ring-sky-100" },
  tss_reminder:      { icon: Calendar,     color: "text-violet-600 bg-violet-50 ring-violet-100" },
  tss_deadline:      { icon: Calendar,     color: "text-red-600 bg-red-50 ring-red-100" },
  custom:            { icon: Pin,          color: "text-emerald-600 bg-emerald-50 ring-emerald-100" },
};

const BUCKETS = ["overdue", "today", "this_week", "this_month", "later"];

const bucketLabel = (b, isEs) => {
  if (isEs) return {
    overdue: "Atrasado", today: "Hoy", this_week: "Esta semana",
    this_month: "Este mes", later: "Más adelante",
  }[b];
  return {
    overdue: "Overdue", today: "Today", this_week: "This week",
    this_month: "This month", later: "Later",
  }[b];
};


export default function KeyDatesWidget() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API}/people-ops/key-dates?days_ahead=90`);
      setEvents(data.events || []);
    } catch (e) {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = BUCKETS.reduce((acc, b) => {
    acc[b] = events.filter(e => e.bucket === b);
    return acc;
  }, {});

  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm" data-testid="key-dates-widget">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-violet-600" />
          <h3 className="text-lg font-semibold">{isEs ? "Fechas Clave" : "Key Dates"}</h3>
          {events.length > 0 && (
            <span className="ml-1 inline-flex items-center px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">
              {events.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => setShowCustom(true)}
            data-testid="key-dates-add-custom-btn"
            title={isEs ? "Agregar evento personalizado" : "Add custom event"}
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setShowPrefs(true)}
            data-testid="key-dates-prefs-btn"
            title={isEs ? "Preferencias" : "Preferences"}
          >
            <Settings2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-8 flex justify-center"><KoraLoader size={32} /></div>
      ) : events.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>{isEs ? "No hay eventos próximos en los próximos 90 días." : "No upcoming events in the next 90 days."}</p>
          <button
            onClick={() => setShowCustom(true)}
            className="mt-2 text-xs text-violet-600 hover:underline"
          >
            {isEs ? "+ Agregar evento personalizado" : "+ Add custom event"}
          </button>
        </div>
      ) : (
        <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
          {BUCKETS.filter(b => grouped[b].length > 0).map(bucket => (
            <div key={bucket}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {bucketLabel(bucket, isEs)} · {grouped[bucket].length}
              </p>
              <div className="space-y-1.5">
                {grouped[bucket].map((ev, i) => <EventRow key={`${ev.type}-${i}`} ev={ev} isEs={isEs} onChanged={load} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showPrefs && <PreferencesDialog onClose={() => setShowPrefs(false)} onSaved={load} isEs={isEs} />}
      {showCustom && <CustomEventDialog onClose={() => setShowCustom(false)} onSaved={load} isEs={isEs} />}
    </div>
  );
}


const EventRow = ({ ev, isEs, onChanged }) => {
  const meta = TYPE_META[ev.type] || TYPE_META.custom;
  const Icon = meta.icon;
  const isCustom = ev.type === "custom";
  const dateLabel = ev.days_until === 0
    ? (isEs ? "Hoy" : "Today")
    : ev.days_until === 1
      ? (isEs ? "Mañana" : "Tomorrow")
      : ev.days_until < 0
        ? (isEs ? `Hace ${Math.abs(ev.days_until)}d` : `${Math.abs(ev.days_until)}d ago`)
        : (isEs ? `En ${ev.days_until}d` : `In ${ev.days_until}d`);

  const removeCustom = async () => {
    if (!ev?.meta?.event_id) return;
    if (!window.confirm(isEs ? "¿Eliminar este evento?" : "Delete this event?")) return;
    try {
      await axios.delete(`${API}/people-ops/custom-events/${ev.meta.event_id}`);
      toast.success(isEs ? "Evento eliminado" : "Event deleted");
      onChanged?.();
    } catch (_e) {
      toast.error(isEs ? "No se pudo eliminar" : "Failed to delete");
    }
  };

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ring-1 shrink-0 ${meta.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate">
          {isEs ? ev.title_es : ev.title_en}
        </p>
        {(isEs ? ev.subtitle_es : ev.subtitle_en) && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {isEs ? ev.subtitle_es : ev.subtitle_en}
          </p>
        )}
      </div>
      <div className="text-right shrink-0 flex items-center gap-1">
        <div>
          <p className={`text-xs font-semibold ${
            ev.severity === "danger" ? "text-red-600" :
            ev.severity === "warning" ? "text-amber-600" : "text-slate-500"
          }`}>
            {dateLabel}
          </p>
          <p className="text-[10px] text-muted-foreground">{ev.date}</p>
        </div>
        {isCustom && (
          <button
            onClick={removeCustom}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-red-500"
            title={isEs ? "Eliminar" : "Delete"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Preferences dialog
// ─────────────────────────────────────────────────────────────────────────────
const PreferencesDialog = ({ onClose, onSaved, isEs }) => {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/people-ops/alert-preferences`);
        setPrefs(data.preferences);
      } catch (_e) {
        toast.error(isEs ? "No se pudieron cargar las preferencias" : "Failed to load preferences");
      }
    })();
  }, [isEs]);

  const save = async () => {
    try {
      setSaving(true);
      await axios.put(`${API}/people-ops/alert-preferences`, prefs);
      toast.success(isEs ? "Preferencias guardadas" : "Preferences saved");
      onSaved?.();
      onClose();
    } catch (_e) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));
  const setNum = (key, val) => setPrefs((p) => ({ ...p, [key]: Math.max(0, parseInt(val || "0", 10)) }));

  const rows = prefs ? [
    { key: "birthday", label: isEs ? "Cumpleaños" : "Birthdays", daysKey: "birthday_days_ahead" },
    { key: "anniversary", label: isEs ? "Aniversario laboral" : "Work anniversary", daysKey: "anniversary_days_ahead" },
    { key: "probation", label: isEs ? "Fin de período de prueba" : "Probation end", daysKey: null },  // multi-day
    { key: "contract", label: isEs ? "Vencimiento de contrato" : "Contract expiry", daysKey: "contract_days_ahead" },
    { key: "document", label: isEs ? "Vencimiento de documentos" : "Document expiry", daysKey: "document_days_ahead" },
    { key: "vacation_return", label: isEs ? "Regreso de vacaciones" : "Vacation return", daysKey: "vacation_return_days_ahead" },
    { key: "tss", label: "TSS", daysKey: null },
    { key: "custom_events", label: isEs ? "Eventos personalizados" : "Custom events", daysKey: null },
  ] : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="key-dates-prefs-dialog">
        <DialogHeader>
          <DialogTitle>{isEs ? "Preferencias de Alertas" : "Alert Preferences"}</DialogTitle>
        </DialogHeader>
        {!prefs ? (
          <div className="py-6 flex justify-center"><KoraLoader size={28} /></div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">{row.label}</p>
                  {row.daysKey && prefs[`${row.key}_enabled`] && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {isEs ? "Avisar con" : "Notify"}
                      </Label>
                      <Input
                        type="number" min="0" max="365"
                        className="w-20 h-7 text-xs"
                        value={prefs[row.daysKey] ?? 0}
                        onChange={(e) => setNum(row.daysKey, e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {isEs ? "días de anticipación" : "days ahead"}
                      </span>
                    </div>
                  )}
                </div>
                <Switch
                  checked={!!prefs[`${row.key}_enabled`]}
                  onCheckedChange={() => toggle(`${row.key}_enabled`)}
                  data-testid={`key-dates-toggle-${row.key}`}
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isEs ? "Cancelar" : "Cancel"}
          </Button>
          <Button onClick={save} disabled={!prefs || saving} data-testid="key-dates-prefs-save">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEs ? "Guardar" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Custom event dialog
// ─────────────────────────────────────────────────────────────────────────────
const CustomEventDialog = ({ onClose, onSaved, isEs }) => {
  const [form, setForm] = useState({
    title: "",
    event_date: "",
    recurrence: "none",
    days_ahead: 7,
    notes: "",
    employee_id: null,
  });
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/people-ops/employees`);
        setEmployees(Array.isArray(data) ? data : (data.employees || []));
      } catch (_e) {
        setEmployees([]);
      }
    })();
  }, []);

  const save = async () => {
    if (!form.title.trim()) {
      toast.error(isEs ? "El título es obligatorio" : "Title is required");
      return;
    }
    if (!form.event_date) {
      toast.error(isEs ? "La fecha es obligatoria" : "Date is required");
      return;
    }
    try {
      setSaving(true);
      await axios.post(`${API}/people-ops/custom-events`, form);
      toast.success(isEs ? "Evento creado" : "Event created");
      onSaved?.();
      onClose();
    } catch (_e) {
      toast.error(isEs ? "Error al crear" : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="key-dates-custom-dialog">
        <DialogHeader>
          <DialogTitle>{isEs ? "Nuevo Evento" : "New Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{isEs ? "Título" : "Title"} *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={isEs ? "Ej: Renovación de licencia manejo" : "e.g. Driver license renewal"}
              data-testid="custom-event-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{isEs ? "Fecha" : "Date"} *</Label>
              <Input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                data-testid="custom-event-date"
              />
            </div>
            <div>
              <Label className="text-xs">{isEs ? "Repetición" : "Recurrence"}</Label>
              <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                <SelectTrigger data-testid="custom-event-recurrence"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Una vez" : "Once"}</SelectItem>
                  <SelectItem value="yearly">{isEs ? "Cada año" : "Yearly"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Cada mes" : "Monthly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">{isEs ? "Empleado (opcional)" : "Employee (optional)"}</Label>
            <Select value={form.employee_id || "none"} onValueChange={(v) => setForm({ ...form, employee_id: v === "none" ? null : v })}>
              <SelectTrigger data-testid="custom-event-employee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{isEs ? "— Ninguno —" : "— None —"}</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.employee_id} value={emp.employee_id}>
                    {emp.full_name || `${emp.first_name || ""} ${emp.last_name || ""}`.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{isEs ? "Anticipación (días)" : "Days ahead"}</Label>
            <Input
              type="number" min="0" max="365"
              value={form.days_ahead}
              onChange={(e) => setForm({ ...form, days_ahead: parseInt(e.target.value || "0", 10) })}
            />
          </div>
          <div>
            <Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isEs ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={save} disabled={saving} data-testid="custom-event-save">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEs ? "Crear" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
