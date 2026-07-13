import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { ScrollArea } from "../../components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plug, Plus, Key, Copy, CheckCircle, RefreshCw, MoreHorizontal, Activity, AlertTriangle, Shield, ExternalLink, FileJson, Clock, Building2, Trash2, Pause, Play, Eye, EyeOff } from "lucide-react";

import { KoraLoader } from "../../components/KoraLoader";
import { API_BASE as API } from "../../utils/api";

const PERMISSIONS = [
  { key: "leads", label: "Leads/CRM", description: "Create leads in CRM" },
  { key: "invoices", label: "Invoices", description: "Create invoices" },
  { key: "events", label: "Events", description: "Trigger custom events/workflows" },
];

const RATE_TIERS = [
  { value: "standard", label: "Standard", description: "100 req/min" },
  { value: "premium", label: "Premium", description: "1000 req/min" },
];

export default function IntegrationsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [integrations, setIntegrations] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [newApiKeys, setNewApiKeys] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    company_id: "",
    permissions: ["leads"],
    rate_limit_tier: "standard",
    sandbox_mode: false,
    webhook_url: "",
    notes: ""
  });
  
  // Details state
  const [integrationDetails, setIntegrationDetails] = useState(null);
  const [detailsTab, setDetailsTab] = useState("overview");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [intResponse, orgResponse] = await Promise.all([
        axios.get(`${API}/api/super-admin/integrations`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/organizations`, { withCredentials: true })
      ]);
      setIntegrations(intResponse.data.integrations || []);
      setOrganizations(orgResponse.data.organizations || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.company_id) {
      toast.error(isEs ? "Nombre y organización son requeridos" : "Name and organization are required");
      return;
    }
    
    setSaving(true);
    try {
      const response = await axios.post(
        `${API}/api/super-admin/integrations`,
        formData,
        { withCredentials: true }
      );
      
      // Show the API keys
      setNewApiKeys({
        api_key: response.data.api_key,
        test_api_key: response.data.test_api_key,
        integration_id: response.data.integration_id
      });
      setShowCreateModal(false);
      setShowApiKeyModal(true);
      
      resetForm();
      fetchData();
    } catch (error) {
      const msg = error.response?.data?.detail || (isEs ? "Error al crear integración" : "Error creating integration");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      company_id: "",
      permissions: ["leads"],
      rate_limit_tier: "standard",
      sandbox_mode: false,
      webhook_url: "",
      notes: ""
    });
  };

  const handleViewDetails = async (integration) => {
    setSelectedIntegration(integration);
    setShowDetailsModal(true);
    setDetailsTab("overview");
    
    try {
      const response = await axios.get(
        `${API}/api/super-admin/integrations/${integration.integration_id}`,
        { withCredentials: true }
      );
      setIntegrationDetails(response.data);
    } catch (error) {
      toast.error(isEs ? "Error al cargar detalles" : "Error loading details");
    }
  };

  const handleRegenerateKey = async (integrationId, keyType) => {
    if (!confirm(isEs 
      ? `¿Regenerar API key ${keyType}? La key anterior dejará de funcionar.` 
      : `Regenerate ${keyType} API key? The previous key will stop working.`)) {
      return;
    }
    
    try {
      const response = await axios.post(
        `${API}/api/super-admin/integrations/${integrationId}/regenerate-key?key_type=${keyType}`,
        {},
        { withCredentials: true }
      );
      
      setNewApiKeys({
        [keyType === "live" ? "api_key" : "test_api_key"]: response.data.new_api_key,
        integration_id: integrationId,
        regenerated: true
      });
      setShowApiKeyModal(true);
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al regenerar key" : "Error regenerating key");
    }
  };

  const handleStatusChange = async (integrationId, newStatus) => {
    try {
      await axios.patch(
        `${API}/api/super-admin/integrations/${integrationId}`,
        { status: newStatus },
        { withCredentials: true }
      );
      toast.success(isEs ? "Estado actualizado" : "Status updated");
      fetchData();
      if (showDetailsModal) {
        handleViewDetails({ integration_id: integrationId });
      }
    } catch (error) {
      toast.error(isEs ? "Error al actualizar estado" : "Error updating status");
    }
  };

  const handleRevoke = async (integrationId) => {
    if (!confirm(isEs 
      ? "¿Revocar esta integración? Esta acción no se puede deshacer."
      : "Revoke this integration? This action cannot be undone.")) {
      return;
    }
    
    try {
      await axios.delete(
        `${API}/api/super-admin/integrations/${integrationId}`,
        { withCredentials: true }
      );
      toast.success(isEs ? "Integración revocada" : "Integration revoked");
      setShowDetailsModal(false);
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al revocar" : "Error revoking");
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success(isEs ? "Copiado!" : "Copied!");
  };

  const togglePermission = (perm) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }));
  };

  const getStatusBadge = (status) => {
    const configs = {
      active: { color: "bg-green-500", label: isEs ? "Activa" : "Active" },
      paused: { color: "bg-amber-500", label: isEs ? "Pausada" : "Paused" },
      revoked: { color: "bg-red-500", label: isEs ? "Revocada" : "Revoked" }
    };
    const config = configs[status] || configs.active;
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="w-6 h-6 text-blue-500" />
            {isEs ? "Integraciones API" : "API Integrations"}
          </h1>
          <p className="text-muted-foreground">
            {isEs 
              ? "Gestiona conexiones de plataformas externas como Staffdo" 
              : "Manage connections from external platforms like Staffdo"}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Integración" : "New Integration"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{integrations.length}</div>
            <div className="text-sm text-muted-foreground">{isEs ? "Total" : "Total"}</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {integrations.filter(i => i.status === "active").length}
            </div>
            <div className="text-sm text-muted-foreground">{isEs ? "Activas" : "Active"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {integrations.reduce((sum, i) => sum + (i.calls_24h || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">{isEs ? "Llamadas 24h" : "Calls 24h"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {new Set(integrations.map(i => i.company_id)).size}
            </div>
            <div className="text-sm text-muted-foreground">{isEs ? "Organizaciones" : "Organizations"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Integrations Table */}
      <Card>
        <CardHeader>
          <CardTitle>{isEs ? "Integraciones Configuradas" : "Configured Integrations"}</CardTitle>
        </CardHeader>
        <CardContent>
          {integrations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Plug className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isEs ? "No hay integraciones configuradas" : "No integrations configured"}</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => setShowCreateModal(true)}
              >
                {isEs ? "Crear primera integración" : "Create first integration"}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Integración" : "Integration"}</TableHead>
                  <TableHead>{isEs ? "Organización" : "Organization"}</TableHead>
                  <TableHead>{isEs ? "Permisos" : "Permissions"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead>{isEs ? "Llamadas 24h" : "Calls 24h"}</TableHead>
                  <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((integration) => (
                  <TableRow key={integration.integration_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Plug className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium">{integration.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {integration.api_key_prefix}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        {integration.company_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {integration.permissions?.map(p => (
                          <Badge key={p} variant="outline" className="text-xs">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(integration.status)}
                      {integration.sandbox_mode && (
                        <Badge variant="secondary" className="ml-1 text-xs">Sandbox</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-muted-foreground" />
                        {integration.calls_24h || 0}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetails(integration)}>
                            <Eye className="w-4 h-4 mr-2" />
                            {isEs ? "Ver Detalles" : "View Details"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleRegenerateKey(integration.integration_id, "live")}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {isEs ? "Regenerar Live Key" : "Regenerate Live Key"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRegenerateKey(integration.integration_id, "test")}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {isEs ? "Regenerar Test Key" : "Regenerate Test Key"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {integration.status === "active" ? (
                            <DropdownMenuItem onClick={() => handleStatusChange(integration.integration_id, "paused")}>
                              <Pause className="w-4 h-4 mr-2" />
                              {isEs ? "Pausar" : "Pause"}
                            </DropdownMenuItem>
                          ) : integration.status === "paused" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(integration.integration_id, "active")}>
                              <Play className="w-4 h-4 mr-2" />
                              {isEs ? "Activar" : "Activate"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleRevoke(integration.integration_id)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isEs ? "Revocar" : "Revoke"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Integration Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="w-5 h-5 text-blue-500" />
              {isEs ? "Nueva Integración" : "New Integration"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Configura una nueva conexión API para plataformas externas" 
                : "Configure a new API connection for external platforms"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Staffdo Integration"
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Organización" : "Organization"} *</Label>
              <Select 
                value={formData.company_id} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, company_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.company_id} value={org.company_id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={isEs ? "Descripción de la integración..." : "Integration description..."}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Permisos" : "Permissions"}</Label>
              <div className="space-y-2">
                {PERMISSIONS.map((perm) => (
                  <label 
                    key={perm.key}
                    className="flex items-center gap-3 p-2 rounded border cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={formData.permissions.includes(perm.key)}
                      onCheckedChange={() => togglePermission(perm.key)}
                    />
                    <div>
                      <div className="font-medium text-sm">{perm.label}</div>
                      <div className="text-xs text-muted-foreground">{perm.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Rate Limit</Label>
              <Select 
                value={formData.rate_limit_tier} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, rate_limit_tier: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_TIERS.map((tier) => (
                    <SelectItem key={tier.value} value={tier.value}>
                      {tier.label} - {tier.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
              <div>
                <div className="font-medium text-sm">{isEs ? "Modo Sandbox" : "Sandbox Mode"}</div>
                <div className="text-xs text-muted-foreground">
                  {isEs ? "Solo para pruebas, no afecta datos reales" : "For testing only, doesn't affect real data"}
                </div>
              </div>
              <Switch
                checked={formData.sandbox_mode}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, sandbox_mode: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <KoraLoader size={16} className="mr-2" /> : <Key className="w-4 h-4 mr-2" />}
              {isEs ? "Crear y Generar Keys" : "Create & Generate Keys"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Keys Modal */}
      <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" />
              {newApiKeys?.regenerated 
                ? (isEs ? "Nueva API Key" : "New API Key")
                : (isEs ? "API Keys Generadas" : "Generated API Keys")}
            </DialogTitle>
            <DialogDescription className="text-amber-600 font-medium">
              {isEs 
                ? "⚠️ Guarda estas keys ahora. No se mostrarán de nuevo."
                : "⚠️ Save these keys now. They won't be shown again."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {newApiKeys?.api_key && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-500" />
                  Live API Key
                </Label>
                <div className="flex gap-2">
                  <Input 
                    value={newApiKeys.api_key} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => copyToClipboard(newApiKeys.api_key, "live")}
                  >
                    {copiedField === "live" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}
            
            {newApiKeys?.test_api_key && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Test API Key (Sandbox)
                </Label>
                <div className="flex gap-2">
                  <Input 
                    value={newApiKeys.test_api_key} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => copyToClipboard(newApiKeys.test_api_key, "test")}
                  >
                    {copiedField === "test" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="font-medium mb-2">{isEs ? "Uso:" : "Usage:"}</div>
              <code className="text-xs bg-black text-green-400 p-2 rounded block">
                curl -X POST https://ourkora.com/api/v1/integrations/leads \<br/>
                &nbsp;&nbsp;-H "X-API-Key: {newApiKeys?.api_key?.slice(0, 20)}..." \<br/>
                &nbsp;&nbsp;-H "Content-Type: application/json" \<br/>
                &nbsp;&nbsp;-d '{`{"type":"company","name":"Test"}`}'
              </code>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowApiKeyModal(false)}>
              {isEs ? "Entendido, guardé las keys" : "Got it, I saved the keys"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Integration Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="w-5 h-5 text-blue-500" />
              {selectedIntegration?.name}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={detailsTab} onValueChange={setDetailsTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">{isEs ? "General" : "Overview"}</TabsTrigger>
              <TabsTrigger value="logs">{isEs ? "Logs" : "Logs"}</TabsTrigger>
              <TabsTrigger value="docs">{isEs ? "Documentación" : "Documentation"}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              {integrationDetails && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{integrationDetails.stats?.calls_24h || 0}</div>
                        <div className="text-xs text-muted-foreground">Calls 24h</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{integrationDetails.stats?.calls_7d || 0}</div>
                        <div className="text-xs text-muted-foreground">Calls 7d</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-500">{integrationDetails.stats?.errors_24h || 0}</div>
                        <div className="text-xs text-muted-foreground">Errors 24h</div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{isEs ? "Permisos" : "Permissions"}</Label>
                    <div className="flex gap-2">
                      {integrationDetails.integration?.permissions?.map(p => (
                        <Badge key={p}>{p}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>API Key Prefix</Label>
                    <code className="text-sm bg-muted p-2 rounded block">
                      {integrationDetails.integration?.api_key_prefix}
                    </code>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{isEs ? "Última Actividad" : "Last Activity"}</Label>
                    <p className="text-sm text-muted-foreground">
                      {integrationDetails.integration?.last_used_at 
                        ? new Date(integrationDetails.integration.last_used_at).toLocaleString()
                        : (isEs ? "Nunca" : "Never")}
                    </p>
                  </div>
                </>
              )}
            </TabsContent>
            
            <TabsContent value="logs">
              <ScrollArea className="h-[400px]">
                {integrationDetails?.recent_logs?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay logs recientes" : "No recent logs"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {integrationDetails?.recent_logs?.map((log, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded border ${log.success ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <Badge variant={log.success ? "default" : "destructive"} className="text-xs">
                              {log.endpoint}
                            </Badge>
                            {log.is_sandbox && <Badge variant="secondary" className="ml-1 text-xs">Sandbox</Badge>}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {log.error && (
                          <p className="text-xs text-red-600 mt-1">{log.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="docs">
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">Base URL</h4>
                    <code className="bg-muted p-2 rounded block">
                      https://ourkora.com/api/v1/integrations
                    </code>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">{isEs ? "Autenticación" : "Authentication"}</h4>
                    <p className="text-muted-foreground mb-2">
                      {isEs ? "Incluir header X-API-Key en cada request" : "Include X-API-Key header in every request"}
                    </p>
                    <code className="bg-muted p-2 rounded block">
                      X-API-Key: sk_live_xxxxx...
                    </code>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">POST /leads</h4>
                    <pre className="bg-black text-green-400 p-3 rounded text-xs overflow-x-auto">
{`{
  "type": "company|candidate|contractor|other",
  "name": "Company Name",
  "email": "contact@example.com",
  "phone": "809-555-1234",
  "rnc": "123456789",
  "source": "staffdo",
  "custom_fields": {}
}`}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">POST /invoices</h4>
                    <pre className="bg-black text-green-400 p-3 rounded text-xs overflow-x-auto">
{`{
  "client_rnc": "123456789",
  "amount": 5000.00,
  "currency": "USD",
  "description": "Service description",
  "items": []
}`}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">POST /events</h4>
                    <pre className="bg-black text-green-400 p-3 rounded text-xs overflow-x-auto">
{`{
  "event_type": "custom_event_name",
  "payload": {
    "key": "value"
  }
}`}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
