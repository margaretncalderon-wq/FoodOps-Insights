import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { 
  Building2, Users, CreditCard, TrendingUp, Activity, Loader2, 
  Package, DollarSign, PieChart, ArrowUpRight, ArrowDownRight,
  Briefcase, Wrench, Calendar, BarChart3, RefreshCw, Download,
  FileSpreadsheet, AlertTriangle, AlertCircle, Info, Bell, X
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

export default function SuperAdminOverview() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);

  useEffect(() => {
    fetchMetrics();
    fetchAlerts();
  }, []);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/super-admin/metrics/dashboard`, { withCredentials: true });
      setMetrics(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const fetchAlerts = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/metrics/alerts`, { withCredentials: true });
      setAlerts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API}/api/super-admin/metrics/export/csv`, {
        withCredentials: true,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `kora_metrics_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(isEs ? "CSV exportado" : "CSV exported");
    } catch (err) {
      toast.error(isEs ? "Error al exportar" : "Export failed");
    }
    setExporting(false);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API}/api/super-admin/metrics/export/excel`, {
        withCredentials: true,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `kora_metrics_${new Date().toISOString().slice(0,10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(isEs ? "Excel exportado" : "Excel exported");
    } catch (err) {
      toast.error(isEs ? "Error al exportar" : "Export failed");
    }
    setExporting(false);
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case "critical": return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case "warning": return <AlertCircle className="w-5 h-5 text-amber-400" />;
      case "info": return <Info className="w-5 h-5 text-blue-400" />;
      default: return <Bell className="w-5 h-5 text-slate-400" />;
    }
  };

  const getAlertStyle = (type) => {
    switch (type) {
      case "critical": return "border-red-500/50 bg-red-900/20";
      case "warning": return "border-amber-500/50 bg-amber-900/20";
      case "info": return "border-blue-500/50 bg-blue-900/20";
      default: return "border-slate-600 bg-slate-800/50";
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getIndustryIcon = (industry) => {
    switch (industry) {
      case "events_hospitality": return <Calendar className="w-4 h-4" />;
      case "professional_services": return <Briefcase className="w-4 h-4" />;
      case "generic": return <Wrench className="w-4 h-4" />;
      default: return <Building2 className="w-4 h-4" />;
    }
  };

  const getIndustryName = (industry) => {
    const names = {
      events_hospitality: isEs ? "Eventos y Hospitalidad" : "Events & Hospitality",
      professional_services: isEs ? "Servicios Profesionales" : "Professional Services",
      generic: isEs ? "Servicios Generales" : "General Services",
      not_set: isEs ? "Sin configurar" : "Not Set"
    };
    return names[industry] || industry;
  };

  const getIndustryColor = (industry) => {
    const colors = {
      events_hospitality: "bg-purple-500",
      professional_services: "bg-blue-500",
      generic: "bg-gray-500",
      not_set: "bg-slate-600"
    };
    return colors[industry] || "bg-slate-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalByIndustry = Object.values(metrics?.by_industry || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isEs ? "Dashboard de Métricas" : "Metrics Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            {isEs ? "Resumen ejecutivo de la plataforma" : "Executive platform summary"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportCSV}
            disabled={exporting}
            className="border-slate-600"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportExcel}
            disabled={exporting}
            className="border-slate-600"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchMetrics(); fetchAlerts(); }} className="border-slate-600">
            <RefreshCw className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts && alerts.alerts && alerts.alerts.length > 0 && showAlerts && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="w-5 h-5 text-amber-400" />
                {isEs ? "Alertas de la Plataforma" : "Platform Alerts"}
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                  {alerts.total_alerts}
                </span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAlerts(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.alerts.map((alert, idx) => (
              <div 
                key={idx}
                className={`p-4 rounded-lg border ${getAlertStyle(alert.type)}`}
              >
                <div className="flex items-start gap-3">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <p className="font-medium text-slate-200">{alert.title}</p>
                    <p className="text-sm text-slate-400 mt-1">{alert.message}</p>
                    <p className="text-xs text-slate-500 mt-2">
                      <span className="text-slate-400">{isEs ? "Acción:" : "Action:"}</span> {alert.action}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

        {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR Card */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-green-900/50 dark:to-green-800/30 border-emerald-200 dark:border-green-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-700 dark:text-green-300/80 font-medium">MRR</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-green-400">
                  {formatCurrency(metrics?.mrr?.total || 0)}
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-green-300/60 mt-1">
                  {isEs ? "Ingresos Mensuales Recurrentes" : "Monthly Recurring Revenue"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-emerald-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paying Customers Card */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/50 dark:to-blue-800/30 border-blue-200 dark:border-blue-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300/80 font-medium">
                  {isEs ? "Clientes de Pago" : "Paying Customers"}
                </p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {metrics?.organizations?.paying || 0}
                </p>
                <p className="text-xs text-blue-600/70 dark:text-blue-300/60 mt-1">
                  {isEs ? `de ${metrics?.organizations?.total || 0} total` : `of ${metrics?.organizations?.total || 0} total`}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Rate Card */}
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/50 dark:to-amber-800/30 border-amber-200 dark:border-amber-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300/80 font-medium">
                  {isEs ? "Tasa de Conversión" : "Conversion Rate"}
                </p>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {metrics?.conversion?.rate || 0}%
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-300/60 mt-1">
                  {isEs ? "Free → Pago" : "Free → Paid"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Modules Card */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/50 dark:to-purple-800/30 border-purple-200 dark:border-purple-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-700 dark:text-purple-300/80 font-medium">
                  {isEs ? "Módulos Activos" : "Active Modules"}
                </p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {metrics?.modules?.total_active_subscriptions || 0}
                </p>
                <p className="text-xs text-purple-600/70 dark:text-purple-300/60 mt-1">
                  {isEs ? "Suscripciones de módulos" : "Module subscriptions"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{isEs ? "Nuevas Orgs" : "New Orgs"}</p>
                  <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-sm">
                    <ArrowUpRight className="w-4 h-4" />
                    {isEs ? "este mes" : "this month"}
                  </span>
                </div>
                <p className="text-2xl font-bold">{metrics?.organizations?.new_this_month || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{isEs ? "Nuevos Usuarios" : "New Users"}</p>
                  <span className="flex items-center text-blue-600 dark:text-blue-400 text-sm">
                    <ArrowUpRight className="w-4 h-4" />
                    {isEs ? "este mes" : "this month"}
                  </span>
                </div>
                <p className="text-2xl font-bold">{metrics?.users?.new_this_month || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{isEs ? "Total Usuarios" : "Total Users"}</p>
                </div>
                <p className="text-2xl font-bold">{metrics?.users?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organizations by Industry */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PieChart className="w-5 h-5 text-muted-foreground" />
              {isEs ? "Organizaciones por Industria" : "Organizations by Industry"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(metrics?.by_industry || {}).map(([industry, count]) => {
                const percentage = totalByIndustry > 0 ? (count / totalByIndustry * 100).toFixed(1) : 0;
                return (
                  <div key={industry} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getIndustryColor(industry)}`} />
                        <span className="text-sm">{getIndustryName(industry)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{count}</span>
                        <span className="text-xs text-muted-foreground">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${getIndustryColor(industry)} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Module */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
              {isEs ? "Ingresos por Módulo" : "Revenue by Module"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(metrics?.modules?.revenue_by_module || []).map((mod, idx) => {
                const maxRevenue = Math.max(...(metrics?.modules?.revenue_by_module || []).map(m => m.monthly_revenue));
                const percentage = maxRevenue > 0 ? (mod.monthly_revenue / maxRevenue * 100) : 0;
                const colors = ["bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-pink-500"];
                return (
                  <div key={mod.addon_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{mod.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {mod.active_subscriptions} {isEs ? "subs" : "subs"}
                        </span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-green-400">
                          {formatCurrency(mod.monthly_revenue)}/mes
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${colors[idx % colors.length]} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!metrics?.modules?.revenue_by_module || metrics?.modules?.revenue_by_module.length === 0) && (
                <p className="text-center text-muted-foreground py-4">
                  {isEs ? "Sin módulos activos" : "No active modules"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="w-5 h-5 text-muted-foreground" />
            {isEs ? "Transacciones Recientes" : "Recent Transactions"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(metrics?.recent_transactions || []).length > 0 ? (
            <div className="space-y-3">
              {(metrics?.recent_transactions || []).map((tx) => (
                <div 
                  key={tx.transaction_id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-green-500/20 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-emerald-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tx.user_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.payment_type === "subscription" ? (isEs ? "Suscripción" : "Subscription") : "Add-on"} • {(tx.modules || []).length} {isEs ? "módulo(s)" : "module(s)"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600 dark:text-green-400">{formatCurrency(tx.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {isEs ? "Sin transacciones recientes" : "No recent transactions"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats Footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{metrics?.organizations?.total || 0}</p>
          <p className="text-xs text-muted-foreground">{isEs ? "Orgs Totales" : "Total Orgs"}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600 dark:text-green-400">{metrics?.organizations?.active || 0}</p>
          <p className="text-xs text-muted-foreground">{isEs ? "Orgs Activas" : "Active Orgs"}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics?.conversion?.paid_transactions || 0}</p>
          <p className="text-xs text-muted-foreground">{isEs ? "Pagos Exitosos" : "Paid Transactions"}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics?.conversion?.pending_transactions || 0}</p>
          <p className="text-xs text-muted-foreground">{isEs ? "Pagos Pendientes" : "Pending Payments"}</p>
        </div>
      </div>
    </div>
  );
}
