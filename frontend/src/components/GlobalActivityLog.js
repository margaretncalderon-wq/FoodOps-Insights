// components/GlobalActivityLog.js - Global Activity Log Panel
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { 
  History, 
  Clock, 
  User, 
  ArrowRight, 
  Move, 
  Maximize2,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Copy,
  Filter
} from "lucide-react";

const MODULE_INFO = {
  auth: { name: "Authentication", icon: "🔐", color: "bg-gray-100 text-gray-700" },
  crm: { name: "Client Management", icon: "👥", color: "bg-blue-100 text-blue-700" },
  events: { name: "Events", icon: "📅", color: "bg-purple-100 text-purple-700" },
  room_setup: { name: "Room Setup", icon: "🚪", color: "bg-cyan-100 text-cyan-700" },
  locations: { name: "Venues", icon: "📍", color: "bg-green-100 text-green-700" },
  execution_hub: { name: "Execution Hub", icon: "🎯", color: "bg-amber-100 text-amber-700" },
  demand_studio: { name: "Demand Studio", icon: "📊", color: "bg-pink-100 text-pink-700" },
  business_clarity: { name: "Business Clarity", icon: "💰", color: "bg-emerald-100 text-emerald-700" },
  addons: { name: "Add-ons", icon: "🧩", color: "bg-indigo-100 text-indigo-700" },
};

const ACTION_INFO = {
  create: { name: "Created", icon: Plus, color: "bg-green-100 text-green-700" },
  update: { name: "Updated", icon: Edit2, color: "bg-amber-100 text-amber-700" },
  delete: { name: "Deleted", icon: Trash2, color: "bg-red-100 text-red-700" },
  move: { name: "Moved", icon: Move, color: "bg-blue-100 text-blue-700" },
  resize: { name: "Resized", icon: Maximize2, color: "bg-purple-100 text-purple-700" },
  status_change: { name: "Status Changed", icon: RefreshCw, color: "bg-cyan-100 text-cyan-700" },
  approve: { name: "Approved", icon: CheckCircle, color: "bg-green-100 text-green-700" },
  reject: { name: "Rejected", icon: XCircle, color: "bg-red-100 text-red-700" },
  copy: { name: "Copied", icon: Copy, color: "bg-blue-100 text-blue-700" },
};

export function GlobalActivityLog({ trigger, orgId = null }) {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("limit", "100");
      if (moduleFilter !== "all") params.append("module", moduleFilter);
      if (actionFilter !== "all") params.append("action", actionFilter);
      if (orgId) params.append("org_id", orgId);
      
      const res = await axios.get(`${API}/activity-logs/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
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
  }, [open, moduleFilter, actionFilter]);

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

  const getActionIcon = (action) => {
    const info = ACTION_INFO[action];
    if (!info) return <Edit2 className="w-4 h-4" />;
    const Icon = info.icon;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2" data-testid="global-activity-log-btn">
            <History className="w-4 h-4" />
            Activity Log
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[450px] sm:w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#3A4D3F]" />
            Activity Log
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex gap-2">
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {Object.entries(MODULE_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    {info.icon} {info.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {Object.entries(ACTION_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    {info.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              variant="ghost" 
              size="icon" 
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{logs.length} activities found</span>
          </div>

          {/* Logs List */}
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-16 h-16 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No activities recorded yet</p>
              <p className="text-xs mt-1">Activities will appear here as you use the system</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
              {logs.map((log, idx) => {
                const moduleInfo = MODULE_INFO[log.module] || { name: log.module, icon: "📋", color: "bg-gray-100 text-gray-700" };
                const actionInfo = ACTION_INFO[log.action] || { name: log.action, color: "bg-gray-100 text-gray-700" };

                return (
                  <div 
                    key={log.log_id || idx} 
                    className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${actionInfo.color}`}>
                        {getActionIcon(log.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Entity name and action */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {log.entity_name || log.entity_type}
                          </span>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {actionInfo.name}
                          </Badge>
                        </div>

                        {/* Module and entity type */}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={`text-xs ${moduleInfo.color}`}>
                            {moduleInfo.icon} {moduleInfo.name}
                          </Badge>
                          <span className="text-xs text-muted-foreground capitalize">
                            {log.entity_type}
                          </span>
                        </div>

                        {/* Value change if exists */}
                        {(log.old_value || log.new_value) && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            {log.old_value && (
                              <span className="font-mono bg-muted px-1.5 py-0.5 rounded line-through text-muted-foreground">
                                {log.old_value}
                              </span>
                            )}
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            {log.new_value && (
                              <span className="font-mono bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                {log.new_value}
                              </span>
                            )}
                          </div>
                        )}

                        {/* User and time */}
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.user_name || log.user_email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default GlobalActivityLog;
