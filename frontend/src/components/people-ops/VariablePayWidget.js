import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";
import {
  Clock, Percent, DollarSign, Zap, AlertCircle, 
  ChevronRight, Calendar, RefreshCw
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function VariablePayWidget() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/settings/variable-pay-summary`, { withCredentials: true });
      setSummary(res.data);
    } catch (err) {
      console.error("Error fetching variable pay summary:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const now = new Date();
  const currentDay = now.getDate();

  const getPaymentStatus = (paymentDay, paymentType) => {
    if (paymentType === "with_payroll") return { status: "with_payroll", label: isEs ? "Con nómina" : "With payroll" };
    if (currentDay > paymentDay) return { status: "overdue", label: isEs ? "Vencido" : "Overdue" };
    if (currentDay === paymentDay) return { status: "today", label: isEs ? "Hoy" : "Today" };
    const daysLeft = paymentDay - currentDay;
    return { status: "upcoming", label: isEs ? `En ${daysLeft} días` : `In ${daysLeft} days` };
  };

  const payTypes = [
    {
      type: "overtime",
      icon: Clock,
      color: "text-amber-500",
      bgColor: "bg-amber-50",
      label: isEs ? "Horas Extras" : "Overtime",
      paymentDay: summary.overtime?.payment_day,
      paymentType: summary.overtime?.payment_type,
      pendingAmount: summary.overtime?.pending_amount || 0,
      pendingCount: summary.overtime?.pending_count || 0,
      showAmount: true
    },
    {
      type: "commission",
      icon: Percent,
      color: "text-emerald-500",
      bgColor: "bg-emerald-50",
      label: isEs ? "Comisiones" : "Commissions",
      paymentDay: summary.commission?.payment_day,
      paymentType: summary.commission?.payment_type,
      info: isEs 
        ? `${summary.commission?.employees_eligible || 0} vendedores elegibles` 
        : `${summary.commission?.employees_eligible || 0} eligible salespeople`
    },
    {
      type: "bonus",
      icon: DollarSign,
      color: "text-blue-500",
      bgColor: "bg-blue-50",
      label: isEs ? "Bonos" : "Bonuses",
      paymentDay: summary.bonus?.payment_day,
      paymentType: summary.bonus?.payment_type
    },
    {
      type: "incentive",
      icon: Zap,
      color: "text-purple-500",
      bgColor: "bg-purple-50",
      label: isEs ? "Incentivos" : "Incentives",
      paymentDay: summary.incentive?.payment_day,
      paymentType: summary.incentive?.payment_type
    }
  ];

  const pendingRuns = summary.pending_runs || [];

  return (
    <Card data-testid="variable-pay-widget">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            {isEs ? "Próximos Pagos Variables" : "Upcoming Variable Pay"}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/people-ops/variable-pay")}
            className="text-xs"
          >
            {isEs ? "Ver todos" : "View all"}
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Payment Type Cards */}
        <div className="grid grid-cols-2 gap-2">
          {payTypes.map(pt => {
            const Icon = pt.icon;
            const payStatus = getPaymentStatus(pt.paymentDay, pt.paymentType);
            
            return (
              <div 
                key={pt.type}
                className={`p-3 rounded-lg ${pt.bgColor} cursor-pointer hover:opacity-80 transition-opacity`}
                onClick={() => navigate(`/people-ops/variable-pay?tab=${pt.type}`)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${pt.color}`} />
                  <span className="text-sm font-medium">{pt.label}</span>
                </div>
                
                {pt.showAmount && pt.pendingAmount > 0 ? (
                  <p className="text-lg font-bold">{formatCurrency(pt.pendingAmount)}</p>
                ) : pt.info ? (
                  <p className="text-xs text-muted-foreground">{pt.info}</p>
                ) : null}
                
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {payStatus.status === "with_payroll" 
                      ? payStatus.label 
                      : isEs ? `Día ${pt.paymentDay}` : `Day ${pt.paymentDay}`}
                  </span>
                  {payStatus.status === "overdue" && (
                    <Badge variant="destructive" className="text-xs px-1 py-0 ml-1">
                      {payStatus.label}
                    </Badge>
                  )}
                  {payStatus.status === "today" && (
                    <Badge className="bg-amber-500 text-xs px-1 py-0 ml-1">
                      {payStatus.label}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pending Runs Alert */}
        {pendingRuns.length > 0 && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
              <AlertCircle className="w-4 h-4" />
              {isEs ? `${pendingRuns.length} pago(s) pendiente(s)` : `${pendingRuns.length} pending payment(s)`}
            </div>
            <div className="space-y-1">
              {pendingRuns.slice(0, 3).map(run => (
                <div 
                  key={run.run_id}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-amber-100 p-1 rounded"
                  onClick={() => navigate(`/people-ops/variable-pay`)}
                >
                  <span className="truncate">{run.run_name}</span>
                  <span className="font-medium">{formatCurrency(run.total_net)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
