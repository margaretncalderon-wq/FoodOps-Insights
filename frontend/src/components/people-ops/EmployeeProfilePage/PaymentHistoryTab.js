import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import {
  DollarSign, Calendar, Clock, Percent, Zap, 
  Wallet, Gift, RefreshCw, Filter, TrendingUp
} from "lucide-react";

import { API_BASE as API } from "../../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TYPE_CONFIG = {
  payroll: { 
    icon: Wallet, 
    color: "text-violet-600", 
    bgColor: "bg-violet-100",
    label: "Nómina", 
    labelEn: "Payroll" 
  },
  overtime: { 
    icon: Clock, 
    color: "text-amber-600", 
    bgColor: "bg-amber-100",
    label: "Horas Extras", 
    labelEn: "Overtime" 
  },
  commission: { 
    icon: Percent, 
    color: "text-emerald-600", 
    bgColor: "bg-emerald-100",
    label: "Comisión", 
    labelEn: "Commission" 
  },
  bonus: { 
    icon: DollarSign, 
    color: "text-blue-600", 
    bgColor: "bg-blue-100",
    label: "Bono", 
    labelEn: "Bonus" 
  },
  incentive: { 
    icon: Zap, 
    color: "text-purple-600", 
    bgColor: "bg-purple-100",
    label: "Incentivo", 
    labelEn: "Incentive" 
  },
  benefits_in_kind: { 
    icon: Gift, 
    color: "text-pink-600", 
    bgColor: "bg-pink-100",
    label: "Beneficio", 
    labelEn: "Benefit" 
  }
};

export function PaymentHistoryTab({ employeeId }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [history, setHistory] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [payType, setPayType] = useState("all");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: year.toString() });
      if (payType !== "all") params.append("pay_type", payType);
      
      const res = await axios.get(
        `${API}/api/settings/employee-payment-history/${employeeId}?${params}`,
        { withCredentials: true }
      );
      setHistory(res.data.history || []);
      setTotals(res.data.totals || {});
    } catch (err) {
      console.error("Error fetching payment history:", err);
    }
    setLoading(false);
  }, [employeeId, year, payType]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    years.push(y);
  }

  const getTypeIcon = (type) => {
    const config = TYPE_CONFIG[type] || TYPE_CONFIG.payroll;
    const Icon = config.icon;
    return <Icon className={`w-4 h-4 ${config.color}`} />;
  };

  const getTypeBadge = (type) => {
    const config = TYPE_CONFIG[type] || TYPE_CONFIG.payroll;
    return (
      <Badge className={`${config.bgColor} ${config.color} border-0`}>
        {isEs ? config.label : config.labelEn}
      </Badge>
    );
  };

  return (
    <div className="space-y-6" data-testid="payment-history-tab">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={payType} onValueChange={setPayType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              <SelectItem value="payroll">{isEs ? "Nómina" : "Payroll"}</SelectItem>
              <SelectItem value="overtime">{isEs ? "Horas Extras" : "Overtime"}</SelectItem>
              <SelectItem value="commission">{isEs ? "Comisiones" : "Commissions"}</SelectItem>
              <SelectItem value="bonus">{isEs ? "Bonos" : "Bonuses"}</SelectItem>
              <SelectItem value="incentive">{isEs ? "Incentivos" : "Incentives"}</SelectItem>
              <SelectItem value="benefits_in_kind">{isEs ? "Beneficios" : "Benefits"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-violet-200 bg-violet-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-violet-600 text-sm">
              <Wallet className="w-4 h-4" />
              {isEs ? "Nómina" : "Payroll"}
            </div>
            <p className="text-xl font-bold mt-1">{formatCurrency(totals.payroll)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <Clock className="w-4 h-4" />
              {isEs ? "Hrs Extra" : "Overtime"}
            </div>
            <p className="text-xl font-bold mt-1">{formatCurrency(totals.overtime)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <Percent className="w-4 h-4" />
              {isEs ? "Comisiones" : "Commissions"}
            </div>
            <p className="text-xl font-bold mt-1">{formatCurrency(totals.commission)}</p>
          </CardContent>
        </Card>
        
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-purple-600 text-sm">
              <TrendingUp className="w-4 h-4" />
              {isEs ? "Total Neto" : "Net Total"}
            </div>
            <p className="text-xl font-bold mt-1">{formatCurrency(totals.total_net)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Totals Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Bonos" : "Bonuses"}
            </div>
            <p className="text-lg font-semibold mt-1">{formatCurrency(totals.bonus)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-purple-600 text-sm">
              <Zap className="w-4 h-4" />
              {isEs ? "Incentivos" : "Incentives"}
            </div>
            <p className="text-lg font-semibold mt-1">{formatCurrency(totals.incentive)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-pink-600 text-sm">
              <Gift className="w-4 h-4" />
              {isEs ? "Beneficios en Especie" : "Benefits in Kind"}
            </div>
            <p className="text-lg font-semibold mt-1">{formatCurrency(totals.benefits_in_kind)}</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isEs ? `Historial de Pagos ${year}` : `Payment History ${year}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              {isEs ? "No hay pagos registrados para este período" : "No payments recorded for this period"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Bruto" : "Gross"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Deducciones" : "Deductions"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Neto" : "Net"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item, idx) => (
                  <TableRow key={`${item.type}-${item.date}-${idx}`}>
                    <TableCell className="text-sm">{item.date}</TableCell>
                    <TableCell>{getTypeBadge(item.type)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{item.description}</p>
                        {item.details?.overtime_hours > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {item.details.overtime_hours}h
                          </p>
                        )}
                        {item.details?.commission_rate && (
                          <p className="text-xs text-muted-foreground">
                            {item.details.commission_rate}% {isEs ? "sobre" : "of"} {formatCurrency(item.details.commission_sales)}
                          </p>
                        )}
                        {item.details?.pool_percentage && (
                          <p className="text-xs text-muted-foreground">
                            {item.details.pool_percentage}% pool
                          </p>
                        )}
                        {item.details?.benefit_type && (
                          <p className="text-xs text-muted-foreground">
                            {item.details.benefit_type}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.gross)}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {item.deductions > 0 ? `-${formatCurrency(item.deductions)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {formatCurrency(item.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
