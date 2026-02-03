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
import {
  Settings, Globe, FileText, Code, Copy, Check, ExternalLink,
  Loader2, Save, Eye
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SuperAdminSettings() {
  const [activeTab, setActiveTab] = useState("leadform");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [leadFormConfig, setLeadFormConfig] = useState({
    enabled: true,
    title: "Solicita una Demo de Evoke OS",
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

  const embedCode = `<!-- Evoke OS Lead Form -->
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Ajustes de la plataforma Evoke OS</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="leadform">Formulario de Leads</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="integrations">Integraciones</TabsTrigger>
        </TabsList>

        {/* Lead Form Configuration */}
        <TabsContent value="leadform" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Configuration */}
            <Card className="bg-slate-800 border-slate-700">
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
                    <p className="text-xs text-slate-400">Habilitar/deshabilitar el formulario</p>
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
                    className="bg-slate-700 border-slate-600"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Subtítulo</Label>
                  <Input
                    value={leadFormConfig.subtitle}
                    onChange={(e) => setLeadFormConfig({ ...leadFormConfig, subtitle: e.target.value })}
                    className="bg-slate-700 border-slate-600"
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
                    placeholder="ventas@evoke.com"
                    value={leadFormConfig.notification_email}
                    onChange={(e) => setLeadFormConfig({ ...leadFormConfig, notification_email: e.target.value })}
                    className="bg-slate-700 border-slate-600"
                  />
                  <p className="text-xs text-slate-400">Recibirás una notificación cuando llegue un nuevo lead</p>
                </div>

                <Button onClick={handleSaveConfig} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar Configuración
                </Button>
              </CardContent>
            </Card>

            {/* Embed Code */}
            <div className="space-y-6">
              <Card className="bg-slate-800 border-slate-700">
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
                    <pre className="bg-slate-900 p-4 rounded-lg text-xs overflow-x-auto text-green-400">
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
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle>Vista Previa</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-white rounded-lg p-6 text-slate-900">
                    <h2 className="text-xl font-bold mb-2">{leadFormConfig.title}</h2>
                    <p className="text-slate-600 text-sm mb-6">{leadFormConfig.subtitle}</p>
                    
                    <div className="space-y-4">
                      {leadFormConfig.fields.company_name && (
                        <div>
                          <label className="text-sm font-medium">Empresa *</label>
                          <div className="mt-1 h-10 bg-slate-100 rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.contact_name && (
                        <div>
                          <label className="text-sm font-medium">Nombre *</label>
                          <div className="mt-1 h-10 bg-slate-100 rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.email && (
                        <div>
                          <label className="text-sm font-medium">Email *</label>
                          <div className="mt-1 h-10 bg-slate-100 rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.phone && (
                        <div>
                          <label className="text-sm font-medium">Teléfono</label>
                          <div className="mt-1 h-10 bg-slate-100 rounded border" />
                        </div>
                      )}
                      {leadFormConfig.fields.message && (
                        <div>
                          <label className="text-sm font-medium">Mensaje</label>
                          <div className="mt-1 h-20 bg-slate-100 rounded border" />
                        </div>
                      )}
                      <div className="h-10 bg-blue-600 rounded flex items-center justify-center text-white font-medium">
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
          <Card className="bg-slate-800 border-slate-700">
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
                  defaultValue="Evoke OS"
                  className="bg-slate-700 border-slate-600"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Dominio Principal</Label>
                <Input
                  defaultValue="evoke.app"
                  className="bg-slate-700 border-slate-600"
                />
              </div>

              <div className="space-y-2">
                <Label>Email de Soporte</Label>
                <Input
                  defaultValue="soporte@evoke.app"
                  className="bg-slate-700 border-slate-600"
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
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">
                      S
                    </div>
                    <div>
                      <p className="font-medium">Stripe</p>
                      <p className="text-xs text-slate-400">Procesamiento de pagos</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500">Conectado</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold">
                      G
                    </div>
                    <div>
                      <p className="font-medium">Google Auth</p>
                      <p className="text-xs text-slate-400">Autenticación social</p>
                    </div>
                  </div>
                  <Badge className="bg-green-500">Conectado</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
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

            <Card className="bg-slate-800 border-slate-700 opacity-60">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                      @
                    </div>
                    <div>
                      <p className="font-medium">SendGrid</p>
                      <p className="text-xs text-slate-400">Emails transaccionales</p>
                    </div>
                  </div>
                  <Badge variant="outline">No conectado</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
