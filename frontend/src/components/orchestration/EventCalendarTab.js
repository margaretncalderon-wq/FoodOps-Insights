import { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  RefreshCw, Calendar, ChevronLeft, ChevronRight,
  AlertTriangle, MapPin, Users, Clock
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { KoraLoader } from "../KoraLoader";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// --- Helpers ----------------------------------------------------------------
const toLocalISO = (d) => {
  // YYYY-MM-DD respecting local timezone (avoids the UTC shift bug)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseHHmm = (t) => {
  if (!t || typeof t !== "string") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
};
const fmtTime = (t) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5) : "");

const STAGE_BG = {
  Lead: "#3b82f6", Contacted: "#06b6d4", Proposal: "#eab308",
  Negotiation: "#f97316", Won: "#22c55e", Lost: "#ef4444",
};
const stageColor = (s) => STAGE_BG[s] || "#6b7280";

// Surface each service as its own "calendar entry" so the UI can render granular blocks.
const explodeEventsIntoEntries = (events) => {
  const entries = [];
  for (const ev of events) {
    const cds = ev.calendar_dates || (ev.event_date ? [String(ev.event_date).slice(0, 10)] : []);
    const svcs = ev.services || [];
    // Group services by date for fast lookup
    const svcByDate = svcs.reduce((acc, s) => {
      const d = s.date || (cds[0] || null);
      if (!d) return acc;
      (acc[d] = acc[d] || []).push(s);
      return acc;
    }, {});
    if (cds.length === 0) continue;
    for (const d of cds) {
      const list = svcByDate[d] || [];
      if (list.length === 0) {
        entries.push({
          kind: "event",
          date: d,
          event_id: ev.event_id,
          event_name: ev.name,
          stage: ev.stage,
          event: ev,
        });
      } else {
        for (const s of list) {
          entries.push({
            kind: "service",
            date: d,
            time: s.time,
            end_time: s.end_time,
            title: s.title,
            item_count: s.item_count,
            total: s.total,
            event_id: ev.event_id,
            event_name: ev.name,
            stage: ev.stage,
            event: ev,
          });
        }
      }
    }
  }
  // Sort by date then time
  entries.sort((a, b) => {
    if (a.date !== b.date) return (a.date || "").localeCompare(b.date || "");
    const ta = parseHHmm(a.time) ?? 99;
    const tb = parseHHmm(b.time) ?? 99;
    if (ta !== tb) return ta - tb;
    return (a.title || a.event_name || "").localeCompare(b.title || b.event_name || "");
  });
  return entries;
};

export default function EventCalendarTab({ eventId, isGlobal = false }) {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [conflicts, setConflicts] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month"); // month, week
  const [selectedEvent, setSelectedEvent] = useState(null);

  const fetchCalendar = useCallback(async () => {
    try {
      let startDate, endDate;
      if (view === "month") {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        startDate = toLocalISO(new Date(year, month, 1));
        endDate = toLocalISO(new Date(year, month + 1, 0));
      } else {
        // week: 7 days starting on Sunday containing currentDate
        const ref = new Date(currentDate);
        ref.setHours(0, 0, 0, 0);
        ref.setDate(ref.getDate() - ref.getDay());
        startDate = toLocalISO(ref);
        const end = new Date(ref); end.setDate(end.getDate() + 6);
        endDate = toLocalISO(end);
      }
      const res = await axios.get(
        `${API}/api/orchestration/calendar?start_date=${startDate}&end_date=${endDate}`,
        { withCredentials: true }
      );
      setEvents(res.data.events || []);
      setConflicts(res.data.conflicts || {});
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [currentDate, view]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  // Reschedule a service slot (drag-to-reschedule on the Week timeline).
  // Optimistically applies the new time then refetches.
  const handleRescheduleService = useCallback(async ({ entry, new_time, new_end_time, new_date }) => {
    try {
      const body = {
        event_id: entry.event_id,
        section_title: entry.title || "",
        event_date: entry.date,
        old_time: entry.time || "",
        new_time: new_time || "",
        new_end_time: new_end_time || null,
      };
      if (new_date && new_date !== entry.date) body.new_date = new_date;
      const res = await axios.post(
        `${API}/api/orchestration/calendar/reschedule-service`,
        body,
        { withCredentials: true }
      );
      const modified = res.data?.modified ?? 0;
      toast.success(
        isEs
          ? `Servicio reagendado a ${new_time}${new_end_time ? `–${new_end_time}` : ""}${new_date && new_date !== entry.date ? ` (${new_date})` : ""} · ${modified} ítem(s)`
          : `Service rescheduled to ${new_time}${new_end_time ? `–${new_end_time}` : ""}${new_date && new_date !== entry.date ? ` (${new_date})` : ""} · ${modified} item(s)`
      );
      fetchCalendar();
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "No se pudo reagendar el servicio" : "Could not reschedule the service");
    }
  }, [fetchCalendar, isEs]);

  // Pre-explode events into per-date entries (service-level granularity)
  const entriesByDate = useMemo(() => {
    const map = {};
    for (const e of explodeEventsIntoEntries(events)) {
      (map[e.date] = map[e.date] || []).push(e);
    }
    return map;
  }, [events]);

  // ----- Month builder -----
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();
    const days = [];
    const prevMonth = new Date(year, month, 0);
    const prevDays = prevMonth.getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevDays - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  };

  const isConflictDate = (date) => {
    const key = toLocalISO(date);
    return conflicts[key] && conflicts[key].length > 1;
  };

  const isToday = (date) => date.toDateString() === new Date().toDateString();

  const navigate = (direction) => {
    const nd = new Date(currentDate);
    if (view === "month") nd.setMonth(nd.getMonth() + direction);
    else nd.setDate(nd.getDate() + 7 * direction);
    setCurrentDate(nd);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  const monthNames = isEs ? MONTHS_ES : MONTHS;
  const weekdayNames = isEs ? WEEKDAYS_ES : WEEKDAYS;

  // Build a label for the navigation header
  const headerLabel = (() => {
    if (view === "month") return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    const ref = new Date(currentDate);
    ref.setDate(ref.getDate() - ref.getDay());
    const end = new Date(ref); end.setDate(end.getDate() + 6);
    const sameMonth = ref.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${monthNames[ref.getMonth()]} ${ref.getDate()}–${end.getDate()}, ${ref.getFullYear()}`;
    }
    return `${monthNames[ref.getMonth()].slice(0, 3)} ${ref.getDate()} – ${monthNames[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
  })();

  return (
    <div className="space-y-4" data-testid="event-calendar-tab">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {isGlobal
              ? (isEs ? `Calendario Global de ${term("events", "entity_plural")}` : `Global ${term("events", "entity_singular")} Calendar`)
              : (isEs ? `Calendario del ${term("events", "entity_singular")}` : `${term("events", "entity_singular")} Calendar`)}
          </h2>
          {/* View toggle */}
          <div className="inline-flex rounded-md border bg-background overflow-hidden" data-testid="calendar-view-toggle">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1 text-xs ${view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              data-testid="calendar-view-month"
            >
              {isEs ? "Mes" : "Month"}
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1 text-xs border-l ${view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              data-testid="calendar-view-week"
            >
              {isEs ? "Semana" : "Week"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} data-testid="calendar-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center min-w-[180px]"><span className="font-medium">{headerLabel}</span></div>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} data-testid="calendar-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())} data-testid="calendar-today">
            {isEs ? "Hoy" : "Today"}
          </Button>
        </div>
      </div>

      {/* Conflicts Warning */}
      {Object.keys(conflicts).length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">
                {isEs
                  ? `${Object.keys(conflicts).length} fecha(s) con múltiples ${term("events", "entity_plural").toLowerCase()}`
                  : `${Object.keys(conflicts).length} date(s) with multiple ${term("events", "entity_plural").toLowerCase()}`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "month" ? (
        <MonthView
          days={getDaysInMonth()}
          weekdayNames={weekdayNames}
          entriesByDate={entriesByDate}
          isConflictDate={isConflictDate}
          isToday={isToday}
          isEs={isEs}
          onSelect={(ev) => setSelectedEvent(ev)}
        />
      ) : (
        <WeekTimelineView
          currentDate={currentDate}
          weekdayNames={weekdayNames}
          entriesByDate={entriesByDate}
          conflicts={conflicts}
          isEs={isEs}
          onSelect={(ev) => setSelectedEvent(ev)}
          onReschedule={handleRescheduleService}
        />
      )}

      {/* Event Details Sidebar */}
      {selectedEvent && (
        <Card data-testid="calendar-event-details">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <CardTitle className="text-base">{selectedEvent.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>×</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>
                  {(selectedEvent.calendar_dates && selectedEvent.calendar_dates.length > 0)
                    ? selectedEvent.calendar_dates.join(", ")
                    : (selectedEvent.event_date ? String(selectedEvent.event_date).slice(0, 10) : "TBD")}
                </span>
              </div>
              {selectedEvent.venue_name && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span>{selectedEvent.venue_name}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{selectedEvent.guest_count || "?"} {isEs ? "invitados" : "guests"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{selectedEvent.stage || "Lead"}</Badge>
                <Badge variant="outline" className="capitalize">{selectedEvent.event_type || "event"}</Badge>
              </div>
              {selectedEvent.client_name && (
                <p className="text-muted-foreground">
                  {isEs ? "Cliente" : "Client"}: {selectedEvent.client_name}
                </p>
              )}
              {selectedEvent.services && selectedEvent.services.length > 0 && (
                <div className="border rounded-md p-2 space-y-1" data-testid="calendar-event-services">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {isEs ? "Servicios" : "Services"}
                  </p>
                  {selectedEvent.services.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="font-mono">{fmtTime(s.time) || "—"}</span>
                        <span>·</span>
                        <span className="font-medium">{s.title || (isEs ? "Sin sección" : "No section")}</span>
                      </span>
                      <span className="text-muted-foreground">{s.date}</span>
                    </div>
                  ))}
                </div>
              )}
              {!isGlobal && (
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => window.location.href = `/event-orchestration/${selectedEvent.event_id}`}
                >
                  {isEs ? "Ver Orquestación" : "View Orchestration"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-muted-foreground">{isEs ? "Estados" : "Stages"}:</span>
        {["Lead", "Contacted", "Proposal", "Negotiation", "Won", "Lost"].map((stage) => (
          <div key={stage} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: stageColor(stage) }} />
            <span>{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// Month grid — services as time + title chips inside each day cell
// =========================================================================
function MonthView({ days, weekdayNames, entriesByDate, isConflictDate, isToday, isEs, onSelect }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekdayNames.map((day) => (
            <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            const key = toLocalISO(day.date);
            const dayEntries = entriesByDate[key] || [];
            const hasConflict = isConflictDate(day.date);
            const today = isToday(day.date);
            return (
              <div
                key={idx}
                className={`min-h-[110px] p-1 border rounded-lg transition-colors ${
                  !day.isCurrentMonth ? "bg-muted/30" : "bg-background"
                } ${today ? "ring-2 ring-primary" : ""} ${hasConflict ? "border-yellow-400" : ""}`}
                data-testid={`calendar-day-${key}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${!day.isCurrentMonth ? "text-muted-foreground" : ""} ${today ? "text-primary" : ""}`}>
                    {day.date.getDate()}
                  </span>
                  {hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                </div>
                <div className="space-y-0.5">
                  {dayEntries.slice(0, 4).map((entry, i) => {
                    const bg = stageColor(entry.stage);
                    if (entry.kind === "service") {
                      return (
                        <button
                          key={i}
                          onClick={() => onSelect(entry.event)}
                          className="w-full text-left px-1 py-0.5 rounded text-[10px] leading-tight bg-white border hover:bg-muted truncate flex items-center gap-1"
                          title={`${entry.event_name} · ${entry.title || ""} ${entry.time || ""}`}
                          data-testid={`calendar-service-${entry.event_id}-${i}`}
                        >
                          <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: bg }} />
                          {entry.time && <span className="font-mono">{fmtTime(entry.time)}</span>}
                          <span className="font-medium truncate">{entry.title || entry.event_name}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => onSelect(entry.event)}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] text-white truncate"
                        style={{ backgroundColor: bg }}
                        title={entry.event_name}
                        data-testid={`calendar-event-${entry.event_id}`}
                      >
                        {entry.event_name}
                      </button>
                    );
                  })}
                  {dayEntries.length > 4 && (
                    <p className="text-[9px] text-muted-foreground px-1">
                      +{dayEntries.length - 4} {isEs ? "más" : "more"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// =========================================================================
// Week view — timeline with hour rows + positioned service blocks
// Supports drag-to-reschedule: drag a block vertically to change its start
// time (snapped to 15-min) or horizontally to move it to a different day.
// =========================================================================
function WeekTimelineView({ currentDate, weekdayNames, entriesByDate, conflicts, isEs, onSelect, onReschedule }) {
  // Start at Sunday of the week containing currentDate
  const weekStart = new Date(currentDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });

  // Hours 7..22 (15 rows). Each row = 56px.
  const startHour = 7;
  const endHour = 22;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const ROW_PX = 56;
  const SNAP_MIN = 15;
  // 15-min snap → ROW_PX/4 px per quarter
  const PX_PER_MIN = ROW_PX / 60;

  const fmtHHmm = (decimal) => {
    const total = Math.round(decimal * 60 / SNAP_MIN) * SNAP_MIN;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const handleDragStart = (e, entry) => {
    e.dataTransfer.effectAllowed = "move";
    // Calculate offset within the block so we can compensate on drop.
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ entry, offsetY })
    );
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, targetDate) => {
    e.preventDefault();
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData("application/json")); }
    catch { return; }
    if (!payload?.entry || !onReschedule) return;
    const { entry, offsetY } = payload;
    const colRect = e.currentTarget.getBoundingClientRect();
    const yWithin = e.clientY - colRect.top - (offsetY || 0);
    const minutesFromTop = Math.max(0, yWithin / PX_PER_MIN);
    const snapped = Math.round(minutesFromTop / SNAP_MIN) * SNAP_MIN;
    const newStartDecimal = startHour + (snapped / 60);
    if (newStartDecimal >= endHour + 1) return;

    const new_time = fmtHHmm(newStartDecimal);
    // Preserve duration if we knew the original end time
    const origStart = parseHHmm(entry.time);
    const origEnd = parseHHmm(entry.end_time);
    let new_end_time = null;
    if (origStart !== null && origEnd !== null && origEnd > origStart) {
      const duration = origEnd - origStart;
      const endDecimal = Math.min(24, newStartDecimal + duration);
      new_end_time = fmtHHmm(endDecimal);
    }
    if (new_time === entry.time && targetDate === entry.date) return; // no-op
    onReschedule({ entry, new_time, new_end_time, new_date: targetDate });
  };

  // For each day, get sorted entries that have a time (timed) and untimed
  const todayISO = toLocalISO(new Date());

  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        {/* Header row */}
        <div className="grid border-b" style={{ gridTemplateColumns: `60px repeat(7, minmax(0, 1fr))` }}>
          <div className="bg-muted/30" />
          {weekDays.map((d, idx) => {
            const isToday = toLocalISO(d) === todayISO;
            return (
              <div key={idx} className={`py-2 px-2 text-center border-l text-xs ${isToday ? "bg-primary/5 text-primary font-semibold" : ""}`}>
                <div className="uppercase tracking-wide text-muted-foreground">{weekdayNames[idx]}</div>
                <div className="text-base font-semibold">{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* All-day / untimed row */}
        <div className="grid border-b bg-muted/10" style={{ gridTemplateColumns: `60px repeat(7, minmax(0, 1fr))` }}>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground p-2 text-right">
            {isEs ? "Todo el día" : "All day"}
          </div>
          {weekDays.map((d, idx) => {
            const key = toLocalISO(d);
            const untimed = (entriesByDate[key] || []).filter((e) => !parseHHmm(e.time));
            return (
              <div key={idx} className="border-l p-1 min-h-[36px] space-y-0.5">
                {untimed.slice(0, 3).map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => onSelect(entry.event)}
                    className="w-full text-left px-1.5 py-0.5 rounded text-[10px] text-white truncate"
                    style={{ backgroundColor: stageColor(entry.stage) }}
                    title={`${entry.event_name}${entry.title ? " · " + entry.title : ""}`}
                  >
                    {entry.kind === "service" && entry.title ? `${entry.title} · ${entry.event_name}` : entry.event_name}
                  </button>
                ))}
                {untimed.length > 3 && (
                  <p className="text-[9px] text-muted-foreground px-1">+{untimed.length - 3}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Timeline body */}
        <div className="grid relative" style={{ gridTemplateColumns: `60px repeat(7, minmax(0, 1fr))` }}>
          {/* Hour gutter */}
          <div>
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-muted-foreground text-right pr-2 border-b" style={{ height: ROW_PX }}>
                {`${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {weekDays.map((d, idx) => {
            const key = toLocalISO(d);
            const timed = (entriesByDate[key] || []).filter((e) => parseHHmm(e.time) !== null);
            return (
              <div
                key={idx}
                className="border-l relative"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, key)}
                data-testid={`calendar-week-day-${key}`}
              >
                {/* Background hour lines */}
                {hours.map((h) => (
                  <div key={h} className="border-b" style={{ height: ROW_PX }} />
                ))}
                {/* Positioned service blocks */}
                {timed.map((entry, i) => {
                  const start = parseHHmm(entry.time);
                  const end = parseHHmm(entry.end_time);
                  const duration = end && end > start ? (end - start) : 1; // default 1h
                  const outOfRange = start < startHour || start > endHour;
                  if (outOfRange) {
                    // Clamp into a tiny chip at top or bottom so the service isn't lost.
                    const atTop = start < startHour;
                    return (
                      <button
                        key={i}
                        onClick={() => onSelect(entry.event)}
                        className="absolute left-1 right-1 rounded text-left px-1 py-0.5 text-[9px] text-white shadow-sm hover:brightness-110 truncate"
                        style={{ [atTop ? "top" : "bottom"]: 2, backgroundColor: stageColor(entry.stage) }}
                        title={`${entry.event_name} · ${entry.title || ""} ${fmtTime(entry.time)}`}
                        data-testid={`calendar-week-block-${entry.event_id}-${i}`}
                      >
                        {atTop ? "↑ " : "↓ "}{fmtTime(entry.time)} · {entry.title || entry.event_name}
                      </button>
                    );
                  }
                  const top = (start - startHour) * ROW_PX;
                  const height = Math.max(20, duration * ROW_PX - 2);
                  const bg = stageColor(entry.stage);
                  return (
                    <div
                      key={i}
                      draggable
                      onDragStart={(e) => handleDragStart(e, entry)}
                      onClick={() => onSelect(entry.event)}
                      className="absolute left-1 right-1 rounded text-left p-1 text-[10px] leading-tight text-white shadow-sm hover:brightness-110 cursor-grab active:cursor-grabbing select-none"
                      style={{ top, height, backgroundColor: bg }}
                      title={`${entry.event_name} · ${entry.title || ""} ${fmtTime(entry.time)}${entry.end_time ? "-" + fmtTime(entry.end_time) : ""}\n${isEs ? "Arrastra para reagendar" : "Drag to reschedule"}`}
                      data-testid={`calendar-week-block-${entry.event_id}-${i}`}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="font-mono text-[9px] opacity-90">
                        {fmtTime(entry.time)}{entry.end_time ? `–${fmtTime(entry.end_time)}` : ""}
                      </div>
                      <div className="font-semibold truncate">{entry.title || entry.event_name}</div>
                      {entry.title && <div className="opacity-90 truncate">{entry.event_name}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
