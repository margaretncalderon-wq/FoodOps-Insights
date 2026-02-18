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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
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
        <Button variant="outline" size="sm" onClick={fetchMetrics} className="border-slate-600">
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR Card */}
        <Card className="bg-gradient-to-br from-green-900/50 to-green-800/30 border-green-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-300/80 font-medium">MRR</p>
                <p className="text-3xl font-bold text-green-400">
                  {formatCurrency(metrics?.mrr?.total || 0)}
                </p>
                <p className="text-xs text-green-300/60 mt-1">
                  {isEs ? "Ingresos Mensuales Recurrentes" : "Monthly Recurring Revenue"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paying Customers Card */}
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-blue-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-300/80 font-medium">
                  {isEs ? "Clientes de Pago" : "Paying Customers"}
                </p>
                <p className="text-3xl font-bold text-blue-400">
                  {metrics?.organizations?.paying || 0}
                </p>
                <p className="text-xs text-blue-300/60 mt-1">
                  {isEs ? `de ${metrics?.organizations?.total || 0} total` : `of ${metrics?.organizations?.total || 0} total`}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Rate Card */}
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 border-amber-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-300/80 font-medium">
                  {isEs ? "Tasa de Conversión" : "Conversion Rate"}
                </p>
                <p className="text-3xl font-bold text-amber-400">
                  {metrics?.conversion?.rate || 0}%
                </p>
                <p className="text-xs text-amber-300/60 mt-1">
                  {isEs ? "Free → Pago" : "Free → Paid"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Modules Card */}
        <Card className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border-purple-700/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-300/80 font-medium">
                  {isEs ? "Módulos Activos" : "Active Modules"}
                </p>
                <p className="text-3xl font-bold text-purple-400">
                  {metrics?.modules?.total_active_subscriptions || 0}
                </p>
                <p className="text-xs text-purple-300/60 mt-1">
                  {isEs ? "Suscripciones de módulos" : "Module subscriptions"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{isEs ? "Nuevas Orgs" : "New Orgs"}</p>
                  <span className="flex items-center text-emerald-400 text-sm">
                    <ArrowUpRight className="w-4 h-4" />
                    {isEs ? "este mes" : "this month"}
                  </span>
                </div>
                <p className="text-2xl font-bold">{metrics?.organizations?.new_this_month || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{isEs ? "Nuevos Usuarios" : "New Users"}</p>
                  <span className="flex items-center text-blue-400 text-sm">
                    <ArrowUpRight className="w-4 h-4" />
                    {isEs ? "este mes" : "this month"}
                  </span>
                </div>
                <p className="text-2xl font-bold">{metrics?.users?.new_this_month || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{isEs ? "Total Usuarios" : "Total Users"}</p>
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
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PieChart className="w-5 h-5 text-slate-400" />
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
                        <span className="text-sm text-slate-300">{getIndustryName(industry)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{count}</span>
                        <span className="text-xs text-slate-500">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
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
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-slate-400" />
              {isEs ? "Ingresos por Módulo" : "Revenue by Module"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(metrics?.modules?.revenue_by_module || []).map((mod, idx) => {
                const maxRevenue = Math.max(...(metrics?.modules?.revenue_by_module || []).map(m => m.monthly_revenue));
                const percentage = maxRevenue > 0 ? (mod.monthly_revenue / maxRevenue * 100) : 0;
                const colors = ["bg-green-500", "bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-pink-500"];
                return (
                  <div key={mod.addon_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">{mod.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">
                          {mod.active_subscriptions} {isEs ? "subs" : "subs"}
                        </span>
                        <span className="text-sm font-bold text-green-400">
                          {formatCurrency(mod.monthly_revenue)}/mes
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${colors[idx % colors.length]} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!metrics?.modules?.revenue_by_module || metrics?.modules?.revenue_by_module.length === 0) && (
                <p className="text-center text-slate-500 py-4">
                  {isEs ? "Sin módulos activos" : "No active modules"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="w-5 h-5 text-slate-400" />
            {isEs ? "Transacciones Recientes" : "Recent Transactions"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(metrics?.recent_transactions || []).length > 0 ? (
            <div className="space-y-3">
              {(metrics?.recent_transactions || []).map((tx) => (
                <div 
                  key={tx.transaction_id} 
                  className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{tx.user_email}</p>
                      <p className="text-xs text-slate-500">
                        {tx.payment_type === "subscription" ? (isEs ? "Suscripción" : "Subscription") : "Add-on"} • {(tx.modules || []).length} {isEs ? "módulo(s)" : "module(s)"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-400">{formatCurrency(tx.amount)}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-500 py-8">
              {isEs ? "Sin transacciones recientes" : "No recent transactions"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats Footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/30 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-slate-200">{metrics?.organizations?.total || 0}</p>
          <p className="text-xs text-slate-500">{isEs ? "Orgs Totales" : "Total Orgs"}</p>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{metrics?.organizations?.active || 0}</p>
          <p className="text-xs text-slate-500">{isEs ? "Orgs Activas" : "Active Orgs"}</p>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{metrics?.conversion?.paid_transactions || 0}</p>
          <p className="text-xs text-slate-500">{isEs ? "Pagos Exitosos" : "Paid Transactions"}</p>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{metrics?.conversion?.pending_transactions || 0}</p>
          <p className="text-xs text-slate-500">{isEs ? "Pagos Pendientes" : "Pending Payments"}</p>
        </div>
      </div>
    </div>
  );
}
