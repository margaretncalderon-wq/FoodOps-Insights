// pages/CollaborationDashboard.js
// Clean dashboard for cross-organization collaboration

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { 
  Users, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building2, 
  Target, 
  Megaphone,
  Loader2,
  Eye,
  MessageSquare,
  Plus,
  Edit3,
  ExternalLink,
  Clock,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { formatDateOnly } from "../utils/dates";

const API = process.env.REACT_APP_BACKEND_URL;

const PERMISSION_LABELS = {
  view: { en: "View", es: "Ver", icon: Eye, color: "bg-slate-500/20 text-slate-400" },
  comment: { en: "Comment", es: "Comentar", icon: MessageSquare, color: "bg-blue-500/20 text-blue-400" },
  create: { en: "Create", es: "Crear", icon: Plus, color: "bg-green-500/20 text-green-400" },
  edit: { en: "Edit", es: "Editar", icon: Edit3, color: "bg-purple-500/20 text-purple-400" },
};

const STATUS_LABELS = {
  active: { en: "Active", es: "Activo", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  revoked: { en: "Revoked", es: "Revocado", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

export default function CollaborationDashboard() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("received");
  const [sentShares, setSentShares] = useState([]);
  const [receivedShares, setReceivedShares] = useState([]);
  const [stats, setStats] = useState({
    totalSent: 0,
    totalReceived: 0,
    activeCollaborations: 0,
    projectsShared: 0,
    campaignsShared: 0
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sentRes, receivedRes, statusRes] = await Promise.all([
        axios.get(`${API}/api/share/sent`, { withCredentials: true }),
        axios.get(`${API}/api/share/received`, { withCredentials: true }),
        axios.get(`${API}/api/share/collaboration-status`, { withCredentials: true })
      ]);
      
      const sent = sentRes.data || [];
      const received = receivedRes.data || [];
      
      setSentShares(sent);
      setReceivedShares(received);
      
      // Calculate stats
      const activeSent = sent.filter(s => s.status === "active");
      const activeReceived = received.filter(s => s.status === "active");
      
      setStats({
        totalSent: activeSent.length,
        totalReceived: activeReceived.length,
        activeCollaborations: activeSent.length + activeReceived.length,
        projectsShared: [...activeSent, ...activeReceived].filter(s => s.entity_type === "project").length,
        campaignsShared: [...activeSent, ...activeReceived].filter(s => s.entity_type === "campaign").length
      });
      
    } catch (error) {
      console.error("Error fetching collaboration data:", error);
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleNavigate = (share) => {
    if (share.entity_type === "project") {
      navigate(`/execution-hub/${share.entity_id}`);
    } else {
      navigate("/demand-studio/campaigns");
    }
  };

  const handleRevoke = async (shareId) => {
    if (!window.confirm(isEs ? "¿Revocar este acceso?" : "Revoke this access?")) return;
    
    try {
      await axios.post(`${API}/api/share/${shareId}/revoke`, {}, { withCredentials: true });
      toast.success(isEs ? "Acceso revocado" : "Access revoked");
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al revocar" : "Error revoking access");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#AED768]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="collaboration-dashboard">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-7 h-7 text-purple-400" />
            {isEs ? "Colaboraciones" : "Collaborations"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEs ? "Gestiona proyectos y campañas compartidas" : "Manage shared projects and campaigns"}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {isEs ? "Activas" : "Active"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{stats.activeCollaborations}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {isEs ? "Enviadas" : "Sent"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{stats.totalSent}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {isEs ? "Recibidas" : "Received"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{stats.totalReceived}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {isEs ? "Proyectos" : "Projects"}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{stats.projectsShared}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#AED768]/20 flex items-center justify-center">
                  <Target className="w-5 h-5 text-[#AED768]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="received" className="data-[state=active]:bg-card">
              <ArrowDownLeft className="w-4 h-4 mr-2" />
              {isEs ? "Recibidas" : "Received"} ({receivedShares.filter(s => s.status === "active").length})
            </TabsTrigger>
            <TabsTrigger value="sent" className="data-[state=active]:bg-card">
              <ArrowUpRight className="w-4 h-4 mr-2" />
              {isEs ? "Enviadas" : "Sent"} ({sentShares.filter(s => s.status === "active").length})
            </TabsTrigger>
          </TabsList>

          {/* Received Tab */}
          <TabsContent value="received" className="mt-4">
            {receivedShares.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <ArrowDownLeft className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {isEs ? "No tienes colaboraciones recibidas" : "You have no received collaborations"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {receivedShares.map((share) => (
                  <ShareCard 
                    key={share.share_id} 
                    share={share} 
                    type="received" 
                    isEs={isEs}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Sent Tab */}
          <TabsContent value="sent" className="mt-4">
            {sentShares.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <ArrowUpRight className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {isEs ? "No has compartido con otras organizaciones" : "You haven't shared with other organizations"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isEs 
                      ? "Ve a un proyecto o campaña y usa el botón Compartir" 
                      : "Go to a project or campaign and use the Share button"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sentShares.map((share) => (
                  <ShareCard 
                    key={share.share_id} 
                    share={share} 
                    type="sent" 
                    isEs={isEs}
                    onNavigate={handleNavigate}
                    onRevoke={handleRevoke}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// Reusable Share Card Component
function ShareCard({ share, type, isEs, onNavigate, onRevoke }) {
  const language = isEs ? "es" : "en";
  const isActive = share.status === "active";
  const permLabel = PERMISSION_LABELS[share.permission_level] || PERMISSION_LABELS.view;
  const statusLabel = STATUS_LABELS[share.status] || STATUS_LABELS.active;
  const PermIcon = permLabel.icon;
  
  return (
    <Card 
      className={`bg-card border-border transition-colors ${isActive ? "hover:border-purple-500/50" : "opacity-60"}`}
      data-testid={`share-card-${share.share_id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Entity Icon */}
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              share.entity_type === "project" 
                ? "bg-[#AED768]/20" 
                : "bg-pink-500/20"
            }`}>
              {share.entity_type === "project" 
                ? <Target className="w-5 h-5 text-[#AED768]" />
                : <Megaphone className="w-5 h-5 text-pink-400" />
              }
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Entity Name */}
              <h3 className="font-semibold text-foreground truncate">
                {share.entity_name}
              </h3>
              
              {/* Organization */}
              <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                <Building2 className="w-3.5 h-3.5" />
                <span className="truncate">
                  {type === "received" ? share.source_org_name : share.target_org_name}
                </span>
              </div>
              
              {/* Meta Info */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {/* Permission Badge */}
                <Badge className={`${permLabel.color} text-xs`}>
                  <PermIcon className="w-3 h-3 mr-1" />
                  {isEs ? permLabel.es : permLabel.en}
                </Badge>
                
                {/* Status Badge */}
                <Badge variant="outline" className={`${statusLabel.color} text-xs`}>
                  {isEs ? statusLabel.es : statusLabel.en}
                </Badge>
                
                {/* Date */}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateOnly(share.created_at, language)}
                </span>
              </div>
              
              {/* Scope Pills */}
              <div className="flex gap-1 mt-2 flex-wrap">
                {share.scope?.map((s) => (
                  <span 
                    key={s} 
                    className="px-2 py-0.5 text-xs bg-muted rounded-full text-muted-foreground capitalize"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate(share)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                {isEs ? "Ver" : "View"}
              </Button>
            )}
            
            {type === "sent" && isActive && onRevoke && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRevoke(share.share_id)}
                className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
