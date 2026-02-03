import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Building2, Users, CreditCard, TrendingUp, Activity, Loader2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SuperAdminOverview() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/stats`, { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          {isEs ? "Resumen de Plataforma" : "Platform Overview"}
        </h1>
        <p className="text-muted-foreground">
          {isEs ? "Monitorea todas las organizaciones y métricas" : "Monitor all organizations and metrics"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.organizations?.total || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Organizaciones Totales" : "Total Organizations"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.organizations?.active || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Organizaciones Activas" : "Active Organizations"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.total_users || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Usuarios Totales" : "Total Users"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stats?.events_this_month || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Eventos Este Mes" : "Events This Month"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions by Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              {isEs ? "Suscripciones por Plan" : "Subscriptions by Plan"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Starter ({isEs ? "Gratis" : "Free"})</span>
                <span className="text-2xl font-bold">{stats?.subscriptions?.starter || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Professional</span>
                <span className="text-2xl font-bold text-blue-500">{stats?.subscriptions?.professional || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Enterprise</span>
                <span className="text-2xl font-bold text-purple-500">{stats?.subscriptions?.enterprise || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              {isEs ? "Estado de Organizaciones" : "Organization Status"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">{isEs ? "Activas" : "Active"}</span>
                </div>
                <span className="text-2xl font-bold text-green-500">{stats?.organizations?.active || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">{isEs ? "Suspendidas" : "Suspended"}</span>
                </div>
                <span className="text-2xl font-bold text-red-500">{stats?.organizations?.suspended || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
