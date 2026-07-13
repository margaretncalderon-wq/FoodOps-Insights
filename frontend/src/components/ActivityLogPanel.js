// components/ActivityLogPanel.js - Activity Change History Panel
import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { History, Clock, User, ArrowRight, Move, Maximize2, Plus, Trash2, Edit2, RefreshCw } from "lucide-react";

import { KoraLoader } from "./KoraLoader";
export function ActivityLogPanel({ eventId, roomId = null }) {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchLogs = async () => {
    if (!eventId) return;
    
    try {
      setLoading(true);
      const endpoint = roomId 
        ? `${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}/activity-logs`
        : `${API}/orchestration/room-setup/events/${eventId}/activity-logs`;
      
      const res = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 }
      });
      setLogs(res.data || []);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, eventId, roomId]);

  const getChangeIcon = (changeType) => {
    switch (changeType) {
      case "move": return <Move className="w-4 h-4" />;
      case "resize": return <Maximize2 className="w-4 h-4" />;
      case "create": return <Plus className="w-4 h-4" />;
      case "delete": return <Trash2 className="w-4 h-4" />;
      case "update": return <Edit2 className="w-4 h-4" />;
      default: return <Edit2 className="w-4 h-4" />;
    }
  };

  const getChangeBadgeColor = (changeType) => {
    switch (changeType) {
      case "move": return "bg-blue-100 text-blue-700";
      case "resize": return "bg-purple-100 text-purple-700";
      case "create": return "bg-green-100 text-green-700";
      case "delete": return "bg-red-100 text-red-700";
      case "update": return "bg-amber-100 text-amber-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="activity-log-btn">
          <History className="w-4 h-4" />
          Change History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#3A4D3F]" />
            Activity Change History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {logs.length} changes recorded
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <KoraLoader size={24} />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No changes recorded yet</p>
              <p className="text-xs mt-1">Changes will appear here when activities are modified</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
              {logs.map((log, idx) => (
                <div 
                  key={log.log_id || idx} 
                  className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${getChangeBadgeColor(log.change_type)}`}>
                      {getChangeIcon(log.change_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {log.activity_title}
                        </span>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {log.change_type}
                        </Badge>
                      </div>
                      
                      {/* Time change details */}
                      {(log.old_start_time || log.new_start_time) && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                            {log.old_start_time} - {log.old_end_time}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            {log.new_start_time} - {log.new_end_time}
                          </span>
                        </div>
                      )}

                      {/* User and time */}
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {log.changed_by_name || log.changed_by_email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ActivityLogPanel;
