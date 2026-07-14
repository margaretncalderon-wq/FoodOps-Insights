import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { 
  Plug, RefreshCw, CheckCircle, XCircle, ExternalLink, 
  Mail, MessageSquare, Calculator, CreditCard, Settings2, AlertTriangle
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { KoraLoader } from "../KoraLoader";

// Available integrations
const AVAILABLE_INTEGRATIONS = [
  {
    id: "alegra",
    name: "Alegra",
    description: "Electronic invoicing and accounting",
    descriptionEs: "Facturación electrónica y contabilidad",
    icon: Calculator,
    category: "accounting",
    configFields: [
      { key: "api_key", label: "API Key", type: "password" },
      { key: "company_id", label: "Company ID", type: "text" },
    ],
    docsUrl: "https://developer.alegra.com/docs"
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    description: "Accounting and financial management",
    descriptionEs: "Contabilidad y gestión financiera",
    icon: Calculator,
    category: "accounting",
    configFields: [
      { key: "client_id", label: "Client ID", type: "text" },
      { key: "client_secret", label: "Client Secret", type: "password" },
      { key: "realm_id", label: "Realm ID", type: "text" },
    ],
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs"
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Send emails via Gmail API",
    descriptionEs: "Enviar emails mediante Gmail API",
    icon: Mail,
    category: "communication",
    configFields: [
      { key: "email", label: "Email Address", type: "email" },
    ],
    requiresOAuth: true,
    docsUrl: "https://developers.google.com/gmail/api"
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Send WhatsApp messages to clients",
    descriptionEs: "Enviar mensajes de WhatsApp a clientes",
    icon: MessageSquare,
    category: "communication",
    configFields: [
      { key: "phone_number_id", label: "Phone Number ID", type: "text" },
      { key: "access_token", label: "Access Token", type: "password" },
      { key: "business_account_id", label: "Business Account ID", type: "text" },
    ],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api"
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Payment processing (Pre-configured)",
    descriptionEs: "Procesamiento de pagos (Pre-configurado)",
    icon: CreditCard,
    category: "payments",
    configFields: [],
    isPreConfigured: true,
    docsUrl: "https://stripe.com/docs"
  },
];

const CATEGORIES = [
  { value: "all", label: "All", labelEs: "Todas" },
  { value: "accounting", label: "Accounting", labelEs: "Contabilidad" },
  { value: "communication", label: "Communication", labelEs: "Comunicación" },
  { value: "payments", label: "Payments", labelEs: "Pagos" },
];

export default function IntegrationsSettingsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [configForm, setConfigForm] = useState({});
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [testingConnection, setTestingConnection] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/settings/integrations`, { withCredentials: true });
      setIntegrations(res.data);
    } catch (err) {
      // Default: Stripe is pre-configured
      setIntegrations([
        { integration_id: "stripe", status: "connected", connected_at: new Date().toISOString() }
      ]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  const getIntegrationStatus = (integrationId) => {
    return integrations.find(i => i.integration_id === integrationId);
  };

  const handleOpenConfig = (integration) => {
    setSelectedIntegration(integration);
    const existing = getIntegrationStatus(integration.id);
    setConfigForm(existing?.config || {});
    setDialogOpen(true);
  };

  const handleSaveIntegration = async () => {
    if (!selectedIntegration) return;
    
    // Validate required fields
    const requiredFields = selectedIntegration.configFields.filter(f => !configForm[f.key]);
    if (requiredFields.length > 0 && !selectedIntegration.isPreConfigured) {
      return toast.error(isEs ? "Complete todos los campos" : "Fill all fields");
    }

    try {
      await axios.post(`${API}/api/settings/integrations`, {
        integration_id: selectedIntegration.id,
        config: configForm
      }, { withCredentials: true });
      toast.success(isEs ? "Integración guardada" : "Integration saved");
      setDialogOpen(false);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleTestConnection = async () => {
    if (!selectedIntegration) return;
    setTestingConnection(true);
    try {
      const res = await axios.post(`${API}/api/settings/integrations/${selectedIntegration.id}/test`, 
        { config: configForm }, 
        { withCredentials: true }
      );
      if (res.data.success) {
        toast.success(isEs ? "Conexión exitosa" : "Connection successful");
      } else {
        toast.error(res.data.message || (isEs ? "Error de conexión" : "Connection error"));
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error de conexión" : "Connection error"));
    }
    setTestingConnection(false);
  };

  const handleDisconnect = async (integrationId) => {
    if (!window.confirm(isEs ? "¿Desconectar integración?" : "Disconnect integration?")) return;
    try {
      await axios.delete(`${API}/api/settings/integrations/${integrationId}`, { withCredentials: true });
      toast.success(isEs ? "Integración desconectada" : "Integration disconnected");
      fetchIntegrations();
    } catch (err) {
      toast.error("Error");
    }
  };

  const handleOAuthConnect = (integration) => {
    // For OAuth integrations, redirect to OAuth flow
    toast.info(isEs ? "Redirigiendo a autenticación..." : "Redirecting to authentication...");
    // This would typically open a popup or redirect
    window.open(`${API}/api/settings/integrations/${integration.id}/oauth/connect`, "_blank", "width=600,height=700");
  };

  const filteredIntegrations = categoryFilter === "all" 
    ? AVAILABLE_INTEGRATIONS 
    : AVAILABLE_INTEGRATIONS.filter(i => i.category === categoryFilter);

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  return (
    <div className="space-y-6" data-testid="integrations-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plug className="w-5 h-5" />
            {isEs ? "Integraciones" : "Integrations"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Conecta con servicios externos" : "Connect with external services"}
          </p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={categoryFilter === cat.value ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoryFilter(cat.value)}
          >
            {isEs ? cat.labelEs : cat.label}
          </Button>
        ))}
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map((integration) => {
          const status = getIntegrationStatus(integration.id);
          const isConnected = status?.status === "connected";
          const Icon = integration.icon;
          
          return (
            <Card key={integration.id} className={`transition-all hover:shadow-md ${isConnected ? "border-green-200" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isConnected ? "bg-green-100" : "bg-muted"}`}>
                      <Icon className={`w-6 h-6 ${isConnected ? "text-green-600" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{integration.name}</CardTitle>
                      {isConnected ? (
                        <Badge className="bg-green-100 text-green-700 gap-1 mt-1">
                          <CheckCircle className="w-3 h-3" />
                          {isEs ? "Conectado" : "Connected"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 mt-1">
                          <XCircle className="w-3 h-3" />
                          {isEs ? "No conectado" : "Not connected"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {integration.docsUrl && (
                    <Button variant="ghost" size="icon" asChild>
                      <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {isEs ? integration.descriptionEs : integration.description}
                </p>
                <div className="flex gap-2">
                  {isConnected ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleOpenConfig(integration)}>
                        <Settings2 className="w-4 h-4 mr-1" />
                        {isEs ? "Configurar" : "Configure"}
                      </Button>
                      {!integration.isPreConfigured && (
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDisconnect(integration.id)}>
                          {isEs ? "Desconectar" : "Disconnect"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button size="sm" onClick={() => integration.requiresOAuth ? handleOAuthConnect(integration) : handleOpenConfig(integration)}>
                      <Plug className="w-4 h-4 mr-1" />
                      {isEs ? "Conectar" : "Connect"}
                    </Button>
                  )}
                </div>
                {integration.isPreConfigured && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {isEs ? "Pre-configurado por el sistema" : "Pre-configured by system"}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Configuration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedIntegration && <selectedIntegration.icon className="w-5 h-5" />}
              {selectedIntegration?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedIntegration && (isEs ? selectedIntegration.descriptionEs : selectedIntegration.description)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedIntegration?.isPreConfigured ? (
            <div className="py-4 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
              <p className="text-muted-foreground">
                {isEs 
                  ? "Esta integración está pre-configurada y lista para usar."
                  : "This integration is pre-configured and ready to use."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedIntegration?.configFields.map((field) => (
                <div key={field.key}>
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type}
                    value={configForm[field.key] || ""}
                    onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                    placeholder={field.placeholder || ""}
                  />
                </div>
              ))}
              
              {selectedIntegration?.requiresOAuth && (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-700 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {isEs 
                    ? "Esta integración requiere autenticación OAuth"
                    : "This integration requires OAuth authentication"}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            {!selectedIntegration?.isPreConfigured && (
              <>
                <Button variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
                  {testingConnection ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
                  {isEs ? "Probar Conexión" : "Test Connection"}
                </Button>
                <Button onClick={handleSaveIntegration}>
                  {isEs ? "Guardar" : "Save"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
