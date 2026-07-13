// components/demand-studio/CampaignDNA.js - Campaign DNA tab inside Campaign Detail
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Palette, Wand2, FileText, MessageSquare, Download, Save, RefreshCw, Check, ArrowRight, Sparkles } from "lucide-react";
import { KoraLoader } from "../KoraLoader";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";

export default function CampaignDNA({ campaignId, brandId = null }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("theme");
  
  // DNA state
  const [dna, setDna] = useState({
    theme_overrides_json: {},
    default_look_id: null,
    look_pack_id: null,
    messaging_pack_id: null,
    export_rules_json: { sizes: ["1:1", "4:5", "9:16"], include_landscape: false }
  });
  
  // Options from brand level
  const [looks, setLooks] = useState([]);
  const [lookPacks, setLookPacks] = useState([]);
  const [messagingPacks, setMessagingPacks] = useState([]);
  const [resolvedConfig, setResolvedConfig] = useState(null);

  const fetchData = useCallback(async () => {
    if (!campaignId) return;
    
    setLoading(true);
    try {
      const [dnaRes, looksRes, packsRes, messagingRes, resolvedRes] = await Promise.all([
        axios.get(`${API}/api/brand-hub/campaign-dna/${campaignId}`, { withCredentials: true }),
        axios.get(`${API}/api/studio/looks`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/brand-hub/look-packs`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/brand-hub/messaging-packs`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/brand-hub/resolve`, { withCredentials: true, params: { brand_id: brandId, campaign_id: campaignId } })
      ]);
      
      if (dnaRes.data) setDna(dnaRes.data);
      setLooks(looksRes.data || []);
      setLookPacks(packsRes.data || []);
      setMessagingPacks(messagingRes.data || []);
      setResolvedConfig(resolvedRes.data);
    } catch (error) {
      console.error("Error fetching campaign DNA:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId, brandId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveDNA = async () => {
    if (!campaignId) return;
    
    setSaving(true);
    try {
      await axios.post(`${API}/api/brand-hub/campaign-dna`, {
        campaign_id: campaignId,
        theme_overrides_json: dna.theme_overrides_json,
        default_look_id: dna.default_look_id,
        look_pack_id: dna.look_pack_id,
        messaging_pack_id: dna.messaging_pack_id,
        export_rules_json: dna.export_rules_json
      }, { withCredentials: true });
      
      toast.success(isEs ? "Campaign DNA guardado" : "Campaign DNA saved");
      fetchData(); // Refresh resolved config
    } catch (error) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  const updateThemeOverride = (key, value) => {
    setDna(prev => ({
      ...prev,
      theme_overrides_json: {
        ...prev.theme_overrides_json,
        colors: {
          ...(prev.theme_overrides_json?.colors || {}),
          [key]: value
        }
      }
    }));
  };

  const toggleExportSize = (size) => {
    setDna(prev => {
      const sizes = prev.export_rules_json?.sizes || [];
      const newSizes = sizes.includes(size)
        ? sizes.filter(s => s !== size)
        : [...sizes, size];
      return {
        ...prev,
        export_rules_json: {
          ...prev.export_rules_json,
          sizes: newSizes
        }
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="campaign-dna">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Campaign DNA
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Configuración específica de campaña (hereda de Brand Hub)" : "Campaign-specific config (inherits from Brand Hub)"}
          </p>
        </div>
        <Button onClick={saveDNA} disabled={saving}>
          {saving ? <KoraLoader size={16} className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {isEs ? "Guardar" : "Save"}
        </Button>
      </div>

      {/* Inheritance indicator */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-3 flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Brand Hub</span>
            <ArrowRight className="w-4 h-4" />
            <span className="text-foreground font-medium">Campaign DNA</span>
          </div>
          <Badge variant="outline" className="ml-auto">
            {isEs ? "Los valores vacíos heredan de Brand Hub" : "Empty values inherit from Brand Hub"}
          </Badge>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="theme" className="gap-1 text-xs">
            <Palette className="w-3 h-3" />
            Theme
          </TabsTrigger>
          <TabsTrigger value="looks" className="gap-1 text-xs">
            <Wand2 className="w-3 h-3" />
            Looks
          </TabsTrigger>
          <TabsTrigger value="messaging" className="gap-1 text-xs">
            <MessageSquare className="w-3 h-3" />
            Copy
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1 text-xs">
            <Download className="w-3 h-3" />
            Export
          </TabsTrigger>
        </TabsList>

        {/* Theme Tab */}
        <TabsContent value="theme" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isEs ? "Colores de Campaña" : "Campaign Colors"}
              </CardTitle>
              <CardDescription>
                {isEs ? "Sobrescribe los colores de Brand Hub para esta campaña" : "Override Brand Hub colors for this campaign"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {["primary", "secondary", "accent"].map(colorKey => {
                  const brandValue = resolvedConfig?.effective_tokens?.colors?.[colorKey] || "#6366f1";
                  const overrideValue = dna.theme_overrides_json?.colors?.[colorKey];
                  
                  return (
                    <div key={colorKey} className="space-y-2">
                      <Label className="text-xs capitalize flex items-center gap-2">
                        {colorKey}
                        {overrideValue && <Badge variant="secondary" className="text-[10px]">Override</Badge>}
                      </Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={overrideValue || brandValue}
                          onChange={(e) => updateThemeOverride(colorKey, e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer border"
                        />
                        <Input
                          value={overrideValue || ""}
                          onChange={(e) => updateThemeOverride(colorKey, e.target.value || null)}
                          placeholder={brandValue}
                          className="flex-1 font-mono text-xs"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Brand: {brandValue}
                      </p>
                    </div>
                  );
                })}
              </div>
              
              {Object.keys(dna.theme_overrides_json?.colors || {}).length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => setDna(prev => ({ ...prev, theme_overrides_json: {} }))}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  {isEs ? "Resetear a Brand Hub" : "Reset to Brand Hub"}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Looks Tab */}
        <TabsContent value="looks" className="space-y-6 mt-6">
          {/* Default Look */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isEs ? "Look por Defecto" : "Default Look"}
              </CardTitle>
              <CardDescription>
                {isEs ? "El look que se aplica automáticamente a nuevos assets" : "The look automatically applied to new assets"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={dna.default_look_id || ""}
                onValueChange={(val) => setDna(prev => ({ ...prev, default_look_id: val || null }))}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={isEs ? "Heredar de Brand Hub" : "Inherit from Brand Hub"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{isEs ? "Heredar de Brand Hub" : "Inherit from Brand Hub"}</SelectItem>
                  {looks.map(look => (
                    <SelectItem key={look.look_id} value={look.look_id}>
                      {look.name} ({look.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Preview selected look */}
              {dna.default_look_id && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                  <div className="w-12 h-12 rounded bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
                    <Wand2 className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {looks.find(l => l.look_id === dna.default_look_id)?.name || "Selected Look"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Se aplicará a nuevos assets" : "Will be applied to new assets"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Look Pack Override */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Look Pack</CardTitle>
              <CardDescription>
                {isEs ? "Colección de looks para esta campaña" : "Look collection for this campaign"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={dna.look_pack_id || ""}
                onValueChange={(val) => setDna(prev => ({ ...prev, look_pack_id: val || null }))}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={isEs ? "Heredar de Brand Hub" : "Inherit from Brand Hub"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{isEs ? "Heredar de Brand Hub" : "Inherit from Brand Hub"}</SelectItem>
                  {lookPacks.map(pack => (
                    <SelectItem key={pack.pack_id} value={pack.pack_id}>
                      {pack.name} ({pack.look_ids?.length || 0} looks)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messaging Tab */}
        <TabsContent value="messaging" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isEs ? "Pack de Messaging" : "Messaging Pack"}
              </CardTitle>
              <CardDescription>
                {isEs ? "CTAs, hooks y tono para esta campaña" : "CTAs, hooks and tone for this campaign"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={dna.messaging_pack_id || ""}
                onValueChange={(val) => setDna(prev => ({ ...prev, messaging_pack_id: val || null }))}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={isEs ? "Heredar de Brand Hub" : "Inherit from Brand Hub"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{isEs ? "Heredar de Brand Hub" : "Inherit from Brand Hub"}</SelectItem>
                  {messagingPacks.map(pack => (
                    <SelectItem key={pack.pack_id} value={pack.pack_id}>
                      {pack.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Preview effective messaging */}
              {resolvedConfig?.effective_messaging && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-medium">{isEs ? "Configuración efectiva" : "Effective config"}</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs font-medium mb-1">CTAs</p>
                      <div className="flex flex-wrap gap-1">
                        {(resolvedConfig.effective_messaging.ctas_json || []).slice(0, 4).map((cta, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{cta.text}</Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs font-medium mb-1">Hooks</p>
                      <p className="text-xs text-muted-foreground">
                        {resolvedConfig.effective_messaging.hooks_json?.length || 0} {isEs ? "disponibles" : "available"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isEs ? "Reglas de Exportación" : "Export Rules"}
              </CardTitle>
              <CardDescription>
                {isEs ? "Tamaños y configuración de exportación" : "Export sizes and configuration"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-3 block">{isEs ? "Tamaños incluidos" : "Included sizes"}</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "1:1", label: "Square (1:1)" },
                    { value: "4:5", label: "Portrait (4:5)" },
                    { value: "9:16", label: "Story (9:16)" },
                    { value: "16:9", label: "Landscape (16:9)" }
                  ].map(size => {
                    const isSelected = dna.export_rules_json?.sizes?.includes(size.value);
                    return (
                      <Button
                        key={size.value}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleExportSize(size.value)}
                      >
                        {isSelected && <Check className="w-3 h-3 mr-1" />}
                        {size.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">{isEs ? "Incluir Landscape" : "Include Landscape"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Añadir 16:9 al pack de exportación" : "Add 16:9 to export pack"}
                  </p>
                </div>
                <Switch
                  checked={dna.export_rules_json?.include_landscape || false}
                  onCheckedChange={(checked) => setDna(prev => ({
                    ...prev,
                    export_rules_json: { ...prev.export_rules_json, include_landscape: checked }
                  }))}
                />
              </div>
              
              <div>
                <Label>{isEs ? "Calidad de exportación" : "Export quality"}</Label>
                <Select
                  value={String(dna.export_rules_json?.quality || 90)}
                  onValueChange={(val) => setDna(prev => ({
                    ...prev,
                    export_rules_json: { ...prev.export_rules_json, quality: parseInt(val) }
                  }))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="70">70% (Menor)</SelectItem>
                    <SelectItem value="80">80%</SelectItem>
                    <SelectItem value="90">90% (Default)</SelectItem>
                    <SelectItem value="100">100% (Máxima)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
