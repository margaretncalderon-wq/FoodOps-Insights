import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { API_BASE as API } from "../../utils/api";

const PERIOD_LABELS = {
  weekly: { es: "Semanal", en: "Weekly" },
  biweekly: { es: "Quincenal", en: "Biweekly" },
  monthly: { es: "Mensual", en: "Monthly" },
};

// Build period bounds locally — MUST match backend _compute_period_bounds
function periodBounds(periodType, refDateISO) {
  const [y, m, d] = refDateISO.split("-").map(Number);
  const ref = new Date(Date.UTC(y, m - 1, d));
  let start, end;
  if (periodType === "weekly") {
    // Monday-Sunday
    const day = ref.getUTCDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    start = new Date(ref); start.setUTCDate(ref.getUTCDate() + diff);
    end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  } else if (periodType === "biweekly") {
    if (ref.getUTCDate() <= 15) {
      start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
      end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 15));
    } else {
      start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 16));
      end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
    }
  } else {
    // monthly
    start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
    end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function enumerateDays(startISO, endISO) {
  const [y1, m1, d1] = startISO.split("-").map(Number);
  const [y2, m2, d2] = endISO.split("-").map(Number);
  const start = new Date(Date.UTC(y1, m1 - 1, d1));
  const end = new Date(Date.UTC(y2, m2 - 1, d2));
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

const DOW_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function OvertimePeriodDialog({
  open, onClose, onSaved, employees, defaultPeriodType = "biweekly", isEs = true,
  editPeriod = null,  // if set, edit mode
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [periodType, setPeriodType] = useState(defaultPeriodType);
  const [refDate, setRefDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState({}); // { "YYYY-MM-DD": {hours_35, hours_night, hours_holiday, hours_100, notes} }
  const [saving, setSaving] = useState(false);
  const [expectedHours, setExpectedHours] = useState(null); // { daily: {...}, total_hours, weekly_hours_threshold }
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const isEditMode = !!editPeriod;

  useEffect(() => {
    if (open) {
      if (editPeriod) {
        // Prefill from existing period
        setEmployeeId(editPeriod.employee_id);
        setPeriodType(editPeriod.period_type);
        setRefDate(editPeriod.start_date);
        setReason(editPeriod.reason || "");
        setNotes(editPeriod.notes || "");
        const prefill = {};
        (editPeriod.daily_entries || []).forEach((e) => {
          prefill[e.date] = {
            hours_35: e.hours_35 ?? "",
            hours_night: e.hours_night ?? "",
            hours_holiday: e.hours_holiday ?? "",
            hours_100: e.hours_100 ?? "",
            notes: e.notes || "",
          };
        });
        setEntries(prefill);
        setExpectedHours(null);
      } else {
        setEmployeeId("");
        setPeriodType(defaultPeriodType);
        setRefDate(new Date().toISOString().slice(0, 10));
        setReason("");
        setNotes("");
        setEntries({});
        setExpectedHours(null);
      }
    }
  }, [open, defaultPeriodType, editPeriod]);

  const loadBaseSchedule = async () => {
    if (!employeeId) {
      toast.error(isEs ? "Selecciona un empleado primero" : "Select an employee first");
      return;
    }
    setLoadingSchedule(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/schedules/employee/${employeeId}/expected-hours?start_date=${start}&end_date=${end}`,
        { withCredentials: true },
      );
      setExpectedHours(res.data);
      toast.success(isEs
        ? `Horario base cargado: ${res.data.total_hours}h esperadas · umbral semanal ${res.data.weekly_hours_threshold}h`
        : `Base schedule loaded: ${res.data.total_hours}h expected · weekly threshold ${res.data.weekly_hours_threshold}h`);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const { start, end } = useMemo(() => periodBounds(periodType, refDate), [periodType, refDate]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);

  // If employee has an override, adopt it
  const selectedEmployee = employees.find((e) => e.employee_id === employeeId);
  useEffect(() => {
    const empPeriod = selectedEmployee?.overtime_period_type;
    if (empPeriod && ["weekly", "biweekly", "monthly"].includes(empPeriod)) {
      setPeriodType(empPeriod);
    }
  }, [selectedEmployee]);

  const setCell = (date, field, value) => {
    setEntries((prev) => {
      const row = prev[date] || {};
      return { ...prev, [date]: { ...row, [field]: value } };
    });
  };

  const totals = useMemo(() => {
    let h35 = 0, hn = 0, hh = 0, h100 = 0;
    Object.values(entries).forEach((r) => {
      h35 += Number(r.hours_35 || 0);
      hn += Number(r.hours_night || 0);
      hh += Number(r.hours_holiday || 0);
      h100 += Number(r.hours_100 || 0);
    });
    return { hours_35: h35, hours_night: hn, hours_holiday: hh, hours_100: h100, total: h35 + hn + hh + h100 };
  }, [entries]);

  const submit = async () => {
    if (!employeeId) {
      toast.error(isEs ? "Selecciona un empleado" : "Select an employee");
      return;
    }
    const daily_entries = Object.entries(entries)
      .filter(([, r]) => {
        return (
          Number(r.hours_35 || 0) > 0 ||
          Number(r.hours_night || 0) > 0 ||
          Number(r.hours_holiday || 0) > 0 ||
          Number(r.hours_100 || 0) > 0
        );
      })
      .map(([date, r]) => ({
        date,
        hours_35: Number(r.hours_35 || 0),
        hours_night: Number(r.hours_night || 0),
        hours_holiday: Number(r.hours_holiday || 0),
        hours_100: Number(r.hours_100 || 0),
        notes: r.notes || null,
      }));

    if (daily_entries.length === 0) {
      toast.error(isEs ? "Ingresa horas en al menos un día" : "Enter hours on at least one day");
      return;
    }

    setSaving(true);
    try {
      if (isEditMode) {
        // Only send editable fields (daily_entries, reason, notes)
        const payload = { daily_entries, reason, notes };
        await axios.put(`${API}/api/people-ops/overtime/periods/${editPeriod.overtime_period_id}`, payload, { withCredentials: true });
        toast.success(isEs ? "Período actualizado" : "Period updated");
      } else {
        const payload = {
          employee_id: employeeId,
          period_type: periodType,
          ref_date: refDate,
          daily_entries,
          reason,
          notes,
        };
        await axios.post(`${API}/api/people-ops/overtime/periods`, payload, { withCredentials: true });
        toast.success(isEs ? "Período de horas extras creado" : "Overtime period created");
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      toast.error(isEs ? `Error: ${msg}` : `Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="overtime-period-dialog">
        <DialogHeader>
          <DialogTitle>{isEditMode ? (isEs ? "Editar Período de Horas Extras" : "Edit Overtime Period") : (isEs ? "Nuevo Período de Horas Extras" : "New Overtime Period")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="employee">{isEs ? "Empleado" : "Employee"}</Label>
              <Select value={employeeId} onValueChange={setEmployeeId} disabled={isEditMode}>
                <SelectTrigger data-testid="overtime-period-employee-select">
                  <SelectValue placeholder={isEs ? "Selecciona…" : "Select…"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.employee_id} value={e.employee_id}>
                      {e.full_name}
                      {e.overtime_period_type && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({PERIOD_LABELS[e.overtime_period_type][isEs ? "es" : "en"]})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="period-type">{isEs ? "Período" : "Period"}</Label>
              <Select value={periodType} onValueChange={setPeriodType} disabled={isEditMode}>
                <SelectTrigger data-testid="overtime-period-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">{isEs ? "Semanal (Lun-Dom)" : "Weekly (Mon-Sun)"}</SelectItem>
                  <SelectItem value="biweekly">{isEs ? "Quincenal (1-15 / 16-fin)" : "Biweekly (1-15 / 16-end)"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ref-date">{isEs ? "Fecha de referencia" : "Reference date"}</Label>
              <Input id="ref-date" type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} data-testid="overtime-period-refdate-input" disabled={isEditMode} />
              <p className="text-[10px] text-muted-foreground mt-1">
                {isEs ? `Período: ${start} → ${end}` : `Period: ${start} → ${end}`}
              </p>
            </div>
          </div>

          {/* Base schedule loader */}
          {employeeId && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-blue-200 bg-blue-50/60 text-sm">
              <div>
                {expectedHours ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-xs text-blue-800">
                      {isEs ? "Horario base:" : "Base schedule:"} <b>{expectedHours.total_hours}h</b> {isEs ? "esperadas" : "expected"}
                    </span>
                    <span className="text-xs text-blue-800">
                      {isEs ? "Umbral semanal:" : "Weekly threshold:"} <b>{expectedHours.weekly_hours_threshold}h</b>
                    </span>
                    <span className="text-xs text-emerald-800">
                      {isEs ? "Horas OT ingresadas:" : "OT entered:"} <b>{Object.values(entries).reduce((s, r) => s + Number(r.hours_35||0) + Number(r.hours_night||0) + Number(r.hours_holiday||0) + Number(r.hours_100||0), 0).toFixed(2)}h</b>
                    </span>
                    {expectedHours.days_off_count > 0 && (
                      <span className="text-xs text-amber-800">
                        {expectedHours.days_off_count} {isEs ? "día(s) libre" : "day(s) off"}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {isEs ? "Carga el horario base para ver horas esperadas y umbral OT." : "Load base schedule to see expected hours and OT threshold."}
                  </span>
                )}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={loadBaseSchedule} disabled={loadingSchedule} data-testid="load-base-schedule-btn">
                {loadingSchedule ? (isEs ? "Cargando…" : "Loading…") : (isEs ? "Cargar horario base" : "Load base schedule")}
              </Button>
            </div>
          )}

          {/* Timesheet grid */}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Día" : "Day"}</th>
                  {expectedHours && (
                    <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600" title={isEs ? "Horas base según horario" : "Base scheduled hours"}>
                      {isEs ? "Base" : "Base"}
                    </th>
                  )}
                  <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Normal (35%)" : "Normal (35%)"}</th>
                  <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Nocturna (15%)" : "Night (15%)"}</th>
                  <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Feriado (100%)" : "Holiday (100%)"}</th>
                  <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Extra (100%)" : "Extra (100%)"}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((iso) => {
                  const [dy, dm, dd] = iso.split("-").map(Number);
                  const dateObj = new Date(Date.UTC(dy, dm - 1, dd));
                  const dow = dateObj.getUTCDay();
                  const row = entries[iso] || {};
                  const isWeekend = dow === 0 || dow === 6;
                  const baseHours = expectedHours ? (expectedHours.daily?.[iso] ?? 0) : null;
                  const isDayOff = baseHours === 0 && expectedHours;
                  return (
                    <tr key={iso} className={`border-b ${isDayOff ? "bg-slate-100/60" : isWeekend ? "bg-amber-50/40" : ""}`}>
                      <td className="px-2 py-1.5">
                        <span className="text-xs font-medium">
                          {(isEs ? DOW_ES : DOW_EN)[dow]}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">{iso.slice(5)}</span>
                      </td>
                      {expectedHours && (
                        <td className={`text-right px-2 py-1 text-xs font-mono ${isDayOff ? "text-slate-400" : "text-slate-600"}`}>
                          {isDayOff ? (isEs ? "libre" : "off") : `${baseHours}h`}
                        </td>
                      )}
                      {["hours_35", "hours_night", "hours_holiday", "hours_100"].map((field) => (
                        <td key={field} className="px-1 py-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.25"
                            value={row[field] ?? ""}
                            onChange={(e) => setCell(iso, field, e.target.value)}
                            placeholder="0"
                            className="h-7 text-right text-xs"
                            data-testid={`ot-cell-${iso}-${field}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-semibold">
                <tr>
                  <td className="px-2 py-2 text-xs uppercase text-slate-600">{isEs ? "Totales" : "Totals"}</td>
                  {expectedHours && (
                    <td className="text-right px-2 py-2 text-xs font-mono" data-testid="totals-base-hours">
                      {expectedHours.total_hours}h
                    </td>
                  )}
                  <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-35">{totals.hours_35.toFixed(2)}</td>
                  <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-night">{totals.hours_night.toFixed(2)}</td>
                  <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-holiday">{totals.hours_holiday.toFixed(2)}</td>
                  <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-100">{totals.hours_100.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={expectedHours ? 5 : 4} className="px-2 py-1.5 text-right text-xs text-slate-500">
                    {isEs ? "Total horas OT del período:" : "Total OT hours in period:"}
                  </td>
                  <td className="text-right px-2 py-1.5">
                    <Badge variant="outline" className="font-bold" data-testid="period-total-hours">{totals.total.toFixed(2)}</Badge>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Reason + notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="reason">{isEs ? "Motivo" : "Reason"}</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isEs ? "Ej. cierre de mes, evento especial" : "e.g. month-end close"} />
            </div>
            <div>
              <Label htmlFor="notes">{isEs ? "Notas" : "Notes"}</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {isEs ? "Cancelar" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={saving} data-testid="overtime-period-submit">
            {saving ? (isEs ? "Guardando…" : "Saving…") : (isEs ? "Guardar período" : "Save period")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
