// components/demand-studio/BrandHub.js - Brand Hub inside Demand Generation Settings
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { 
  Palette, Type, Image as ImageIcon, Wand2, FileText, MessageSquare, BookOpen,
  Plus, Search, Pin, Star, Trash2, Edit, Save, Upload, Copy, Check,
  Loader2, ChevronRight, ExternalLink, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";

// Default colors for color picker
const COLOR_PRESETS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#1e293b", "#64748b", "#94a3b8"
];

export default function BrandHub({ brandId = null }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("kit");
  
  // Brand Kit state
  const [brandKit, setBrandKit] = useState({
    tokens_json: {
      colors: { primary: "#6366f1", secondary: "#8b5cf6", accent: "#f59e0b", background: "#ffffff", surface: "#f8fafc", text: "#1e293b", text_muted: "#64748b" },
      typography: { font_heading: "Inter", font_body: "Inter", font_accent: "Inter" },
      buttons: { radius: "8px", style: "filled" }
    },
    logos_json: {}
  });
  
  // Looks state
  const [looks, setLooks] = useState([]);
  const [lookPacks, setLookPacks] = useState([]);
  const [lookDialogOpen, setLookDialogOpen] = useState(false);
  
  // Templates state  
  const [templates, setTemplates] = useState([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  
  // Messaging state
  const [messagingPack, setMessagingPack] = useState({
    tone_json: { voice: "", style: "", rules: [] },
    hooks_json: [],
    ctas_json: [],
    forbidden_json: []
  });
  
  // Playbooks state
  const [playbooks, setPlaybooks] = useState([]);
  const [playbookSearch, setPlaybookSearch] = useState("");
  const [playbookDialogOpen, setPlaybookDialogOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [kitRes, looksRes, packsRes, templatesRes, messagingRes, playbooksRes] = await Promise.all([
        axios.get(`${API}/api/brand-hub/kits`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/studio/looks`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/brand-hub/look-packs`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/brand-hub/templates`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/brand-hub/messaging-packs`, { withCredentials: true, params: { brand_id: brandId } }),
        axios.get(`${API}/api/brand-hub/playbooks`, { withCredentials: true, params: { brand_id: brandId } })
      ]);
      
      if (kitRes.data?.[0]) setBrandKit(kitRes.data[0]);
      setLooks(looksRes.data || []);
      setLookPacks(packsRes.data || []);
      setTemplates(templatesRes.data || []);
      if (messagingRes.data?.[0]) setMessagingPack(messagingRes.data[0]);
      setPlaybooks(playbooksRes.data || []);
    } catch (error) {
      console.error("Error fetching brand hub data:", error);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveBrandKit = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/api/brand-hub/kits`, {
        brand_id: brandId,
        tokens_json: brandKit.tokens_json,
        logos_json: brandKit.logos_json
      }, { withCredentials: true });
      toast.success(isEs ? "Brand Kit guardado" : "Brand Kit saved");
    } catch (error) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  const saveMessaging = async () => {
    setSaving(true);
    try {
      if (messagingPack.pack_id && messagingPack.pack_id !== "default") {
        await axios.put(`${API}/api/brand-hub/messaging-packs/${messagingPack.pack_id}`, {
          brand_id: brandId,
          name: messagingPack.name || "Default",
          tone_json: messagingPack.tone_json,
          hooks_json: messagingPack.hooks_json,
          ctas_json: messagingPack.ctas_json,
          forbidden_json: messagingPack.forbidden_json,
          blocks_json: messagingPack.blocks_json || []
        }, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/brand-hub/messaging-packs`, {
          brand_id: brandId,
          name: "Default",
          tone_json: messagingPack.tone_json,
          hooks_json: messagingPack.hooks_json,
          ctas_json: messagingPack.ctas_json,
          forbidden_json: messagingPack.forbidden_json,
          blocks_json: []
        }, { withCredentials: true });
      }
      toast.success(isEs ? "Messaging guardado" : "Messaging saved");
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  const updateColor = (colorKey, value) => {
    setBrandKit(prev => ({
      ...prev,
      tokens_json: {
        ...prev.tokens_json,
        colors: {
          ...prev.tokens_json.colors,
          [colorKey]: value
        }
      }
    }));
  };

  const togglePlaybookPin = async (page_id) => {
    try {
      await axios.post(`${API}/api/brand-hub/playbooks/${page_id}/pin`, {}, { withCredentials: true });
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error" : "Error");
    }
  };

  const savePlaybook = async () => {
    if (!editingPlaybook?.title) {
      toast.error(isEs ? "El título es requerido" : "Title is required");
      return;
    }
    
    setSaving(true);
    try {
      if (editingPlaybook.page_id) {
        await axios.put(`${API}/api/brand-hub/playbooks/${editingPlaybook.page_id}`, {
          brand_id: brandId,
          title: editingPlaybook.title,
          content_rich_json: editingPlaybook.content_rich_json || {},
          pinned: editingPlaybook.pinned || false,
          tags: editingPlaybook.tags || [],
          attachments_json: editingPlaybook.attachments_json || []
        }, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/brand-hub/playbooks`, {
          brand_id: brandId,
          title: editingPlaybook.title,
          content_rich_json: editingPlaybook.content_rich_json || {},
          pinned: false,
          tags: editingPlaybook.tags || [],
          attachments_json: []
        }, { withCredentials: true });
      }
      toast.success(isEs ? "Playbook guardado" : "Playbook saved");
      setPlaybookDialogOpen(false);
      setEditingPlaybook(null);
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  const filteredPlaybooks = playbooks.filter(p => 
    !playbookSearch || 
    p.title.toLowerCase().includes(playbookSearch.toLowerCase()) ||
    p.tags?.some(t => t.toLowerCase().includes(playbookSearch.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="brand-hub">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Brand Hub
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Fuente de verdad para tu marca" : "Source of truth for your brand"}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="kit" className="gap-1 text-xs">
            <Palette className="w-3 h-3" />
            <span className="hidden sm:inline">Brand Kit</span>
          </TabsTrigger>
          <TabsTrigger value="looks" className="gap-1 text-xs">
            <Wand2 className="w-3 h-3" />
            <span className="hidden sm:inline">Looks</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1 text-xs">
            <FileText className="w-3 h-3" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="messaging" className="gap-1 text-xs">
            <MessageSquare className="w-3 h-3" />
            <span className="hidden sm:inline">Messaging</span>
          </TabsTrigger>
          <TabsTrigger value="playbooks" className="gap-1 text-xs">
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline">Playbooks</span>
          </TabsTrigger>
        </TabsList>

        {/* Brand Kit Tab */}
        <TabsContent value="kit" className="space-y-6 mt-6">
          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="w-4 h-4" />
                {isEs ? "Colores" : "Colors"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(brandKit.tokens_json.colors || {}).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs capitalize">{key.replace("_", " ")}</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border"
                      />
                      <Input
                        value={value}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="flex-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Color presets */}
              <div>
                <Label className="text-xs mb-2 block">{isEs ? "Presets rápidos" : "Quick presets"}</Label>
                <div className="flex flex-wrap gap-1">
                  {COLOR_PRESETS.map(color => (
                    <button
                      key={color}
                      className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => updateColor("primary", color)}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Type className="w-4 h-4" />
                {isEs ? "Tipografía" : "Typography"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(brandKit.tokens_json.typography || {}).map(([key, value]) => (
                  <div key={key}>
                    <Label className="text-xs capitalize">{key.replace("font_", "")}</Label>
                    <Input
                      value={value}
                      onChange={(e) => setBrandKit(prev => ({
                        ...prev,
                        tokens_json: {
                          ...prev.tokens_json,
                          typography: { ...prev.tokens_json.typography, [key]: e.target.value }
                        }
                      }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Logos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Logos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {["primary", "secondary", "icon"].map(logoType => (
                  <div key={logoType} className="border-2 border-dashed rounded-lg p-4 text-center">
                    {brandKit.logos_json?.[logoType] ? (
                      <img 
                        src={brandKit.logos_json[logoType]} 
                        alt={logoType} 
                        className="max-h-16 mx-auto"
                      />
                    ) : (
                      <div className="text-muted-foreground">
                        <Upload className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-xs capitalize">{logoType}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveBrandKit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {isEs ? "Guardar Brand Kit" : "Save Brand Kit"}
          </Button>
        </TabsContent>

        {/* Looks Tab */}
        <TabsContent value="looks" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {looks.length} {isEs ? "looks disponibles" : "looks available"}
            </p>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              {isEs ? "Crear Look" : "Create Look"}
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {looks.map(look => (
              <div 
                key={look.look_id}
                className="relative rounded-lg overflow-hidden border hover:border-primary cursor-pointer group"
              >
                <div className="aspect-square bg-gradient-to-br from-gray-200 to-gray-400 flex items-center justify-center">
                  {look.preview_image_url ? (
                    <img src={look.preview_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Wand2 className="w-8 h-8 text-gray-500" />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium truncate">{look.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{look.category}</p>
                </div>
                {look.is_favorite && (
                  <Star className="absolute top-2 right-2 w-4 h-4 text-yellow-400 fill-yellow-400" />
                )}
              </div>
            ))}
          </div>

          {/* Look Packs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Look Packs</CardTitle>
              <CardDescription>
                {isEs ? "Colecciones curadas de looks" : "Curated look collections"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lookPacks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {isEs ? "No hay packs creados" : "No packs created"}
                </p>
              ) : (
                <div className="space-y-2">
                  {lookPacks.map(pack => (
                    <div key={pack.pack_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{pack.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pack.look_ids?.length || 0} looks
                        </p>
                      </div>
                      {pack.is_default && <Badge>Default</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {templates.length} templates
            </p>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              {isEs ? "Crear Template" : "Create Template"}
            </Button>
          </div>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {isEs ? "No hay templates. Crea tu primer template." : "No templates. Create your first template."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {templates.map(template => (
                <Card key={template.template_id} className="cursor-pointer hover:border-primary">
                  <CardContent className="p-4">
                    <div className="aspect-video bg-muted rounded mb-3 flex items-center justify-center">
                      {template.preview_url ? (
                        <img src={template.preview_url} alt="" className="w-full h-full object-cover rounded" />
                      ) : (
                        <FileText className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                    <p className="font-medium text-sm truncate">{template.name}</p>
                    <Badge variant="outline" className="text-[10px] mt-1">{template.type}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Messaging Tab */}
        <TabsContent value="messaging" className="space-y-6 mt-6">
          {/* Tone */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Tono y Voz" : "Tone & Voice"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{isEs ? "Voz de marca" : "Brand voice"}</Label>
                <Input
                  value={messagingPack.tone_json?.voice || ""}
                  onChange={(e) => setMessagingPack(prev => ({
                    ...prev,
                    tone_json: { ...prev.tone_json, voice: e.target.value }
                  }))}
                  placeholder={isEs ? "Ej: Profesional pero accesible" : "E.g., Professional yet approachable"}
                />
              </div>
              <div>
                <Label>{isEs ? "Estilo" : "Style"}</Label>
                <Input
                  value={messagingPack.tone_json?.style || ""}
                  onChange={(e) => setMessagingPack(prev => ({
                    ...prev,
                    tone_json: { ...prev.tone_json, style: e.target.value }
                  }))}
                  placeholder={isEs ? "Ej: Claro y conciso" : "E.g., Clear and concise"}
                />
              </div>
            </CardContent>
          </Card>

          {/* CTAs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{isEs ? "CTAs Aprobados" : "Approved CTAs"}</span>
                <Button variant="ghost" size="sm" onClick={() => {
                  setMessagingPack(prev => ({
                    ...prev,
                    ctas_json: [...(prev.ctas_json || []), { text: "", type: "primary" }]
                  }));
                }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(messagingPack.ctas_json || []).map((cta, i) => (
                  <Badge key={i} variant="outline" className="py-1.5 px-3">
                    {cta.text || "New CTA"}
                    <button 
                      className="ml-2 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setMessagingPack(prev => ({
                          ...prev,
                          ctas_json: prev.ctas_json.filter((_, idx) => idx !== i)
                        }));
                      }}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Hooks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Hook Bank</span>
                <Button variant="ghost" size="sm" onClick={() => {
                  setMessagingPack(prev => ({
                    ...prev,
                    hooks_json: [...(prev.hooks_json || []), { text: "", category: "general" }]
                  }));
                }}>
                  <Plus className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(messagingPack.hooks_json || []).map((hook, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <span className="flex-1 text-sm">{hook.text || "New hook..."}</span>
                    <Badge variant="outline" className="text-[10px]">{hook.category}</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveMessaging} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {isEs ? "Guardar Messaging" : "Save Messaging"}
          </Button>
        </TabsContent>

        {/* Playbooks Tab */}
        <TabsContent value="playbooks" className="space-y-6 mt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isEs ? "Buscar playbooks..." : "Search playbooks..."}
                value={playbookSearch}
                onChange={(e) => setPlaybookSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setEditingPlaybook({ title: "", content_rich_json: {} }); setPlaybookDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nuevo Playbook" : "New Playbook"}
            </Button>
          </div>

          {/* Pinned */}
          {filteredPlaybooks.filter(p => p.pinned).length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Pin className="w-4 h-4" />
                {isEs ? "Fijados" : "Pinned"}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPlaybooks.filter(p => p.pinned).map(page => (
                  <Card key={page.page_id} className="cursor-pointer hover:border-primary" onClick={() => { setEditingPlaybook(page); setPlaybookDialogOpen(true); }}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{page.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(page.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); togglePlaybookPin(page.page_id); }}>
                          <Pin className="w-4 h-4 fill-current" />
                        </Button>
                      </div>
                      {page.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {page.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* All Playbooks */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              {isEs ? "Todos los Playbooks" : "All Playbooks"}
            </h3>
            {filteredPlaybooks.filter(p => !p.pinned).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {isEs ? "No hay playbooks. Crea el primero." : "No playbooks. Create the first one."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredPlaybooks.filter(p => !p.pinned).map(page => (
                  <Card key={page.page_id} className="cursor-pointer hover:border-primary" onClick={() => { setEditingPlaybook(page); setPlaybookDialogOpen(true); }}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <h4 className="font-medium text-sm">{page.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {new Date(page.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Playbook Dialog */}
      <Dialog open={playbookDialogOpen} onOpenChange={setPlaybookDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlaybook?.page_id ? (isEs ? "Editar Playbook" : "Edit Playbook") : (isEs ? "Nuevo Playbook" : "New Playbook")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Título" : "Title"}</Label>
              <Input
                value={editingPlaybook?.title || ""}
                onChange={(e) => setEditingPlaybook(prev => ({ ...prev, title: e.target.value }))}
                placeholder={isEs ? "Nombre del playbook" : "Playbook name"}
              />
            </div>
            <div>
              <Label>{isEs ? "Contenido" : "Content"}</Label>
              <Textarea
                value={editingPlaybook?.content_rich_json?.text || ""}
                onChange={(e) => setEditingPlaybook(prev => ({ 
                  ...prev, 
                  content_rich_json: { ...prev?.content_rich_json, text: e.target.value }
                }))}
                rows={10}
                placeholder={isEs ? "Escribe el contenido del playbook..." : "Write playbook content..."}
              />
            </div>
            <div>
              <Label>Tags</Label>
              <Input
                value={editingPlaybook?.tags?.join(", ") || ""}
                onChange={(e) => setEditingPlaybook(prev => ({ 
                  ...prev, 
                  tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean)
                }))}
                placeholder={isEs ? "tag1, tag2, tag3" : "tag1, tag2, tag3"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlaybookDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={savePlaybook} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
