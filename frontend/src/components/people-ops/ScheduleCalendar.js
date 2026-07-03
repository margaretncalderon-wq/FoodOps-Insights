import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { ChevronLeft, ChevronRight, RefreshCw, Users, User as UserIcon } from "lucide-react";
import { API_BASE as API } from "../../utils/api";

/**
 * ScheduleCalendar — Homebase/Connecteam-style month view.
 *
 * Props:
 *   employeeId (optional) — if provided, calendar shows only this employee's events
 *   showEmployeeFilter (default true) — allow switching between team/single view
 *
 * Legend:
 *   - green pill: scheduled hours (from base pattern)
 *   - gray dot: specific day off
 *   - blue pill: approved time-off
 *   - orange pill: approved overtime period (sum of hours)
 */
export default function ScheduleCalendar({ employeeId: initialEmployeeId = null, isEs = true }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() }; // 0-indexed
  });
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [data, setData] = useState({ events: [], employees: [] });
  const [loading, setLoading] = useState(true);

  const { startISO, endISO, gridDays } = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const last = new Date(Date.UTC(cursor.year, cursor.month + 1, 0));
    // Pad to Monday-start grid
    const firstDay = first.getUTCDay(); // 0=Sun..6=Sat
    const leadingBlanks = (firstDay === 0 ? 6 : firstDay - 1);
    const gridStart = new Date(first);
    gridStart.setUTCDate(first.getUTCDate() - leadingBlanks);
    const totalCells = Math.ceil((leadingBlanks + last.getUTCDate()) / 7) * 7;
    const grid = [];
    const cur = new Date(gridStart);
    for (let i = 0; i < totalCells; i++) {
      grid.push({
        iso: cur.toISOString().slice(0, 10),
        day: cur.getUTCDate(),
        inMonth: cur.getUTCMonth() === cursor.month,
        dow: cur.getUTCDay(),
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return {
      startISO: first.toISOString().slice(0, 10),
      endISO: last.toISOString().slice(0, 10),
      gridDays: grid,
    };
  }, [cursor]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/schedules/team-calendar?start_date=${startISO}&end_date=${endISO}`,
        { withCredentials: true },
      );
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [startISO, endISO]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredEvents = useMemo(() => {
    if (!employeeId) return data.events;
    return data.events.filter((e) => e.employee_id === employeeId);
  }, [data.events, employeeId]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = {};
    filteredEvents.forEach((e) => {
      const dates = [];
      if (e.type === "schedule" || e.type === "day_off") {
        dates.push(e.date);
      } else {
        // time_off or overtime — span
        const [y1, m1, d1] = e.start_date.split("-").map(Number);
        const [y2, m2, d2] = e.end_date.split("-").map(Number);
        const cur = new Date(Date.UTC(y1, m1 - 1, d1));
        const end = new Date(Date.UTC(y2, m2 - 1, d2));
        while (cur <= end) {
          dates.push(cur.toISOString().slice(0, 10));
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }
      dates.forEach((iso) => {
        if (!map[iso]) map[iso] = { schedule: 0, days_off: [], time_off: [], overtime: [] };
        if (e.type === "schedule") map[iso].schedule += Number(e.hours || 0);
        else if (e.type === "day_off") map[iso].days_off.push(e);
        else if (e.type === "time_off") map[iso].time_off.push(e);
        else if (e.type === "overtime") map[iso].overtime.push(e);
      });
    });
    return map;
  }, [filteredEvents]);

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString(
    isEs ? "es-DO" : "en-US",
    { month: "long", year: "numeric" },
  );

  const prevMonth = () => setCursor((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  const nextMonth = () => setCursor((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 });
  const today = () => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); };

  return (
    <Card data-testid="schedule-calendar">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {employeeId ? <UserIcon className="w-5 h-5 text-blue-600" /> : <Users className="w-5 h-5 text-blue-600" />}
            <CardTitle className="text-base capitalize">{monthLabel}</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!initialEmployeeId && (
              <Select value={employeeId || "__all__"} onValueChange={(v) => setEmployeeId(v === "__all__" ? null : v)}>
                <SelectTrigger className="h-8 w-56 text-xs" data-testid="calendar-employee-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{isEs ? "Todo el equipo" : "Whole team"}</SelectItem>
                  {(data.employees || []).map((e) => (
                    <SelectItem key={e.employee_id} value={e.employee_id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={prevMonth} data-testid="calendar-prev"><ChevronLeft className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={today} data-testid="calendar-today">{isEs ? "Hoy" : "Today"}</Button>
            <Button size="sm" variant="outline" onClick={nextMonth} data-testid="calendar-next"><ChevronRight className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] mt-2">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>{isEs ? "Horario base" : "Base schedule"}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400"></span>{isEs ? "Día libre" : "Day off"}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span>{isEs ? "Time-off aprobado" : "Approved time-off"}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span>{isEs ? "Horas extras" : "Overtime"}</span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{isEs ? "Cargando…" : "Loading…"}</div>
        ) : (
          <div>
            <div className="grid grid-cols-7 text-[10px] uppercase font-semibold text-slate-500 border-b">
              {(isEs ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((d) => (
                <div key={d} className="px-2 py-1.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridDays.map((cell) => {
                const ev = eventsByDate[cell.iso];
                const isWeekend = cell.dow === 0 || cell.dow === 6;
                return (
                  <div
                    key={cell.iso}
                    className={`border-b border-r min-h-[70px] p-1 ${cell.inMonth ? "" : "bg-slate-50/60 text-slate-400"} ${isWeekend && cell.inMonth ? "bg-amber-50/30" : ""}`}
                    data-testid={`cal-cell-${cell.iso}`}
                  >
                    <div className="text-[10px] font-semibold mb-0.5">{cell.day}</div>
                    {ev && (
                      <div className="space-y-0.5">
                        {ev.schedule > 0 && (
                          <div className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 truncate" title={`${ev.schedule}h ${isEs ? "programadas" : "scheduled"}`}>
                            {ev.schedule}h
                          </div>
                        )}
                        {ev.days_off.map((d, i) => (
                          <div key={"do-" + i} className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-700 truncate" title={d.reason || d.category}>
                            {isEs ? "Libre" : "Off"}{ev.days_off.length > 1 || !employeeId ? ` · ${d.employee_name?.split(" ")[0] || ""}` : ""}
                          </div>
                        ))}
                        {ev.time_off.map((t, i) => (
                          <div key={"to-" + i} className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 truncate" title={`${t.employee_name} · ${t.leave_type}`}>
                            {t.leave_type}{!employeeId ? ` · ${t.employee_name?.split(" ")[0]}` : ""}
                          </div>
                        ))}
                        {ev.overtime.map((o, i) => (
                          <div key={"ot-" + i} className="text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 truncate" title={`${o.employee_name} · ${o.totals?.total_hours || 0}h OT`}>
                            OT{o.totals?.total_hours ? ` ${o.totals.total_hours}h` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!loading && data.employees && (
          <p className="text-[10px] text-muted-foreground mt-2 text-right">
            {isEs ? "Empleados activos:" : "Active employees:"} <Badge variant="outline" className="text-[10px]">{data.employees.length}</Badge>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
