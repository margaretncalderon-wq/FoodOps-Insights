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
  Clock, CheckCircle, UserPlus, Mail, Star, AlertCircle, Activity
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
              System Pulse
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === "es"
                ? "Vista en tiempo real de lo activo, alineado y en movimiento"
                : "A real-time view of what's active, aligned, and in motion"}
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

        {/* NEW: Tasks Due & New Leads Row */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Tasks Due Today & Overdue */}
          <Card data-testid="tasks-due-section">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <CardTitle className="font-heading text-lg">
                  {language === "es" ? "Tareas Pendientes" : "Tasks Due"}
                </CardTitle>
              </div>
              <div className="flex gap-2">
                {stats?.tasks_overdue_count > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {stats.tasks_overdue_count} {language === "es" ? "atrasadas" : "overdue"}
                  </Badge>
                )}
                {stats?.tasks_due_count > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {stats.tasks_due_count} {language === "es" ? "hoy" : "today"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(stats?.tasks_overdue?.length > 0 || stats?.tasks_due_today?.length > 0) ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {/* Overdue tasks first */}
                  {stats.tasks_overdue?.map((task, index) => (
                    <Link
                      key={`overdue-${task.task_id || index}`}
                      to={`/events/${task.event_id}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                      data-testid={`task-overdue-${index}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{task.title}</p>
                        <p className="text-xs text-red-600">
                          {task.event_name} • {language === "es" ? "Venció" : "Due"}: {new Date(task.due_date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${
                        task.priority === "high" ? "border-red-500 text-red-600" :
                        task.priority === "medium" ? "border-yellow-500 text-yellow-600" :
                        "border-gray-400 text-gray-600"
                      }`}>
                        {task.priority === "high" ? (language === "es" ? "Alta" : "High") :
                         task.priority === "medium" ? (language === "es" ? "Media" : "Medium") :
                         (language === "es" ? "Baja" : "Low")}
                      </Badge>
                    </Link>
                  ))}
                  {/* Today's tasks */}
                  {stats.tasks_due_today?.map((task, index) => (
                    <Link
                      key={`today-${task.task_id || index}`}
                      to={`/events/${task.event_id}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 transition-colors"
                      data-testid={`task-today-${index}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{task.title}</p>
                        <p className="text-xs text-yellow-700">
                          {task.event_name} • {language === "es" ? "Hoy" : "Today"}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${
                        task.priority === "high" ? "border-red-500 text-red-600" :
                        task.priority === "medium" ? "border-yellow-500 text-yellow-600" :
                        "border-gray-400 text-gray-600"
                      }`}>
                        {task.priority === "high" ? (language === "es" ? "Alta" : "High") :
                         task.priority === "medium" ? (language === "es" ? "Media" : "Medium") :
                         (language === "es" ? "Baja" : "Low")}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mb-4 opacity-50 text-green-500" />
                  <p className="font-medium text-green-600">
                    {language === "es" ? "¡Todo al día!" : "All caught up!"}
                  </p>
                  <p className="text-sm">
                    {language === "es" ? "No hay tareas pendientes" : "No pending tasks"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* New Leads */}
          <Card data-testid="new-leads-section">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <CardTitle className="font-heading text-lg">
                  {language === "es" ? "Nuevos Leads" : "New Leads"}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {stats?.new_leads_count > 0 && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                    {stats.new_leads_count} {language === "es" ? "nuevos" : "new"}
                  </Badge>
                )}
                <Link to="/crm/inbound" className="text-sm text-primary hover:underline">
                  {language === "es" ? "Ver todos" : "View all"}
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {stats?.new_leads?.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {stats.new_leads.map((lead, index) => (
                    <Link
                      key={lead.lead_id}
                      to="/crm/inbound"
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors border border-muted"
                      data-testid={`new-lead-${index}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Star className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate text-sm">{lead.lead_name}</p>
                          <Badge className="bg-blue-500 text-white text-xs">NEW</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          <span className="truncate">{lead.email}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs mb-1">
                          {lead.source}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {lead.event_type}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                  <UserPlus className="w-12 h-12 mb-4 opacity-50" />
                  <p>{language === "es" ? "No hay leads nuevos" : "No new leads"}</p>
                  <Link to="/crm/inbound" className="mt-4">
                    <Button variant="outline" size="sm">
                      {language === "es" ? "Ver todos los leads" : "View all leads"}
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
