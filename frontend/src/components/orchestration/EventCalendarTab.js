import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  RefreshCw, Calendar, ChevronLeft, ChevronRight, 
  AlertTriangle, MapPin, Users
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

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

export default function EventCalendarTab({ eventId, isGlobal = false }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [conflicts, setConflicts] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month"); // month, week
  const [selectedEvent, setSelectedEvent] = useState(null);

  const fetchCalendar = useCallback(async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const startDate = new Date(year, month, 1).toISOString().split("T")[0];
      const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];
      
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
  }, [currentDate]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();
    
    const days = [];
    
    // Previous month days
    const prevMonth = new Date(year, month, 0);
    const prevDays = prevMonth.getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevDays - i),
        isCurrentMonth: false
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  const getEventsForDate = (date) => {
    const dateStr = date.toISOString().split("T")[0];
    return events.filter(e => {
      if (!e.event_date) return false;
      const eventDate = new Date(e.event_date).toISOString().split("T")[0];
      return eventDate === dateStr;
    });
  };

  const isConflictDate = (date) => {
    const dateStr = date.toISOString().split("T")[0];
    return conflicts[dateStr] && conflicts[dateStr].length > 1;
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const getStageColor = (stage) => {
    const colors = {
      Lead: "bg-blue-500",
      Contacted: "bg-cyan-500",
      Proposal: "bg-yellow-500",
      Negotiation: "bg-orange-500",
      Won: "bg-green-500",
      Lost: "bg-red-500"
    };
    return colors[stage] || "bg-gray-500";
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  const days = getDaysInMonth();
  const monthNames = isEs ? MONTHS_ES : MONTHS;
  const weekdayNames = isEs ? WEEKDAYS_ES : WEEKDAYS;

  return (
    <div className="space-y-4" data-testid="event-calendar-tab">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {isGlobal 
              ? (isEs ? "Calendario Global de Eventos" : "Global Event Calendar")
              : (isEs ? "Calendario del Evento" : "Event Calendar")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center min-w-[150px]">
            <span className="font-medium">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
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
                  ? `${Object.keys(conflicts).length} fecha(s) con múltiples eventos`
                  : `${Object.keys(conflicts).length} date(s) with multiple events`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-4">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekdayNames.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const dayEvents = getEventsForDate(day.date);
              const hasConflict = isConflictDate(day.date);
              const today = isToday(day.date);
              
              return (
                <div
                  key={index}
                  className={`min-h-[100px] p-1 border rounded-lg transition-colors ${
                    !day.isCurrentMonth ? "bg-muted/30" : "bg-background"
                  } ${today ? "ring-2 ring-primary" : ""} ${
                    hasConflict ? "border-yellow-400" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${
                      !day.isCurrentMonth ? "text-muted-foreground" : ""
                    } ${today ? "text-primary" : ""}`}>
                      {day.date.getDate()}
                    </span>
                    {hasConflict && (
                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((event) => (
                      <button
                        key={event.event_id}
                        onClick={() => setSelectedEvent(event)}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-xs text-white truncate ${getStageColor(event.stage)}`}
                        title={event.name}
                      >
                        {event.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Event Details Sidebar */}
      {selectedEvent && (
        <Card>
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
                  {selectedEvent.event_date 
                    ? new Date(selectedEvent.event_date).toLocaleDateString()
                    : "TBD"}
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
            <div className={`w-3 h-3 rounded ${getStageColor(stage)}`} />
            <span>{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
