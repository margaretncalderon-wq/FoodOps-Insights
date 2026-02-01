import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Calendar } from "../components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, List } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isWithinInterval } from "date-fns";
import { es, enUS } from "date-fns/locale";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CalendarPage({ embedded = false }) {
  const { t, language } = useLanguage();
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewMode, setViewMode] = useState("month"); // month, week
  const [loading, setLoading] = useState(true);

  const locale = language === "es" ? es : enUS;

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await axios.get(`${API}/events`, { withCredentials: true });
      setEvents(response.data);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEventsForDate = (date) => {
    return events.filter((event) => {
      // Skip events without a valid date
      if (!event.event_date && !event.start_date) return false;
      
      try {
        const eventStart = parseISO(event.event_date || event.start_date);
        const eventEnd = event.end_date ? parseISO(event.end_date) : eventStart;
        return isWithinInterval(date, { start: eventStart, end: eventEnd }) || isSameDay(date, eventStart);
      } catch (e) {
        return false;
      }
    });
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  };

  const getWeekDays = () => {
    const days = [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const navigateMonth = (direction) => {
    setCurrentDate(direction === "next" ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const navigateYear = (year) => {
    const newDate = new Date(currentDate);
    newDate.setFullYear(parseInt(year));
    setCurrentDate(newDate);
  };

  const statusColors = {
    planning: "bg-info text-info-foreground",
    confirmed: "bg-success text-success-foreground",
    inProgress: "bg-warning text-warning-foreground",
    completed: "bg-primary text-primary-foreground",
    cancelled: "bg-destructive text-destructive-foreground",
  };

  const eventTypeColors = {
    wedding: "border-l-pink-500",
    corporate: "border-l-blue-500",
    birthday: "border-l-purple-500",
    social: "border-l-green-500",
    other: "border-l-gray-500",
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);

  const renderCalendarGrid = () => {
    const days = getDaysInMonth();
    const firstDayOfMonth = startOfMonth(currentDate).getDay();
    const blanks = Array(firstDayOfMonth).fill(null);

    return (
      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
            {language === "es" ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day)] : day}
          </div>
        ))}
        
        {/* Blank cells */}
        {blanks.map((_, index) => (
          <div key={`blank-${index}`} className="min-h-[120px] p-1 bg-muted/30" />
        ))}
        
        {/* Day cells */}
        {days.map((day) => {
          const dayEvents = getEventsForDate(day);
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDate && isSameDay(day, selectedDate);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[120px] p-1 border rounded-lg cursor-pointer transition-colors ${
                isToday ? "bg-primary/5 border-primary" : "border-border hover:bg-muted/50"
              } ${isSelected ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedDate(day)}
            >
              <div className={`text-sm font-medium mb-1 ${isToday ? "text-primary" : ""}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => (
                  <Link
                    key={event.event_id}
                    to={`/events/${event.event_id}`}
                    className={`block text-xs p-1 rounded truncate border-l-2 ${eventTypeColors[event.event_type] || "border-l-gray-500"} bg-white hover:bg-muted`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {event.name}
                  </Link>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-muted-foreground pl-1">
                    +{dayEvents.length - 3} {language === "es" ? "más" : "more"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const content = (
    <div className="space-y-6" data-testid="calendar-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">
            {embedded 
              ? (language === "es" ? "Calendario de Engagement" : "Engagement Calendar")
              : (language === "es" ? "Calendario de Eventos" : "Events Calendar")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {embedded
              ? (language === "es" ? "Compromisos y fechas clave con clientes" : "Client commitments and key dates")
              : (language === "es" ? "Vista mensual de todos tus eventos" : "Monthly view of all your events")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to={embedded ? "/client-engagement/proposals" : "/events"}>
            <Button variant="outline" className="gap-2">
              <List className="w-4 h-4" />
              {language === "es" ? "Ver Lista" : "List View"}
            </Button>
          </Link>
          <Link to={embedded ? "/client-engagement/proposals?new=true" : "/events?new=true"}>
            <Button className="rounded-full gap-2" data-testid="new-event-btn">
              <Plus className="w-4 h-4" />
              {t("addEvent")}
            </Button>
          </Link>
        </div>
      </div>

        {/* Calendar Navigation */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => navigateMonth("prev")}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-xl font-semibold">
                    {format(currentDate, "MMMM", { locale })}
                  </h2>
                  <Select value={currentDate.getFullYear().toString()} onValueChange={navigateYear}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="icon" onClick={() => navigateMonth("next")}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                {language === "es" ? "Hoy" : "Today"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {renderCalendarGrid()}
          </CardContent>
        </Card>

        {/* Selected Day Events */}
        {selectedDate && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {format(selectedDate, "EEEE, MMMM d, yyyy", { locale })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {getEventsForDate(selectedDate).length > 0 ? (
                <div className="space-y-3">
                  {getEventsForDate(selectedDate).map((event) => (
                    <Link
                      key={event.event_id}
                      to={`/events/${event.event_id}`}
                      className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted transition-colors"
                    >
                      <div className={`w-1 h-12 rounded-full ${eventTypeColors[event.event_type]?.replace("border-l-", "bg-") || "bg-gray-500"}`} />
                      <div className="flex-1">
                        <h3 className="font-medium">{event.name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="capitalize">{event.event_type}</span>
                          {event.venue && <span>{event.venue}</span>}
                          <span>{event.guest_count} {language === "es" ? "invitados" : "guests"}</span>
                        </div>
                      </div>
                      <Badge className={statusColors[event.status]}>{t(event.status)}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{language === "es" ? "No hay eventos para este día" : "No events for this day"}</p>
                  <Link to="/events?new=true" className="mt-4 inline-block">
                    <Button variant="outline" size="sm">{t("addEvent")}</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <span className="font-medium">{language === "es" ? "Tipos de Evento:" : "Event Types:"}</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-pink-500" />
                <span>Wedding</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-blue-500" />
                <span>Corporate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-purple-500" />
                <span>Birthday</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span>Social</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Layout>
      {content}
    </Layout>
  );
}
