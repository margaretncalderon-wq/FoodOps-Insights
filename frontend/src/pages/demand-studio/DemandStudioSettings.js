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
  Loader2, CheckCircle, XCircle, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import BrandHub from "../../components/demand-studio/BrandHub";

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
    // For now, simulate a connection with mock data
    // In production, this would redirect to Instagram OAuth
    try {
      await axios.post(`${API}/api/studio/instagram/connect`, {
        access_token: "mock_token_" + Date.now(),
        ig_user_id: "ig_" + Math.random().toString(36).substr(2, 9),
        ig_username: "demo_account"
      }, { withCredentials: true });
      toast.success(isEs ? "Instagram conectado" : "Instagram connected");
      fetchInstagramConnection();
    } catch (error) {
      toast.error(isEs ? "Error al conectar" : "Connection error");
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
      await axios.post(`${API}/api/studio/instagram/sync`, {}, { withCredentials: true });
      toast.success(isEs ? "Sincronización iniciada" : "Sync started");
      fetchInstagramConnection();
    } catch (error) {
      toast.error(isEs ? "Error al sincronizar" : "Sync error");
    } finally {
      setIgSyncing(false);
    }
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
          <TabsTrigger value="brand-hub" className="gap-1">
            <Sparkles className="w-4 h-4" />
            Brand Hub
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
                          @{igConnection.ig_username || "instagram_account"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-green-100 text-green-700">
                      {isEs ? "Activo" : "Active"}
                    </Badge>
                  </div>
                  
                  {igConnection.last_sync_at && (
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Última sincronización:" : "Last sync:"}{" "}
                      {new Date(igConnection.last_sync_at).toLocaleString()}
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

        {/* Brand Hub Tab */}
        <TabsContent value="brand-hub" className="mt-6">
          <BrandHub />
        </TabsContent>
      </Tabs>
    </div>
  );
}
