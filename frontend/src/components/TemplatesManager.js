// components/TemplatesManager.js - Room Setup Templates Management
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Layout, Plus, Edit2, Trash2, Copy, Image, Package, Clock, Users, Star, FileDown, Sparkles } from "lucide-react";
import { KoraLoader } from "./KoraLoader";
import { toast } from "sonner";

const TEMPLATE_CATEGORIES = [
  { value: "wedding", labelEs: "Boda", labelEn: "Wedding", icon: "💒" },
  { value: "corporate", labelEs: "Corporativo", labelEn: "Corporate", icon: "🏢" },
  { value: "social", labelEs: "Social", labelEn: "Social", icon: "🎉" },
  { value: "conference", labelEs: "Conferencia", labelEn: "Conference", icon: "🎤" },
  { value: "gala", labelEs: "Gala", labelEn: "Gala", icon: "🌟" },
  { value: "custom", labelEs: "Personalizado", labelEn: "Custom", icon: "✨" },
];

const LAYOUT_TYPES = [
  { value: "theater", labelEs: "Teatro", labelEn: "Theater" },
  { value: "banquet", labelEs: "Banquete", labelEn: "Banquet" },
  { value: "cocktail", labelEs: "Cóctel", labelEn: "Cocktail" },
  { value: "classroom", labelEs: "Escuela", labelEn: "Classroom" },
  { value: "u_shape", labelEs: "U", labelEn: "U-Shape" },
  { value: "conference", labelEs: "Conferencia", labelEn: "Conference" },
  { value: "hollow_square", labelEs: "Cuadrado Hueco", labelEn: "Hollow Square" },
  { value: "custom", labelEs: "Personalizado", labelEn: "Custom" },
];

export default function TemplatesManager({ token, onApplyTemplate }) {
  const { isEs } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "custom",
    layout_type: "banquet",
    layout_notes: "",
    min_capacity: 0,
    max_capacity: 0,
  });
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = selectedCategory !== "all" ? `?category=${selectedCategory}` : "";
      const res = await axios.get(`${API}/orchestration/room-setup/templates${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTemplates(res.data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error(isEs ? "Error al cargar templates" : "Error loading templates");
    } finally {
      setLoading(false);
    }
  }, [token, selectedCategory, isEs]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Seed system templates on first load
  useEffect(() => {
    const seedTemplates = async () => {
      try {
        await axios.post(`${API}/orchestration/room-setup/templates/seed-system`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        // Ignore - templates may already exist
      }
    };
    seedTemplates();
  }, [token]);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      category: "custom",
      layout_type: "banquet",
      layout_notes: "",
      min_capacity: 0,
      max_capacity: 0,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category,
      layout_type: template.layout_type,
      layout_notes: template.layout_notes || "",
      min_capacity: template.min_capacity || 0,
      max_capacity: template.max_capacity || 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }

    try {
      setSaving(true);
      if (editingTemplate) {
        await axios.put(
          `${API}/orchestration/room-setup/templates/${editingTemplate.template_id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(isEs ? "Template actualizado" : "Template updated");
      } else {
        await axios.post(
          `${API}/orchestration/room-setup/templates`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(isEs ? "Template creado" : "Template created");
      }
      setDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template) => {
    if (template.is_system_template) {
      toast.error(isEs ? "No se puede eliminar template del sistema" : "Cannot delete system template");
      return;
    }

    const confirm = window.confirm(
      isEs ? `¿Eliminar template "${template.name}"?` : `Delete template "${template.name}"?`
    );
    if (!confirm) return;

    try {
      await axios.delete(`${API}/orchestration/room-setup/templates/${template.template_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(isEs ? "Template eliminado" : "Template deleted");
      fetchTemplates();
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  const getCategoryInfo = (cat) => TEMPLATE_CATEGORIES.find(c => c.value === cat) || TEMPLATE_CATEGORIES[5];
  const getLayoutInfo = (layout) => LAYOUT_TYPES.find(l => l.value === layout) || LAYOUT_TYPES[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="templates-manager">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#3A4D3F]" />
            {isEs ? "Templates de Configuración" : "Setup Templates"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Configuraciones predefinidas reutilizables para eventos" : "Reusable predefined configurations for events"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
              {TEMPLATE_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.icon} {isEs ? cat.labelEs : cat.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleOpenCreate} className="bg-[#3A4D3F] hover:bg-[#2d3d31]">
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Nuevo Template" : "New Template"}
          </Button>
        </div>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500 mb-2">
              {isEs ? "No hay templates disponibles" : "No templates available"}
            </p>
            <Button onClick={handleOpenCreate} variant="outline">
              <Plus className="w-4 h-4 mr-1" />
              {isEs ? "Crear Template" : "Create Template"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const catInfo = getCategoryInfo(template.category);
            const layoutInfo = getLayoutInfo(template.layout_type);

            return (
              <Card 
                key={template.template_id} 
                className={`hover:shadow-md transition-shadow ${template.is_system_template ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                data-testid={`template-${template.template_id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{catInfo.icon}</span>
                      <div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        {template.is_system_template && (
                          <Badge variant="outline" className="text-xs mt-1 text-amber-600 border-amber-300">
                            <Star className="w-3 h-3 mr-1" />
                            Sistema
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {!template.is_system_template && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(template)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(template)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {template.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                  )}

                  {/* Visual Layout Preview */}
                  {template.layout_diagram_url && (
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <img 
                        src={template.layout_diagram_url} 
                        alt="Layout" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Info Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <Layout className="w-3 h-3 mr-1" />
                      {isEs ? layoutInfo.labelEs : layoutInfo.labelEn}
                    </Badge>
                    
                    {template.default_needs?.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Package className="w-3 h-3 mr-1" />
                        {template.default_needs.length} {isEs ? "items" : "items"}
                      </Badge>
                    )}
                    
                    {template.default_timeline?.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {template.default_timeline.length} {isEs ? "actividades" : "activities"}
                      </Badge>
                    )}
                    
                    {(template.min_capacity > 0 || template.max_capacity > 0) && (
                      <Badge variant="outline" className="text-xs">
                        <Users className="w-3 h-3 mr-1" />
                        {template.min_capacity}-{template.max_capacity}
                      </Badge>
                    )}
                  </div>

                  {/* Usage Count */}
                  {template.usage_count > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {isEs ? `Usado ${template.usage_count} veces` : `Used ${template.usage_count} times`}
                    </p>
                  )}

                  {/* Apply Button */}
                  {onApplyTemplate && (
                    <Button 
                      variant="outline" 
                      className="w-full mt-2"
                      onClick={() => onApplyTemplate(template)}
                    >
                      <FileDown className="w-4 h-4 mr-1" />
                      {isEs ? "Aplicar Template" : "Apply Template"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#3A4D3F]" />
              {editingTemplate 
                ? (isEs ? "Editar Template" : "Edit Template")
                : (isEs ? "Nuevo Template" : "New Template")
              }
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Ej: Boda Elegante" : "E.g., Elegant Wedding"}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={isEs ? "Describe el template..." : "Describe the template..."}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Categoría" : "Category"}</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.icon} {isEs ? cat.labelEs : cat.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{isEs ? "Layout" : "Layout"}</Label>
                <Select value={formData.layout_type} onValueChange={(v) => setFormData({ ...formData, layout_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LAYOUT_TYPES.map((layout) => (
                      <SelectItem key={layout.value} value={layout.value}>
                        {isEs ? layout.labelEs : layout.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Capacidad Mín." : "Min Capacity"}</Label>
                <Input
                  type="number"
                  value={formData.min_capacity}
                  onChange={(e) => setFormData({ ...formData, min_capacity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Capacidad Máx." : "Max Capacity"}</Label>
                <Input
                  type="number"
                  value={formData.max_capacity}
                  onChange={(e) => setFormData({ ...formData, max_capacity: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Notas del Layout" : "Layout Notes"}</Label>
              <Textarea
                value={formData.layout_notes}
                onChange={(e) => setFormData({ ...formData, layout_notes: e.target.value })}
                placeholder={isEs ? "Detalles de la disposición..." : "Layout details..."}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} className="bg-[#3A4D3F] hover:bg-[#2d3d31]" disabled={saving}>
              {saving ? (
                <>
                  <KoraLoader size={16} className="mr-1" />
                  {isEs ? "Guardando..." : "Saving..."}
                </>
              ) : (
                isEs ? "Guardar" : "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
