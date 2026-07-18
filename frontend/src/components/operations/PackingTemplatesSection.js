import { useEffect, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  LayoutTemplate, Plus, Trash2, Pencil, Sparkles, PackagePlus, AlertTriangle, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";

const EVENT_TYPES = [
  { value: "buffet", es: "Buffet", en: "Buffet" },
  { value: "brunch_box", es: "Brunch Box", en: "Brunch Box" },
  { value: "picadera", es: "Picadera", en: "Cocktail" },
  { value: "brand_moment", es: "Brand Moment", en: "Brand Moment" },
  { value: "wedding", es: "Boda", en: "Wedding" },
  { value: "corporate", es: "Corporativo", en: "Corporate" },
  { value: "other", es: "Otro", en: "Other" },
];

/**
 * Packing Templates management (Sprint F).
 * Compact CRUD + seed-defaults + per-item ratio editor.
 */
export function PackingTemplatesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [templates, setTemplates] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tpl, inv] = await Promise.allSettled([
        axios.get(`${API}/api/packing-templates`, { withCredentials: true }),
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }),
      ]);
      setTemplates(tpl.status === "fulfilled" ? (tpl.value.data || []) : []);
      const invItems = inv.status === "fulfilled" ? (inv.value.data || []) : [];
      setInventory(invItems.filter((i) => ["equipment", "event_supply", "disposable"].includes(i.inventory_type)));
    } catch (e) {
      console.warn("templates load failed", e?.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openNew = () => {
    setEditing({
      template_id: null,
      name: "",
      event_type: "buffet",
      description: "",
      items: [],
    });
    setEditorOpen(true);
  };

  const openEdit = (tpl) => {
    setEditing({ ...tpl, items: [...(tpl.items || [])] });
    setEditorOpen(true);
  };

  const seedDefaults = async () => {
    try {
      const res = await axios.post(`${API}/api/packing-templates/seed-defaults`, {}, { withCredentials: true });
      toast.success(t(
        `Creadas ${res.data.created} plantillas (${res.data.skipped_existing} existentes)`,
        `Created ${res.data.created} templates (${res.data.skipped_existing} already existed)`
      ));
      fetchAll();
    } catch (e) {
      toast.error(t("Error al sembrar", "Seed failed"));
    }
  };

  const saveTemplate = async () => {
    if (!editing?.name) {
      toast.error(t("Nombre requerido", "Name required"));
      return;
    }
    try {
      if (editing.template_id) {
        await axios.put(
          `${API}/api/packing-templates/${editing.template_id}`,
          {
            name: editing.name,
            event_type: editing.event_type,
            description: editing.description,
            setup_photos: editing.setup_photos || [],
            items: (editing.items || []).map((i) => ({
              inventory_item_id: i.inventory_item_id,
              item_name: i.item_name,
              per_guests: Number(i.per_guests) || 1,
              minimum_qty: Number(i.minimum_qty) || 0,
              notes: i.notes || null,
            })),
          },
          { withCredentials: true }
        );
      } else {
        await axios.post(
          `${API}/api/packing-templates`,
          {
            name: editing.name,
            event_type: editing.event_type,
            description: editing.description,
            setup_photos: editing.setup_photos || [],
            items: (editing.items || []).map((i) => ({
              inventory_item_id: i.inventory_item_id,
              item_name: i.item_name,
              per_guests: Number(i.per_guests) || 1,
              minimum_qty: Number(i.minimum_qty) || 0,
              notes: i.notes || null,
            })),
          },
          { withCredentials: true }
        );
      }
      toast.success(t("Plantilla guardada", "Template saved"));
      setEditorOpen(false);
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error al guardar", "Save failed"));
    }
  };

  // Photo helpers. Templates must exist server-side before we can attach a
  // photo (we need the template_id to write the URL to the right doc), so
  // for new templates we save first, then upload.
  const uploadTemplatePhoto = async (file) => {
    if (!file) return;
    let tplId = editing?.template_id;
    if (!tplId) {
      toast.info(t("Guardando plantilla antes de subir foto…", "Saving template before uploading…"));
      await saveTemplate();
      // Re-fetch to grab the freshly-created template_id.
      const list = await axios.get(`${API}/api/packing-templates`, { withCredentials: true });
      const match = (list.data || []).find((x) => x.name === editing.name);
      tplId = match?.template_id;
      if (!tplId) {
        toast.error(t("No se pudo obtener id de plantilla", "Could not resolve template id"));
        return;
      }
      setEditing((p) => ({ ...p, template_id: tplId, setup_photos: match?.setup_photos || [] }));
    }
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await axios.post(
        `${API}/api/packing-templates/${tplId}/photos`,
        fd,
        { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } }
      );
      setEditing((p) => ({ ...p, setup_photos: res.data.setup_photos || [] }));
      toast.success(t("Foto subida", "Photo uploaded"));
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error al subir foto", "Upload failed"));
    }
  };

  const removeTemplatePhoto = async (photoUrl) => {
    if (!editing?.template_id) {
      // Not-yet-saved template: just strip locally.
      setEditing((p) => ({ ...p, setup_photos: (p.setup_photos || []).filter((u) => u !== photoUrl) }));
      return;
    }
    try {
      const res = await axios.delete(
        `${API}/api/packing-templates/${editing.template_id}/photos`,
        { withCredentials: true, params: { photo_url: photoUrl } }
      );
      setEditing((p) => ({ ...p, setup_photos: res.data.setup_photos || [] }));
    } catch (e) {
      toast.error(t("Error al borrar foto", "Delete failed"));
    }
  };

  const deleteTemplate = async (tplId) => {
    if (!window.confirm(t("¿Eliminar esta plantilla?", "Delete this template?"))) return;
    try {
      await axios.delete(`${API}/api/packing-templates/${tplId}`, { withCredentials: true });
      toast.success(t("Eliminada", "Deleted"));
      fetchAll();
    } catch (e) { toast.error(t("Error", "Failed")); }
  };

  const addItemRow = () => {
    setEditing((p) => ({
      ...p,
      items: [...(p.items || []), { inventory_item_id: "", item_name: "", per_guests: 15, minimum_qty: 1, notes: "" }],
    }));
  };

  const updateItemRow = (idx, field, value) => {
    setEditing((p) => ({
      ...p,
      items: p.items.map((i, k) => k === idx ? { ...i, [field]: value } : i),
    }));
  };

  const removeItemRow = (idx) => {
    setEditing((p) => ({ ...p, items: p.items.filter((_, k) => k !== idx) }));
  };

  const linkItemToInventory = (idx, invItem) => {
    updateItemRow(idx, "inventory_item_id", invItem.ingredient_id);
    updateItemRow(idx, "item_name", invItem.name);
  };

  const unmatchedCount = (tpl) =>
    (tpl.items || []).filter((i) => (i.inventory_item_id || "").startsWith("unmatched:")).length;

  return (
    <div className="space-y-4" data-testid="packing-templates-section">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5" />
                {t("Plantillas de Packing", "Packing Templates")}
              </CardTitle>
              <CardDescription>
                {t(
                  "Define proporciones por tipo de evento (ej: 1 bandeja por cada 15 invitados). Al aplicar una plantilla, el sistema calcula la cantidad exacta.",
                  "Define ratios by event type (e.g. 1 tray per 15 guests). Applying a template pre-fills the packing list with the exact quantity."
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {templates.length === 0 && !loading && (
                <Button variant="outline" size="sm" onClick={seedDefaults} data-testid="seed-defaults-btn">
                  <Sparkles className="w-4 h-4 mr-1" />
                  {t("Sembrar plantillas base", "Seed default templates")}
                </Button>
              )}
              <Button onClick={openNew} data-testid="new-template-btn">
                <Plus className="w-4 h-4 mr-1" />
                {t("Nueva plantilla", "New template")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">{t("Cargando…", "Loading…")}</div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <LayoutTemplate className="w-8 h-8 mx-auto text-slate-400" />
              <p className="font-medium">{t("No hay plantillas todavía", "No templates yet")}</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {t(
                  'Usa "Sembrar plantillas base" para arrancar con 4 tipos comunes (Buffet, Brunch Box, Picadera, Brand Moment) o crea la tuya.',
                  'Use "Seed default templates" to start with 4 common types (Buffet, Brunch Box, Cocktail, Brand Moment) or create your own.'
                )}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Nombre", "Name")}</TableHead>
                    <TableHead>{t("Tipo", "Type")}</TableHead>
                    <TableHead className="text-right">{t("Items", "Items")}</TableHead>
                    <TableHead>{t("Estado", "Status")}</TableHead>
                    <TableHead className="w-24 text-right">{t("Acción", "Action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((tpl) => {
                    const unmatched = unmatchedCount(tpl);
                    return (
                      <TableRow key={tpl.template_id} data-testid={`template-row-${tpl.template_id}`}>
                        <TableCell className="font-medium">{tpl.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {EVENT_TYPES.find((e) => e.value === tpl.event_type)?.[isEs ? "es" : "en"] || tpl.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{(tpl.items || []).length}</TableCell>
                        <TableCell>
                          {unmatched > 0 ? (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {unmatched} {t("sin vincular", "unmatched")}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              {t("Lista", "Ready")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(tpl)} data-testid={`edit-template-${tpl.template_id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteTemplate(tpl.template_id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              {editing?.template_id ? t("Editar plantilla", "Edit template") : t("Nueva plantilla", "New template")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Cada item se define como 1 unidad por cada N invitados, con mínimo.",
                "Each item is defined as 1 unit per N guests, with a floor."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>{t("Nombre", "Name")}</Label>
                <Input
                  value={editing?.name || ""}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  data-testid="template-name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Tipo de evento", "Event type")}</Label>
                <Select
                  value={editing?.event_type || "buffet"}
                  onValueChange={(v) => setEditing((p) => ({ ...p, event_type: v }))}
                >
                  <SelectTrigger data-testid="template-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => (
                      <SelectItem key={et.value} value={et.value}>{isEs ? et.es : et.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Descripción", "Description")}</Label>
              <Textarea
                rows={2}
                value={editing?.description || ""}
                onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* Pre-setup photos. Ops staff pull these open at the venue to
                mirror the exact layout even when the account manager is not
                on site. Photos also flow through to the delivery note when
                this template is applied. */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("Fotos de pre-montaje", "Pre-setup photos")}</Label>
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-medium cursor-pointer hover:bg-emerald-100 transition-colors" data-testid="template-photo-upload-label">
                  <Camera className="w-3.5 h-3.5" />
                  {t("Subir foto", "Upload photo")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadTemplatePhoto(f);
                      e.target.value = "";
                    }}
                    data-testid="template-photo-upload"
                  />
                </label>
              </div>
              {(editing?.setup_photos || []).length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {(editing.setup_photos || []).map((url) => (
                    <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border" data-testid={`template-photo-${url.split("/").pop()}`}>
                      <img
                        src={`${API}${url}`}
                        alt="setup"
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => window.open(`${API}${url}`, "_blank")}
                      />
                      <button
                        type="button"
                        onClick={() => removeTemplatePhoto(url)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                        aria-label="remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic p-2 rounded bg-slate-50 border border-dashed">
                  {t(
                    "Aún no hay fotos. Sube una foto del montaje ideal para que el equipo lo replique.",
                    "No photos yet. Upload a reference photo so the team can replicate the setup."
                  )}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("Items y proporciones", "Items and ratios")}</Label>
                <Button size="sm" variant="outline" onClick={addItemRow} data-testid="add-template-item">
                  <PackagePlus className="w-4 h-4 mr-1" />
                  {t("Agregar item", "Add item")}
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Item de inventario", "Inventory item")}</TableHead>
                      <TableHead className="w-24 text-right">{t("Por c/N inv.", "Per N gsts")}</TableHead>
                      <TableHead className="w-20 text-right">{t("Mín.", "Min.")}</TableHead>
                      <TableHead className="w-40">{t("Nota", "Note")}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(editing?.items || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-4">
                          {t('Agrega al menos un item con "Agregar item"', 'Add at least one item')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (editing?.items || []).map((it, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                placeholder={t("Nombre visible", "Display name")}
                                value={it.item_name || ""}
                                onChange={(e) => updateItemRow(idx, "item_name", e.target.value)}
                                className="h-8"
                              />
                              <Select
                                value={it.inventory_item_id?.startsWith("unmatched:") ? "" : (it.inventory_item_id || "")}
                                onValueChange={(v) => {
                                  const chosen = inventory.find((i) => i.ingredient_id === v);
                                  if (chosen) linkItemToInventory(idx, chosen);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder={t("Vincular a inventario…", "Link to inventory…")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {inventory.slice(0, 200).map((i) => (
                                    <SelectItem key={i.ingredient_id} value={i.ingredient_id}>
                                      {i.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {(it.inventory_item_id || "").startsWith("unmatched:") && (
                                <p className="text-xs text-amber-600 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {t("Sin vincular al inventario", "Not linked to inventory")}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="1"
                              value={it.per_guests}
                              onChange={(e) => updateItemRow(idx, "per_guests", e.target.value)}
                              className="w-20 h-8 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              value={it.minimum_qty}
                              onChange={(e) => updateItemRow(idx, "minimum_qty", e.target.value)}
                              className="w-16 h-8 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={it.notes || ""}
                              onChange={(e) => updateItemRow(idx, "notes", e.target.value)}
                              className="h-8"
                              placeholder={t("Opcional", "Optional")}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeItemRow(idx)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>{t("Cancelar", "Cancel")}</Button>
            <Button onClick={saveTemplate} data-testid="save-template-btn">
              {t("Guardar plantilla", "Save template")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PackingTemplatesSection;
