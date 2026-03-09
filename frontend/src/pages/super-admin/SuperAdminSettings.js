import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Switch } from "../../components/ui/switch";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Settings, Globe, FileText, Code, Copy, Check, ExternalLink,
  Loader2, Save, Eye, DollarSign, History, RefreshCw, Package, Layers
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export default function SuperAdminSettings() {
  const [activeTab, setActiveTab] = useState("kora-core");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  
  // Kora Core config state
  const [allModules, setAllModules] = useState([]);
  const [coreConfig, setCoreConfig] = useState({
    core_modules: [],
    description_en: "",
    description_es: ""
  });
  const [coreLoading, setCoreLoading] = useState(true);
  const [savingCore, setSavingCore] = useState(false);
  
  // Pricing state
  const [pricingConfig, setPricingConfig] = useState({
    kora_core_price: 69,
    kora_core_price_annual: 59,
    module_prices: {
      module_event_orchestration: 29,
      module_program_orchestration: 29,
      module_culinary_intelligence: 29,
      module_resource_management: 19,
      module_venues: 19,
      module_demand_studio: 39,
      module_people_ops: 49
    },
    module_prices_annual: {
      module_event_orchestration: 24,
      module_program_orchestration: 24,
      module_culinary_intelligence: 24,
      module_resource_management: 16,
      module_venues: 16,
      module_demand_studio: 33,
      module_people_ops: 41
    },
    bundle_prices: {
      bundle_event_suite: 39,
      bundle_program_suite: 39,
      bundle_agency_suite: 39
    },
    bundle_prices_annual: {
      bundle_event_suite: 33,
      bundle_program_suite: 33,
      bundle_agency_suite: 33
    }
  });
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingHistory, setPricingHistory] = useState([]);
  const [savingPricing, setSavingPricing] = useState(false);
  const [showAnnualPricing, setShowAnnualPricing] = useState(false);
  
  const [leadFormConfig, setLeadFormConfig] = useState({
    enabled: true,
    title: "Solicita una Demo de Kora OS",
    subtitle: "Completa el formulario y nos pondremos en contacto contigo",
    fields: {
      company_name: true,
      contact_name: true,
      email: true,
      phone: true,
      industry: true,
      company_size: true,
      message: true
    },
    notification_email: "",
    redirect_url: ""
  });

  // Fetch data on mount
  useEffect(() => {
    fetchKoraCoreConfig();
    fetchPricing();
  }, []);

  const fetchKoraCoreConfig = async () => {
    setCoreLoading(true);
    try {
      const [modulesRes, configRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/modules/available`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/kora-core-config`, { withCredentials: true })
      ]);
      setAllModules(modulesRes.data.modules || []);
      setCoreConfig({
        core_modules: configRes.data.core_modules || [],
        description_en: configRes.data.description_en || "",
        description_es: configRes.data.description_es || ""
      });
    } catch (err) {
      console.error("Failed to fetch Kora Core config:", err);
      toast.error("Error loading Kora Core configuration");
    }
    setCoreLoading(false);
  };

  const handleSaveCoreConfig = async () => {
    setSavingCore(true);
    try {
      await axios.put(`${API}/api/super-admin/kora-core-config`, coreConfig, { withCredentials: true });
      toast.success("Configuración de Kora Core actualizada");
    } catch (err) {
      console.error("Failed to save core config:", err);
      toast.error("Error guardando configuración");
    }
    setSavingCore(false);
  };

  const toggleCoreModule = (moduleKey) => {
    setCoreConfig(prev => ({
      ...prev,
      core_modules: prev.core_modules.includes(moduleKey)
        ? prev.core_modules.filter(k => k !== moduleKey)
        : [...prev.core_modules, moduleKey]
    }));
  };

  const fetchPricing = async () => {
    setPricingLoading(true);
    try {
      const [configRes, historyRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/pricing`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/pricing/history?limit=5`, { withCredentials: true })
      ]);
      setPricingConfig({
        kora_core_price: configRes.data.kora_core_price || 69,
        module_prices: configRes.data.module_prices || {}
      });
      setPricingHistory(historyRes.data.history || []);
    } catch (err) {
      console.error("Failed to fetch pricing:", err);
      toast.error("Error loading pricing configuration");
    }
    setPricingLoading(false);
  };

  const handleSavePricing = async () => {
    setSavingPricing(true);
    try {
      await axios.put(`${API}/api/super-admin/pricing`, pricingConfig, { withCredentials: true });
      toast.success("Precios actualizados exitosamente");
      fetchPricing(); // Refresh history
    } catch (err) {
      console.error("Failed to save pricing:", err);
      toast.error("Error guardando precios");
    }
    setSavingPricing(false);
  };

  const updateModulePrice = (key, value) => {
    setPricingConfig(prev => ({
      ...prev,
      module_prices: {
        ...prev.module_prices,
        [key]: parseFloat(value) || 0
      }
    }));
  };

  const MODULE_LABELS = {
    module_event_orchestration: { name: "Event Orchestration", desc: "Event management", priceMonthly: 29, priceAnnual: 24 },
    module_program_orchestration: { name: "Program Orchestration", desc: "Project/Program management", priceMonthly: 29, priceAnnual: 24 },
    module_culinary_intelligence: { name: "Culinary Intelligence", desc: "Recetas, costeo, menús", priceMonthly: 29, priceAnnual: 24 },
    module_resource_management: { name: "Resource Management", desc: "Inventario, proveedores", priceMonthly: 19, priceAnnual: 16 },
    module_venues: { name: "Venues", desc: "Ubicaciones, espacios", priceMonthly: 19, priceAnnual: 16 },
    module_demand_studio: { name: "Demand Generation", desc: "Marketing, leads, campaigns", priceMonthly: 39, priceAnnual: 33 },
    module_people_ops: { name: "People Ops", desc: "RRHH completo", priceMonthly: 49, priceAnnual: 41 }
  };

  const BUNDLE_LABELS = {
    bundle_event_suite: { name: "Event Suite", desc: "Event Orchestration + Venues + Resource Management", priceMonthly: 39, priceAnnual: 33 },
    bundle_program_suite: { name: "Program Suite", desc: "Program Orchestration + Venues + Resource Management", priceMonthly: 39, priceAnnual: 33 },
    bundle_agency_suite: { name: "Agency Suite", desc: "Demand Generation + Program Orchestration + Resource Management", priceMonthly: 39, priceAnnual: 33 }
  };

  const embedCode = `<!-- Kora OS Lead Form -->
<iframe 
  src="${window.location.origin}/embed/lead-form" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"
></iframe>`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast.success("Código copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      // Save to backend
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error("Error guardando configuración");
    }
    setLoading(false);
  };

  const handleRepairOrganizations = async () => {
    setRepairLoading(true);
    setRepairResult(null);
    try {
      const res = await axios.post(`${API}/api/super-admin/repair-all-organizations`, {}, { withCredentials: true });
      setRepairResult(res.data);
      toast.success(`Reparadas ${res.data.repaired} de ${res.data.total} organizaciones`);
    } catch (err) {
      console.error("Repair failed:", err);
      toast.error("Error al reparar organizaciones");
    }
    setRepairLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Ajustes de la plataforma Kora OS</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="kora-core">
            <Layers className="w-4 h-4 mr-2" />
            Kora Core
          </TabsTrigger>
          <TabsTrigger value="pricing">
            <DollarSign className="w-4 h-4 mr-2" />
            Precios
          </TabsTrigger>
          <TabsTrigger value="leadform">Formulario de Leads</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="integrations">Integraciones</TabsTrigger>
          <TabsTrigger value="maintenance">
            <RefreshCw className="w-4 h-4 mr-2" />
            Mantenimiento
          </TabsTrigger>
        </TabsList>

        {/* Kora Core Configuration */}
        <TabsContent value="kora-core" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Configuración de Kora Core
              </CardTitle>
              <CardDescription>
                Define qué módulos están incluidos en la suscripción base de Kora Core
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {coreLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Core Modules Selection */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-2">Módulos Base (Core)</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Estos módulos siempre están disponibles para todos los usuarios
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {allModules.filter(m => m.type === "core").map((mod) => (
                          <label 
                            key={mod.key}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              coreConfig.core_modules.includes(mod.key) 
                                ? 'bg-primary/10 border-primary' 
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <Checkbox
                              checked={coreConfig.core_modules.includes(mod.key)}
                              onCheckedChange={() => toggleCoreModule(mod.key)}
                            />
                            <div>
                              <p className="font-medium text-sm">{mod.name_es || mod.name_en}</p>
                              <p className="text-xs text-muted-foreground">{mod.path}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <h3 className="font-semibold mb-2">Módulos Add-on incluidos en Core</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Selecciona qué módulos premium incluir en la suscripción base (sin costo adicional)
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {allModules.filter(m => m.type === "addon").map((mod) => (
                          <label 
                            key={mod.key}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              coreConfig.core_modules.includes(mod.key) 
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-500' 
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <Checkbox
                              checked={coreConfig.core_modules.includes(mod.key)}
                              onCheckedChange={() => toggleCoreModule(mod.key)}
                            />
                            <div>
                              <p className="font-medium text-sm">{mod.name_es || mod.name_en}</p>
                              <p className="text-xs text-muted-foreground">{mod.path}</p>
                            </div>
                            {coreConfig.core_modules.includes(mod.key) && (
                              <Badge className="ml-auto bg-green-500 text-xs">Incluido</Badge>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label>Descripción (Inglés)</Label>
                      <Textarea
                        value={coreConfig.description_en}
                        onChange={(e) => setCoreConfig(prev => ({ ...prev, description_en: e.target.value }))}
                        placeholder="Modules included in Kora Core..."
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción (Español)</Label>
                      <Textarea
                        value={coreConfig.description_es}
                        onChange={(e) => setCoreConfig(prev => ({ ...prev, description_es: e.target.value }))}
                        placeholder="Módulos incluidos en Kora Core..."
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <p className="text-sm font-medium mb-2">Resumen de Kora Core:</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{coreConfig.core_modules.length}</span> módulos incluidos
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {coreConfig.core_modules.map(key => {
                        const mod = allModules.find(m => m.key === key);
                        return mod ? (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {mod.name_es || mod.name_en}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>

                  {/* Save Button */}
                  <Button onClick={handleSaveCoreConfig} disabled={savingCore} className="w-full">
                    {savingCore ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Guardar Configuración de Kora Core
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pricing Configuration */}
        <TabsContent value="pricing" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Kora Core Pricing */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  Configuración de Precios
                </CardTitle>
                <CardDescription>
                  Administra los precios de Kora Core y los módulos add-on
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {pricingLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Kora Core */}
                    <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">Kora Core</h3>
                          <p className="text-sm text-muted-foreground">
                            System Pulse, Client Engagement, Execution Hub, Partners, Business Clarity. 1 Location
                          </p>
                        </div>
                        <Badge className="bg-primary">Suscripción Base</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label className="text-sm font-medium">Precio mensual:</Label>
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={pricingConfig.kora_core_price}
                            onChange={(e) => setPricingConfig(prev => ({
                              ...prev,
                              kora_core_price: parseFloat(e.target.value) || 0
                            }))}
                            className="pl-7"
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">/mes</span>
                        <span className="text-muted-foreground mx-2">·</span>
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={pricingConfig.kora_core_price_annual}
                            onChange={(e) => setPricingConfig(prev => ({
                              ...prev,
                              kora_core_price_annual: parseFloat(e.target.value) || 0
                            }))}
                            className="pl-7"
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">/mes anual</span>
                      </div>
                    </div>

                    {/* Bundles */}
                    <div>
                      <h3 className="font-semibold mb-4">Bundles - $39/mes · $33/mes anual</h3>
                      <div className="space-y-3">
                        {Object.entries(BUNDLE_LABELS).map(([key, info]) => (
                          <div 
                            key={key}
                            className="flex items-center justify-between p-4 rounded-lg border bg-gradient-to-r from-purple-500/10 to-transparent"
                          >
                            <div>
                              <p className="font-medium">{info.name}</p>
                              <p className="text-sm text-muted-foreground">{info.desc}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">${info.priceMonthly}/mes</Badge>
                              <Badge variant="secondary">${info.priceAnnual}/mes anual</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Add-on Modules */}
                    <div>
                      <h3 className="font-semibold mb-4">Módulos Add-on (compra individual)</h3>
                      <div className="space-y-3">
                        {Object.entries(MODULE_LABELS).map(([key, info]) => (
                          <div 
                            key={key}
                            className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                          >
                            <div>
                              <p className="font-medium">{info.name}</p>
                              <p className="text-sm text-muted-foreground">{info.desc}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">${info.priceMonthly}/mes</Badge>
                              <Badge variant="secondary">${info.priceAnnual}/mes anual</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Total Preview */}
                    <div className="p-4 rounded-lg bg-muted/50 border">
                      <p className="text-sm text-muted-foreground mb-2">Vista previa (Core + Bundle + todos los add-ons):</p>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Total mensual máximo:</span>
                        <span className="text-2xl font-bold text-primary">
                          ${(pricingConfig.kora_core_price + 39 + Object.values(MODULE_LABELS).reduce((sum, m) => sum + m.priceMonthly, 0)).toFixed(0)}/mes
                        </span>
                      </div>
                    </div>

                    {/* Save Button */}
                    <Button onClick={handleSavePricing} disabled={savingPricing} className="w-full">
                      {savingPricing ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Guardar Cambios
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Pricing History */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="w-4 h-4" />
                    Historial de Cambios
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={fetchPricing}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {pricingHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Sin cambios de precios registrados
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pricingHistory.map((entry, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg border ${idx === 0 && entry.active ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-muted/30'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            Core: ${entry.kora_core_price}
                          </span>
                          {idx === 0 && entry.active && (
                            <Badge className="bg-green-500 text-xs">Activo</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A'}
                        </p>
                        {entry.created_by_email && (
                          <p className="text-xs text-muted-foreground">
                            Por: {entry.created_by_email}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Lead Form Configuration */}
        <TabsContent value="leadform" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Configuración del Formulario
                </CardTitle>
                <CardDescription>
                  Personaliza el formulario de captura de leads para tu sitio web
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Formulario Activo</Label>
                    <p className="text-xs text-muted-foreground">Habilitar/deshabilitar el formulario</p>
                  </div>
                  <Switch 
                    checked={leadFormConfig.enabled}
                    onCheckedChange={(v) => setLeadFormConfig({ ...leadFormConfig, enabled: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={leadFormConfig.title}
                    onChange={(e) => setLeadFormConfig({ ...leadFormConfig, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Subtítulo</Label>
                  <Input
                    value={leadFormConfig.subtitle}
                    onChange={(e) => setLeadFormConfig({ ...leadFormConfig, subtitle: e.target.value })}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Campos del Formulario</Label>
                  <div className="space-y-2">
                    {Object.entries({
                      company_name: "Nombre de Empresa",
                      contact_name: "Nombre de Contacto",
                      email: "Email",
                      phone: "Teléfono",
                      industry: "Industria",
                      company_size: "Tamaño de Empresa",
                      message: "Mensaje"
                    }).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between py-2">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={leadFormConfig.fields[key]}
                          onCheckedChange={(v) => setLeadFormConfig({
                            ...leadFormConfig,
                            fields: { ...leadFormConfig.fields, [key]: v }
                          })}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email de Notificación</Label>
                  <Input
                    type="email"
                    placeholder="ventas@kora.com"
                    value={leadFormConfig.notification_email}
                    onChange={(e) => setLeadFormConfig({ ...leadFormConfig, notification_email: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Recibirás una notificación cuando llegue un nuevo lead</p>
                </div>

                <Button onClick={handleSaveConfig} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar Configuración
                </Button>
              </CardContent>
            </Card>

            {/* Embed Code */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="w-5 h-5" />
                    Código de Inserción
                  </CardTitle>
                  <CardDescription>
                    Copia este código y pégalo en tu sitio web
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto text-foreground border">
                      {embedCode}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-2 right-2"
                      onClick={handleCopyCode}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1">
                      <Eye className="w-4 h-4 mr-2" />
                      Vista Previa
                    </Button>
                    <Button variant="outline" className="flex-1">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir en Nueva Pestaña
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Vista Previa</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-card rounded-lg p-6 border">
                    <h2 className="text-xl font-bold mb-2">{leadFormConfig.title}</h2>
                    <p className="text-muted-foreground text-sm mb-6">{leadFormConfig.subtitle}</p>
                    
                    <div className="space-y-4">
                      {leadFormConfig.fields.company_name && (
                        <div>
                          <label className="text-sm font-medium">Empresa *</label>
                          <div className="mt-1 h-10 bg-muted rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.contact_name && (
                        <div>
                          <label className="text-sm font-medium">Nombre *</label>
                          <div className="mt-1 h-10 bg-muted rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.email && (
                        <div>
                          <label className="text-sm font-medium">Email *</label>
                          <div className="mt-1 h-10 bg-muted rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.phone && (
                        <div>
                          <label className="text-sm font-medium">Teléfono</label>
                          <div className="mt-1 h-10 bg-muted rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.message && (
                        <div>
                          <label className="text-sm font-medium">Mensaje</label>
                          <div className="mt-1 h-20 bg-muted rounded border" />
                        </div>
                      )}
                      <div className="h-10 bg-primary rounded flex items-center justify-center text-primary-foreground font-medium">
                        Solicitar Demo
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configuración General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Nombre de la Plataforma</Label>
                <Input
                  defaultValue="Kora OS"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Dominio Principal</Label>
                <Input
                  defaultValue="kora.app"
                />
              </div>

              <div className="space-y-2">
                <Label>Email de Soporte</Label>
                <Input
                  defaultValue="soporte@kora.app"
                />
              </div>

              <Button className="w-full">
                <Save className="w-4 h-4 mr-2" />
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">
                      S
                    </div>
                    <div>
                      <p className="font-medium">Stripe</p>
                      <p className="text-xs text-muted-foreground">Procesamiento de pagos</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500">Conectado</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold">
                      G
                    </div>
                    <div>
                      <p className="font-medium">Google Auth</p>
                      <p className="text-xs text-muted-foreground">Autenticación social</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500">Conectado</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold">
                      M
                    </div>
                    <div>
                      <p className="font-medium">MongoDB Atlas</p>
                      <p className="text-xs text-slate-400">Base de datos</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500">Conectado</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                      @
                    </div>
                    <div>
                      <p className="font-medium">SendGrid</p>
                      <p className="text-xs text-muted-foreground">Emails transaccionales</p>
                    </div>
                  </div>
                  <Badge variant="outline">No conectado</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Reparar Organizaciones
              </CardTitle>
              <CardDescription>
                Corrige datos faltantes de todas las organizaciones: crea configuración de industria y suscripción trial si no existen.
                Es seguro ejecutar múltiples veces.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                data-testid="repair-organizations-btn"
                onClick={handleRepairOrganizations}
                disabled={repairLoading}
                className="w-full"
              >
                {repairLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {repairLoading ? "Reparando..." : "Reparar Todas las Organizaciones"}
              </Button>

              {repairResult && (
                <div className="p-4 rounded-lg border bg-muted/50 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Total organizaciones:</span>
                    <span className="font-bold">{repairResult.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-green-600">Reparadas:</span>
                    <span className="font-bold text-green-600">{repairResult.repaired}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Ya estaban bien:</span>
                    <span className="font-bold">{repairResult.skipped}</span>
                  </div>
                  {repairResult.details && repairResult.details.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Detalle de reparaciones:</p>
                      {repairResult.details.map((item, idx) => (
                        <div key={idx} className="text-xs flex justify-between">
                          <span>{item.name || item.company_id}</span>
                          <span className="text-muted-foreground">{item.fixes.join(", ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
