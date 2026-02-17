import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  DoorOpen,
  Users,
} from "lucide-react";

const DAYS_OF_WEEK = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
};

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
};

export default function RoomAvailabilityCalendar({ venueId, venueName, rooms = [] }) {
  const { t, language } = useLanguage();
  const token = localStorage.getItem("token");
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("all");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  const monthName = MONTHS[language]?.[month] || MONTHS.en[month];
  const daysOfWeek = DAYS_OF_WEEK[language] || DAYS_OF_WEEK.en;

  const fetchBookings = useCallback(async () => {
    if (!venueId) return;
    
    try {
      setLoading(true);
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;
      
      const response = await axios.get(
        `${API}/locations/calendar?start_date=${startDate}&end_date=${endDate}&venue_id=${venueId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setBookings(response.data.bookings_by_date || {});
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setLoading(false);
    }
  }, [token, venueId, year, month, daysInMonth]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getBookingsForDay = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBookings = bookings[dateStr] || [];
    
    if (selectedRoom === "all") {
      return dayBookings;
    }
    return dayBookings.filter(b => b.room_id === selectedRoom);
  };

  const getRoomColor = (roomId) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-teal-500",
      "bg-indigo-500",
      "bg-red-500",
    ];
    const index = rooms.findIndex(r => r.room_id === roomId);
    return colors[index % colors.length];
  };

  const isToday = (day) => {
    const today = new Date();
    return today.getDate() === day && 
           today.getMonth() === month && 
           today.getFullYear() === year;
  };

  const renderCalendarDays = () => {
    const days = [];
    
    // Empty cells for days before the first day of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(
        <div key={`empty-${i}`} className="h-24 bg-gray-50 dark:bg-gray-800/50" />
      );
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayBookings = getBookingsForDay(day);
      const hasBookings = dayBookings.length > 0;
      
      days.push(
        <div
          key={day}
          className={`h-24 border-t border-l p-1 overflow-hidden transition-colors ${
            isToday(day) 
              ? "bg-[#3A4D3F]/10 dark:bg-[#3A4D3F]/20" 
              : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-medium ${
              isToday(day) 
                ? "bg-[#3A4D3F] text-white w-6 h-6 rounded-full flex items-center justify-center" 
                : "text-gray-700 dark:text-gray-300"
            }`}>
              {day}
            </span>
            {hasBookings && (
              <Badge variant="secondary" className="text-xs px-1 py-0">
                {dayBookings.length}
              </Badge>
            )}
          </div>
          
          <div className="space-y-0.5 overflow-y-auto max-h-16">
            {dayBookings.slice(0, 3).map((booking, idx) => (
              <TooltipProvider key={idx}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={`text-xs px-1 py-0.5 rounded truncate text-white cursor-pointer ${getRoomColor(booking.room_id)}`}
                    >
                      {booking.room_name}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-medium">{booking.event_name || "Booking"}</p>
                      <p className="text-xs text-gray-500">
                        {booking.room_name} - {booking.venue_name}
                      </p>
                      {booking.start_time && (
                        <p className="text-xs">
                          {booking.start_time} - {booking.end_time || "?"}
                        </p>
                      )}
                      {booking.all_day && (
                        <Badge variant="outline" className="text-xs">
                          {language === "es" ? "Todo el día" : "All day"}
                        </Badge>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
            {dayBookings.length > 3 && (
              <div className="text-xs text-gray-500 px-1">
                +{dayBookings.length - 3} {language === "es" ? "más" : "more"}
              </div>
            )}
          </div>
        </div>
      );
    }
    
    return days;
  };

  return (
    <Card className="bg-white dark:bg-gray-800" data-testid="room-availability-calendar">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarIcon className="w-5 h-5 text-[#3A4D3F]" />
            {t("roomAvailability")} - {venueName}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Room Filter */}
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {language === "es" ? "Todos los salones" : "All rooms"}
                </SelectItem>
                {rooms.filter(r => r.is_active).map((room) => (
                  <SelectItem key={room.room_id} value={room.room_id}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getRoomColor(room.room_id)}`} />
                      {room.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              {language === "es" ? "Hoy" : "Today"}
            </Button>
          </div>
          
          <h3 className="text-lg font-semibold">
            {monthName} {year}
          </h3>
          
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>

        {/* Room Legend */}
        {rooms.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {rooms.filter(r => r.is_active).map((room) => (
              <div 
                key={room.room_id}
                className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400"
              >
                <div className={`w-3 h-3 rounded ${getRoomColor(room.room_id)}`} />
                <span>{room.name}</span>
                <span className="text-gray-400">({room.capacity})</span>
              </div>
            ))}
          </div>
        )}

        {/* Calendar Grid */}
        <div className="border rounded-lg overflow-hidden">
          {/* Days of week header */}
          <div className="grid grid-cols-7 bg-gray-100 dark:bg-gray-700">
            {daysOfWeek.map((day) => (
              <div 
                key={day} 
                className="py-2 text-center text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar days */}
          <div className="grid grid-cols-7 border-r border-b">
            {renderCalendarDays()}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <DoorOpen className="w-4 h-4" />
            {rooms.filter(r => r.is_active).length} {t("rooms")}
          </div>
          <div className="flex items-center gap-1">
            <CalendarIcon className="w-4 h-4" />
            {Object.values(bookings).flat().length} {t("bookings")} {language === "es" ? "este mes" : "this month"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
