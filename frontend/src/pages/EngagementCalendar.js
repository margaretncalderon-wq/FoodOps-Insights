import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  RefreshCw, Filter, Users, MapPin, Clock, DollarSign
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Status colors for events
const STATUS_COLORS = {
  // Stages
  "Lead": { bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-700", dot: "bg-gray-500" },
  "Contacted": { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-700", dot: "bg-blue-500" },
  "Proposal": { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-700", dot: "bg-yellow-500" },
  "Negotiation": { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-700", dot: "bg-orange-500" },
  "Won": { bg: "bg-green-100", border: "border-green-300", text: "text-green-700", dot: "bg-green-500" },
  "Approved": { bg: "bg-green-100", border: "border-green-300", text: "text-green-700", dot: "bg-green-500" },
  "Closed": { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-700", dot: "bg-purple-500" },
  "Lost": { bg: "bg-red-100", border: "border-red-300", text: "text-red-700", dot: "bg-red-500" },
  // Default
  "default": { bg: "bg-gray-100", border: "border-gray-200", text: "text-gray-700", dot: "bg-gray-400" }
};

const EVENT_TYPE_COLORS = {
  wedding: "bg-pink-500",
  corporate: "bg-blue-500",
  birthday: "bg-purple-500",
  social: "bg-green-500",
  other: "bg-gray-500"
};

export default function EngagementCalendar({ embedded = false }) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isEs = language === "es";
  
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month"); // month, week, day
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/events`, { withCredentials: true });
      setEvents(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Filter events
  const filteredEvents = events.filter(event => {
    const matchesStatus = statusFilter === "all" || event.stage === statusFilter;
    const matchesType = typeFilter === "all" || event.event_type === typeFilter;
    return matchesStatus && matchesType;
  });

  // Get events for a specific date (including multi-day events)
  const getEventsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return filteredEvents.filter(event => {
      if (!event.event_date) return false;
      const eventStartDate = event.event_date.split('T')[0];
      const eventEndDate = event.end_date ? event.end_date.split('T')[0] : eventStartDate;
      
      // Check if the date falls within the event range
      return dateStr >= eventStartDate && dateStr <= eventEndDate;
    }).sort((a, b) => {
      // Sort by start_time if available
      if (a.start_time && b.start_time) {
        return a.start_time.localeCompare(b.start_time);
      }
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      return 0;
    });
  };

  // Check if event is multi-day
  const isMultiDayEvent = (event) => {
    if (!event.event_date || !event.end_date) return false;
    const startDate = event.event_date.split('T')[0];
    const endDate = event.end_date.split('T')[0];
    return startDate !== endDate;
  };

  // Get event position in multi-day span (start, middle, end)
  const getMultiDayPosition = (event, date) => {
    if (!isMultiDayEvent(event)) return null;
    const dateStr = date.toISOString().split('T')[0];
    const startDate = event.event_date.split('T')[0];
    const endDate = event.end_date.split('T')[0];
    
    if (dateStr === startDate) return "start";
    if (dateStr === endDate) return "end";
    return "middle";
  };

  // Format time based on user preference (will use 24h as default)
  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    return timeStr;
  };

  // Navigation
  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
  };

  const navigateDay = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get status color
  const getStatusColor = (stage) => {
    return STATUS_COLORS[stage] || STATUS_COLORS.default;
  };

  // Open event detail
  const openEventDetail = (event) => {
    setSelectedEvent(event);
    setDetailOpen(true);
  };

  // Navigate to event page
  const goToEvent = (eventId) => {
    setDetailOpen(false);
    navigate(`/events/${eventId}`);
  };

  // Generate calendar days for month view
  const generateMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const days = [];

    // Previous month padding
    for (let i = 0; i < startPadding; i++) {
      const prevDate = new Date(year, month, -startPadding + i + 1);
      days.push({ date: prevDate, isCurrentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return days;
  };

  // Generate week days
  const generateWeekDays = () => {
    const days = [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);
  };

  // Day names
  const dayNames = isEs 
    ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Month names
  const monthNames = isEs
    ? ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Unique stages for filter
  const uniqueStages = [...new Set(events.map(e => e.stage).filter(Boolean))];
  const uniqueTypes = [...new Set(events.map(e => e.event_type).filter(Boolean))];

  // Today check
  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="engagement-calendar">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {isEs ? "Calendario de Engagement" : "Engagement Calendar"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Vista de todos los compromisos con clientes" : "View of all client commitments"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            {isEs ? "Hoy" : "Today"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(embedded ? "/client-engagement/proposals?new=true" : "/events?new=true")}>
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Nuevo Evento" : "New Event"}
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => {
            if (viewMode === "month") navigateMonth(-1);
            else if (viewMode === "week") navigateWeek(-1);
            else navigateDay(-1);
          }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          {/* Month Dropdown */}
          <Select 
            value={currentDate.getMonth().toString()} 
            onValueChange={(value) => {
              const newDate = new Date(currentDate);
              newDate.setMonth(parseInt(value));
              setCurrentDate(newDate);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((month, index) => (
                <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Year Dropdown */}
          <Select 
            value={currentDate.getFullYear().toString()} 
            onValueChange={(value) => {
              const newDate = new Date(currentDate);
              newDate.setFullYear(parseInt(value));
              setCurrentDate(newDate);
            }}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={() => {
            if (viewMode === "month") navigateMonth(1);
            else if (viewMode === "week") navigateWeek(1);
            else navigateDay(1);
          }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* View Mode & Filters */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border rounded-lg p-1 bg-muted/30">
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("month")}
            >
              {isEs ? "Mes" : "Month"}
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("week")}
            >
              {isEs ? "Semana" : "Week"}
            </Button>
            <Button
              variant={viewMode === "day" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("day")}
            >
              {isEs ? "Día" : "Day"}
            </Button>
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={isEs ? "Estado" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              {uniqueStages.map(stage => (
                <SelectItem key={stage} value={stage}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(stage).dot}`} />
                    {stage}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={isEs ? "Tipo" : "Type"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              {uniqueTypes.map(type => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${EVENT_TYPE_COLORS[type] || EVENT_TYPE_COLORS.other}`} />
                    {type}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-medium">{isEs ? "Estado:" : "Status:"}</span>
        {Object.entries(STATUS_COLORS).filter(([key]) => key !== "default").map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${colors.dot}`} />
            <span>{status}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-4">
          {/* Month View */}
          {viewMode === "month" && (
            <div>
              {/* Day Headers */}
              <div className="grid grid-cols-7 mb-2">
                {dayNames.map(day => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1">
                {generateMonthDays().map((dayInfo, index) => {
                  const dayEvents = getEventsForDate(dayInfo.date);
                  const isCurrentDay = isToday(dayInfo.date);
                  
                  return (
                    <div
                      key={index}
                      className={`min-h-[100px] p-1 border rounded-lg transition-colors ${
                        dayInfo.isCurrentMonth ? "bg-background" : "bg-muted/30"
                      } ${isCurrentDay ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isCurrentDay ? "text-primary" : dayInfo.isCurrentMonth ? "" : "text-muted-foreground"
                      }`}>
                        {dayInfo.date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(event => {
                          const colors = getStatusColor(event.stage);
                          return (
                            <div
                              key={event.event_id}
                              onClick={() => openEventDetail(event)}
                              className={`text-xs p-1 rounded cursor-pointer truncate ${colors.bg} ${colors.border} ${colors.text} border hover:opacity-80 transition-opacity`}
                              title={`${event.name} - ${event.stage}`}
                            >
                              {event.name}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-muted-foreground text-center">
                            +{dayEvents.length - 3} {isEs ? "más" : "more"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Week View */}
          {viewMode === "week" && (
            <div>
              {/* Day Headers */}
              <div className="grid grid-cols-7 mb-2">
                {generateWeekDays().map((date, index) => {
                  const isCurrentDay = isToday(date);
                  return (
                    <div key={index} className={`text-center py-2 ${isCurrentDay ? "bg-primary/10 rounded-t-lg" : ""}`}>
                      <div className="text-sm font-medium text-muted-foreground">{dayNames[date.getDay()]}</div>
                      <div className={`text-lg font-semibold ${isCurrentDay ? "text-primary" : ""}`}>{date.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {/* Week Events */}
              <div className="grid grid-cols-7 gap-1 min-h-[400px]">
                {generateWeekDays().map((date, index) => {
                  const dayEvents = getEventsForDate(date);
                  const isCurrentDay = isToday(date);
                  
                  return (
                    <div
                      key={index}
                      className={`p-2 border rounded-lg ${isCurrentDay ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="space-y-2">
                        {dayEvents.map(event => {
                          const colors = getStatusColor(event.stage);
                          return (
                            <div
                              key={event.event_id}
                              onClick={() => openEventDetail(event)}
                              className={`p-2 rounded cursor-pointer ${colors.bg} ${colors.border} ${colors.text} border hover:opacity-80 transition-opacity`}
                            >
                              <div className="font-medium text-sm truncate">{event.name}</div>
                              <div className="text-xs opacity-75">{event.client_name}</div>
                              <Badge className={`mt-1 text-xs ${colors.bg} ${colors.text}`}>{event.stage}</Badge>
                            </div>
                          );
                        })}
                        {dayEvents.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-4">
                            {isEs ? "Sin eventos" : "No events"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day View */}
          {viewMode === "day" && (
            <div className="min-h-[400px]">
              {(() => {
                const dayEvents = getEventsForDate(currentDate);
                return (
                  <div className="space-y-3">
                    {dayEvents.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>{isEs ? "No hay eventos para este día" : "No events for this day"}</p>
                      </div>
                    ) : (
                      dayEvents.map(event => {
                        const colors = getStatusColor(event.stage);
                        return (
                          <div
                            key={event.event_id}
                            onClick={() => openEventDetail(event)}
                            className={`p-4 rounded-lg cursor-pointer ${colors.bg} ${colors.border} border hover:opacity-90 transition-opacity`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className={`font-semibold text-lg ${colors.text}`}>{event.name}</h3>
                                <p className="text-sm text-muted-foreground">{event.client_name}</p>
                              </div>
                              <Badge className={`${colors.bg} ${colors.text} border ${colors.border}`}>
                                {event.stage}
                              </Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span>{event.event_type}</span>
                              </div>
                              {event.guest_count && (
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-muted-foreground" />
                                  <span>{event.guest_count} {isEs ? "invitados" : "guests"}</span>
                                </div>
                              )}
                              {event.venue && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-4 h-4 text-muted-foreground" />
                                  <span className="truncate">{event.venue}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEvent?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <Badge className={`${getStatusColor(selectedEvent.stage).bg} ${getStatusColor(selectedEvent.stage).text} border ${getStatusColor(selectedEvent.stage).border}`}>
                  {selectedEvent.stage}
                </Badge>
                <Badge variant="outline">{selectedEvent.event_type}</Badge>
              </div>

              {/* Event Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{isEs ? "Cliente" : "Client"}</p>
                  <p className="font-medium">{selectedEvent.client_name || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{isEs ? "Fecha" : "Date"}</p>
                  <p className="font-medium">
                    {selectedEvent.event_date 
                      ? new Date(selectedEvent.event_date).toLocaleDateString(isEs ? 'es-ES' : 'en-US')
                      : "TBD"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{isEs ? "Invitados" : "Guests"}</p>
                  <p className="font-medium flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {selectedEvent.guest_count || "-"}
                  </p>
                </div>
                {selectedEvent.venue && (
                  <div>
                    <p className="text-muted-foreground">{isEs ? "Lugar" : "Venue"}</p>
                    <p className="font-medium flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {selectedEvent.venue}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-4 border-t">
                <Button className="w-full" onClick={() => goToEvent(selectedEvent.event_id)}>
                  {isEs ? "Ver Detalles Completos" : "View Full Details"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
