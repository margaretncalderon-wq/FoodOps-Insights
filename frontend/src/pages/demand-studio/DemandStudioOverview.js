import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { 
  Target, DollarSign, Users, Briefcase, 
  TrendingUp, Loader2, Monitor, MapPin, Zap, ShieldCheck
} from "lucide-react";
import GlobalMarketingCalendar from "../../components/demand-studio/GlobalMarketingCalendar";

const API = process.env.REACT_APP_BACKEND_URL;

export default function DemandStudioOverview() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeCampaigns: 0,
    spendMTD: 0,
    spendQTD: 0,
    leadsLinked: 0,
    opportunitiesLinked: 0,
    onlineSpend: 0,
    offlineSpend: 0
  });
  const [userRole, setUserRole] = useState(null);
  const [hasFullAccess, setHasFullAccess] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // First check user role via my-stats endpoint
      const myStatsResponse = await axios.get(`${API}/api/demand-studio/my-stats`, { withCredentials: true });
      const myStats = myStatsResponse.data;
      
      setUserRole(myStats.role);
      setHasFullAccess(myStats.has_full_access !== false);
      
      if (myStats.role === "marketing_partner") {
        // Use limited stats for marketing partners
        setStats({
          activeCampaigns: myStats.activeCampaigns || 0,
          leadsLinked: myStats.leadsLinked || 0,
          activationsCount: myStats.activationsCount || 0,
          assignedCampaigns: myStats.assignedCampaigns || 0
        });
      } else {
        // Full stats for other roles
        const response = await axios.get(`${API}/api/demand-studio/stats`, { withCredentials: true });
        setStats(response.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Marketing Partner View (Restricted)
  if (userRole === "marketing_partner") {
    return (
      <div className="space-y-6" data-testid="demand-studio-overview-partner">
        {/* Role Banner */}
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold text-purple-900 dark:text-purple-100">
                  {isEs ? "Vista Marketing Partner" : "Marketing Partner View"}
                </p>
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  {isEs 
                    ? "Tienes acceso a campañas asignadas. Contacta a tu administrador para más acceso." 
                    : "You have access to assigned campaigns. Contact your admin for more access."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Limited Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.assignedCampaigns || 0}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Campañas Asignadas" : "Assigned Campaigns"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.activeCampaigns || 0}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Activas" : "Active"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.leadsLinked || 0}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Leads Vinculados" : "Leads Linked"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.activationsCount || 0}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Activaciones" : "Activations"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Card */}
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {isEs 
                ? "Navega a la pestaña 'Campaigns' para ver tus campañas asignadas."
                : "Navigate to the 'Campaigns' tab to view your assigned campaigns."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Full Access View (Owner, Admin, etc.)
  return (
    <div className="space-y-6" data-testid="demand-studio-overview">
      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeCampaigns}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Campañas Activas" : "Active Campaigns"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.spendMTD)}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Gasto MTD" : "Spend MTD"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.leadsLinked}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Leads Vinculados" : "Leads Linked"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.opportunitiesLinked}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Oportunidades" : "Opportunities"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spend Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {isEs ? "Gasto por Período" : "Spend by Period"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">MTD (Month to Date)</span>
                <span className="font-semibold">{formatCurrency(stats.spendMTD)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">QTD (Quarter to Date)</span>
                <span className="font-semibold">{formatCurrency(stats.spendQTD)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {isEs ? "Online vs Offline" : "Online vs Offline"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Online</span>
                </div>
                <span className="font-semibold">{formatCurrency(stats.onlineSpend)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">Offline</span>
                </div>
                <span className="font-semibold">{formatCurrency(stats.offlineSpend)}</span>
              </div>
              {(stats.onlineSpend + stats.offlineSpend) > 0 && (
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500" 
                    style={{ width: `${(stats.onlineSpend / (stats.onlineSpend + stats.offlineSpend)) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Marketing Calendar */}
      <GlobalMarketingCalendar />
    </div>
  );
}
