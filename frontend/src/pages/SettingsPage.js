import { useEffect, useState } from "react";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Building2, Palette, Globe, DollarSign, FileText, Loader2, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CURRENCIES = ["USD", "EUR", "MXN", "COP", "ARS", "CLP", "PEN"];

export default function SettingsPage() {
  const { t, language, changeLanguage } = useLanguage();
  const [company, setCompany] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    primary_color: "#3A4D3F",
    secondary_color: "#E5DCC5",
    default_language: "en",
    currency: "USD",
  });

  useEffect(() => {
    fetchCompany();
    fetchDocumentTypes();
  }, []);

  const fetchCompany = async () => {
    try {
      const response = await axios.get(`${API}/settings/company`, { withCredentials: true });
      setCompany(response.data);
      setFormData({
        name: response.data.name,
        logo_url: response.data.logo_url || "",
        primary_color: response.data.primary_color,
        secondary_color: response.data.secondary_color,
        default_language: response.data.default_language,
        currency: response.data.currency,
      });
    } catch (error) {
      console.error("Failed to fetch company:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocumentTypes = async () => {
    try {
      const response = await axios.get(`${API}/settings/document-types`, { withCredentials: true });
      setDocumentTypes(response.data);
    } catch (error) {
      console.error("Failed to fetch document types:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/settings/company`, formData, { withCredentials: true });
      toast.success(language === "es" ? "Configuración guardada" : "Settings saved");
      fetchCompany();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateSettingChange = async (docType, setting, value) => {
    const typeIndex = documentTypes.findIndex(dt => dt.type === docType);
    if (typeIndex === -1) return;

    // Update local state immediately
    const updatedTypes = [...documentTypes];
    if (!updatedTypes[typeIndex].custom_settings) {
      updatedTypes[typeIndex].custom_settings = {};
    }
    updatedTypes[typeIndex].custom_settings[setting] = value;
    setDocumentTypes(updatedTypes);

    // Save to backend
    setSavingTemplate(docType);
    try {
      const existingTemplate = updatedTypes[typeIndex].template_id;
      const settings = updatedTypes[typeIndex].custom_settings;

      if (existingTemplate) {
        await axios.put(`${API}/settings/templates/${existingTemplate}`, {
          name: docType,
          settings,
        }, { withCredentials: true });
      } else {
        const response = await axios.post(`${API}/settings/templates`, {
          name: docType,
          type: docType,
          settings,
        }, { withCredentials: true });
        updatedTypes[typeIndex].template_id = response.data.template_id;
        setDocumentTypes(updatedTypes);
      }
      toast.success(language === "es" ? "Plantilla actualizada" : "Template updated");
    } catch (error) {
      toast.error("Failed to save template settings");
      // Revert
      fetchDocumentTypes();
    } finally {
      setSavingTemplate(null);
    }
  };

  const getDocTypeLabel = (dt) => {
    const labels = {
      contract: { en: "Contract", es: "Contrato" },
      quote: { en: "Proposal", es: "Propuesta" },
      invoice: { en: "Invoice", es: "Factura" },
      beo: { en: "Banquet Event Order", es: "Orden de Evento" },
      kitchen_sheet: { en: "Kitchen Sheet", es: "Hoja de Cocina" },
      packing_list: { en: "Packing/Setup List", es: "Lista de Montaje" },
      mise_en_place: { en: "Mise en Place", es: "Mise en Place" },
      menu: { en: "Menu", es: "Menú" },
    };
    return labels[dt.type]?.[language] || dt.name;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">{t("loading")}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="settings-page">
        {/* Header */}
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">{t("settings")}</h1>
          <p className="text-muted-foreground mt-1">{t("companySettings")}</p>
        </div>

        <Tabs defaultValue="branding" className="space-y-6">
          <TabsList>
            <TabsTrigger value="branding">{t("branding")}</TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("documentTemplates")}
            </TabsTrigger>
            <TabsTrigger value="preferences">
              {language === "es" ? "Preferencias" : "Preferences"}
            </TabsTrigger>
          </TabsList>

          {/* Branding Tab */}
          <TabsContent value="branding">
            <form onSubmit={handleSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {language === "es" ? "Información de la Empresa" : "Company Information"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>{t("companyName")}</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        data-testid="company-name-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("logoUrl")}</Label>
                      <Input
                        value={formData.logo_url}
                        onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      {language === "es" ? "Colores de Marca" : "Brand Colors"}
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>{t("primaryColor")}</Label>
                        <div className="flex gap-3">
                          <Input
                            type="color"
                            value={formData.primary_color}
                            onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                            className="w-16 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={formData.primary_color}
                            onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("secondaryColor")}</Label>
                        <div className="flex gap-3">
                          <Input
                            type="color"
                            value={formData.secondary_color}
                            onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                            className="w-16 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={formData.secondary_color}
                            onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="p-6 rounded-xl border">
                    <p className="text-sm text-muted-foreground mb-4">
                      {language === "es" ? "Vista Previa" : "Preview"}
                    </p>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: formData.primary_color }}
                      >
                        <span className="font-heading text-2xl font-bold text-white">
                          {formData.name?.charAt(0) || "E"}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-heading text-xl font-semibold">{formData.name}</h3>
                        <div className="flex gap-2 mt-2">
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: formData.primary_color }}
                            title="Primary"
                          />
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: formData.secondary_color }}
                            title="Secondary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving} data-testid="save-settings-btn">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {t("save")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          </TabsContent>

          {/* Document Templates Tab */}
          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {t("documentTemplates")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-6">
                  {language === "es"
                    ? "Configura las opciones de cada tipo de documento. Por ejemplo, la Hoja de Cocina no incluye precios por defecto."
                    : "Configure options for each document type. For example, Kitchen Sheet doesn't include prices by default."}
                </p>
                <div className="space-y-4">
                  {documentTypes.map((dt) => {
                    const showPrices = dt.custom_settings?.show_prices ?? dt.show_prices;
                    const requiresSignature = dt.custom_settings?.requires_signature ?? dt.requires_signature;
                    const isSaving = savingTemplate === dt.type;

                    return (
                      <div
                        key={dt.type}
                        className="flex items-center justify-between p-4 border rounded-lg"
                        data-testid={`template-${dt.type}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <h4 className="font-medium">{getDocTypeLabel(dt)}</h4>
                            <p className="text-xs text-muted-foreground">
                              {dt.type}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`${dt.type}-prices`} className="text-sm">
                              {t("showPrices")}
                            </Label>
                            <Switch
                              id={`${dt.type}-prices`}
                              checked={showPrices}
                              onCheckedChange={(checked) => handleTemplateSettingChange(dt.type, "show_prices", checked)}
                              disabled={isSaving}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`${dt.type}-signature`} className="text-sm">
                              {t("requiresSignature")}
                            </Label>
                            <Switch
                              id={`${dt.type}-signature`}
                              checked={requiresSignature}
                              onCheckedChange={(checked) => handleTemplateSettingChange(dt.type, "requires_signature", checked)}
                              disabled={isSaving}
                            />
                          </div>
                          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                          {!isSaving && dt.template_id && (
                            <Check className="w-4 h-4 text-success" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  {language === "es" ? "Preferencias Regionales" : "Regional Preferences"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>{t("language")}</Label>
                    <Select
                      value={language}
                      onValueChange={(value) => changeLanguage(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {language === "es"
                        ? "Cambiar el idioma de la interfaz"
                        : "Change the interface language"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      {t("currency")}
                    </Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) => setFormData({ ...formData, currency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((curr) => (
                          <SelectItem key={curr} value={curr}>
                            {curr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {language === "es"
                        ? "Moneda predeterminada para cotizaciones"
                        : "Default currency for quotes"}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSubmit} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {t("save")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
