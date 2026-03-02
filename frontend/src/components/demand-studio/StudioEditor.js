// components/demand-studio/StudioEditor.js - Tezza-like Photo/Video Editor
import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Slider } from "../ui/slider";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { 
  Wand2, Sliders, Crop, Download, Save, Heart, Plus,
  Loader2, RefreshCw, Check, X, ChevronLeft, ChevronRight,
  Image as ImageIcon, Square, RectangleHorizontal, RectangleVertical,
  Smartphone, Upload, Trash2, Star
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";

const DEFAULT_SLIDERS = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  saturation: 0,
  grain: 0,
  sharpen: 0,
  vignette: 0,
  glow: 0
};

const SLIDER_CONFIG = [
  { key: "exposure", label: "Exposure", labelEs: "Exposición", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", labelEs: "Contraste", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", labelEs: "Luces", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", labelEs: "Sombras", min: -100, max: 100 },
  { key: "temperature", label: "Temperature", labelEs: "Temperatura", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", labelEs: "Saturación", min: -100, max: 100 },
  { key: "grain", label: "Grain", labelEs: "Grano", min: 0, max: 100 },
  { key: "sharpen", label: "Sharpen", labelEs: "Nitidez", min: 0, max: 100 },
  { key: "vignette", label: "Vignette", labelEs: "Viñeta", min: 0, max: 100 },
  { key: "glow", label: "Glow", labelEs: "Resplandor", min: 0, max: 100 },
];

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square", labelEs: "Cuadrado", icon: Square, width: 1080, height: 1080 },
  { value: "4:5", label: "Portrait", labelEs: "Retrato", icon: RectangleVertical, width: 1080, height: 1350 },
  { value: "9:16", label: "Story", labelEs: "Historia", icon: Smartphone, width: 1080, height: 1920 },
  { value: "16:9", label: "Landscape", labelEs: "Paisaje", icon: RectangleHorizontal, width: 1920, height: 1080 },
];

export default function StudioEditor({ 
  isOpen, 
  onClose, 
  initialAssets = [], 
  campaignId = null,
  onSave,
  onSaveAsTemplate
}) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const canvasRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("looks");
  const [assets, setAssets] = useState([]);
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0);
  const [looks, setLooks] = useState([]);
  const [selectedLook, setSelectedLook] = useState(null);
  const [sliders, setSliders] = useState({ ...DEFAULT_SLIDERS });
  const [cropRatio, setCropRatio] = useState("1:1");
  const [uploading, setUploading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSizes, setExportSizes] = useState(["1:1", "4:5", "9:16"]);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("social_post");
  const [newTemplateCategory, setNewTemplateCategory] = useState("custom");
  
  // Load looks on mount
  useEffect(() => {
    const fetchLooks = async () => {
      try {
        const res = await axios.get(`${API}/api/studio/looks`, { withCredentials: true });
        setLooks(res.data || []);
      } catch (error) {
        console.error("Error fetching looks:", error);
      }
    };
    fetchLooks();
  }, []);
  
  // Initialize assets
  useEffect(() => {
    if (initialAssets.length > 0) {
      setAssets(initialAssets);
      if (initialAssets[0]?.current_edit_json?.sliders) {
        setSliders(initialAssets[0].current_edit_json.sliders);
      }
      if (initialAssets[0]?.current_edit_json?.look_id) {
        setSelectedLook(initialAssets[0].current_edit_json.look_id);
      }
    }
  }, [initialAssets]);

  const currentAsset = assets[selectedAssetIndex];
  
  // Apply CSS filters based on sliders
  const getFilterStyle = () => {
    const { exposure, contrast, highlights, shadows, temperature, saturation, grain, sharpen, vignette, glow } = sliders;
    
    const brightness = 100 + exposure;
    const contrastVal = 100 + contrast;
    const saturateVal = 100 + saturation;
    
    // Temperature approximation using sepia + hue-rotate
    const sepiaVal = Math.max(0, temperature) / 5;
    const hueRotate = temperature < 0 ? Math.abs(temperature) * 2 : 0;
    
    return {
      filter: `
        brightness(${brightness}%)
        contrast(${contrastVal}%)
        saturate(${saturateVal}%)
        sepia(${sepiaVal}%)
        hue-rotate(${hueRotate}deg)
      `.trim(),
      // Vignette as box shadow
      boxShadow: vignette > 0 
        ? `inset 0 0 ${vignette * 2}px ${vignette / 2}px rgba(0,0,0,${vignette / 100})`
        : 'none'
    };
  };

  const applyLook = (look) => {
    setSelectedLook(look.look_id);
    if (look.settings_json) {
      setSliders(prev => ({
        ...DEFAULT_SLIDERS,
        ...look.settings_json
      }));
    }
  };

  const resetSliders = () => {
    setSliders({ ...DEFAULT_SLIDERS });
    setSelectedLook(null);
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        if (campaignId) {
          formData.append("campaign_id", campaignId);
        }
        
        const res = await axios.post(`${API}/api/studio/assets/upload`, formData, {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" }
        });
        
        setAssets(prev => [...prev, res.data]);
      }
      toast.success(isEs ? "Archivo subido" : "File uploaded");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(isEs ? "Error al subir" : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAsset = (index) => {
    setAssets(prev => prev.filter((_, i) => i !== index));
    if (selectedAssetIndex >= assets.length - 1) {
      setSelectedAssetIndex(Math.max(0, assets.length - 2));
    }
  };

  const saveEdits = async () => {
    if (!currentAsset) return;
    
    setLoading(true);
    try {
      await axios.put(`${API}/api/studio/assets/${currentAsset.asset_id}`, {
        current_edit_json: {
          look_id: selectedLook,
          sliders,
          crop: cropRatio
        }
      }, { withCredentials: true });
      
      toast.success(isEs ? "Cambios guardados" : "Changes saved");
    } catch (error) {
      console.error("Save error:", error);
      toast.error(isEs ? "Error al guardar" : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    // For MVP, we'll just save the edit settings
    // In production, this would generate actual resized exports
    if (!currentAsset) return;
    
    setLoading(true);
    try {
      const exports = exportSizes.map(size => ({
        size,
        url: currentAsset.original_url, // In production, generate actual exports
        created_at: new Date().toISOString()
      }));
      
      await axios.put(`${API}/api/studio/assets/${currentAsset.asset_id}`, {
        current_edit_json: { look_id: selectedLook, sliders, crop: cropRatio },
        exports_json: exports
      }, { withCredentials: true });
      
      toast.success(isEs ? `Exportado en ${exportSizes.length} tamaños` : `Exported in ${exportSizes.length} sizes`);
      setExportDialogOpen(false);
      
      if (onSave) {
        onSave(assets);
      }
    } catch (error) {
      console.error("Export error:", error);
      toast.error(isEs ? "Error al exportar" : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const applyToAll = () => {
    if (!selectedLook && JSON.stringify(sliders) === JSON.stringify(DEFAULT_SLIDERS)) {
      toast.info(isEs ? "No hay cambios para aplicar" : "No changes to apply");
      return;
    }
    
    // Apply current settings to all assets
    setAssets(prev => prev.map(asset => ({
      ...asset,
      current_edit_json: {
        ...asset.current_edit_json,
        look_id: selectedLook,
        sliders
      }
    })));
    
    toast.success(isEs ? "Aplicado a todos" : "Applied to all");
  };

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error(isEs ? "Ingresa un nombre" : "Enter a name");
      return;
    }
    
    if (!currentAsset) {
      toast.error(isEs ? "No hay imagen seleccionada" : "No image selected");
      return;
    }

    setLoading(true);
    try {
      const templateData = {
        name: newTemplateName,
        type: newTemplateType,
        category: newTemplateCategory,
        template_json: {
          aspect_ratio: cropRatio,
          look_id: selectedLook,
          sliders: sliders,
          source_asset: currentAsset.asset_id
        },
        preview_url: currentAsset.original_url,
        auto_applies_tokens: true,
        is_default: false
      };

      await axios.post(`${API}/api/brand-hub/templates`, templateData, { withCredentials: true });
      toast.success(isEs ? "Template guardado" : "Template saved");
      setSaveAsTemplateOpen(false);
      setNewTemplateName("");
      
      if (onSaveAsTemplate) {
        onSaveAsTemplate(templateData);
      }
    } catch (error) {
      console.error("Save as template error:", error);
      toast.error(isEs ? "Error al guardar template" : "Error saving template");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            <Wand2 className="w-5 h-5 text-primary" />
            <span className="font-semibold">Studio</span>
            {assets.length > 0 && (
              <Badge variant="secondary">{assets.length} {isEs ? "archivos" : "files"}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetSliders}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSaveAsTemplateOpen(true)} disabled={loading || !currentAsset}>
              <Plus className="w-4 h-4 mr-1" />
              {isEs ? "Guardar como Template" : "Save as Template"}
            </Button>
            <Button variant="outline" size="sm" onClick={saveEdits} disabled={loading || !currentAsset}>
              <Save className="w-4 h-4 mr-1" />
              {isEs ? "Guardar" : "Save"}
            </Button>
            <Button size="sm" onClick={() => setExportDialogOpen(true)} disabled={!currentAsset}>
              <Download className="w-4 h-4 mr-1" />
              {isEs ? "Exportar" : "Export"}
            </Button>
          </div>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Media Tray */}
          <div className="w-24 border-r bg-muted/30 p-2 overflow-y-auto">
            <div className="space-y-2">
              {assets.map((asset, index) => (
                <div
                  key={asset.asset_id || index}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                    selectedAssetIndex === index ? "border-primary" : "border-transparent hover:border-muted-foreground"
                  }`}
                  onClick={() => setSelectedAssetIndex(index)}
                >
                  <img
                    src={asset.original_url?.startsWith("/") ? `${API}${asset.original_url}` : asset.original_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                    onClick={(e) => { e.stopPropagation(); removeAsset(index); }}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              
              {/* Upload Button */}
              <label className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary flex items-center justify-center cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="w-5 h-5 text-muted-foreground" />
                )}
              </label>
            </div>
          </div>
          
          {/* Center: Main Preview */}
          <div className="flex-1 flex items-center justify-center p-6 bg-neutral-900">
            {currentAsset ? (
              <div 
                ref={canvasRef}
                className="relative max-w-full max-h-full rounded-lg overflow-hidden"
                style={getFilterStyle()}
              >
                <img
                  src={currentAsset.original_url?.startsWith("/") ? `${API}${currentAsset.original_url}` : currentAsset.original_url}
                  alt=""
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
            ) : (
              <div className="text-center text-white/50">
                <Upload className="w-16 h-16 mx-auto mb-4" />
                <p>{isEs ? "Arrastra archivos o haz clic en +" : "Drag files or click +"}</p>
              </div>
            )}
          </div>
          
          {/* Right: Controls */}
          <div className="w-80 border-l overflow-y-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-4 rounded-none border-b">
                <TabsTrigger value="looks" className="text-xs">
                  <Wand2 className="w-3 h-3 mr-1" />
                  Looks
                </TabsTrigger>
                <TabsTrigger value="adjust" className="text-xs">
                  <Sliders className="w-3 h-3 mr-1" />
                  Adjust
                </TabsTrigger>
                <TabsTrigger value="crop" className="text-xs">
                  <Crop className="w-3 h-3 mr-1" />
                  Crop
                </TabsTrigger>
                <TabsTrigger value="export" className="text-xs">
                  <Download className="w-3 h-3 mr-1" />
                  Export
                </TabsTrigger>
              </TabsList>
              
              {/* Looks Tab */}
              <TabsContent value="looks" className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{isEs ? "Presets" : "Presets"}</span>
                  {assets.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={applyToAll}>
                      {isEs ? "Aplicar a todos" : "Apply to all"}
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {looks.map((look) => (
                    <div
                      key={look.look_id}
                      className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                        selectedLook === look.look_id ? "border-primary" : "border-transparent hover:border-muted"
                      }`}
                      onClick={() => applyLook(look)}
                    >
                      <div className="aspect-square bg-gradient-to-br from-gray-200 to-gray-400 flex items-center justify-center">
                        {look.preview_image_url ? (
                          <img src={look.preview_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Wand2 className="w-6 h-6 text-gray-500" />
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                        <p className="text-xs text-white truncate">{look.name}</p>
                      </div>
                      {look.is_favorite && (
                        <Star className="absolute top-1 right-1 w-4 h-4 text-yellow-400 fill-yellow-400" />
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              {/* Adjust Tab */}
              <TabsContent value="adjust" className="p-4 space-y-4">
                {SLIDER_CONFIG.map((slider) => (
                  <div key={slider.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">{isEs ? slider.labelEs : slider.label}</label>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {sliders[slider.key]}
                      </span>
                    </div>
                    <Slider
                      value={[sliders[slider.key]]}
                      onValueChange={([val]) => setSliders(prev => ({ ...prev, [slider.key]: val }))}
                      min={slider.min}
                      max={slider.max}
                      step={1}
                    />
                  </div>
                ))}
              </TabsContent>
              
              {/* Crop Tab */}
              <TabsContent value="crop" className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {ASPECT_RATIOS.map((ratio) => (
                    <Button
                      key={ratio.value}
                      variant={cropRatio === ratio.value ? "default" : "outline"}
                      className="h-auto py-3 flex-col"
                      onClick={() => setCropRatio(ratio.value)}
                    >
                      <ratio.icon className="w-6 h-6 mb-1" />
                      <span className="text-xs">{ratio.value}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {isEs ? ratio.labelEs : ratio.label}
                      </span>
                    </Button>
                  ))}
                </div>
                
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    {isEs 
                      ? "El recorte se aplicará al exportar" 
                      : "Crop will be applied on export"}
                  </p>
                </div>
              </TabsContent>
              
              {/* Export Tab */}
              <TabsContent value="export" className="p-4 space-y-4">
                <div className="space-y-3">
                  <p className="text-sm font-medium">{isEs ? "Tamaños a exportar" : "Export sizes"}</p>
                  {ASPECT_RATIOS.map((ratio) => (
                    <label
                      key={ratio.value}
                      className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={exportSizes.includes(ratio.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setExportSizes(prev => [...prev, ratio.value]);
                          } else {
                            setExportSizes(prev => prev.filter(s => s !== ratio.value));
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <ratio.icon className="w-5 h-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm">{ratio.value} - {isEs ? ratio.labelEs : ratio.label}</p>
                        <p className="text-xs text-muted-foreground">{ratio.width}x{ratio.height}</p>
                      </div>
                    </label>
                  ))}
                </div>
                
                <div className="pt-4 border-t space-y-2">
                  <Button className="w-full" onClick={handleExport} disabled={loading || exportSizes.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    {isEs ? "Exportar Pack" : "Export Pack"} ({exportSizes.length})
                  </Button>
                  <Button variant="outline" className="w-full">
                    <Save className="w-4 h-4 mr-2" />
                    {isEs ? "Guardar en Biblioteca" : "Save to Library"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>

      {/* Save as Template Dialog */}
      <Dialog open={saveAsTemplateOpen} onOpenChange={setSaveAsTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Guardar como Template" : "Save as Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Nombre del Template" : "Template Name"}</label>
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder={isEs ? "Mi template personalizado" : "My custom template"}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Tipo" : "Type"}</label>
              <select 
                className="w-full p-2 border rounded-md bg-background"
                value={newTemplateType}
                onChange={(e) => setNewTemplateType(e.target.value)}
              >
                <option value="social_post">Social Post</option>
                <option value="story">Story</option>
                <option value="carousel">Carousel</option>
                <option value="email">Email</option>
                <option value="banner">Banner</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Categoría" : "Category"}</label>
              <select 
                className="w-full p-2 border rounded-md bg-background"
                value={newTemplateCategory}
                onChange={(e) => setNewTemplateCategory(e.target.value)}
              >
                <option value="custom">{isEs ? "Personalizado" : "Custom"}</option>
                <option value="promotion">{isEs ? "Promoción" : "Promotion"}</option>
                <option value="engagement">{isEs ? "Engagement" : "Engagement"}</option>
                <option value="product">{isEs ? "Producto" : "Product"}</option>
                <option value="newsletter">Newsletter</option>
                <option value="announcement">{isEs ? "Anuncio" : "Announcement"}</option>
              </select>
            </div>
            {currentAsset?.original_url && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Preview</label>
                <div className="aspect-video rounded-lg overflow-hidden border">
                  <img 
                    src={currentAsset.original_url} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                    style={getFilterStyle()}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsTemplateOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveAsTemplate} disabled={loading || !newTemplateName.trim()}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isEs ? "Guardar Template" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
