import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_BASE as API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "./ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "./ui/dialog";
import { Calculator, Save, RefreshCw, Users, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "../utils/format";

/**
 * RecipeScalePanel — live preview of a recipe scaled to a target portion count,
 * with the ability to persist the result as a new "Scaled Menu" (base recipe stays untouched).
 */
export default function RecipeScalePanel({ recipe }) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState("");
  const [target, setTarget] = useState(
    Math.max(1, Number(recipe?.portions_per_yield) || 1),
  );
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [menuName, setMenuName] = useState("");
  const [saving, setSaving] = useState(false);

  // Load active events for the "use event guest_count" dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/api/events`, { withCredentials: true });
        const list = Array.isArray(res.data) ? res.data : res.data?.items || [];
        if (!cancelled) setEvents(list.filter((e) => (e.guest_count || e.num_guests) > 0));
      } catch (_) { /* non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const runPreview = useCallback(async (portions) => {
    if (!recipe?.recipe_id || !portions || portions <= 0) return;
    setLoading(true);
    try {
      const res = await axios.post(
        `${API}/api/recipes/${recipe.recipe_id}/scale`,
        { target_portions: Number(portions), event_id: eventId || null },
        { withCredentials: true },
      );
      setPreview(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error escalando" : "Scale failed"));
    } finally {
      setLoading(false);
    }
  }, [recipe?.recipe_id, eventId, isEs]);

  // Initial preview when recipe loads
  useEffect(() => {
    if (recipe?.recipe_id) runPreview(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.recipe_id]);

  const handleEventSelect = (val) => {
    setEventId(val);
    const evt = events.find((e) => e.event_id === val);
    if (evt) {
      const gc = Number(evt.guest_count || evt.num_guests) || target;
      setTarget(gc);
      runPreview(gc);
    }
  };

  const handleTargetChange = (val) => {
    const num = Number(val);
    setTarget(num);
    if (num > 0) runPreview(num);
  };

  const handleSaveAsMenu = async () => {
    if (!menuName.trim()) {
      toast.error(isEs ? "Nombre requerido" : "Name required");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(
        `${API}/api/recipes/save-scaled-menu`,
        {
          name: menuName.trim(),
          description: isEs
            ? `Escalado para ${target} porciones de "${recipe.name}"`
            : `Scaled for ${target} portions of "${recipe.name}"`,
          event_id: eventId || null,
          recipes: [{ recipe_id: recipe.recipe_id, target_portions: Number(target) }],
        },
        { withCredentials: true },
      );
      toast.success(
        isEs
          ? `Menú "${res.data.name}" creado — la receta base no cambió`
          : `Menu "${res.data.name}" created — base recipe unchanged`,
      );
      setSaveDialogOpen(false);
      setMenuName("");
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al guardar" : "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!recipe?.recipe_id) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground" data-testid="recipe-scale-panel-empty">
        <ChefHat className="w-10 h-10 mx-auto mb-2 opacity-60" />
        {isEs
          ? "Guarda la receta primero para poder escalarla"
          : "Save the recipe first to enable scaling"}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="recipe-scale-panel">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5" />
                {isEs ? "Porciones objetivo" : "Target portions"}
              </Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={target}
                onChange={(e) => handleTargetChange(e.target.value)}
                className="font-mono"
                data-testid="recipe-scale-target-input"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {isEs ? "Receta base rinde" : "Base recipe yields"}: {recipe.portions_per_yield || 1}
              </p>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {isEs ? "O cargar invitados desde un evento" : "Or load guests from an event"}
              </Label>
              <Select value={eventId || undefined} onValueChange={handleEventSelect}>
                <SelectTrigger data-testid="recipe-scale-event-select">
                  <SelectValue placeholder={isEs ? "Selecciona evento (opcional)" : "Pick an event (optional)"} />
                </SelectTrigger>
                <SelectContent>
                  {events.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {isEs ? "No hay eventos con invitados" : "No events with guest count"}
                    </div>
                  )}
                  {events.map((e) => (
                    <SelectItem key={e.event_id} value={e.event_id}>
                      {e.name} — {e.guest_count || e.num_guests} {isEs ? "invitados" : "guests"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary */}
          {preview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="recipe-scale-summary">
              <div className="rounded border bg-muted/20 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{isEs ? "Factor" : "Factor"}</p>
                <p className="text-base font-semibold">×{preview.scale_factor}</p>
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{isEs ? "Costo total" : "Total cost"}</p>
                <p className="text-base font-semibold">${fmtNum(preview.total_cost_scaled)}</p>
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{isEs ? "$ / porción" : "$ / portion"}</p>
                <p className="text-base font-semibold">${fmtNum(preview.cost_per_portion_scaled)}</p>
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{isEs ? "Original $/p" : "Original $/p"}</p>
                <p className="text-base font-semibold opacity-70">${fmtNum(preview.original_cost_per_portion)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ingredient table */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              {isEs ? "Ingredientes escalados" : "Scaled ingredients"}
            </h3>
            <div className="flex items-center gap-2">
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
              <Button
                size="sm"
                onClick={() => {
                  setMenuName(`${recipe.name} — ${target} ${isEs ? "porciones" : "portions"}`);
                  setSaveDialogOpen(true);
                }}
                disabled={!preview || loading}
                data-testid="recipe-scale-save-menu-btn"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {isEs ? "Guardar como Menú" : "Save as Menu"}
              </Button>
            </div>
          </div>

          {!preview ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {isEs ? "Ingresa porciones objetivo para previsualizar" : "Enter target portions to preview"}
            </div>
          ) : preview.ingredients.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {isEs ? "Esta receta no tiene ingredientes" : "This recipe has no ingredients"}
            </div>
          ) : (
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">{isEs ? "Ingrediente" : "Ingredient"}</th>
                    <th className="text-right px-3 py-2">{isEs ? "Cantidad" : "Quantity"}</th>
                    <th className="text-left px-3 py-2">{isEs ? "Unidad" : "Unit"}</th>
                    <th className="text-right px-3 py-2">{isEs ? "Costo" : "Cost"}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.ingredients.map((i, idx) => {
                    const rounded = i.is_discrete_unit && i.quantity_scaled_raw !== i.quantity_scaled;
                    return (
                      <tr
                        key={i.ingredient_id || idx}
                        className="border-t hover:bg-muted/20"
                        data-testid={`recipe-scale-row-${idx}`}
                      >
                        <td className="px-3 py-2">
                          <span>{i.name}</span>
                          {i.is_discrete_unit && (
                            <Badge variant="outline" className="ml-2 text-[9px] py-0">
                              {isEs ? "discreto" : "discrete"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {i.quantity_scaled}
                          {rounded && (
                            <span className="text-[10px] text-amber-600 ml-1">
                              (↑ {i.quantity_scaled_raw})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{i.unit}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          ${fmtNum(i.line_cost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-recipes */}
          {preview?.sub_recipes?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {isEs ? "Sub-recetas" : "Sub-recipes"}
              </h4>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">{isEs ? "Sub-receta" : "Sub-recipe"}</th>
                      <th className="text-right px-3 py-2">{isEs ? "Cantidad" : "Quantity"}</th>
                      <th className="text-left px-3 py-2">{isEs ? "Unidad" : "Unit"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sub_recipes.map((s, idx) => (
                      <tr key={s.child_recipe_id || idx} className="border-t">
                        <td className="px-3 py-2">{s.name}</td>
                        <td className="px-3 py-2 text-right font-mono">{s.quantity_scaled}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{s.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save as Menu dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={(o) => !saving && setSaveDialogOpen(o)}>
        <DialogContent data-testid="recipe-scale-save-dialog">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Guardar como Menú Escalado" : "Save as Scaled Menu"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {isEs
                ? "Se creará un nuevo Menú con el snapshot escalado. La receta original NO se modifica."
                : "A new Menu will be created with the scaled snapshot. The original recipe is NOT modified."}
            </p>
            <div>
              <Label className="text-xs">{isEs ? "Nombre del menú" : "Menu name"}</Label>
              <Input
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                data-testid="recipe-scale-save-name-input"
              />
            </div>
            <div className="rounded border bg-muted/20 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isEs ? "Receta base" : "Base recipe"}</span>
                <span className="font-medium">{recipe.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isEs ? "Porciones objetivo" : "Target portions"}</span>
                <span className="font-mono">{target}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isEs ? "Costo total" : "Total cost"}</span>
                <span className="font-mono">${fmtNum((preview?.total_cost_scaled || 0))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={saving} data-testid="recipe-scale-save-cancel-btn">
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveAsMenu} disabled={saving || !menuName.trim()} data-testid="recipe-scale-save-confirm-btn">
              {saving
                ? (<><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />{isEs ? "Guardando..." : "Saving..."}</>)
                : (isEs ? "Guardar" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
