import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { 
  Target, DollarSign, Users, Briefcase, 
  TrendingUp, Loader2, Monitor, MapPin
} from "lucide-react";

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

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/api/demand-studio/stats`, { withCredentials: true });
      setStats(response.data);
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
    </div>
  );
}
