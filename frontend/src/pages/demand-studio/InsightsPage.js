import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Users, Target, BarChart3, Mail, Instagram, Youtube, Play, Eye, Heart, MousePointer, ArrowRight, RefreshCw, Megaphone, Send, ExternalLink, ChevronRight } from "lucide-react";

import { KoraLoader } from "../../components/KoraLoader";
import { API_BASE as API } from "../../utils/api";

const formatNumber = (num) => {
  if (!num) return "0";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount || 0);
};

const formatPercent = (num) => `${(num || 0).toFixed(1)}%`;

export default function InsightsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data states
  const [campaigns, setCampaigns] = useState({ summary: {}, campaigns: [] });
  const [socialMetrics, setSocialMetrics] = useState({ connections: [], manual_entries: [], total_followers: 0 });
  const [emailMetrics, setEmailMetrics] = useState({ emails: [], summary: {} });

  const fetchAllData = useCallback(async () => {
    try {
      const [campaignsRes, socialRes, emailsRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/insights`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/social-metrics/dashboard`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/emails`, { withCredentials: true })
      ]);
      
      setCampaigns(campaignsRes.data);
      setSocialMetrics(socialRes.data);
      
      // Calculate email summary
      const emails = emailsRes.data || [];
      const emailSummary = {
        total_sent: emails.reduce((sum, e) => sum + (e.sent_count || 0), 0),
        total_opens: emails.reduce((sum, e) => sum + (e.open_count || 0), 0),
        total_clicks: emails.reduce((sum, e) => sum + (e.click_count || 0), 0),
        total_bounces: emails.reduce((sum, e) => sum + (e.bounce_count || 0), 0),
        total_unsubscribes: emails.reduce((sum, e) => sum + (e.unsubscribe_count || 0), 0),
        total_emails: emails.length
      };
      emailSummary.open_rate = emailSummary.total_sent > 0 
        ? (emailSummary.total_opens / emailSummary.total_sent) * 100 
        : 0;
      emailSummary.click_rate = emailSummary.total_opens > 0 
        ? (emailSummary.total_clicks / emailSummary.total_opens) * 100 
        : 0;
      
      setEmailMetrics({ emails, summary: emailSummary });
    } catch (error) {
      console.error("Error fetching insights:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAllData();
  };

  // Get latest social metrics
  const latestSocial = socialMetrics.manual_entries?.[0] || {};
  const socialConnections = socialMetrics.connections || [];
  const totalFollowers = socialMetrics.total_followers || latestSocial.followers_count || 0;

  // Prepare trend data from manual entries
  const socialTrendData = (socialMetrics.manual_entries || [])
    .slice(0, 14)
    .reverse()
    .map(e => ({
      date: e.entry_date?.slice(5) || "",
      followers: e.followers_count || 0,
      reach: e.reach || 0
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={32} />
      </div>
    );
  }

  const { summary } = campaigns;

  return (
    <div className="space-y-6" data-testid="insights-hub">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{isEs ? "Centro de Insights" : "Insights Hub"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Resumen de todo tu marketing en un solo lugar" : "All your marketing metrics in one place"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Main KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-violet-600" />
              <span className="text-xs text-violet-600">{isEs ? "Seguidores" : "Followers"}</span>
            </div>
            <p className="text-2xl font-bold text-violet-800">{formatNumber(totalFollowers)}</p>
            <p className="text-xs text-violet-600">{isEs ? "Redes sociales" : "Social media"}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-600">{isEs ? "Emails Enviados" : "Emails Sent"}</span>
            </div>
            <p className="text-2xl font-bold text-blue-800">{formatNumber(emailMetrics.summary.total_sent)}</p>
            <p className="text-xs text-blue-600">Open rate: {formatPercent(emailMetrics.summary.open_rate)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-600">Leads</span>
            </div>
            <p className="text-2xl font-bold text-green-800">{summary.total_leads_linked || 0}</p>
            <p className="text-xs text-green-600">{isEs ? "Vinculados a campañas" : "Linked to campaigns"}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-amber-600">{isEs ? "Gasto Total" : "Total Spend"}</span>
            </div>
            <p className="text-2xl font-bold text-amber-800">{formatCurrency(summary.total_spend)}</p>
            <p className="text-xs text-amber-600">CPL: {formatCurrency(summary.cost_per_lead)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Three Column Layout for Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Social Media Summary */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Instagram className="w-5 h-5 text-pink-500" />
                {isEs ? "Redes Sociales" : "Social Media"}
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs"
                onClick={() => navigate("/demand-studio/social-media")}
              >
                {isEs ? "Ver más" : "See more"} <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Platform breakdown */}
            <div className="space-y-3">
              {["instagram", "tiktok", "youtube"].map(platform => {
                const entry = (socialMetrics.manual_entries || []).find(e => e.platform === platform);
                const connection = socialConnections.find(c => c.platform === platform);
                const data = entry || connection;
                
                return (
                  <div key={platform} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {platform === "instagram" && <Instagram className="w-4 h-4 text-pink-500" />}
                      {platform === "tiktok" && <Play className="w-4 h-4" />}
                      {platform === "youtube" && <Youtube className="w-4 h-4 text-red-500" />}
                      <span className="text-sm capitalize">{platform}</span>
                    </div>
                    <div className="text-right">
                      {data ? (
                        <>
                          <p className="font-medium">{formatNumber(data.followers_count)}</p>
                          <p className="text-xs text-muted-foreground">{isEs ? "seguidores" : "followers"}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{isEs ? "Sin datos" : "No data"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mini metrics */}
            {latestSocial.reach && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div className="text-center p-2">
                  <Eye className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                  <p className="font-medium">{formatNumber(latestSocial.reach)}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Alcance" : "Reach"}</p>
                </div>
                <div className="text-center p-2">
                  <Heart className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                  <p className="font-medium">{formatPercent(latestSocial.engagement_rate)}</p>
                  <p className="text-xs text-muted-foreground">Engagement</p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!latestSocial.followers_count && socialConnections.length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">
                  {isEs ? "Sin métricas de redes sociales" : "No social media metrics"}
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate("/demand-studio/social-media")}
                >
                  {isEs ? "Agregar métricas" : "Add metrics"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Marketing Summary */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-500" />
                Email Marketing
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs"
                onClick={() => navigate("/demand-studio/email-marketing")}
              >
                {isEs ? "Ver más" : "See more"} <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {emailMetrics.summary.total_emails > 0 ? (
              <>
                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <Send className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                    <p className="text-lg font-bold text-blue-800">{formatNumber(emailMetrics.summary.total_sent)}</p>
                    <p className="text-xs text-blue-600">{isEs ? "Enviados" : "Sent"}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <Eye className="w-4 h-4 mx-auto text-green-600 mb-1" />
                    <p className="text-lg font-bold text-green-800">{formatPercent(emailMetrics.summary.open_rate)}</p>
                    <p className="text-xs text-green-600">Open Rate</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-violet-50 rounded-lg text-center">
                    <MousePointer className="w-4 h-4 mx-auto text-violet-600 mb-1" />
                    <p className="text-lg font-bold text-violet-800">{formatPercent(emailMetrics.summary.click_rate)}</p>
                    <p className="text-xs text-violet-600">CTR</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg text-center">
                    <TrendingDown className="w-4 h-4 mx-auto text-amber-600 mb-1" />
                    <p className="text-lg font-bold text-amber-800">{formatNumber(emailMetrics.summary.total_unsubscribes)}</p>
                    <p className="text-xs text-amber-600">{isEs ? "Bajas" : "Unsubs"}</p>
                  </div>
                </div>

                {/* Recent emails */}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">{isEs ? "Emails recientes" : "Recent emails"}</p>
                  {emailMetrics.emails.slice(0, 2).map(email => (
                    <div key={email.email_id} className="flex items-center justify-between py-1 text-sm">
                      <span className="truncate max-w-[150px]">{email.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {email.open_count || 0} opens
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <Mail className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  {isEs ? "Sin campañas de email" : "No email campaigns"}
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate("/demand-studio/email-marketing")}
                >
                  {isEs ? "Crear campaña" : "Create campaign"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaigns Summary */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-purple-500" />
                {isEs ? "Campañas" : "Campaigns"}
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs"
                onClick={() => navigate("/demand-studio/campaigns")}
              >
                {isEs ? "Ver más" : "See more"} <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Campaign stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-purple-50 rounded-lg text-center">
                <Target className="w-4 h-4 mx-auto text-purple-600 mb-1" />
                <p className="text-lg font-bold text-purple-800">{summary.total_campaigns || 0}</p>
                <p className="text-xs text-purple-600">{isEs ? "Total" : "Total"}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <TrendingUp className="w-4 h-4 mx-auto text-green-600 mb-1" />
                <p className="text-lg font-bold text-green-800">{summary.active_campaigns || 0}</p>
                <p className="text-xs text-green-600">{isEs ? "Activas" : "Active"}</p>
              </div>
            </div>

            {/* Budget utilization */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{isEs ? "Presupuesto" : "Budget"}</span>
                <span className="font-medium">{formatCurrency(summary.total_budget)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    (summary.budget_utilization || 0) > 90 
                      ? "bg-red-500" 
                      : "bg-gradient-to-r from-purple-500 to-pink-500"
                  }`}
                  style={{ width: `${Math.min(summary.budget_utilization || 0, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{isEs ? "Gastado" : "Spent"}: {formatCurrency(summary.total_spend)}</span>
                <span className={summary.budget_utilization > 90 ? "text-red-500" : "text-green-500"}>
                  {summary.budget_utilization || 0}%
                </span>
              </div>
            </div>

            {/* ROI metrics */}
            <div className="pt-2 border-t grid grid-cols-2 gap-2">
              <div className="text-center">
                <p className="text-lg font-bold">{summary.total_leads_linked || 0}</p>
                <p className="text-xs text-muted-foreground">Leads</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{summary.total_opportunities_linked || 0}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Oportunidades" : "Opportunities"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      {socialTrendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isEs ? "Tendencia de Redes Sociales" : "Social Media Trend"}</CardTitle>
            <CardDescription>{isEs ? "Últimos 14 días" : "Last 14 days"}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={socialTrendData}>
                <defs>
                  <linearGradient id="colorFollowers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis tickFormatter={formatNumber} className="text-xs" />
                <Tooltip formatter={(value) => formatNumber(value)} />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="followers" 
                  name={isEs ? "Seguidores" : "Followers"} 
                  stroke="#8b5cf6" 
                  fillOpacity={1} 
                  fill="url(#colorFollowers)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="reach" 
                  name={isEs ? "Alcance" : "Reach"} 
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorReach)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Acciones Rápidas" : "Quick Actions"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/demand-studio/social-media")}>
              <Instagram className="w-4 h-4 mr-2" />
              {isEs ? "Agregar métricas sociales" : "Add social metrics"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/demand-studio/email-marketing")}>
              <Mail className="w-4 h-4 mr-2" />
              {isEs ? "Crear email" : "Create email"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/demand-studio/campaigns")}>
              <Megaphone className="w-4 h-4 mr-2" />
              {isEs ? "Nueva campaña" : "New campaign"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
