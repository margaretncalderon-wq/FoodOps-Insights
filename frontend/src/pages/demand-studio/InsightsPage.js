import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Loader2, TrendingUp, DollarSign, Users, Target, BarChart3 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function InsightsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState({
    campaigns: [],
    summary: {}
  });

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      const response = await axios.get(`${API}/api/demand-studio/insights`, { withCredentials: true });
      setInsights(response.data);
    } catch (error) {
      console.error("Error fetching insights:", error);
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

  const { summary } = insights;

  return (
    <div className="space-y-6" data-testid="insights-page">
      <div>
        <h2 className="text-lg font-semibold">{isEs ? "Insights de Marketing" : "Marketing Insights"}</h2>
        <p className="text-sm text-muted-foreground">
          {isEs ? "Análisis de rendimiento de campañas" : "Campaign performance analysis"}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.total_campaigns || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Total Campañas" : "Total Campaigns"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.active_campaigns || 0}</p>
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
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(summary.total_spend)}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Gasto Total" : "Total Spend"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.budget_utilization || 0}%</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Uso Presupuesto" : "Budget Usage"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROI Metrics */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isEs ? "Métricas de Conversión" : "Conversion Metrics"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{isEs ? "Total Leads Vinculados" : "Total Leads Linked"}</span>
              </div>
              <span className="font-bold">{summary.total_leads_linked || 0}</span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span>{isEs ? "Total Oportunidades" : "Total Opportunities"}</span>
              </div>
              <span className="font-bold">{summary.total_opportunities_linked || 0}</span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span>{isEs ? "Costo por Lead" : "Cost per Lead"}</span>
              </div>
              <span className="font-bold text-green-600">{formatCurrency(summary.cost_per_lead)}</span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span>{isEs ? "Costo por Oportunidad" : "Cost per Opportunity"}</span>
              </div>
              <span className="font-bold text-blue-600">{formatCurrency(summary.cost_per_opportunity)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isEs ? "Resumen de Presupuesto" : "Budget Summary"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{isEs ? "Presupuesto Total" : "Total Budget"}</span>
              <span className="font-bold">{formatCurrency(summary.total_budget)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{isEs ? "Gasto Total" : "Total Spend"}</span>
              <span className="font-bold">{formatCurrency(summary.total_spend)}</span>
            </div>
            
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                style={{ width: `${Math.min(summary.budget_utilization || 0, 100)}%` }}
              />
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {isEs ? "Utilización" : "Utilization"}
              </span>
              <span className={summary.budget_utilization > 90 ? "text-red-500" : "text-green-500"}>
                {summary.budget_utilization || 0}%
              </span>
            </div>
            
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{isEs ? "Disponible" : "Available"}</span>
                <span className="font-bold text-green-600">
                  {formatCurrency((summary.total_budget || 0) - (summary.total_spend || 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance Table */}
      {insights.campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isEs ? "Rendimiento por Campaña" : "Campaign Performance"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">{isEs ? "Campaña" : "Campaign"}</th>
                    <th className="text-right py-2">{isEs ? "Presupuesto" : "Budget"}</th>
                    <th className="text-right py-2">{isEs ? "Gastado" : "Spent"}</th>
                    <th className="text-right py-2">Leads</th>
                    <th className="text-right py-2">{isEs ? "Oport." : "Opps"}</th>
                    <th className="text-right py-2">CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.campaigns.slice(0, 10).map(campaign => (
                    <tr key={campaign.campaign_id} className="border-b">
                      <td className="py-2">{campaign.name}</td>
                      <td className="text-right">{formatCurrency(campaign.budget)}</td>
                      <td className="text-right">{formatCurrency(campaign.actual_spend)}</td>
                      <td className="text-right">{campaign.leads_linked || 0}</td>
                      <td className="text-right">{campaign.opportunities_linked || 0}</td>
                      <td className="text-right">
                        {campaign.leads_linked > 0 
                          ? formatCurrency(campaign.actual_spend / campaign.leads_linked)
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
