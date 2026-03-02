// components/NotificationBell.js - In-App Notifications Component
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { 
  Bell, Check, CheckCheck, Trash2, ExternalLink,
  Lightbulb, FileText, Users, AlertCircle, Settings,
  Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = process.env.REACT_APP_BACKEND_URL;

const NOTIFICATION_ICONS = {
  content_created: Lightbulb,
  approval_needed: FileText,
  invitation_accepted: Users,
  campaign_update: Settings,
  system: AlertCircle
};

const PRIORITY_COLORS = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-orange-500",
  urgent: "text-red-500"
};

export default function NotificationBell() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isEs = language === "es";
  
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        axios.get(`${API}/api/notifications?limit=10`, { withCredentials: true }),
        axios.get(`${API}/api/notifications/unread-count`, { withCredentials: true })
      ]);
      setNotifications(notifRes.data || []);
      setUnreadCount(countRes.data?.unread_count || 0);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkRead = async (notificationId, e) => {
    e?.stopPropagation();
    try {
      await axios.post(`${API}/api/notifications/${notificationId}/read`, {}, { withCredentials: true });
      setNotifications(prev => 
        prev.map(n => n.notification_id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/api/notifications/mark-all-read`, {}, { withCredentials: true });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (notificationId, e) => {
    e?.stopPropagation();
    try {
      await axios.delete(`${API}/api/notifications/${notificationId}`, { withCredentials: true });
      setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      handleMarkRead(notification.notification_id);
    }
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return isEs ? "Ahora" : "Now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notification-bell">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{isEs ? "Notificaciones" : "Notifications"}</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs"
              onClick={handleMarkAllRead}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <CheckCheck className="w-3 h-3 mr-1" />
                  {isEs ? "Marcar todo" : "Mark all"}
                </>
              )}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {isEs ? "No hay notificaciones" : "No notifications"}
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.map((notification) => {
              const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
              const priorityClass = PRIORITY_COLORS[notification.priority] || "";
              
              return (
                <DropdownMenuItem
                  key={notification.notification_id}
                  className={`flex items-start gap-3 p-3 cursor-pointer ${!notification.read ? 'bg-primary/5' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={`mt-0.5 ${priorityClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium truncate ${!notification.read ? '' : 'text-muted-foreground'}`}>
                        {notification.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatTime(notification.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notification.message}
                    </p>
                    {notification.link && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-primary">
                        <ExternalLink className="w-3 h-3" />
                        {isEs ? "Ver más" : "View"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => handleMarkRead(notification.notification_id, e)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(notification.notification_id, e)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
        
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 text-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => {
                  navigate("/notifications");
                  setOpen(false);
                }}
              >
                {isEs ? "Ver todas las notificaciones" : "View all notifications"}
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
