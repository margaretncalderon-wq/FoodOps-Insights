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
    const day = ref.getUTCDay();
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

// Mirror of backend logic to preview OT categorization from worked time_in/time_out
function computeWorkedMinutes(timeIn, timeOut, breakMin) {
  if (!timeIn || !timeOut) return { total: 0, night: 0 };
  const [ih, im] = timeIn.split(":").map(Number);
  const [oh, om] = timeOut.split(":").map(Number);
  let ti = ih * 60 + im;
  let to = oh * 60 + om;
  if (to <= ti) to += 24 * 60;
  const total = Math.max(0, to - ti - Number(breakMin || 0));
  let night = 0;
  for (let m = ti; m < to; m++) {
    const hod = Math.floor(m / 60) % 24;
    if (hod >= 21 || hod < 6) night++;
  }
  const shiftLen = to - ti;
  const adjustedNight = shiftLen > 0 && breakMin > 0 ? Math.round(night * (total / shiftLen)) : night;
  return { total, night: adjustedNight };
}

function previewOtForDay({ isoDate, dow, baseHours, timeIn, timeOut, breakMin, isHoliday }) {
  const { total, night } = computeWorkedMinutes(timeIn, timeOut, breakMin);
  if (total <= 0) return { hours_35: 0, hours_night: 0, hours_holiday: 0, worked: 0 };
  const workedH = total / 60;
  const nightH = night / 60;
  const isSunday = dow === 0;
  if (isSunday || isHoliday) {
    return { hours_35: 0, hours_night: 0, hours_holiday: workedH, worked: workedH };
  }
  const otTotal = Math.max(0, workedH - (baseHours || 0));
  if (otTotal <= 0) return { hours_35: 0, hours_night: 0, hours_holiday: 0, worked: workedH };
  const nightOt = Math.min(nightH, otTotal);
  return {
    hours_35: Math.max(0, otTotal - nightOt),
    hours_night: nightOt,
    hours_holiday: 0,
    worked: workedH,
  };
}

export default function OvertimePeriodDialog({
  open, onClose, onSaved, employees, defaultPeriodType = "biweekly", isEs = true,
  editPeriod = null,
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [periodType, setPeriodType] = useState(defaultPeriodType);
  const [refDate, setRefDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState({}); // manual mode: {iso:{hours_35,hours_night,hours_holiday,hours_100,notes}}
  const [workedEntries, setWorkedEntries] = useState({}); // worked mode: {iso:{time_in,time_out,break_min,is_holiday,notes}}
  const [inputMode, setInputMode] = useState("worked"); // "worked" | "manual"
  const [saving, setSaving] = useState(false);
  const [expectedHours, setExpectedHours] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const isEditMode = !!editPeriod;

  useEffect(() => {
    if (open) {
      if (editPeriod) {
        setEmployeeId(editPeriod.employee_id);
        setPeriodType(editPeriod.period_type);
        setRefDate(editPeriod.start_date);
        setReason(editPeriod.reason || "");
        setNotes(editPeriod.notes || "");
        const prefillManual = {};
        (editPeriod.daily_entries || []).forEach((e) => {
          prefillManual[e.date] = {
            hours_35: e.hours_35 ?? "",
            hours_night: e.hours_night ?? "",
            hours_holiday: e.hours_holiday ?? "",
            hours_100: e.hours_100 ?? "",
            notes: e.notes || "",
          };
        });
        setEntries(prefillManual);
        // Prefill worked mode if we have worked_entries stored
        const prefillWorked = {};
        (editPeriod.worked_entries || []).forEach((e) => {
          prefillWorked[e.date] = {
            time_in: e.time_in || "",
            time_out: e.time_out || "",
            break_min: e.break_min ?? "",
            is_holiday: !!e.is_holiday,
            notes: e.notes || "",
          };
        });
        setWorkedEntries(prefillWorked);
        setInputMode(editPeriod.input_mode === "worked_schedule" ? "worked" : "manual");
        setExpectedHours(null);
      } else {
        setEmployeeId("");
        setPeriodType(defaultPeriodType);
        setRefDate(new Date().toISOString().slice(0, 10));
        setReason("");
        setNotes("");
        setEntries({});
        setWorkedEntries({});
        setInputMode("worked");
        setExpectedHours(null);
      }
    }
  }, [open, defaultPeriodType, editPeriod]);

  const { start, end } = useMemo(() => periodBounds(periodType, refDate), [periodType, refDate]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);

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

  // Auto-load base schedule when in worked mode and employee/dates change
  useEffect(() => {
    if (open && inputMode === "worked" && employeeId && !expectedHours) {
      loadBaseSchedule();
    }
  }, [inputMode, employeeId, start, end, open]);

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

  const setWorkedCell = (date, field, value) => {
    setWorkedEntries((prev) => {
      const row = prev[date] || {};
      return { ...prev, [date]: { ...row, [field]: value } };
    });
  };

  // Prefill worked entries with base schedule when it loads
  useEffect(() => {
    if (inputMode !== "worked" || !expectedHours) return;
    setWorkedEntries((prev) => {
      const next = { ...prev };
      let changed = false;
      days.forEach((iso) => {
        if (next[iso]) return;
        const [dy, dm, dd] = iso.split("-").map(Number);
        const dateObj = new Date(Date.UTC(dy, dm - 1, dd));
        const dow = dateObj.getUTCDay();
        const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][dow];
        // Try to fetch schedule start/end from expectedHours.pattern if provided in future
        // For now, leave empty — user fills in actual worked times
        next[iso] = { time_in: "", time_out: "", break_min: "", is_holiday: false, notes: "" };
        changed = true;
        // suppress unused warning
        void dayKey;
      });
      return changed ? next : prev;
    });
  }, [inputMode, expectedHours, days]);

  const manualTotals = useMemo(() => {
    let h35 = 0, hn = 0, hh = 0, h100 = 0;
    Object.values(entries).forEach((r) => {
      h35 += Number(r.hours_35 || 0);
      hn += Number(r.hours_night || 0);
      hh += Number(r.hours_holiday || 0);
      h100 += Number(r.hours_100 || 0);
    });
    return { hours_35: h35, hours_night: hn, hours_holiday: hh, hours_100: h100, total: h35 + hn + hh + h100 };
  }, [entries]);

  const workedTotals = useMemo(() => {
    let h35 = 0, hn = 0, hh = 0, worked = 0;
    days.forEach((iso) => {
      const [dy, dm, dd] = iso.split("-").map(Number);
      const dateObj = new Date(Date.UTC(dy, dm - 1, dd));
      const dow = dateObj.getUTCDay();
      const base = expectedHours ? (expectedHours.daily?.[iso] ?? 0) : 0;
      const row = workedEntries[iso] || {};
      const p = previewOtForDay({
        isoDate: iso, dow, baseHours: base,
        timeIn: row.time_in, timeOut: row.time_out, breakMin: Number(row.break_min || 0),
        isHoliday: row.is_holiday,
      });
      h35 += p.hours_35;
      hn += p.hours_night;
      hh += p.hours_holiday;
      worked += p.worked;
    });
    return {
      hours_35: h35, hours_night: hn, hours_holiday: hh,
      total_ot: h35 + hn + hh,
      total_worked: worked,
    };
  }, [workedEntries, days, expectedHours]);

  const submit = async () => {
    if (!employeeId) {
      toast.error(isEs ? "Selecciona un empleado" : "Select an employee");
      return;
    }
    setSaving(true);
    try {
      if (inputMode === "worked") {
        const worked_entries = Object.entries(workedEntries)
          .filter(([, r]) => r.time_in && r.time_out)
          .map(([date, r]) => ({
            date,
            time_in: r.time_in,
            time_out: r.time_out,
            break_min: Number(r.break_min || 0),
            is_holiday: !!r.is_holiday,
            notes: r.notes || null,
          }));
        if (worked_entries.length === 0) {
          toast.error(isEs ? "Ingresa entrada/salida en al menos un día" : "Enter time in/out on at least one day");
          setSaving(false);
          return;
        }
        if (isEditMode) {
          await axios.put(`${API}/api/people-ops/overtime/periods/${editPeriod.overtime_period_id}`,
            { worked_entries, reason, notes }, { withCredentials: true });
          toast.success(isEs ? "Período actualizado" : "Period updated");
        } else {
          await axios.post(`${API}/api/people-ops/overtime/periods`, {
            employee_id: employeeId,
            period_type: periodType,
            ref_date: refDate,
            worked_entries,
            reason,
            notes,
          }, { withCredentials: true });
          toast.success(isEs ? "Período de horas extras creado" : "Overtime period created");
        }
      } else {
        const daily_entries = Object.entries(entries)
          .filter(([, r]) => (
            Number(r.hours_35 || 0) > 0 ||
            Number(r.hours_night || 0) > 0 ||
            Number(r.hours_holiday || 0) > 0 ||
            Number(r.hours_100 || 0) > 0
          ))
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
          setSaving(false);
          return;
        }

        if (isEditMode) {
          await axios.put(`${API}/api/people-ops/overtime/periods/${editPeriod.overtime_period_id}`,
            { daily_entries, reason, notes }, { withCredentials: true });
          toast.success(isEs ? "Período actualizado" : "Period updated");
        } else {
          await axios.post(`${API}/api/people-ops/overtime/periods`, {
            employee_id: employeeId,
            period_type: periodType,
            ref_date: refDate,
            daily_entries,
            reason,
            notes,
          }, { withCredentials: true });
          toast.success(isEs ? "Período de horas extras creado" : "Overtime period created");
        }
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

          {/* Mode toggle */}
          <div className="flex items-center gap-2 border-b pb-2">
            <Label className="text-xs uppercase tracking-wide text-slate-600">{isEs ? "Modo de captura:" : "Input mode:"}</Label>
            <Button
              type="button"
              size="sm"
              variant={inputMode === "worked" ? "default" : "outline"}
              onClick={() => setInputMode("worked")}
              data-testid="mode-toggle-worked"
            >
              {isEs ? "Horario real trabajado" : "Actual worked schedule"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={inputMode === "manual" ? "default" : "outline"}
              onClick={() => setInputMode("manual")}
              data-testid="mode-toggle-manual"
            >
              {isEs ? "Horas OT manual" : "Manual OT hours"}
            </Button>
            {inputMode === "worked" && (
              <span className="text-[11px] text-blue-700 ml-2">
                {isEs
                  ? "Ingresa entrada/salida real → el sistema calcula OT automáticamente"
                  : "Enter actual time in/out → system auto-calculates OT"}
              </span>
            )}
          </div>

          {/* Base schedule status */}
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
                    {inputMode === "worked" ? (
                      <>
                        <span className="text-xs text-emerald-800">
                          {isEs ? "Trabajadas:" : "Worked:"} <b>{workedTotals.total_worked.toFixed(2)}h</b>
                        </span>
                        <span className="text-xs text-purple-800">
                          {isEs ? "OT auto:" : "OT auto:"} <b>{workedTotals.total_ot.toFixed(2)}h</b>
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-emerald-800">
                        {isEs ? "Horas OT ingresadas:" : "OT entered:"} <b>{manualTotals.total.toFixed(2)}h</b>
                      </span>
                    )}
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
                {loadingSchedule ? (isEs ? "Cargando…" : "Loading…") : (isEs ? "Recargar horario" : "Reload schedule")}
              </Button>
            </div>
          )}

          {/* WORKED SCHEDULE GRID */}
          {inputMode === "worked" && (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Día" : "Day"}</th>
                    <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600" title={isEs ? "Horas base según horario" : "Base scheduled hours"}>{isEs ? "Base" : "Base"}</th>
                    <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Entrada" : "Time in"}</th>
                    <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Salida" : "Time out"}</th>
                    <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Descanso (min)" : "Break (min)"}</th>
                    <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Feriado" : "Holiday"}</th>
                    <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "OT (auto)" : "OT (auto)"}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((iso) => {
                    const [dy, dm, dd] = iso.split("-").map(Number);
                    const dateObj = new Date(Date.UTC(dy, dm - 1, dd));
                    const dow = dateObj.getUTCDay();
                    const isSun = dow === 0;
                    const row = workedEntries[iso] || {};
                    const baseHours = expectedHours ? (expectedHours.daily?.[iso] ?? 0) : 0;
                    const isDayOff = baseHours === 0 && expectedHours;
                    const preview = previewOtForDay({
                      isoDate: iso, dow, baseHours,
                      timeIn: row.time_in, timeOut: row.time_out, breakMin: Number(row.break_min || 0),
                      isHoliday: row.is_holiday,
                    });
                    return (
                      <tr key={iso} className={`border-b ${isSun ? "bg-red-50/40" : isDayOff ? "bg-slate-100/60" : ""}`}>
                        <td className="px-2 py-1.5">
                          <span className={`text-xs font-medium ${isSun ? "text-red-700" : ""}`}>
                            {(isEs ? DOW_ES : DOW_EN)[dow]}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">{iso.slice(5)}</span>
                        </td>
                        <td className={`text-right px-2 py-1 text-xs font-mono ${isDayOff ? "text-slate-400" : "text-slate-600"}`}>
                          {isDayOff ? (isEs ? "libre" : "off") : `${baseHours}h`}
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="time"
                            value={row.time_in || ""}
                            onChange={(e) => setWorkedCell(iso, "time_in", e.target.value)}
                            className="h-7 text-xs w-24 mx-auto"
                            data-testid={`ot-worked-in-${iso}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="time"
                            value={row.time_out || ""}
                            onChange={(e) => setWorkedCell(iso, "time_out", e.target.value)}
                            className="h-7 text-xs w-24 mx-auto"
                            data-testid={`ot-worked-out-${iso}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number"
                            min="0"
                            step="5"
                            value={row.break_min ?? ""}
                            onChange={(e) => setWorkedCell(iso, "break_min", e.target.value)}
                            placeholder="0"
                            className="h-7 text-right text-xs w-16 mx-auto"
                            data-testid={`ot-worked-break-${iso}`}
                          />
                        </td>
                        <td className="text-center px-1 py-1">
                          <input
                            type="checkbox"
                            checked={!!row.is_holiday}
                            onChange={(e) => setWorkedCell(iso, "is_holiday", e.target.checked)}
                            className="w-4 h-4"
                            data-testid={`ot-worked-holiday-${iso}`}
                          />
                        </td>
                        <td className="text-right px-2 py-1 text-xs font-mono">
                          {preview.worked > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-slate-500">{preview.worked.toFixed(2)}h</span>
                              {(preview.hours_35 + preview.hours_night + preview.hours_holiday) > 0 && (
                                <div className="flex gap-1 text-[10px] mt-0.5">
                                  {preview.hours_35 > 0 && <span className="text-purple-700">35%:{preview.hours_35.toFixed(2)}</span>}
                                  {preview.hours_night > 0 && <span className="text-indigo-700">N:{preview.hours_night.toFixed(2)}</span>}
                                  {preview.hours_holiday > 0 && <span className="text-red-700">F:{preview.hours_holiday.toFixed(2)}</span>}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 font-semibold">
                  <tr>
                    <td colSpan={6} className="px-2 py-2 text-right text-xs text-slate-600 uppercase">{isEs ? "Total OT del período:" : "Period OT total:"}</td>
                    <td className="text-right px-2 py-2">
                      <div className="flex flex-col items-end">
                        <Badge variant="outline" className="font-bold" data-testid="worked-period-total-ot">
                          {workedTotals.total_ot.toFixed(2)}h
                        </Badge>
                        <div className="flex gap-1 text-[10px] mt-1">
                          {workedTotals.hours_35 > 0 && <span className="text-purple-700">35%:{workedTotals.hours_35.toFixed(2)}</span>}
                          {workedTotals.hours_night > 0 && <span className="text-indigo-700">N:{workedTotals.hours_night.toFixed(2)}</span>}
                          {workedTotals.hours_holiday > 0 && <span className="text-red-700">F:{workedTotals.hours_holiday.toFixed(2)}</span>}
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* MANUAL HOURS GRID */}
          {inputMode === "manual" && (
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
                          <span className="text-xs font-medium">{(isEs ? DOW_ES : DOW_EN)[dow]}</span>
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
                    <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-35">{manualTotals.hours_35.toFixed(2)}</td>
                    <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-night">{manualTotals.hours_night.toFixed(2)}</td>
                    <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-holiday">{manualTotals.hours_holiday.toFixed(2)}</td>
                    <td className="text-right px-2 py-2 text-xs" data-testid="totals-hours-100">{manualTotals.hours_100.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan={expectedHours ? 5 : 4} className="px-2 py-1.5 text-right text-xs text-slate-500">
                      {isEs ? "Total horas OT del período:" : "Total OT hours in period:"}
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <Badge variant="outline" className="font-bold" data-testid="period-total-hours">{manualTotals.total.toFixed(2)}</Badge>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

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
