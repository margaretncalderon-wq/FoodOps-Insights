import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { 
  Settings, Link2, Copy, Check, Webhook, 
  Facebook, ExternalLink, Zap, AlertCircle, Sparkles, Instagram,
  Loader2, CheckCircle, XCircle, RefreshCw, Users, Building2, 
  UserPlus, Trash2, Edit, Shield, Eye
} from "lucide-react";
import { toast } from "sonner";
import BrandHub from "../../components/demand-studio/BrandHub";
import CompanyShareSettings from "../../components/demand-studio/CompanyShareSettings";
import { formatDateOnly } from "../../utils/dates";

const API = process.env.REACT_APP_BACKEND_URL;

export default function DemandStudioSettings() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isEs = language === "es";
  const [copied, setCopied] = useState(null);
  const [companySlug, setCompanySlug] = useState("");
  
  // Instagram state
  const [igConnection, setIgConnection] = useState(null);
  const [igLoading, setIgLoading] = useState(true);
  const [igSyncing, setIgSyncing] = useState(false);

  // Team & Sharing state
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  // Format & Account Colors
  const [formatColors, setFormatColors] = useState({
    post: "#22c55e", reel: "#a855f7", story: "#eab308", carousel: "#3b82f6", live: "#ef4444"
  });
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [colorsSaving, setColorsSaving] = useState(false);

  // Handle OAuth callback parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const igSuccess = urlParams.get("ig_success");
    const igError = urlParams.get("ig_error");
    const igUsername = urlParams.get("ig_username");
    
    if (igSuccess === "true") {
      toast.success(isEs 
        ? `Instagram conectado: @${igUsername || "cuenta"}` 
        : `Instagram connected: @${igUsername || "account"}`);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (igError) {
      const errorMessages = {
        invalid_state: isEs ? "Sesión expirada. Intenta de nuevo." : "Session expired. Try again.",
        expired: isEs ? "Enlace expirado. Intenta de nuevo." : "Link expired. Try again.",
        token_exchange_failed: isEs ? "Error de autenticación con Instagram." : "Instagram authentication error.",
        no_token: isEs ? "No se recibió token de Instagram." : "No token received from Instagram.",
        unknown: isEs ? "Error desconocido. Intenta de nuevo." : "Unknown error. Try again."
      };
      toast.error(errorMessages[igError] || errorMessages.unknown);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isEs]);

  useEffect(() => {
    // Get company slug/id for webhook URL
    const fetchCompany = async () => {
      try {
        const res = await axios.get(`${API}/api/settings/company`, { withCredentials: true });
        setCompanySlug(res.data?.slug || res.data?.company_id || user?.company_id || "");
      } catch (err) {
        setCompanySlug(user?.company_id || "your-company-id");
      }
    };
    fetchCompany();
  }, [user]);

  const fetchInstagramConnection = useCallback(async () => {
    setIgLoading(true);
    try {
      const res = await axios.get(`${API}/api/studio/instagram/connection`, { withCredentials: true });
      setIgConnection(res.data);
    } catch (error) {
      console.error("Error fetching IG connection:", error);
      setIgConnection({ connected: false });
    } finally {
      setIgLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstagramConnection();
  }, [fetchInstagramConnection]);

  const handleInstagramConnect = async () => {
    // Start real Instagram OAuth flow
    try {
      setIgLoading(true);
      const res = await axios.get(`${API}/api/instagram/oauth/start`, { withCredentials: true });
      
      if (res.data?.auth_url) {
        // Redirect to Instagram authorization
        window.location.href = res.data.auth_url;
      } else {
        toast.error(isEs ? "Error al iniciar conexión" : "Failed to start connection");
      }
    } catch (error) {
      console.error("Instagram connect error:", error);
      if (error.response?.status === 503) {
        toast.error(isEs 
          ? "Instagram no está configurado. Contacta al administrador." 
          : "Instagram not configured. Contact administrator.");
      } else {
        toast.error(isEs ? "Error al conectar" : "Connection error");
      }
      setIgLoading(false);
    }
  };

  const handleInstagramDisconnect = async () => {
    try {
      await axios.delete(`${API}/api/studio/instagram/disconnect`, { withCredentials: true });
      toast.success(isEs ? "Instagram desconectado" : "Instagram disconnected");
      setIgConnection({ connected: false });
    } catch (error) {
      toast.error(isEs ? "Error al desconectar" : "Disconnect error");
    }
  };

  const handleInstagramSync = async () => {
    setIgSyncing(true);
    try {
      // Use the new media endpoint that fetches from API
      await axios.get(`${API}/api/instagram/media`, { withCredentials: true });
      toast.success(isEs ? "Media sincronizado" : "Media synced");
      fetchInstagramConnection();
    } catch (error) {
      toast.error(isEs ? "Error al sincronizar" : "Sync error");
    } finally {
      setIgSyncing(false);
    }
  };

  // Fetch company members
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await axios.get(`${API}/api/company-sharing/members`, { withCredentials: true });
      setMembers(res.data?.members || []);
      setPendingInvites(res.data?.pending || []);
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
    // Fetch format colors and accounts
    const fetchColors = async () => {
      try {
        const colorsRes = await axios.get(`${API}/api/demand-studio/social/format-colors`, { withCredentials: true }).catch(() => null);
        if (colorsRes && colorsRes.data && typeof colorsRes.data === 'object' && !Array.isArray(colorsRes.data)) {
          setFormatColors(prev => ({ ...prev, ...colorsRes.data }));
        }
      } catch { /* use defaults */ }
      try {
        const acctsRes = await axios.get(`${API}/api/account-sharing/my-accounts`, { withCredentials: true }).catch(() => null);
        if (acctsRes && Array.isArray(acctsRes.data)) {
          setSocialAccounts(acctsRes.data);
        }
      } catch { /* ignore */ }
    };
    fetchColors();
  }, [fetchMembers]);

  const handleSaveFormatColors = async () => {
    setColorsSaving(true);
    try {
      await axios.put(`${API}/api/demand-studio/social/format-colors`, formatColors, { withCredentials: true });
      toast.success(isEs ? "Colores guardados" : "Colors saved");
    } catch { toast.error("Error"); }
    setColorsSaving(false);
  };

  const handleSaveAccountColor = async (accountId, color) => {
    try {
      await axios.put(`${API}/api/demand-studio/social/accounts/${accountId}/color`, { color }, { withCredentials: true });
      setSocialAccounts(prev => prev.map(a => a.account_id === accountId ? { ...a, color } : a));
      toast.success(isEs ? "Color guardado" : "Color saved");
    } catch { toast.error("Error"); }
  };

  const handleRemoveMember = async (membershipId) => {
    if (!confirm(isEs ? "¿Eliminar acceso de este colaborador?" : "Remove this collaborator's access?")) {
      return;
    }
    try {
      await axios.delete(`${API}/api/company-sharing/members/${membershipId}`, { withCredentials: true });
      toast.success(isEs ? "Acceso eliminado" : "Access removed");
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  const handleRevokeInvitation = async (invitationId) => {
    try {
      await axios.delete(`${API}/api/company-sharing/invitations/${invitationId}`, { withCredentials: true });
      toast.success(isEs ? "Invitación cancelada" : "Invitation cancelled");
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  const getEnabledSectionsCount = (permissions) => {
    if (!permissions) return 0;
    return Object.values(permissions).filter(p => p?.enabled).length;
  };

  const webhookUrl = `${window.location.origin}/api/webhooks/leads/${companySlug}`;
  const testUrl = `${window.location.origin}/api/webhooks/test/${companySlug}`;

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success(isEs ? "Copiado" : "Copied");
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      toast.error(isEs ? "Error al copiar" : "Failed to copy");
    }
  };

  return (
    <div className="space-y-6" data-testid="demand-studio-settings">
      <div>
        <h2 className="text-lg font-semibold">
          {isEs ? "Configuración de Demand Studio" : "Demand Studio Settings"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEs ? "Integraciones y configuración de marketing" : "Integrations and marketing configuration"}
        </p>
      </div>

      <Tabs defaultValue="integrations" className="w-full">
        <TabsList>
          <TabsTrigger value="integrations" className="gap-1">
            <Webhook className="w-4 h-4" />
            {isEs ? "Integraciones" : "Integrations"}
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1">
            <Users className="w-4 h-4" />
            {isEs ? "Equipo" : "Team"}
          </TabsTrigger>
          <TabsTrigger value="brand-hub" className="gap-1">
            <Sparkles className="w-4 h-4" />
            Brand Hub
          </TabsTrigger>
          <TabsTrigger value="colors" className="gap-1">
            <Settings className="w-4 h-4" />
            {isEs ? "Colores" : "Colors"}
          </TabsTrigger>
        </TabsList>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="mt-6">
          {/* External Integrations Section */}
          <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-purple-500" />
            {isEs ? "Integraciones Externas" : "External Integrations"}
          </CardTitle>
          <CardDescription>
            {isEs 
              ? "Conecta servicios externos como Zapier, Make, o Meta Lead Ads para recibir leads automáticamente"
              : "Connect external services like Zapier, Make, or Meta Lead Ads to receive leads automatically"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Webhook URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Webhook URL
            </label>
            <div className="flex gap-2">
              <Input 
                value={webhookUrl} 
                readOnly 
                className="font-mono text-sm bg-muted"
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, "webhook")}
              >
                {copied === "webhook" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isEs 
                ? "Usa esta URL en Zapier, Make, o cualquier servicio de automatización"
                : "Use this URL in Zapier, Make, or any automation service"}
            </p>
          </div>

          {/* Test URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              Test Endpoint
            </label>
            <div className="flex gap-2">
              <Input 
                value={testUrl} 
                readOnly 
                className="font-mono text-sm bg-muted"
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(testUrl, "test")}
              >
                {copied === "test" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isEs 
                ? "GET request para verificar que el webhook está funcionando"
                : "GET request to verify the webhook is working"}
            </p>
          </div>

          {/* Integration Cards */}
          <div className="grid md:grid-cols-3 gap-4 pt-4">
            {/* Zapier */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" />
                <span className="font-medium">Zapier</span>
                <Badge variant="outline" className="text-xs">Ready</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs 
                  ? "Conecta Meta Lead Ads, Google Forms, y más"
                  : "Connect Meta Lead Ads, Google Forms, and more"}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => window.open("https://zapier.com/apps/webhooks", "_blank")}
              >
                <ExternalLink className="w-3 h-3 mr-2" />
                {isEs ? "Ver Docs" : "View Docs"}
              </Button>
            </div>

            {/* Meta Lead Ads */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Facebook className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Meta Lead Ads</span>
                <Badge variant="outline" className="text-xs">Via Zapier</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs 
                  ? "Recibe leads de Facebook/Instagram automáticamente"
                  : "Receive leads from Facebook/Instagram automatically"}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => window.open("https://zapier.com/apps/facebook-lead-ads", "_blank")}
              >
                <ExternalLink className="w-3 h-3 mr-2" />
                {isEs ? "Conectar" : "Connect"}
              </Button>
            </div>

            {/* Make */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-600" />
                <span className="font-medium">Make (Integromat)</span>
                <Badge variant="outline" className="text-xs">Ready</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs 
                  ? "Alternativa a Zapier con más flexibilidad"
                  : "Zapier alternative with more flexibility"}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => window.open("https://www.make.com/en/integrations/http", "_blank")}
              >
                <ExternalLink className="w-3 h-3 mr-2" />
                {isEs ? "Ver Docs" : "View Docs"}
              </Button>
            </div>
          </div>

          {/* Payload Example */}
          <div className="bg-muted rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {isEs ? "Formato del Payload (JSON)" : "Payload Format (JSON)"}
              </span>
            </div>
            <pre className="text-xs overflow-x-auto">
{`{
  "email": "lead@example.com",
  "name": "John Doe",
  "phone": "+1234567890",
  "source": "Meta Lead Ads",
  "campaign_code": "CAM-XXXXX",
  "message": "Optional message"
}`}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              {isEs 
                ? "Incluye campaign_code para auto-linkear el lead a una campaña"
                : "Include campaign_code to auto-link the lead to a campaign"}
            </p>
          </div>
        </CardContent>
      </Card>

          {/* Instagram Connection Card */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Instagram className="w-5 h-5 text-pink-500" />
                Instagram
              </CardTitle>
              <CardDescription>
                {isEs 
                  ? "Conecta tu cuenta de Instagram Business para ver tus posts publicados en el Feed"
                  : "Connect your Instagram Business account to see your published posts in the Feed"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {igLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : igConnection?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-400">
                          {isEs ? "Conectado" : "Connected"}
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-500">
                          @{igConnection.connection?.ig_username || igConnection.ig_username || "instagram_account"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-green-100 text-green-700">
                      {isEs ? "Activo" : "Active"}
                    </Badge>
                  </div>
                  
                  {(igConnection.connection?.last_sync_at || igConnection.last_sync_at) && (
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Última sincronización:" : "Last sync:"}{" "}
                      {new Date(igConnection.connection?.last_sync_at || igConnection.last_sync_at).toLocaleString()}
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={handleInstagramSync}
                      disabled={igSyncing}
                    >
                      {igSyncing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      {isEs ? "Sincronizar" : "Sync"}
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleInstagramDisconnect}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      {isEs ? "Desconectar" : "Disconnect"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Instagram className="w-12 h-12 mx-auto text-pink-500 mb-4" />
                  <h3 className="font-medium mb-2">
                    {isEs ? "Conecta tu Instagram" : "Connect your Instagram"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                    {isEs 
                      ? "Conecta tu cuenta de Instagram Business o Creator para importar tus posts publicados"
                      : "Connect your Instagram Business or Creator account to import your published posts"}
                  </p>
                  <Button onClick={handleInstagramConnect} className="bg-gradient-to-r from-purple-500 to-pink-500">
                    <Instagram className="w-4 h-4 mr-2" />
                    {isEs ? "Conectar Instagram" : "Connect Instagram"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">
                    {isEs ? "Requiere cuenta Business o Creator" : "Requires Business or Creator account"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team & Sharing Tab */}
        <TabsContent value="team" className="mt-6 space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    {isEs ? "Compartir Empresa" : "Share Company"}
                  </CardTitle>
                  <CardDescription>
                    {isEs 
                      ? "Comparte acceso a tu empresa con colaboradores externos. Configura qué secciones pueden ver y con qué permisos."
                      : "Share access to your company with external collaborators. Configure which sections they can access and with what permissions."
                    }
                  </CardDescription>
                </div>
                <Button onClick={() => { setEditingMember(null); setShareDialogOpen(true); }} data-testid="share-company-btn">
                  <UserPlus className="w-4 h-4 mr-2" />
                  {isEs ? "Compartir" : "Share"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Members List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                {isEs ? "Colaboradores" : "Collaborators"}
                {membersLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 && !membersLoading ? (
                <div className="text-center text-muted-foreground py-8">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{isEs ? "No hay colaboradores aún" : "No collaborators yet"}</p>
                  <p className="text-sm mt-1">
                    {isEs ? "Comparte tu empresa con agencias o miembros externos" : "Share your company with agencies or external members"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div key={member.membership_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                          {member.name?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="font-medium">{member.name || member.email}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">
                          {getEnabledSectionsCount(member.permissions)} {isEs ? "secciones" : "sections"}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => { setEditingMember(member); setShareDialogOpen(true); }}
                          title={isEs ? "Editar permisos" : "Edit permissions"}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleRemoveMember(member.membership_id)}
                          title={isEs ? "Eliminar acceso" : "Remove access"}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  {isEs ? "Invitaciones Pendientes" : "Pending Invitations"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingInvites.map((invite) => (
                    <div key={invite.invitation_id} className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <div>
                        <p className="font-medium">{invite.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {isEs ? "Expira:" : "Expires:"} {formatDateOnly(invite.expires_at, language)}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleRevokeInvitation(invite.invitation_id)}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        {isEs ? "Cancelar" : "Cancel"}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Brand Hub Tab */}
        <TabsContent value="brand-hub" className="mt-6">
          <BrandHub />
        </TabsContent>

        {/* Colors Tab */}
        <TabsContent value="colors" className="mt-6 space-y-6">
          {/* Format Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Colores por Formato" : "Format Colors"}</CardTitle>
              <CardDescription>{isEs ? "Estos colores se usan en el calendario para identificar cada tipo de contenido" : "These colors are used in the calendar to identify each content type"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "post", label: "Post" },
                { key: "reel", label: "Reel" },
                { key: "story", label: isEs ? "Historia" : "Story" },
                { key: "carousel", label: isEs ? "Carrusel" : "Carousel" },
                { key: "live", label: isEs ? "En Vivo" : "Live" },
              ].map(fmt => (
                <div key={fmt.key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formatColors[fmt.key] || "#3b82f6"}
                    onChange={e => setFormatColors({ ...formatColors, [fmt.key]: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0"
                    data-testid={`format-color-${fmt.key}`}
                  />
                  <span className="text-sm font-medium w-20">{fmt.label}</span>
                  <div className="flex-1 h-6 rounded" style={{ backgroundColor: `${formatColors[fmt.key]}20`, borderLeft: `4px solid ${formatColors[fmt.key]}` }}>
                    <span className="text-xs px-2 leading-6" style={{ color: formatColors[fmt.key] }}>{isEs ? "Vista previa" : "Preview"}</span>
                  </div>
                </div>
              ))}
              <Button size="sm" onClick={handleSaveFormatColors} disabled={colorsSaving} data-testid="save-format-colors-btn">
                <Check className="w-4 h-4 mr-1" />
                {colorsSaving ? "..." : isEs ? "Guardar Colores" : "Save Colors"}
              </Button>
            </CardContent>
          </Card>

          {/* Account Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Colores por Cuenta Social" : "Account Colors"}</CardTitle>
              <CardDescription>{isEs ? "Asigna un color a cada cuenta para identificarla en el calendario" : "Assign a color to each account to identify it in the calendar"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {socialAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{isEs ? "No hay cuentas sociales" : "No social accounts"}</p>
              ) : (
                socialAccounts.filter(acc => acc && acc.account_id).map(acc => (
                  <div key={acc.account_id} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={acc.color || "#94a3b8"}
                      onChange={e => handleSaveAccountColor(acc.account_id, e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                      data-testid={`account-color-${acc.account_id}`}
                    />
                    <div className="flex items-center gap-2">
                      <Instagram className="w-4 h-4 text-pink-500" />
                      <span className="text-sm font-medium">{acc.handle || acc.platform || "Account"}</span>
                    </div>
                    {acc.color && (
                      <div className="w-16 h-4 rounded" style={{ backgroundColor: acc.color, opacity: 0.6 }} />
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Share Company Dialog */}
      <CompanyShareSettings 
        open={shareDialogOpen}
        onOpenChange={(open) => {
          setShareDialogOpen(open);
          if (!open) {
            setEditingMember(null);
            fetchMembers();
          }
        }}
        existingMembership={editingMember}
      />
    </div>
  );
}
