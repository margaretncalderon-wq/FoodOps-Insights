import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { 
  TrendingUp, AlertTriangle, X, ChevronRight,
  DollarSign, Building2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function BudgetAlertsBell() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [alerts, setAlerts] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const lastFetchRef = useRef(0);

  const fetchAlerts = useCallback(async () => {
    // Throttle: don't fetch if last fetch was less than 30 seconds ago
    const now = Date.now();
    if (now - lastFetchRef.current < 30000 && !isOpen) return;
    lastFetchRef.current = now;
    
    try {
      const response = await axios.get(`${API}/api/business-clarity/budget-alerts`, { withCredentials: true });
      const data = response.data;
      setAlerts(data.alerts || []);
      setAlertCount(data.summary?.total || 0);
      setCriticalCount(data.summary?.critical || 0);
    } catch (error) {
      // Silently fail
    }
  }, [isOpen]);

  useEffect(() => {
    fetchAlerts();
    // Poll every 2 minutes
    const interval = setInterval(fetchAlerts, 120000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = () => {
    if (!isOpen) {
      fetchAlerts();
    }
    setIsOpen(!isOpen);
  };

  const handleViewReport = () => {
    setIsOpen(false);
    navigate("/business-clarity/reports");
    // Small delay then click on cost center tab
    setTimeout(() => {
      const ccTab = document.querySelector('button:has-text("Cost Center")');
      if (ccTab) ccTab.click();
    }, 500);
  };

  // Don't show bell if no alerts
  if (alertCount === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleOpen}
        data-testid="budget-alerts-bell"
      >
        <TrendingUp className={`h-5 w-5 ${criticalCount > 0 ? "text-red-500" : "text-amber-500"}`} />
        {alertCount > 0 && (
          <Badge 
            variant={criticalCount > 0 ? "destructive" : "default"}
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {alertCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-background border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="font-medium text-sm">
                {isEs ? "Alertas de Presupuesto" : "Budget Alerts"}
              </span>
              {criticalCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {criticalCount} {isEs ? "críticas" : "critical"}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Alert List */}
          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{isEs ? "Sin alertas de presupuesto" : "No budget alerts"}</p>
              </div>
            ) : (
              <div className="divide-y">
                {alerts.map((alert) => (
                  <div 
                    key={alert.alert_id}
                    className={`p-3 hover:bg-muted/50 cursor-pointer ${
                      alert.type === "critical" ? "bg-red-50/50" : "bg-amber-50/50"
                    }`}
                    onClick={handleViewReport}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-full ${
                        alert.type === "critical" ? "bg-red-100" : "bg-amber-100"
                      }`}>
                        {alert.type === "critical" ? (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {alert.cost_center_code && (
                              <Badge variant="outline" className="mr-1 text-xs">{alert.cost_center_code}</Badge>
                            )}
                            {alert.cost_center_name}
                          </span>
                        </div>
                        
                        <div className="mt-1.5 flex items-center gap-2">
                          <Progress 
                            value={Math.min(alert.utilization, 100)} 
                            className={`h-1.5 flex-1 ${alert.type === "critical" ? "[&>div]:bg-red-500" : "[&>div]:bg-amber-500"}`}
                          />
                          <span className={`text-xs font-medium ${
                            alert.type === "critical" ? "text-red-600" : "text-amber-600"
                          }`}>
                            {alert.utilization}%
                          </span>
                        </div>
                        
                        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {isEs ? "Presupuesto:" : "Budget:"} {formatCurrency(alert.budget)}
                          </span>
                          <span>
                            {isEs ? "Real:" : "Actual:"} {formatCurrency(alert.actual)}
                          </span>
                        </div>
                        
                        {alert.type === "critical" && alert.over_amount > 0 && (
                          <div className="mt-1 text-xs text-red-600 font-medium">
                            {isEs ? "Excedido por" : "Over by"} {formatCurrency(alert.over_amount)}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t bg-muted/30">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs"
              onClick={handleViewReport}
            >
              <Building2 className="w-3 h-3 mr-1" />
              {isEs ? "Ver reporte completo" : "View full report"}
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
