import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Save, RefreshCw, Palette, Plus, Trash2, Image, 
  Upload, Link2, MapPin, X, LayoutGrid
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const CATERING_SETUPS = [
  { value: "buffet", label: "Buffet", labelEs: "Buffet" },
  { value: "plated", label: "Plated Service", labelEs: "Servicio Emplatado" },
  { value: "stations", label: "Food Stations", labelEs: "Estaciones de Comida" },
  { value: "family", label: "Family Style", labelEs: "Estilo Familiar" },
  { value: "cocktail", label: "Cocktail Reception", labelEs: "Cóctel" },
  { value: "mixed", label: "Mixed Service", labelEs: "Servicio Mixto" },
];

const MATERIAL_CATEGORIES = [
  { value: "linens", label: "Linens", labelEs: "Mantelería" },
  { value: "florals", label: "Florals", labelEs: "Flores" },
  { value: "lighting", label: "Lighting", labelEs: "Iluminación" },
  { value: "furniture", label: "Furniture", labelEs: "Mobiliario" },
  { value: "tableware", label: "Tableware", labelEs: "Vajilla" },
  { value: "signage", label: "Signage", labelEs: "Señalización" },
  { value: "other", label: "Other", labelEs: "Otro" },
];

export default function ExperienceDesignTab({ eventId }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [design, setDesign] = useState({
    color_palette: [],
    materials: [],
    moodboard_images: [],
    catering_setup: null,
    layout_zones: [],
    notes: ""
  });
  const [materialDialog, setMaterialDialog] = useState(false);
  const [imageDialog, setImageDialog] = useState(false);
  const [zoneDialog, setZoneDialog] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: "", description: "", category: "other" });
  const [newImage, setNewImage] = useState({ url: "", caption: "", type: "url" });
  const [newZone, setNewZone] = useState({ name: "", purpose: "", capacity: "" });
  const [newColor, setNewColor] = useState("#3A4D3F");

  const fetchDesign = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/experience/${eventId}`, { withCredentials: true });
      setDesign(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchDesign(); }, [fetchDesign]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/experience/${eventId}`, { event_id: eventId, ...design }, { withCredentials: true });
      toast.success(isEs ? "Diseño guardado" : "Design saved");
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
    setSaving(false);
  };

  const addColor = () => {
    if (!design.color_palette.includes(newColor)) {
      setDesign({ ...design, color_palette: [...design.color_palette, newColor] });
    }
  };

  const removeColor = (color) => {
    setDesign({ ...design, color_palette: design.color_palette.filter(c => c !== color) });
  };

  const addMaterial = () => {
    if (!newMaterial.name) return;
    setDesign({ ...design, materials: [...design.materials, { ...newMaterial, id: Date.now() }] });
    setNewMaterial({ name: "", description: "", category: "other" });
    setMaterialDialog(false);
  };

  const removeMaterial = (id) => {
    setDesign({ ...design, materials: design.materials.filter(m => m.id !== id) });
  };

  const addImage = () => {
    if (!newImage.url) return;
    setDesign({ ...design, moodboard_images: [...design.moodboard_images, { ...newImage, id: Date.now() }] });
    setNewImage({ url: "", caption: "", type: "url" });
    setImageDialog(false);
  };

  const removeImage = (id) => {
    setDesign({ ...design, moodboard_images: design.moodboard_images.filter(i => i.id !== id) });
  };

  const addZone = () => {
    if (!newZone.name) return;
    setDesign({ ...design, layout_zones: [...design.layout_zones, { ...newZone, id: Date.now() }] });
    setNewZone({ name: "", purpose: "", capacity: "" });
    setZoneDialog(false);
  };

  const removeZone = (id) => {
    setDesign({ ...design, layout_zones: design.layout_zones.filter(z => z.id !== id) });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="experience-design-tab">
      {/* Color Palette */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            {isEs ? "Paleta de Colores" : "Color Palette"}
          </CardTitle>
          <CardDescription>
            {isEs ? "Define los colores principales del evento" : "Define the main colors for the event"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {design.color_palette.map((color) => (
              <div key={color} className="relative group">
                <div 
                  className="w-12 h-12 rounded-lg border-2 border-white shadow-md cursor-pointer"
                  style={{ backgroundColor: color }}
                  title={color}
                />
                <button
                  onClick={() => removeColor(color)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-12 h-12 rounded-lg cursor-pointer"
              />
              <Button variant="outline" size="sm" onClick={addColor}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Catering Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Configuración de Catering" : "Catering Setup"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={design.catering_setup || "none"} onValueChange={(v) => setDesign({ ...design, catering_setup: v === "none" ? null : v })}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder={isEs ? "Seleccionar estilo" : "Select style"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{isEs ? "Sin definir" : "Not defined"}</SelectItem>
              {CATERING_SETUPS.map(s => (
                <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Materials */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{isEs ? "Materiales" : "Materials"}</CardTitle>
            <CardDescription>{isEs ? "Elementos físicos del diseño" : "Physical design elements"}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setMaterialDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </CardHeader>
        <CardContent>
          {design.materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isEs ? "No hay materiales definidos" : "No materials defined"}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {design.materials.map((material) => (
                <Badge key={material.id} variant="secondary" className="gap-2 py-1 px-3">
                  <span>{material.name}</span>
                  <span className="text-xs text-muted-foreground">({isEs ? MATERIAL_CATEGORIES.find(c => c.value === material.category)?.labelEs : material.category})</span>
                  <button onClick={() => removeMaterial(material.id)} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Moodboard */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              Moodboard
            </CardTitle>
            <CardDescription>{isEs ? "Imágenes de referencia e inspiración" : "Reference and inspiration images"}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImageDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </CardHeader>
        <CardContent>
          {design.moodboard_images.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isEs ? "No hay imágenes en el moodboard" : "No moodboard images"}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {design.moodboard_images.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.url}
                    alt={img.caption || "Moodboard"}
                    className="w-full h-32 object-cover rounded-lg"
                    onError={(e) => { e.target.src = "https://placehold.co/200x200?text=Image"; }}
                  />
                  {img.caption && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{img.caption}</p>
                  )}
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Layout Zones */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5" />
              {isEs ? "Zonas del Evento" : "Event Zones"}
            </CardTitle>
            <CardDescription>{isEs ? "Áreas y espacios del evento" : "Areas and spaces of the event"}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setZoneDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </CardHeader>
        <CardContent>
          {design.layout_zones.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isEs ? "No hay zonas definidas" : "No zones defined"}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {design.layout_zones.map((zone) => (
                <div key={zone.id} className="p-4 border rounded-lg relative group">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 mt-0.5 text-primary" />
                    <div>
                      <p className="font-medium">{zone.name}</p>
                      {zone.purpose && <p className="text-sm text-muted-foreground">{zone.purpose}</p>}
                      {zone.capacity && <p className="text-xs text-muted-foreground">{isEs ? "Capacidad" : "Capacity"}: {zone.capacity}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => removeZone(zone.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Notas de Diseño" : "Design Notes"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={design.notes || ""}
            onChange={(e) => setDesign({ ...design, notes: e.target.value })}
            placeholder={isEs ? "Notas adicionales sobre el diseño..." : "Additional design notes..."}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEs ? "Guardar Diseño" : "Save Design"}
        </Button>
      </div>

      {/* Material Dialog */}
      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Material" : "Add Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input value={newMaterial.name} onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })} />
            </div>
            <div>
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <Select value={newMaterial.category} onValueChange={(v) => setNewMaterial({ ...newMaterial, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{isEs ? c.labelEs : c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Input value={newMaterial.description} onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaterialDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={addMaterial}>{isEs ? "Agregar" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Dialog */}
      <Dialog open={imageDialog} onOpenChange={setImageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Imagen" : "Add Image"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>URL</Label>
              <Input value={newImage.url} onChange={(e) => setNewImage({ ...newImage, url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>{isEs ? "Descripción" : "Caption"}</Label>
              <Input value={newImage.caption} onChange={(e) => setNewImage({ ...newImage, caption: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={addImage}>{isEs ? "Agregar" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zone Dialog */}
      <Dialog open={zoneDialog} onOpenChange={setZoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Zona" : "Add Zone"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} placeholder={isEs ? "Ej: Área de Cóctel" : "E.g.: Cocktail Area"} />
            </div>
            <div>
              <Label>{isEs ? "Propósito" : "Purpose"}</Label>
              <Input value={newZone.purpose} onChange={(e) => setNewZone({ ...newZone, purpose: e.target.value })} />
            </div>
            <div>
              <Label>{isEs ? "Capacidad" : "Capacity"}</Label>
              <Input value={newZone.capacity} onChange={(e) => setNewZone({ ...newZone, capacity: e.target.value })} placeholder={isEs ? "Ej: 50 personas" : "E.g.: 50 people"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={addZone}>{isEs ? "Agregar" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
