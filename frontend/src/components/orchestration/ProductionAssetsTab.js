import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Progress } from "../ui/progress";
import { 
  Save, RefreshCw, Package, Plus, Trash2, CheckSquare,
  Box, Truck, ClipboardList
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const ASSET_CATEGORIES = [
  { value: "equipment", label: "Equipment", labelEs: "Equipo" },
  { value: "decor", label: "Decor", labelEs: "Decoración" },
  { value: "furniture", label: "Furniture", labelEs: "Mobiliario" },
  { value: "linens", label: "Linens", labelEs: "Mantelería" },
  { value: "tableware", label: "Tableware", labelEs: "Vajilla" },
  { value: "av", label: "Audio/Visual", labelEs: "Audio/Visual" },
  { value: "lighting", label: "Lighting", labelEs: "Iluminación" },
  { value: "supplies", label: "Supplies", labelEs: "Suministros" },
  { value: "other", label: "Other", labelEs: "Otro" },
];

const ASSET_STATUSES = [
  { value: "pending", label: "Pending", labelEs: "Pendiente", color: "bg-gray-100 text-gray-700" },
  { value: "confirmed", label: "Confirmed", labelEs: "Confirmado", color: "bg-blue-100 text-blue-700" },
  { value: "packed", label: "Packed", labelEs: "Empacado", color: "bg-yellow-100 text-yellow-700" },
  { value: "delivered", label: "Delivered", labelEs: "Entregado", color: "bg-green-100 text-green-700" },
];

export default function ProductionAssetsTab({ eventId }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [production, setProduction] = useState({
    assets: [],
    checklists: [],
    packing_list: [],
    preparation_status: "not_started"
  });
  const [assetDialog, setAssetDialog] = useState(false);
  const [checklistDialog, setChecklistDialog] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [newAsset, setNewAsset] = useState({
    name: "", category: "equipment", quantity: 1, status: "pending", source: "", notes: ""
  });
  const [newChecklistItem, setNewChecklistItem] = useState({ name: "", category: "general" });

  const fetchProduction = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/production/${eventId}`, { withCredentials: true });
      setProduction(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchProduction(); }, [fetchProduction]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/production/${eventId}`, { event_id: eventId, ...production }, { withCredentials: true });
      toast.success(isEs ? "Producción guardada" : "Production saved");
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
    setSaving(false);
  };

  const addAsset = () => {
    if (!newAsset.name) return;
    const asset = { ...newAsset, asset_id: `asset_${Date.now()}` };
    setProduction({ ...production, assets: [...production.assets, asset] });
    setNewAsset({ name: "", category: "equipment", quantity: 1, status: "pending", source: "", notes: "" });
    setAssetDialog(false);
  };

  const updateAsset = () => {
    if (!editingAsset) return;
    setProduction({
      ...production,
      assets: production.assets.map(a => a.asset_id === editingAsset.asset_id ? editingAsset : a)
    });
    setEditingAsset(null);
    setAssetDialog(false);
  };

  const removeAsset = (assetId) => {
    setProduction({ ...production, assets: production.assets.filter(a => a.asset_id !== assetId) });
  };

  const updateAssetStatus = (assetId, status) => {
    setProduction({
      ...production,
      assets: production.assets.map(a => a.asset_id === assetId ? { ...a, status } : a)
    });
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.name) return;
    const item = { ...newChecklistItem, item_id: `item_${Date.now()}`, completed: false };
    setProduction({ ...production, checklists: [...production.checklists, item] });
    setNewChecklistItem({ name: "", category: "general" });
    setChecklistDialog(false);
  };

  const toggleChecklistItem = (itemId) => {
    setProduction({
      ...production,
      checklists: production.checklists.map(item => 
        item.item_id === itemId ? { ...item, completed: !item.completed } : item
      )
    });
  };

  const removeChecklistItem = (itemId) => {
    setProduction({ ...production, checklists: production.checklists.filter(i => i.item_id !== itemId) });
  };

  const getAssetsProgress = () => {
    if (production.assets.length === 0) return 0;
    const delivered = production.assets.filter(a => a.status === "delivered").length;
    return Math.round((delivered / production.assets.length) * 100);
  };

  const getChecklistProgress = () => {
    if (production.checklists.length === 0) return 0;
    const completed = production.checklists.filter(i => i.completed).length;
    return Math.round((completed / production.checklists.length) * 100);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="production-assets-tab">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{isEs ? "Activos" : "Assets"}</p>
                <span className="font-medium">{getAssetsProgress()}%</span>
              </div>
              <Progress value={getAssetsProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {production.assets.filter(a => a.status === "delivered").length} / {production.assets.length} {isEs ? "entregados" : "delivered"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Checklist</p>
                <span className="font-medium">{getChecklistProgress()}%</span>
              </div>
              <Progress value={getChecklistProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {production.checklists.filter(i => i.completed).length} / {production.checklists.length} {isEs ? "completados" : "completed"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Estado de Preparación" : "Preparation Status"}</p>
                <Select 
                  value={production.preparation_status} 
                  onValueChange={(v) => setProduction({ ...production, preparation_status: v })}
                >
                  <SelectTrigger className="mt-1 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">{isEs ? "No iniciado" : "Not Started"}</SelectItem>
                    <SelectItem value="in_progress">{isEs ? "En progreso" : "In Progress"}</SelectItem>
                    <SelectItem value="ready">{isEs ? "Listo" : "Ready"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assets */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Box className="w-5 h-5" />
              {isEs ? "Activos de Producción" : "Production Assets"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Equipos, decoración y materiales necesarios" : "Equipment, decor and materials needed"}
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => { setEditingAsset(null); setAssetDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </CardHeader>
        <CardContent>
          {production.assets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isEs ? "No hay activos registrados" : "No assets registered"}
            </p>
          ) : (
            <div className="space-y-2">
              {production.assets.map((asset) => {
                const statusInfo = ASSET_STATUSES.find(s => s.value === asset.status) || ASSET_STATUSES[0];
                const categoryInfo = ASSET_CATEGORIES.find(c => c.value === asset.category);
                return (
                  <div key={asset.asset_id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{asset.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{isEs ? categoryInfo?.labelEs : categoryInfo?.label}</span>
                          <span>•</span>
                          <span>{isEs ? "Cantidad" : "Qty"}: {asset.quantity}</span>
                          {asset.source && <><span>•</span><span>{asset.source}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={asset.status} onValueChange={(v) => updateAssetStatus(asset.asset_id, v)}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSET_STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingAsset({ ...asset }); setAssetDialog(true); }}>
                        <ClipboardList className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => removeAsset(asset.asset_id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5" />
              {isEs ? "Lista de Verificación" : "Checklist"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Tareas de preparación y verificación" : "Preparation and verification tasks"}
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setChecklistDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </CardHeader>
        <CardContent>
          {production.checklists.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isEs ? "No hay items en el checklist" : "No checklist items"}
            </p>
          ) : (
            <div className="space-y-2">
              {production.checklists.map((item) => (
                <div key={item.item_id} className="flex items-center gap-3 p-2 border rounded-lg">
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={() => toggleChecklistItem(item.item_id)}
                  />
                  <span className={`flex-1 ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                    {item.name}
                  </span>
                  <Badge variant="outline" className="text-xs">{item.category}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => removeChecklistItem(item.item_id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEs ? "Guardar Producción" : "Save Production"}
        </Button>
      </div>

      {/* Asset Dialog */}
      <Dialog open={assetDialog} onOpenChange={setAssetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAsset 
                ? (isEs ? "Editar Activo" : "Edit Asset")
                : (isEs ? "Nuevo Activo" : "New Asset")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={editingAsset?.name || newAsset.name}
                onChange={(e) => editingAsset 
                  ? setEditingAsset({ ...editingAsset, name: e.target.value })
                  : setNewAsset({ ...newAsset, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Categoría" : "Category"}</Label>
                <Select 
                  value={editingAsset?.category || newAsset.category} 
                  onValueChange={(v) => editingAsset 
                    ? setEditingAsset({ ...editingAsset, category: v })
                    : setNewAsset({ ...newAsset, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{isEs ? c.labelEs : c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Cantidad" : "Quantity"}</Label>
                <Input
                  type="number"
                  min="1"
                  value={editingAsset?.quantity || newAsset.quantity}
                  onChange={(e) => editingAsset 
                    ? setEditingAsset({ ...editingAsset, quantity: parseInt(e.target.value) || 1 })
                    : setNewAsset({ ...newAsset, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div>
              <Label>{isEs ? "Fuente" : "Source"}</Label>
              <Input
                value={editingAsset?.source || newAsset.source}
                onChange={(e) => editingAsset 
                  ? setEditingAsset({ ...editingAsset, source: e.target.value })
                  : setNewAsset({ ...newAsset, source: e.target.value })}
                placeholder={isEs ? "Ej: Propio, Alquiler de X" : "E.g.: Owned, Rental from X"}
              />
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Input
                value={editingAsset?.notes || newAsset.notes}
                onChange={(e) => editingAsset 
                  ? setEditingAsset({ ...editingAsset, notes: e.target.value })
                  : setNewAsset({ ...newAsset, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssetDialog(false); setEditingAsset(null); }}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={editingAsset ? updateAsset : addAsset}>
              {editingAsset ? (isEs ? "Actualizar" : "Update") : (isEs ? "Agregar" : "Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checklist Dialog */}
      <Dialog open={checklistDialog} onOpenChange={setChecklistDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Item al Checklist" : "Add Checklist Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Descripción" : "Description"} *</Label>
              <Input
                value={newChecklistItem.name}
                onChange={(e) => setNewChecklistItem({ ...newChecklistItem, name: e.target.value })}
                placeholder={isEs ? "Ej: Verificar disponibilidad de mesas" : "E.g.: Verify table availability"}
              />
            </div>
            <div>
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <Input
                value={newChecklistItem.category}
                onChange={(e) => setNewChecklistItem({ ...newChecklistItem, category: e.target.value })}
                placeholder={isEs ? "Ej: Logística, Setup" : "E.g.: Logistics, Setup"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={addChecklistItem}>{isEs ? "Agregar" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
