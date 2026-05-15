import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Plus, Trash2, Edit, Save, X, Info, Sliders } from "lucide-react";
import { API_BASE as API } from "../utils/api";

const APPLIES_TO_OPTIONS = [
  { value: "buffet", labelEs: "Buffet", labelEn: "Buffet" },
  { value: "cocktail", labelEs: "Cóctel", labelEn: "Cocktail" },
];

const SCOPE_TYPES = [
  { value: "default", labelEs: "Por defecto (todas las recetas)", labelEn: "Default (all recipes)" },
  { value: "category", labelEs: "Por categoría", labelEn: "By category" },
  { value: "recipe", labelEs: "Por receta específica", labelEn: "Per specific recipe" },
];

/**
 * BuffetFactorsDialog — Feature 1 CRUD UI.
 *
 * Lets the user manage consumption factors (0–5, typically 0.7–1.2) per scope:
 *  - default: applies to every recipe unless a more-specific factor exists
 *  - category: applies to all recipes in that category
 *  - recipe: specific recipe override
 * Resolution cascade is enforced server-side; the UI is plain CRUD over /api/buffet-factors.
 */
export default function BuffetFactorsDialog({ open, onOpenChange, recipes = [] }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [factors, setFactors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null | "new" | factor_id
  const [form, setForm] = useState({
    scope_type: "default",
    scope_id: "",
    factor: 0.85,
    applies_to_menu_types: ["buffet"],
    notes: "",
  });

  // Unique list of recipe categories for the category select
  const categories = [...new Set(recipes.map((r) => r.category).filter(Boolean))];

  const fetchFactors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/buffet-factors`, { withCredentials: true });
      setFactors(res.data || []);
    } catch (e) {
      toast.error(isEs ? "Error al cargar factores" : "Failed to load factors");
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => {
    if (open) fetchFactors();
  }, [open, fetchFactors]);

  const startNew = () => {
    setForm({ scope_type: "default", scope_id: "", factor: 0.85, applies_to_menu_types: ["buffet"], notes: "" });
    setEditing("new");
  };
  const startEdit = (f) => {
    setForm({
      scope_type: f.scope_type,
      scope_id: f.scope_id || "",
      factor: f.factor,
      applies_to_menu_types: f.applies_to_menu_types || ["buffet"],
      notes: f.notes || "",
    });
    setEditing(f.factor_id);
  };
  const cancelEdit = () => setEditing(null);

  const save = async () => {
    if (form.scope_type !== "default" && !form.scope_id) {
      toast.error(isEs ? "scope_id requerido" : "scope_id required");
      return;
    }
    if (!form.factor || form.factor <= 0 || form.factor > 5) {
      toast.error(isEs ? "Factor debe estar entre 0 y 5" : "Factor must be between 0 and 5");
      return;
    }
    if (!form.applies_to_menu_types?.length) {
      toast.error(isEs ? "Selecciona al menos un tipo" : "Pick at least one menu type");
      return;
    }
    const payload = {
      scope_type: form.scope_type,
      scope_id: form.scope_type === "default" ? null : form.scope_id,
      factor: Number(form.factor),
      applies_to_menu_types: form.applies_to_menu_types,
      notes: form.notes || null,
    };
    try {
      if (editing === "new") {
        await axios.post(`${API}/api/buffet-factors`, payload, { withCredentials: true });
        toast.success(isEs ? "Factor creado" : "Factor created");
      } else {
        await axios.put(`${API}/api/buffet-factors/${editing}`, payload, { withCredentials: true });
        toast.success(isEs ? "Factor actualizado" : "Factor updated");
      }
      setEditing(null);
      fetchFactors();
    } catch (e) {
      const msg = e?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : (isEs ? "Error al guardar" : "Save failed"));
    }
  };

  const remove = async (id) => {
    if (!window.confirm(isEs ? "¿Eliminar este factor?" : "Delete this factor?")) return;
    try {
      await axios.delete(`${API}/api/buffet-factors/${id}`, { withCredentials: true });
      toast.success(isEs ? "Eliminado" : "Deleted");
      fetchFactors();
    } catch {
      toast.error(isEs ? "Error" : "Error");
    }
  };

  const labelForScope = (f) => {
    if (f.scope_type === "default") return isEs ? "(Por defecto)" : "(Default)";
    if (f.scope_type === "category") return f.scope_id;
    const r = recipes.find((x) => x.recipe_id === f.scope_id);
    return r?.name || f.scope_id;
  };

  const renderScopeIdInput = () => {
    if (form.scope_type === "default") return null;
    if (form.scope_type === "category") {
      return (
        <Select value={form.scope_id} onValueChange={(v) => setForm({ ...form, scope_id: v })}>
          <SelectTrigger data-testid="buffet-factor-scope-id">
            <SelectValue placeholder={isEs ? "Elige categoría..." : "Pick category..."} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Select value={form.scope_id} onValueChange={(v) => setForm({ ...form, scope_id: v })}>
        <SelectTrigger data-testid="buffet-factor-scope-id">
          <SelectValue placeholder={isEs ? "Elige receta..." : "Pick recipe..."} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {recipes.map((r) => (
            <SelectItem key={r.recipe_id} value={r.recipe_id}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const toggleAppliesTo = (val) => {
    setForm((prev) => {
      const has = prev.applies_to_menu_types.includes(val);
      return {
        ...prev,
        applies_to_menu_types: has
          ? prev.applies_to_menu_types.filter((x) => x !== val)
          : [...prev.applies_to_menu_types, val],
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="buffet-factors-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            {isEs ? "Factores de Consumo Buffet" : "Buffet Consumption Factors"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {isEs
              ? "Define cuánto consume un comensal de cada receta en buffet/cóctel. Resolución: receta → categoría → por defecto → 1.0."
              : "Define how much a guest consumes for buffet/cocktail. Resolution: recipe → category → default → 1.0."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          {editing === null && (
            <Button size="sm" onClick={startNew} className="gap-1.5" data-testid="buffet-factor-new-btn">
              <Plus className="w-3.5 h-3.5" />
              {isEs ? "Nuevo factor" : "New factor"}
            </Button>
          )}
        </div>

        {editing !== null && (
          <div className="border rounded-md p-3 bg-muted/30 space-y-3 mb-3" data-testid="buffet-factor-form">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{isEs ? "Alcance" : "Scope"}</Label>
                <Select value={form.scope_type} onValueChange={(v) => setForm({ ...form, scope_type: v, scope_id: "" })}>
                  <SelectTrigger data-testid="buffet-factor-scope-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{isEs ? "Detalle del alcance" : "Scope detail"}</Label>
                {renderScopeIdInput() || (
                  <Input value="—" disabled className="text-muted-foreground" />
                )}
              </div>
              <div>
                <Label className="text-xs">{isEs ? "Factor (0–5)" : "Factor (0–5)"}</Label>
                <Input
                  type="number"
                  step="0.05"
                  min={0.05}
                  max={5}
                  value={form.factor}
                  onChange={(e) => setForm({ ...form, factor: e.target.value })}
                  data-testid="buffet-factor-value"
                />
              </div>
              <div>
                <Label className="text-xs">{isEs ? "Aplica a tipos" : "Applies to types"}</Label>
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {APPLIES_TO_OPTIONS.map((o) => (
                    <Badge
                      key={o.value}
                      variant={form.applies_to_menu_types.includes(o.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleAppliesTo(o.value)}
                      data-testid={`buffet-factor-applies-${o.value}`}
                    >
                      {isEs ? o.labelEs : o.labelEn}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">{isEs ? "Notas" : "Notes"}</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={isEs ? "Opcional..." : "Optional..."}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={cancelEdit} data-testid="buffet-factor-cancel-btn">
                <X className="w-3.5 h-3.5 mr-1" />
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button size="sm" onClick={save} data-testid="buffet-factor-save-btn">
                <Save className="w-3.5 h-3.5 mr-1" />
                {isEs ? "Guardar" : "Save"}
              </Button>
            </div>
          </div>
        )}

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Alcance" : "Scope"}</TableHead>
                <TableHead>{isEs ? "Detalle" : "Detail"}</TableHead>
                <TableHead className="text-right">{isEs ? "Factor" : "Factor"}</TableHead>
                <TableHead>{isEs ? "Aplica a" : "Applies to"}</TableHead>
                <TableHead>{isEs ? "Notas" : "Notes"}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">{isEs ? "Cargando..." : "Loading..."}</TableCell></TableRow>
              ) : factors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    {isEs ? "Sin factores. Crea uno por defecto para empezar (sugerido: 0.85 para buffet)." : "No factors yet. Create a default one (try 0.85 for buffet)."}
                  </TableCell>
                </TableRow>
              ) : (
                factors.map((f) => (
                  <TableRow key={f.factor_id} data-testid={`buffet-factor-row-${f.factor_id}`}>
                    <TableCell>
                      <Badge variant="outline">
                        {f.scope_type === "default" ? (isEs ? "Por defecto" : "Default") : f.scope_type === "category" ? (isEs ? "Categoría" : "Category") : (isEs ? "Receta" : "Recipe")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{labelForScope(f)}</TableCell>
                    <TableCell className="text-right font-mono">{f.factor}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(f.applies_to_menu_types || []).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{f.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(f)} data-testid={`buffet-factor-edit-${f.factor_id}`}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(f.factor_id)} data-testid={`buffet-factor-delete-${f.factor_id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="buffet-factors-close-btn">
            {isEs ? "Cerrar" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
