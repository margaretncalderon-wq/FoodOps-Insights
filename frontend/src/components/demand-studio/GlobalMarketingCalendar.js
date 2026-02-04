import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { 
  ChevronLeft, ChevronRight, Calendar, Target, 
  Mail, Zap, Instagram, Linkedin, Youtube, Hash,
  Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const PLATFORMS = {
  instagram: { icon: Instagram, color: "bg-pink-500" },
  tiktok: { icon: Hash, color: "bg-black" },
  linkedin: { icon: Linkedin, color: "bg-blue-600" },
  facebook: { icon: Hash, color: "bg-blue-500" },
  youtube: { icon: Youtube, color: "bg-red-500" },
};

const EVENT_COLORS = {
  campaign: "bg-purple-100 border-purple-300 text-purple-800",
  post: "bg-blue-100 border-blue-300 text-blue-800",
  activation: "bg-orange-100 border-orange-300 text-orange-800",
  email: "bg-green-100 border-green-300 text-green-800",
};

export default function GlobalMarketingCalendar() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState({
    campaigns: [],
    posts: [],
    activations: [],
    emails: []
  });
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    fetchCalendarData();
  }, [calendarMonth]);

  const fetchCalendarData = async () => {
    setLoading(true);
    const startDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).toISOString();
    const endDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0, 23, 59, 59).toISOString();
    
    try {
      const response = await axios.get(
        `${API}/api/demand-studio/global-calendar?start_date=${startDate}&end_date=${endDate}`,
        { withCredentials: true }
      );
      setCalendarData(response.data);
    } catch (error) {
      console.error("Error fetching calendar data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getEventsForDay = (day) => {
    if (!day) return [];
    const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = [];

    // Filter campaigns
    if (filterType === "all" || filterType === "campaigns") {
      calendarData.campaigns.forEach(c => {
        const start = c.start_date?.substring(0, 10);
        const end = c.end_date?.substring(0, 10);
        if ((start && start <= dateStr && end && end >= dateStr) || start === dateStr || end === dateStr) {
          events.push({ type: "campaign", ...c });
        }
      });
    }

    // Filter posts
    if (filterType === "all" || filterType === "posts") {
      calendarData.posts.forEach(p => {
        const scheduled = p.scheduled_at?.substring(0, 10);
        const posted = p.posted_at?.substring(0, 10);
        if (scheduled === dateStr || posted === dateStr) {
          events.push({ type: "post", ...p });
        }
      });
    }

    // Filter activations
    if (filterType === "all" || filterType === "activations") {
      calendarData.activations.forEach(a => {
        const start = a.start_date?.substring(0, 10);
        const end = a.end_date?.substring(0, 10);
        if ((start && start <= dateStr && end && end >= dateStr) || start === dateStr || end === dateStr) {
          events.push({ type: "activation", ...a });
        }
      });
    }

    // Filter emails
    if (filterType === "all" || filterType === "emails") {
      calendarData.emails.forEach(e => {
        const sendDate = e.send_date?.substring(0, 10);
        if (sendDate === dateStr) {
          events.push({ type: "email", ...e });
        }
      });
    }

    return events;
  };

  const getEventIcon = (event) => {
    switch (event.type) {
      case "campaign":
        return <Target className="w-3 h-3" />;
      case "post":
        const platform = event.account?.platform;
        const PlatformIcon = PLATFORMS[platform]?.icon || Calendar;
        return <PlatformIcon className="w-3 h-3" />;
      case "activation":
        return <Zap className="w-3 h-3" />;
      case "email":
        return <Mail className="w-3 h-3" />;
      default:
        return <Calendar className="w-3 h-3" />;
    }
  };

  const totalEvents = calendarData.campaigns.length + calendarData.posts.length + 
                      calendarData.activations.length + calendarData.emails.length;

  return (
    <Card data-testid="global-marketing-calendar">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            {isEs ? "Calendario de Marketing" : "Marketing Calendar"}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todo" : "All"}</SelectItem>
                <SelectItem value="campaigns">{isEs ? "Campañas" : "Campaigns"}</SelectItem>
                <SelectItem value="posts">{isEs ? "Posts" : "Posts"}</SelectItem>
                <SelectItem value="activations">{isEs ? "Activaciones" : "Activations"}</SelectItem>
                <SelectItem value="emails">{isEs ? "Emails" : "Emails"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h4 className="font-medium text-sm">
            {calendarMonth.toLocaleDateString(isEs ? 'es' : 'en', { month: 'long', year: 'numeric' })}
          </h4>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-700">
            <Target className="w-3 h-3 mr-1" />
            {isEs ? "Campañas" : "Campaigns"} ({calendarData.campaigns.length})
          </Badge>
          <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
            <Calendar className="w-3 h-3 mr-1" />
            {isEs ? "Posts" : "Posts"} ({calendarData.posts.length})
          </Badge>
          <Badge variant="outline" className="text-xs bg-orange-50 border-orange-200 text-orange-700">
            <Zap className="w-3 h-3 mr-1" />
            {isEs ? "Activaciones" : "Activations"} ({calendarData.activations.length})
          </Badge>
          <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
            <Mail className="w-3 h-3 mr-1" />
            {isEs ? "Emails" : "Emails"} ({calendarData.emails.length})
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {[
                isEs ? 'Dom' : 'Sun', 
                isEs ? 'Lun' : 'Mon', 
                isEs ? 'Mar' : 'Tue', 
                isEs ? 'Mié' : 'Wed', 
                isEs ? 'Jue' : 'Thu', 
                isEs ? 'Vie' : 'Fri', 
                isEs ? 'Sáb' : 'Sat'
              ].map(d => (
                <div key={d} className="text-xs font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
              
              {getDaysInMonth().map((day, idx) => {
                const events = getEventsForDay(day);
                const isToday = day && 
                  calendarMonth.getMonth() === new Date().getMonth() && 
                  calendarMonth.getFullYear() === new Date().getFullYear() &&
                  day === new Date().getDate();
                
                return (
                  <div
                    key={idx}
                    className={`min-h-[60px] p-1 border rounded text-left ${
                      day ? 'bg-background hover:bg-muted/50' : 'bg-muted/20'
                    } ${isToday ? 'ring-2 ring-purple-500 ring-offset-1' : ''}`}
                  >
                    {day && (
                      <>
                        <span className={`text-xs font-medium ${isToday ? 'text-purple-600' : ''}`}>
                          {day}
                        </span>
                        <div className="space-y-0.5 mt-0.5 overflow-hidden">
                          {events.slice(0, 2).map((event, i) => (
                            <div
                              key={i}
                              className={`text-[10px] px-1 py-0.5 rounded border truncate flex items-center gap-1 ${EVENT_COLORS[event.type]}`}
                              title={event.name || event.title}
                            >
                              {getEventIcon(event)}
                              <span className="truncate">{event.name || event.title}</span>
                            </div>
                          ))}
                          {events.length > 2 && (
                            <span className="text-[10px] text-muted-foreground px-1">
                              +{events.length - 2} {isEs ? 'más' : 'more'}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Empty State */}
            {totalEvents === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {isEs 
                  ? "No hay eventos de marketing programados este mes"
                  : "No marketing events scheduled this month"}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
