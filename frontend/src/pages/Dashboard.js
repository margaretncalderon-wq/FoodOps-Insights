import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { 
  Users, Calendar, ChefHat, AlertTriangle, ArrowRight, TrendingUp,
  Clock, CheckCircle, UserPlus, Mail, Star, AlertCircle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard() {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/dashboard/stats`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const pipelineData = stats?.pipeline_stats
    ? Object.entries(stats.pipeline_stats).map(([stage, count]) => ({
        name: t(stage),
        value: count,
      }))
    : [];

  const COLORS = ["#3A4D3F", "#E5DCC5", "#D4A017", "#4A7C8C", "#4A6C4C", "#B93632"];

  const statCards = [
    {
      title: t("totalClients"),
      value: stats?.total_clients || 0,
      icon: Users,
      color: "bg-primary/10 text-primary",
      link: "/crm",
    },
    {
      title: t("upcomingEvents"),
      value: stats?.upcoming_events || 0,
      icon: Calendar,
      color: "bg-info/10 text-info",
      link: "/events",
    },
    {
      title: t("totalRecipes"),
      value: stats?.total_recipes || 0,
      icon: ChefHat,
      color: "bg-success/10 text-success",
      link: "/recipes",
    },
    {
      title: t("lowStockAlerts"),
      value: stats?.low_stock_alerts || 0,
      icon: AlertTriangle,
      color: "bg-warning/10 text-warning",
      link: "/inventory",
    },
  ];

  return (
    <Layout>
      <div className="space-y-8" data-testid="dashboard-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              {t("dashboard")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === "es"
                ? "Resumen de tu negocio de eventos"
                : "Overview of your event business"}
            </p>
          </div>
          <Link to="/events">
            <Button className="rounded-full gap-2" data-testid="new-event-btn">
              <Calendar className="w-4 h-4" />
              {t("addEvent")}
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Link key={index} to={card.link}>
                <Card
                  className="hover:shadow-card transition-all duration-300 cursor-pointer group"
                  data-testid={`stat-card-${index}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{card.title}</p>
                        <p className="text-3xl font-heading font-bold mt-2">
                          {loading ? "..." : card.value}
                        </p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl ${card.color} flex items-center justify-center`}>
                        <Icon className="w-6 h-6" strokeWidth={1.5} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-4 text-sm text-muted-foreground group-hover:text-primary transition-colors">
                      <span>{language === "es" ? "Ver detalles" : "View details"}</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Pipeline Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">{t("salesPipeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pipelineData} layout="vertical">
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={100} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3A4D3F" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  {t("noResults")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Events */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-lg">{t("recentEvents")}</CardTitle>
              <Link to="/events" className="text-sm text-primary hover:underline">
                {language === "es" ? "Ver todos" : "View all"}
              </Link>
            </CardHeader>
            <CardContent>
              {stats?.recent_events?.length > 0 ? (
                <div className="space-y-4">
                  {stats.recent_events.map((event, index) => (
                    <Link
                      key={event.event_id}
                      to={`/events/${event.event_id}`}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors"
                      data-testid={`recent-event-${index}`}
                    >
                      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-secondary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{event.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(event.event_date).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          event.status === "confirmed"
                            ? "bg-success/10 text-success"
                            : event.status === "planning"
                            ? "bg-info/10 text-info"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t(event.status)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                  <Calendar className="w-12 h-12 mb-4 opacity-50" />
                  <p>{t("noResults")}</p>
                  <Link to="/events" className="mt-4">
                    <Button variant="outline" size="sm">
                      {t("addEvent")}
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">
              {language === "es" ? "Acciones Rápidas" : "Quick Actions"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Link to="/crm">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <Users className="w-5 h-5" />
                  <span className="text-sm">{t("addClient")}</span>
                </Button>
              </Link>
              <Link to="/events">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <Calendar className="w-5 h-5" />
                  <span className="text-sm">{t("addEvent")}</span>
                </Button>
              </Link>
              <Link to="/recipes/new">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <ChefHat className="w-5 h-5" />
                  <span className="text-sm">{t("addRecipe")}</span>
                </Button>
              </Link>
              <Link to="/inventory">
                <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm">{t("inventory")}</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
