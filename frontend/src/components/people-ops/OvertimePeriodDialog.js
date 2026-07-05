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

const OT_HOURS_PER_MONTH = 192;
const RATE_35 = 1.35;
const RATE_NIGHT = 1.15;
const RATE_HOLIDAY = 2.0;

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
  const adjustedNight = shiftLen > 0 && Number(breakMin || 0) > 0 ? Math.round(night * (total / shiftLen)) : night;
  return { total, night: adjustedNight };
}

function previewOtForDay({ dow, baseHours, timeIn, timeOut, breakMin, isHoliday }) {
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

function formatRD(n) {
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 2 }).format(n || 0);
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
  const [workedEntries, setWorkedEntries] = useState({});
  const [saving, setSaving] = useState(false);
  const [expectedHours, setExpectedHours] = useState(null);
  const [scheduleDetail, setScheduleDetail] = useState(null); // {daily_start, daily_end} per day, if backend returns
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [loadingTimeClock, setLoadingTimeClock] = useState(false);
  const isEditMode = !!editPeriod;

  useEffect(() => {
    if (open) {
      if (editPeriod) {
        setEmployeeId(editPeriod.employee_id);
        setPeriodType(editPeriod.period_type);
        setRefDate(editPeriod.start_date);
        setReason(editPeriod.reason || "");
        setNotes(editPeriod.notes || "");
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
        setExpectedHours(null);
      } else {
        setEmployeeId("");
        setPeriodType(defaultPeriodType);
        setRefDate(new Date().toISOString().slice(0, 10));
        setReason("");
        setNotes("");
        setWorkedEntries({});
        setExpectedHours(null);
      }
    }
  }, [open, defaultPeriodType, editPeriod]);

  const { start, end } = useMemo(() => periodBounds(periodType, refDate), [periodType, refDate]);
  const days = useMemo(() => enumerateDays(start, end), [start, end]);

  const selectedEmployee = employees.find((e) => e.employee_id === employeeId);
  const baseSalary = Number(selectedEmployee?.base_salary || 0);
  const hourlyRate = baseSalary > 0 ? baseSalary / OT_HOURS_PER_MONTH : 0;

  const loadBaseSchedule = async (silent = false) => {
    if (!employeeId) {
      if (!silent) toast.error(isEs ? "Selecciona un empleado primero" : "Select an employee first");
      return;
    }
    setLoadingSchedule(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/schedules/employee/${employeeId}/expected-hours?start_date=${start}&end_date=${end}`,
        { withCredentials: true },
      );
      setExpectedHours(res.data);
      // Also fetch the full schedule to get start/end times per day (for autofill)
      try {
        const cur = await axios.get(
          `${API}/api/people-ops/schedules/employee/${employeeId}/current`,
          { withCredentials: true },
        );
        setScheduleDetail(cur.data?.weekly_pattern || null);
      } catch {
        setScheduleDetail(null);
      }
      if (!silent) {
        toast.success(isEs
          ? `Horario cargado: ${res.data.total_hours}h esperadas`
          : `Schedule loaded: ${res.data.total_hours}h expected`);
      }
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.detail || err.message);
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    if (open && employeeId) {
      loadBaseSchedule(true);
    }
  }, [employeeId, start, end, open]);

  useEffect(() => {
    const empPeriod = selectedEmployee?.overtime_period_type;
    if (empPeriod && ["weekly", "biweekly", "monthly"].includes(empPeriod)) {
      setPeriodType(empPeriod);
    }
  }, [selectedEmployee]);

  const setWorkedCell = (date, field, value) => {
    setWorkedEntries((prev) => {
      const row = prev[date] || {};
      return { ...prev, [date]: { ...row, [field]: value } };
    });
  };

  const loadFromTimeClock = async () => {
    if (!employeeId) {
      toast.error(isEs ? "Selecciona un empleado" : "Select an employee");
      return;
    }
    setLoadingTimeClock(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/time-clock/aggregate-daily?employee_id=${employeeId}&start_date=${start}&end_date=${end}`,
        { withCredentials: true },
      );
      const daysArr = res.data?.days || [];
      if (daysArr.length === 0) {
        toast.info(isEs
          ? "El Reloj no tiene registros en este período"
          : "Time Clock has no records for this period");
        return;
      }
      setWorkedEntries((prev) => {
        const next = { ...prev };
        daysArr.forEach((d) => {
          next[d.date] = {
            ...(next[d.date] || {}),
            time_in: d.time_in,
            time_out: d.time_out,
            break_min: d.break_min,
            is_holiday: !!next[d.date]?.is_holiday,
            notes: next[d.date]?.notes || (d.shift_count > 1 ? `${d.shift_count} turnos` : ""),
          };
        });
        return next;
      });
      toast.success(isEs
        ? `${daysArr.length} día(s) cargados del Reloj`
        : `${daysArr.length} day(s) loaded from Time Clock`);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    } finally {
      setLoadingTimeClock(false);
    }
  };


  const applyBaseAsWorked = () => {
    if (!scheduleDetail) {
      toast.error(isEs ? "Aún no cargó el horario base" : "Base schedule not loaded yet");
      return;
    }
    const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    setWorkedEntries((prev) => {
      const next = { ...prev };
      let filled = 0;
      days.forEach((iso) => {
        const [dy, dm, dd] = iso.split("-").map(Number);
        const dow = new Date(Date.UTC(dy, dm - 1, dd)).getUTCDay();
        const patternDay = scheduleDetail[dayKeys[dow]] || {};
        if (patternDay.work_hours > 0 && patternDay.start && patternDay.end) {
          next[iso] = {
            ...(prev[iso] || {}),
            time_in: prev[iso]?.time_in || patternDay.start,
            time_out: prev[iso]?.time_out || patternDay.end,
            break_min: prev[iso]?.break_min ?? (patternDay.break_min || 0),
            is_holiday: !!prev[iso]?.is_holiday,
            notes: prev[iso]?.notes || "",
          };
          filled++;
        }
      });
      if (filled === 0) {
        toast.info(isEs ? "El horario base no tiene horas start/end configuradas" : "Base schedule has no start/end times set");
      } else {
        toast.success(isEs ? `${filled} días llenados con el horario base` : `${filled} days filled from base schedule`);
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    let h35 = 0, hn = 0, hh = 0, worked = 0;
    days.forEach((iso) => {
      const [dy, dm, dd] = iso.split("-").map(Number);
      const dow = new Date(Date.UTC(dy, dm - 1, dd)).getUTCDay();
      const base = expectedHours ? (expectedHours.daily?.[iso] ?? 0) : 0;
      const row = workedEntries[iso] || {};
      const p = previewOtForDay({
        dow, baseHours: base,
        timeIn: row.time_in, timeOut: row.time_out, breakMin: Number(row.break_min || 0),
        isHoliday: row.is_holiday,
      });
      h35 += p.hours_35;
      hn += p.hours_night;
      hh += p.hours_holiday;
      worked += p.worked;
    });
    const amount = hourlyRate * (h35 * RATE_35 + hn * RATE_NIGHT + hh * RATE_HOLIDAY);
    const amountExtraOnly = hourlyRate * (h35 * (RATE_35 - 1) + hn * (RATE_NIGHT - 1) + hh * (RATE_HOLIDAY - 1));
    return {
      hours_35: h35, hours_night: hn, hours_holiday: hh,
      total_ot: h35 + hn + hh,
      total_worked: worked,
      amount, amount_extra_only: amountExtraOnly,
    };
  }, [workedEntries, days, expectedHours, hourlyRate]);

  const submit = async () => {
    if (!employeeId) {
      toast.error(isEs ? "Selecciona un empleado" : "Select an employee");
      return;
    }
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
      return;
    }
    setSaving(true);
    try {
      if (isEditMode) {
        await axios.put(`${API}/api/people-ops/overtime/periods/${editPeriod.overtime_period_id}`,
          { worked_entries, reason, notes }, { withCredentials: true });
        toast.success(isEs ? "Timesheet actualizado" : "Timesheet updated");
      } else {
        await axios.post(`${API}/api/people-ops/overtime/periods`, {
          employee_id: employeeId,
          period_type: periodType,
          ref_date: refDate,
          worked_entries,
          reason,
          notes,
        }, { withCredentials: true });
        toast.success(isEs ? "Timesheet guardado" : "Timesheet saved");
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
          <DialogTitle>
            {isEditMode
              ? (isEs ? "Editar Timesheet Semanal" : "Edit Weekly Timesheet")
              : (isEs ? "Timesheet Semanal · Horas Extras" : "Weekly Timesheet · Overtime")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            {isEs
              ? "Captura el horario real trabajado. Las horas extras se calculan automáticamente comparando contra el horario base."
              : "Enter the actual worked schedule. Overtime is auto-calculated against the base schedule."}
          </p>
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

          {/* Base schedule + autofill */}
          {employeeId && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-blue-200 bg-blue-50/60 text-sm flex-wrap">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {expectedHours ? (
                  <>
                    <span className="text-xs text-blue-800">
                      {isEs ? "Horario base:" : "Base schedule:"} <b>{expectedHours.total_hours}h</b>
                    </span>
                    <span className="text-xs text-blue-800">
                      {isEs ? "Umbral:" : "Threshold:"} <b>{expectedHours.weekly_hours_threshold}h/{isEs ? "sem" : "wk"}</b>
                    </span>
                    <span className="text-xs text-emerald-800">
                      {isEs ? "Trabajadas:" : "Worked:"} <b>{totals.total_worked.toFixed(2)}h</b>
                    </span>
                    <span className="text-xs text-purple-800">
                      {isEs ? "OT auto:" : "OT auto:"} <b>{totals.total_ot.toFixed(2)}h</b>
                    </span>
                    <span className="text-xs text-slate-700">
                      {isEs ? "Tarifa horaria:" : "Hourly rate:"} <b>{formatRD(hourlyRate)}</b>
                    </span>
                    {expectedHours.days_off_count > 0 && (
                      <span className="text-xs text-amber-800">
                        {expectedHours.days_off_count} {isEs ? "día(s) libre" : "day(s) off"}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {loadingSchedule ? (isEs ? "Cargando horario…" : "Loading schedule…") : (isEs ? "Sin horario base cargado" : "No base schedule loaded")}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={applyBaseAsWorked}
                  disabled={!scheduleDetail}
                  data-testid="apply-base-as-worked-btn"
                  title={isEs ? "Copia las horas del horario base a cada día" : "Copy base schedule times to each day"}
                >
                  {isEs ? "Aplicar horario base" : "Apply base schedule"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={loadFromTimeClock}
                  disabled={!employeeId || loadingTimeClock}
                  data-testid="load-from-timeclock-btn"
                  title={isEs ? "Carga las horas trabajadas registradas en el Reloj" : "Load worked hours from Time Clock"}
                >
                  {loadingTimeClock ? "…" : (isEs ? "Cargar desde Reloj" : "Load from Time Clock")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => loadBaseSchedule(false)} disabled={loadingSchedule} data-testid="load-base-schedule-btn">
                  {loadingSchedule ? "…" : (isEs ? "Recargar" : "Reload")}
                </Button>
              </div>
            </div>
          )}

          {/* Timesheet grid */}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Día" : "Day"}</th>
                  <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Base" : "Base"}</th>
                  <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Entrada" : "Time in"}</th>
                  <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Salida" : "Time out"}</th>
                  <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600" title={isEs ? "Descanso en minutos" : "Break in minutes"}>{isEs ? "Descanso" : "Break"}</th>
                  <th className="text-center px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Feriado" : "Holiday"}</th>
                  <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "OT auto" : "OT auto"}</th>
                  <th className="text-right px-2 py-2 font-medium text-xs uppercase text-slate-600">{isEs ? "Monto" : "Amount"}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((iso) => {
                  const [dy, dm, dd] = iso.split("-").map(Number);
                  const dow = new Date(Date.UTC(dy, dm - 1, dd)).getUTCDay();
                  const isSun = dow === 0;
                  const row = workedEntries[iso] || {};
                  const baseHours = expectedHours ? (expectedHours.daily?.[iso] ?? 0) : 0;
                  const isDayOff = baseHours === 0 && expectedHours && !isSun;
                  const preview = previewOtForDay({
                    dow, baseHours,
                    timeIn: row.time_in, timeOut: row.time_out, breakMin: Number(row.break_min || 0),
                    isHoliday: row.is_holiday,
                  });
                  const rowAmount = hourlyRate * (
                    preview.hours_35 * RATE_35 +
                    preview.hours_night * RATE_NIGHT +
                    preview.hours_holiday * RATE_HOLIDAY
                  );
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
                      <td className="text-right px-2 py-1 text-xs font-mono">
                        {rowAmount > 0 ? (
                          <span className="text-emerald-700 font-semibold">{formatRD(rowAmount)}</span>
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
                        {totals.total_ot.toFixed(2)}h
                      </Badge>
                      <div className="flex gap-1 text-[10px] mt-1">
                        {totals.hours_35 > 0 && <span className="text-purple-700">35%:{totals.hours_35.toFixed(2)}</span>}
                        {totals.hours_night > 0 && <span className="text-indigo-700">N:{totals.hours_night.toFixed(2)}</span>}
                        {totals.hours_holiday > 0 && <span className="text-red-700">F:{totals.hours_holiday.toFixed(2)}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="text-right px-2 py-2">
                    <div className="flex flex-col items-end">
                      <Badge className="bg-emerald-600 text-white font-bold" data-testid="worked-period-amount">
                        {formatRD(totals.amount)}
                      </Badge>
                      {totals.amount_extra_only > 0 && (
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          {isEs ? "Recargo solo:" : "Surcharge only:"} {formatRD(totals.amount_extra_only)}
                        </span>
                      )}
                    </div>
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
            {saving ? (isEs ? "Guardando…" : "Saving…") : (isEs ? "Guardar timesheet" : "Save timesheet")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
