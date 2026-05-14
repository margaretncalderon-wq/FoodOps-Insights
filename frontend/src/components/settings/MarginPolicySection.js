import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API } from "../../utils/api";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Plus, Trash2, Percent, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const ITEM_TYPES = ["Food", "Service", "Rental", "Fee", "Other"];

export default function MarginPolicySection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [byType, setByType] = useState({});
  const [byCategory, setByCategory] = useState([]);
  const [defaults, setDefaults] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/settings/margin-policy`, { withCredentials: true });
      setByType(res.data?.by_type || {});
      setByCategory(res.data?.by_category || []);
      setDefaults(res.data?.defaults || {});
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error cargando política" : "Error loading policy"));
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => { load(); }, [load]);

  const handleTypeChange = (type, value) => {
    const num = parseFloat(value);
    setByType((s) => ({ ...s, [type]: isNaN(num) ? 0 : num }));
  };

  const addRule = () => {
    setByCategory((s) => [...s, { item_type: "Food", category: "", min_margin_pct: 35 }]);
  };
  const updateRule = (idx, field, value) => {
    setByCategory((s) => s.map((r, i) => i === idx ? { ...r, [field]: field === "min_margin_pct" ? parseFloat(value) || 0 : value } : r));
  };
  const removeRule = (idx) => {
    setByCategory((s) => s.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    // Validate
    const invalidRule = byCategory.find((r) => !r.category || !r.item_type);
    if (invalidRule) {
      toast.error(isEs ? "Hay reglas con tipo o categoría vacía" : "Some rules are missing type or category");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.put(`${API}/settings/margin-policy`, {
        by_type: byType,
        by_category: byCategory,
      }, { withCredentials: true });
      setByType(res.data?.by_type || {});
      setByCategory(res.data?.by_category || []);
      toast.success(isEs ? "Política guardada" : "Policy saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al guardar" : "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm(isEs ? "¿Restablecer valores por tipo a los defaults?" : "Reset type values to defaults?")) return;
    setByType({ ...defaults });
  };

  return (
    <div className="space-y-6" data-testid="margin-policy-section">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                {isEs ? "Política de Margen" : "Margin Policy"}
              </CardTitle>
              <CardDescription>
                {isEs
                  ? "Define el margen mínimo aceptable. Se resuelve en cascada: ítem individual → categoría → tipo."
                  : "Define the minimum acceptable margin. Resolved in cascade: per-item → category → type."}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="margin-policy-reload-btn">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              {isEs ? "Recargar" : "Reload"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Defaults by type */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                {isEs ? "Por tipo de ítem" : "By item type"}
              </h3>
              <Button variant="ghost" size="sm" onClick={handleReset} data-testid="margin-policy-reset-btn">
                {isEs ? "Restablecer defaults" : "Reset to defaults"}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {ITEM_TYPES.map((t) => (
                <div key={t}>
                  <Label className="text-xs text-muted-foreground">{t}</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={byType[t] ?? ""}
                      onChange={(e) => handleTypeChange(t, e.target.value)}
                      className="pr-8"
                      data-testid={`margin-policy-type-${t.toLowerCase()}`}
                    />
                    <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {isEs ? "Default" : "Default"}: {defaults[t] ?? "—"}%
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Category overrides */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold">
                  {isEs ? "Reglas por categoría (override)" : "Category rules (override)"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isEs
                    ? "Si un ítem pertenece a una categoría con regla, esta gana sobre el tipo."
                    : "If an item belongs to a category with a rule, that wins over the type."}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addRule} data-testid="margin-policy-add-rule-btn">
                <Plus className="w-4 h-4 mr-1.5" />
                {isEs ? "Agregar regla" : "Add rule"}
              </Button>
            </div>
            {byCategory.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                {isEs
                  ? "Sin reglas por categoría. Los ítems usarán el default de su tipo."
                  : "No category rules. Items will use their type default."}
              </div>
            ) : (
              <div className="space-y-2">
                {byCategory.map((rule, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-end rounded-md border bg-muted/10 p-2"
                    data-testid={`margin-policy-rule-${idx}`}
                  >
                    <div className="col-span-3">
                      <Label className="text-[10px] text-muted-foreground">{isEs ? "Tipo" : "Type"}</Label>
                      <Select value={rule.item_type} onValueChange={(v) => updateRule(idx, "item_type", v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ITEM_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6">
                      <Label className="text-[10px] text-muted-foreground">{isEs ? "Categoría (id o nombre)" : "Category (id or name)"}</Label>
                      <Input
                        value={rule.category || ""}
                        onChange={(e) => updateRule(idx, "category", e.target.value)}
                        placeholder={isEs ? "p.ej. appetizers, cat_123" : "e.g. appetizers, cat_123"}
                        className="h-9"
                        data-testid={`margin-policy-rule-category-${idx}`}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">{isEs ? "Margen %" : "Margin %"}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={rule.min_margin_pct ?? ""}
                          onChange={(e) => updateRule(idx, "min_margin_pct", e.target.value)}
                          className="h-9 pr-7"
                          data-testid={`margin-policy-rule-pct-${idx}`}
                        />
                        <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeRule(idx)}
                        data-testid={`margin-policy-rule-remove-${idx}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save action */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <Badge variant="outline" className="mr-1.5">Tip</Badge>
              {isEs
                ? "Los ítems individuales (Recetas / Picklist) pueden tener su propio override desde su formulario de edición."
                : "Individual items (Recipes / Picklist) can have their own override from their edit form."}
            </p>
            <Button onClick={handleSave} disabled={saving || loading} data-testid="margin-policy-save-btn">
              {saving
                ? (<><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />{isEs ? "Guardando..." : "Saving..."}</>)
                : (isEs ? "Guardar política" : "Save policy")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
