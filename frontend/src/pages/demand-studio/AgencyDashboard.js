// pages/demand-studio/AgencyDashboard.js - Multi-client dashboard for agencies
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Building2, Calendar, Lightbulb, FileText, Clock, CheckCircle,
  AlertCircle, Search, RefreshCw, ExternalLink, Users, TrendingUp,
  LayoutGrid, List, Filter, Inbox, Eye, ThumbsUp, ThumbsDown,
  Instagram, Image, Video
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

export default function AgencyDashboard() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid or list
  const [stats, setStats] = useState({ total: 0, pendingApproval: 0, scheduledThisWeek: 0 });
  const [activeTab, setActiveTab] = useState("clients");
  const [pendingItems, setPendingItems] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/agency/clients-overview`, { withCredentials: true });
      setClients(res.data.clients || []);
      setStats(res.data.stats || { total: 0, pendingApproval: 0, scheduledThisWeek: 0 });
    } catch (err) {
      console.error("Error fetching clients:", err);
      // If endpoint doesn't exist yet, use organizations
      try {
        const orgsRes = await axios.get(`${API}/api/org/my-organizations`, { withCredentials: true });
        const orgs = orgsRes.data || [];
        // Filter to only show orgs where user is collaborator (not owner)
        const clientOrgs = orgs.filter(o => 
          o.role === "social_contributor" || o.role === "social_viewer"
        );
        setClients(clientOrgs.map(o => ({
          company_id: o.organization.company_id,
          name: o.organization.name,
          logo_url: o.organization.logo_url,
          role: o.role,
          is_active: o.is_active,
          stats: { scheduled: 0, ideas: 0, pending: 0, published: 0 }
        })));
      } catch (e) {
        console.error("Error fetching organizations:", e);
      }
    }
    setLoading(false);
  }, []);

  const fetchPendingApprovals = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await axios.get(`${API}/api/agency/pending-approvals`, { withCredentials: true });
      setPendingItems(res.data.pending || []);
    } catch (err) {
      console.error("Error fetching pending approvals:", err);
    }
    setLoadingPending(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    if (activeTab === "approvals") {
      fetchPendingApprovals();
    }
  }, [activeTab, fetchPendingApprovals]);

  const handleSwitchToClient = async (companyId) => {
    try {
      await axios.post(`${API}/api/org/switch/${companyId}`, {}, { withCredentials: true });
      toast.success(isEs ? "Cambiando a cliente..." : "Switching to client...");
      // Redirect to demand studio
      window.location.href = "/demand-studio/social";
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error switching organization");
    }
  };

  const handleApprovePost = async (postId, companyId) => {
    try {
      // First switch to the client's org context
      await axios.post(`${API}/api/org/switch/${companyId}`, {}, { withCredentials: true });
      // Then approve the post
      await axios.patch(`${API}/api/demand-studio/social/posts/${postId}`, {
        status: "scheduled",
        needs_approval: false
      }, { withCredentials: true });
      toast.success(isEs ? "Post aprobado" : "Post approved");
      fetchPendingApprovals();
      fetchClients(); // Refresh stats
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error approving post");
    }
  };

  const handleRejectPost = async (postId, companyId) => {
    try {
      // First switch to the client's org context
      await axios.post(`${API}/api/org/switch/${companyId}`, {}, { withCredentials: true });
      // Then reject - just mark as draft without approval needed
      await axios.patch(`${API}/api/demand-studio/social/posts/${postId}`, {
        status: "draft",
        needs_approval: false,
        rejection_note: isEs ? "Rechazado por la empresa" : "Rejected by company"
      }, { withCredentials: true });
      toast.success(isEs ? "Post rechazado" : "Post rejected");
      fetchPendingApprovals();
      fetchClients(); // Refresh stats
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error rejecting post");
    }
  };

  const filteredClients = clients.filter(client =>
    client.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role) => {
    if (role === "social_contributor") {
      return <Badge variant="default">{isEs ? "Colaborador" : "Contributor"}</Badge>;
    }
    if (role === "social_viewer") {
      return <Badge variant="secondary">{isEs ? "Visor" : "Viewer"}</Badge>;
    }
    return <Badge variant="outline">{role}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="agency-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" />
            {isEs ? "Panel de Agencia" : "Agency Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            {isEs 
              ? "Gestiona el contenido de todos tus clientes desde un solo lugar"
              : "Manage content for all your clients from one place"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchClients}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === "clients" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setActiveTab("clients")}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Clientes" : "Clients"}</p>
                <p className="text-2xl font-bold">{clients.length}</p>
              </div>
              <Building2 className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${activeTab === "approvals" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setActiveTab("approvals")}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Pendientes Aprobación" : "Pending Approval"}</p>
                <p className="text-2xl font-bold">{stats.pendingApproval}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Programados Esta Semana" : "Scheduled This Week"}</p>
                <p className="text-2xl font-bold">{stats.scheduledThisWeek}</p>
              </div>
              <Calendar className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Ideas Totales" : "Total Ideas"}</p>
                <p className="text-2xl font-bold">
                  {clients.reduce((sum, c) => sum + (c.stats?.ideas || 0), 0)}
                </p>
              </div>
              <Lightbulb className="w-8 h-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="clients" className="gap-2">
            <Building2 className="w-4 h-4" />
            {isEs ? "Clientes" : "Clients"} ({clients.length})
          </TabsTrigger>
          <TabsTrigger value="approvals" className="gap-2">
            <Inbox className="w-4 h-4" />
            {isEs ? "Cola de Aprobación" : "Approval Queue"} 
            {stats.pendingApproval > 0 && (
              <Badge variant="destructive" className="ml-1">{stats.pendingApproval}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Clients Tab */}
        <TabsContent value="clients" className="mt-4 space-y-4">
          {/* Search & Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isEs ? "Buscar cliente..." : "Search client..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex border rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Clients Grid/List */}
          {filteredClients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {isEs ? "No hay clientes" : "No clients yet"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {isEs 
                    ? "Cuando una empresa te agregue como colaborador, aparecerá aquí"
                    : "When a company adds you as a collaborator, they'll appear here"}
                </p>
              </CardContent>
            </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <Card 
              key={client.company_id} 
              className={`cursor-pointer transition-all hover:shadow-md ${client.is_active ? "ring-2 ring-primary" : ""}`}
              onClick={() => handleSwitchToClient(client.company_id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {client.logo_url ? (
                      <img 
                        src={client.logo_url} 
                        alt={client.name}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                        <span className="text-white font-bold">
                          {client.name?.[0]?.toUpperCase() || "?"}
                        </span>
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-base">{client.name}</CardTitle>
                      {getRoleBadge(client.role)}
                    </div>
                  </div>
                  {client.is_active && (
                    <Badge variant="outline" className="text-green-600 border-green-200">
                      {isEs ? "Activo" : "Active"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span>{client.stats?.scheduled || 0} {isEs ? "programados" : "scheduled"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    <span>{client.stats?.ideas || 0} ideas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    <span>{client.stats?.pending || 0} {isEs ? "pendientes" : "pending"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>{client.stats?.published || 0} {isEs ? "publicados" : "published"}</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-4" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {isEs ? "Abrir Demand Studio" : "Open Demand Studio"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">{isEs ? "Cliente" : "Client"}</th>
                  <th className="text-left p-4 font-medium">{isEs ? "Rol" : "Role"}</th>
                  <th className="text-center p-4 font-medium">{isEs ? "Programados" : "Scheduled"}</th>
                  <th className="text-center p-4 font-medium">Ideas</th>
                  <th className="text-center p-4 font-medium">{isEs ? "Pendientes" : "Pending"}</th>
                  <th className="text-right p-4 font-medium">{isEs ? "Acciones" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr 
                    key={client.company_id} 
                    className={`border-b hover:bg-muted/50 ${client.is_active ? "bg-primary/5" : ""}`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {client.logo_url ? (
                          <img 
                            src={client.logo_url} 
                            alt={client.name}
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                            <span className="text-white text-sm font-bold">
                              {client.name?.[0]?.toUpperCase() || "?"}
                            </span>
                          </div>
                        )}
                        <span className="font-medium">{client.name}</span>
                        {client.is_active && (
                          <Badge variant="outline" className="text-green-600 border-green-200 text-xs">
                            {isEs ? "Activo" : "Active"}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-4">{getRoleBadge(client.role)}</td>
                    <td className="p-4 text-center">{client.stats?.scheduled || 0}</td>
                    <td className="p-4 text-center">{client.stats?.ideas || 0}</td>
                    <td className="p-4 text-center">
                      {(client.stats?.pending || 0) > 0 ? (
                        <Badge variant="destructive">{client.stats?.pending}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleSwitchToClient(client.company_id)}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {isEs ? "Abrir" : "Open"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        {/* Approval Queue Tab */}
        <TabsContent value="approvals" className="mt-4">
          {loadingPending ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto text-green-500 opacity-50 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {isEs ? "¡Todo al día!" : "All caught up!"}
                </h3>
                <p className="text-muted-foreground">
                  {isEs 
                    ? "No hay posts pendientes de aprobación"
                    : "No posts pending approval"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {pendingItems.length} {isEs ? "posts pendientes" : "pending posts"}
                </p>
                <Button variant="outline" size="sm" onClick={fetchPendingApprovals}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {isEs ? "Actualizar" : "Refresh"}
                </Button>
              </div>
              
              {pendingItems.map((post) => (
                <Card key={post.post_id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex">
                      {/* Preview Image/Video */}
                      <div className="w-32 h-32 bg-muted flex-shrink-0 flex items-center justify-center">
                        {post.media_url ? (
                          <img 
                            src={post.media_url} 
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : post.content_type === "video" ? (
                          <Video className="w-8 h-8 text-muted-foreground" />
                        ) : (
                          <Image className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {post.company_logo ? (
                              <img 
                                src={post.company_logo} 
                                alt={post.company_name}
                                className="w-6 h-6 rounded"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                                <span className="text-white text-xs font-bold">
                                  {post.company_name?.[0]?.toUpperCase() || "?"}
                                </span>
                              </div>
                            )}
                            <span className="font-medium text-sm">{post.company_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {post.platforms?.map(p => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {p === "instagram" && <Instagram className="w-3 h-3 mr-1" />}
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <p className="text-sm line-clamp-2 mb-3">
                          {post.caption || (isEs ? "Sin caption" : "No caption")}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {post.scheduled_at 
                              ? new Date(post.scheduled_at).toLocaleString()
                              : (isEs ? "Sin programar" : "Not scheduled")}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleSwitchToClient(post.company_id)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              {isEs ? "Ver" : "View"}
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => handleRejectPost(post.post_id, post.company_id)}
                            >
                              <ThumbsDown className="w-4 h-4 mr-1" />
                              {isEs ? "Rechazar" : "Reject"}
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => handleApprovePost(post.post_id, post.company_id)}
                            >
                              <ThumbsUp className="w-4 h-4 mr-1" />
                              {isEs ? "Aprobar" : "Approve"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
