import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import CrossAccountDashboard from "../../pages/demand-studio/CrossAccountDashboard";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  Users, Eye, Heart, MessageCircle, Share2, TrendingUp, TrendingDown,
  Youtube, Instagram, Facebook, Plus, RefreshCw, Link2, Unlink,
  Calendar, ExternalLink, Play, Image as ImageIcon
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";

const formatNumber = (num) => {
  if (!num) return "0";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

const getPlatformIcon = (platform) => {
  switch (platform) {
    case "youtube": return <Youtube className="w-5 h-5 text-red-600" />;
    case "instagram": return <Instagram className="w-5 h-5 text-pink-600" />;
    case "facebook": return <Facebook className="w-5 h-5 text-blue-600" />;
    case "tiktok": return <Play className="w-5 h-5" />;
    default: return <Link2 className="w-5 h-5" />;
  }
};

const getPlatformColor = (platform) => {
  switch (platform) {
    case "youtube": return "#ef4444";
    case "instagram": return "#ec4899";
    case "facebook": return "#3b82f6";
    case "tiktok": return "#000000";
    default: return "#6b7280";
  }
};

export function SocialMetricsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeTab, setActiveTab] = useState("overview");
  const [connections, setConnections] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [posts, setPosts] = useState([]);
  const [manualEntries, setManualEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Manual entry dialog
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualForm, setManualForm] = useState({
    platform: "instagram",
    account_name: "",
    entry_date: new Date().toISOString().split("T")[0],
    followers_count: "",
    reach: "",
    impressions: "",
    engagement_count: "",
    engagement_rate: "",
    profile_views: "",
    website_clicks: ""
  });
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, postsRes, manualRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/social-metrics/dashboard`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/social-metrics/posts?limit=20`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/social-metrics/manual`, { withCredentials: true })
      ]);
      
      setDashboard(dashRes.data);
      setConnections(dashRes.data.connections || []);
      setPosts(postsRes.data || []);
      setManualEntries(manualRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar métricas" : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [isEs]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const handleSync = async (connectionId) => {
    setSyncing(true);
    try {
      await axios.post(`${API}/api/demand-studio/social-metrics/sync/${connectionId}`, {}, { withCredentials: true });
      toast.success(isEs ? "Métricas sincronizadas" : "Metrics synced");
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al sincronizar" : "Failed to sync");
    } finally {
      setSyncing(false);
    }
  };

  // Connect YouTube via OAuth
  const [connectingYouTube, setConnectingYouTube] = useState(false);
  
  const handleConnectYouTube = async () => {
    setConnectingYouTube(true);
    try {
      const res = await axios.get(`${API}/api/demand-studio/social-metrics/youtube/auth-url`, { 
        withCredentials: true 
      });
      // Redirect to Google OAuth
      window.location.href = res.data.auth_url;
    } catch (err) {
      console.error("Failed to get YouTube auth URL:", err);
      toast.error(isEs ? "Error al iniciar conexión con YouTube" : "Failed to start YouTube connection");
      setConnectingYouTube(false);
    }
  };
  
  const handleAddManual = async () => {
    try {
      const payload = {
        ...manualForm,
        followers_count: manualForm.followers_count ? parseInt(manualForm.followers_count) : null,
        reach: manualForm.reach ? parseInt(manualForm.reach) : null,
        impressions: manualForm.impressions ? parseInt(manualForm.impressions) : null,
        engagement_count: manualForm.engagement_count ? parseInt(manualForm.engagement_count) : null,
        engagement_rate: manualForm.engagement_rate ? parseFloat(manualForm.engagement_rate) : null,
        profile_views: manualForm.profile_views ? parseInt(manualForm.profile_views) : null,
        website_clicks: manualForm.website_clicks ? parseInt(manualForm.website_clicks) : null
      };
      
      await axios.post(`${API}/api/demand-studio/social-metrics/manual`, payload, { withCredentials: true });
      toast.success(isEs ? "Métricas agregadas" : "Metrics added");
      setShowManualDialog(false);
      setManualForm({
        platform: "instagram",
        account_name: "",
        entry_date: new Date().toISOString().split("T")[0],
        followers_count: "",
        reach: "",
        impressions: "",
        engagement_count: "",
        engagement_rate: "",
        profile_views: "",
        website_clicks: ""
      });
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al agregar" : "Failed to add");
    }
  };
  
  // Prepare chart data from manual entries
  const chartData = manualEntries
    .slice(0, 30)
    .reverse()
    .map(e => ({
      date: e.entry_date?.slice(5) || "",
      followers: e.followers_count || 0,
      reach: e.reach || 0,
      engagement: e.engagement_count || 0
    }));
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{isEs ? "Métricas de Redes Sociales" : "Social Media Metrics"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Seguimiento de alcance, seguidores y engagement" : "Track reach, followers, and engagement"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
          <Button size="sm" onClick={() => setShowManualDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Agregar Manual" : "Add Manual"}
          </Button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-violet-600" />
              <span className="text-sm text-violet-600">{isEs ? "Seguidores" : "Followers"}</span>
            </div>
            <p className="text-2xl font-bold text-violet-800">
              {formatNumber(dashboard?.total_followers || manualEntries[0]?.followers_count || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-600">{isEs ? "Alcance" : "Reach"}</span>
            </div>
            <p className="text-2xl font-bold text-blue-800">
              {formatNumber(manualEntries[0]?.reach || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-5 h-5 text-pink-600" />
              <span className="text-sm text-pink-600">Engagement</span>
            </div>
            <p className="text-2xl font-bold text-pink-800">
              {formatNumber(manualEntries[0]?.engagement_count || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-amber-600">{isEs ? "Tasa Eng." : "Eng. Rate"}</span>
            </div>
            <p className="text-2xl font-bold text-amber-800">
              {manualEntries[0]?.engagement_rate?.toFixed(1) || "0"}%
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{isEs ? "Resumen" : "Overview"}</TabsTrigger>
          <TabsTrigger value="comparison" data-testid="metrics-tab-comparison">{isEs ? "Comparativa" : "Comparison"}</TabsTrigger>
          <TabsTrigger value="posts">{isEs ? "Publicaciones" : "Posts"}</TabsTrigger>
          <TabsTrigger value="connections">{isEs ? "Conexiones" : "Connections"}</TabsTrigger>
          <TabsTrigger value="history">{isEs ? "Historial" : "History"}</TabsTrigger>
        </TabsList>

        {/* Comparison Tab · Cross-account benchmark for agency */}
        <TabsContent value="comparison">
          <CrossAccountDashboard orgId={null} />
        </TabsContent>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {chartData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Tendencia de Métricas" : "Metrics Trend"}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis tickFormatter={formatNumber} className="text-xs" />
                    <Tooltip formatter={(value) => formatNumber(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="followers" name={isEs ? "Seguidores" : "Followers"} stroke="#8b5cf6" strokeWidth={2} />
                    <Line type="monotone" dataKey="reach" name={isEs ? "Alcance" : "Reach"} stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="engagement" name="Engagement" stroke="#ec4899" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">{isEs ? "Sin datos aún" : "No data yet"}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {isEs 
                    ? "Conecta tus redes sociales o agrega métricas manualmente"
                    : "Connect your social accounts or add metrics manually"}
                </p>
                <Button onClick={() => setShowManualDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Agregar Métricas" : "Add Metrics"}
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Platform breakdown */}
          {manualEntries.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {["instagram", "tiktok", "youtube"].map(platform => {
                const platformEntries = manualEntries.filter(e => e.platform === platform);
                const latest = platformEntries[0];
                
                return (
                  <Card key={platform}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        {getPlatformIcon(platform)}
                        <span className="font-medium capitalize">{platform}</span>
                        {latest && <Badge variant="secondary" className="ml-auto text-xs">{latest.account_name}</Badge>}
                      </div>
                      {latest ? (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{isEs ? "Seguidores" : "Followers"}</span>
                            <span className="font-medium">{formatNumber(latest.followers_count)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{isEs ? "Alcance" : "Reach"}</span>
                            <span className="font-medium">{formatNumber(latest.reach)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Engagement</span>
                            <span className="font-medium">{latest.engagement_rate?.toFixed(1) || 0}%</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{isEs ? "Sin datos" : "No data"}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        {/* Posts Tab */}
        <TabsContent value="posts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Post" : "Post"}</TableHead>
                    <TableHead>{isEs ? "Plataforma" : "Platform"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Alcance" : "Reach"}</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">{isEs ? "Comentarios" : "Comments"}</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Sin publicaciones sincronizadas" : "No synced posts"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    posts.map(post => (
                      <TableRow key={post.post_metrics_id || post.platform_post_id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {post.thumbnail_url ? (
                              <img src={post.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="max-w-xs">
                              <p className="text-sm font-medium truncate">{post.title || post.caption?.slice(0, 50) || "Sin título"}</p>
                              <p className="text-xs text-muted-foreground">{post.published_at?.split("T")[0]}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getPlatformIcon(post.platform)}
                            <span className="text-xs capitalize">{post.platform}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(post.reach)}</TableCell>
                        <TableCell className="text-right">{formatNumber(post.likes)}</TableCell>
                        <TableCell className="text-right">{formatNumber(post.comments)}</TableCell>
                        <TableCell className="text-right">{formatNumber(post.shares)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Connections Tab */}
        <TabsContent value="connections">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Connected accounts */}
            {connections.map(conn => (
              <Card key={conn.connection_id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {conn.profile_picture ? (
                        <img src={conn.profile_picture} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        getPlatformIcon(conn.platform)
                      )}
                      <div>
                        <p className="font-medium">{conn.account_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{conn.platform}</p>
                      </div>
                    </div>
                    <Badge variant={conn.status === "active" ? "default" : "secondary"}>
                      {conn.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-3">
                    <span className="text-muted-foreground">{isEs ? "Seguidores" : "Followers"}</span>
                    <span className="font-medium">{formatNumber(conn.followers_count)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleSync(conn.connection_id)} disabled={syncing}>
                      <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
                      Sync
                    </Button>
                  </div>
                  {conn.last_sync_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {isEs ? "Última sync:" : "Last sync:"} {formatDateOnly(conn.last_sync_at, language)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            
            {/* Connect new account cards */}
            {[
              { platform: "youtube", name: "YouTube", color: "red", available: true },
              { platform: "instagram", name: "Instagram", color: "pink", available: false },
              { platform: "tiktok", name: "TikTok", color: "gray", available: false }
            ].filter(p => !connections.find(c => c.platform === p.platform)).map(platform => (
              <Card key={platform.platform} className="border-dashed">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-4">
                    {getPlatformIcon(platform.platform)}
                    <div>
                      <p className="font-medium">{platform.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {platform.available 
                          ? (isEs ? "Disponible para conectar" : "Available to connect")
                          : (isEs ? "Próximamente" : "Coming soon")}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    disabled={!platform.available || (platform.platform === "youtube" && connectingYouTube)}
                    onClick={platform.platform === "youtube" ? handleConnectYouTube : undefined}
                    data-testid={`connect-${platform.platform}-btn`}
                  >
                    {platform.platform === "youtube" && connectingYouTube ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        {isEs ? "Conectando..." : "Connecting..."}
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        {isEs ? "Conectar" : "Connect"}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        
        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Plataforma" : "Platform"}</TableHead>
                    <TableHead>{isEs ? "Cuenta" : "Account"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Seguidores" : "Followers"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Alcance" : "Reach"}</TableHead>
                    <TableHead className="text-right">Engagement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manualEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Sin entradas de historial" : "No history entries"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    manualEntries.map(entry => (
                      <TableRow key={entry.entry_id}>
                        <TableCell>{entry.entry_date}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getPlatformIcon(entry.platform)}
                            <span className="capitalize">{entry.platform}</span>
                          </div>
                        </TableCell>
                        <TableCell>{entry.account_name}</TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(entry.followers_count)}</TableCell>
                        <TableCell className="text-right">{formatNumber(entry.reach)}</TableCell>
                        <TableCell className="text-right">{entry.engagement_rate?.toFixed(1) || 0}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Manual Entry Dialog */}
      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Métricas Manualmente" : "Add Metrics Manually"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Ingresa las métricas de tu cuenta de redes sociales" : "Enter your social media account metrics"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Plataforma" : "Platform"}</Label>
                <Select value={manualForm.platform} onValueChange={(v) => setManualForm({...manualForm, platform: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Fecha" : "Date"}</Label>
                <Input 
                  type="date" 
                  value={manualForm.entry_date}
                  onChange={(e) => setManualForm({...manualForm, entry_date: e.target.value})}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{isEs ? "Nombre de Cuenta" : "Account Name"}</Label>
              <Input 
                placeholder="@username"
                value={manualForm.account_name}
                onChange={(e) => setManualForm({...manualForm, account_name: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Seguidores" : "Followers"}</Label>
                <Input 
                  type="number"
                  placeholder="15000"
                  value={manualForm.followers_count}
                  onChange={(e) => setManualForm({...manualForm, followers_count: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Alcance" : "Reach"}</Label>
                <Input 
                  type="number"
                  placeholder="45000"
                  value={manualForm.reach}
                  onChange={(e) => setManualForm({...manualForm, reach: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Impresiones" : "Impressions"}</Label>
                <Input 
                  type="number"
                  placeholder="120000"
                  value={manualForm.impressions}
                  onChange={(e) => setManualForm({...manualForm, impressions: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Engagement</Label>
                <Input 
                  type="number"
                  placeholder="3200"
                  value={manualForm.engagement_count}
                  onChange={(e) => setManualForm({...manualForm, engagement_count: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Tasa Engagement %" : "Engagement Rate %"}</Label>
                <Input 
                  type="number"
                  step="0.1"
                  placeholder="4.2"
                  value={manualForm.engagement_rate}
                  onChange={(e) => setManualForm({...manualForm, engagement_rate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Visitas Perfil" : "Profile Views"}</Label>
                <Input 
                  type="number"
                  placeholder="1500"
                  value={manualForm.profile_views}
                  onChange={(e) => setManualForm({...manualForm, profile_views: e.target.value})}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleAddManual} disabled={!manualForm.account_name}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
