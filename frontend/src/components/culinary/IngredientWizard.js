import { useState, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { ArrowLeft, ArrowRight, Check, Sparkles, Scale, Beaker, Package, Tag, AlertCircle } from "lucide-react";

import { API_BASE as API } from "../../utils/api";

/**
 * IngredientWizard
 * 4-step guided dialog to create or repair an ingredient with the full v2 unit model.
 *
 *  Step 1 — Identidad: name, brand, category
 *  Step 2 — Cómo lo compras: purchase_unit, purchase_quantity_per_unit, purchase_cost
 *  Step 3 — Unidad base de costeo: base_unit (auto-suggested), density_g_per_ml (only if needed)
 *  Step 4 — Revisa y guarda
 */

const CATEGORIES_FALLBACK = [
  { key: "produce", label_es: "Vegetales/Frutas", label_en: "Produce" },
  { key: "protein", label_es: "Proteínas", label_en: "Protein" },
  { key: "dairy_solid", label_es: "Lácteos sólidos", label_en: "Dairy (solid)" },
  { key: "dairy_liquid", label_es: "Lácteos líquidos", label_en: "Dairy (liquid)" },
  { key: "dry_goods", label_es: "Secos / Harinas", label_en: "Dry Goods" },
  { key: "oils", label_es: "Aceites", label_en: "Oils" },
  { key: "beverage", label_es: "Bebidas", label_en: "Beverage" },
  { key: "spices", label_es: "Especias", label_en: "Spices" },
  { key: "sauces", label_es: "Salsas", label_en: "Sauces" },
];

const PURCHASE_UNITS = [
  "kg", "g", "lb", "oz", "L", "ml", "gal", "unit", "dozen",
  "case", "box", "bag", "pack",
];

const BASE_UNITS = [
  { value: "g", labelEs: "gramos (peso)", labelEn: "grams (weight)" },
  { value: "ml", labelEs: "mililitros (volumen)", labelEn: "milliliters (volume)" },
  { value: "unit", labelEs: "unidades (cuenta)", labelEn: "units (count)" },
];

// Suggest the base unit (mass / volume / count) from the category.
function suggestBaseUnit(category) {
  const c = (category || "").toLowerCase();
  if (/(liquid|oil|aceite|vinagre|beverage|bebida|dairy_liquid|sauce|salsa)/.test(c)) return "ml";
  if (/(egg|huevo|packaging|disposable|equipment|supply)/.test(c)) return "unit";
  return "g"; // default
}

// Quick density hints by name keywords (chef-friendly defaults).
const DENSITY_HINTS = [
  { match: ["agua", "water"], density: 1.0 },
  { match: ["leche", "milk"], density: 1.03 },
  { match: ["aceite", "oil"], density: 0.92 },
  { match: ["miel", "honey"], density: 1.42 },
  { match: ["jugo", "juice"], density: 1.05 },
  { match: ["harina", "flour"], density: 0.53 },
  { match: ["azúcar", "azucar", "sugar"], density: 0.85 },
  { match: ["sal", "salt"], density: 1.2 },
];

function suggestDensity(name) {
  const n = (name || "").toLowerCase();
  for (const h of DENSITY_HINTS) {
    if (h.match.some((kw) => n.includes(kw))) return h.density;
  }
  return null;
}

export default function IngredientWizard({ open, onClose, onSaved, initial = null, categories = [] }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const cats = categories.length > 0 ? categories : CATEGORIES_FALLBACK;

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    brand: initial?.brand || "",
    category: initial?.category || "produce",
    inventory_type: "food",
    sku: initial?.sku || "",
    purchase_unit: initial?.purchase_unit || "kg",
    purchase_quantity_per_unit: initial?.purchase_quantity_per_unit || 1,
    purchase_cost: initial?.purchase_cost || initial?.cost_per_unit || 0,
    base_unit: initial?.base_unit || suggestBaseUnit(initial?.category || "produce"),
    density_g_per_ml: initial?.density_g_per_ml || null,
    par_level: initial?.par_level || 0,
    stock_quantity: initial?.stock_quantity || 0,
  }));

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // Whenever category changes, re-suggest a base_unit if user hasn't explicitly chosen one yet
  const handleCategoryChange = (cat) => {
    setForm((prev) => ({
      ...prev,
      category: cat,
      base_unit: initial?.base_unit ? prev.base_unit : suggestBaseUnit(cat),
    }));
  };

  // Density hint when name is typed
  const densityHint = useMemo(() => suggestDensity(form.name), [form.name]);

  // base_unit kind drives whether we need a density
  const baseKind = form.base_unit === "g" ? "weight" : form.base_unit === "ml" ? "volume" : "count";
  const purchaseKind =
    ["g", "kg", "lb", "oz"].includes(form.purchase_unit) ? "weight"
    : ["ml", "L", "gal"].includes(form.purchase_unit) ? "volume"
    : "count";

  const needsDensity = baseKind !== purchaseKind && baseKind !== "count" && purchaseKind !== "count";

  // Derived cost preview
  const costPerBase = useMemo(() => {
    const qty = parseFloat(form.purchase_quantity_per_unit) || 0;
    const cost = parseFloat(form.purchase_cost) || 0;
    if (!qty || !cost) return 0;
    return cost / qty;
  }, [form.purchase_cost, form.purchase_quantity_per_unit]);

  const validateStep = () => {
    if (step === 1) {
      if (!form.name.trim()) return t("Falta el nombre", "Name required");
      if (!form.category) return t("Selecciona categoría", "Pick a category");
    }
    if (step === 2) {
      if (!form.purchase_unit) return t("Selecciona unidad de compra", "Purchase unit required");
      if (!form.purchase_quantity_per_unit || form.purchase_quantity_per_unit <= 0)
        return t("Cantidad por compra debe ser mayor a 0", "Quantity must be > 0");
      if (!form.purchase_cost || form.purchase_cost <= 0)
        return t("Costo de compra debe ser mayor a 0", "Purchase cost must be > 0");
    }
    if (step === 3) {
      if (!form.base_unit) return t("Selecciona unidad base", "Pick a base unit");
      if (needsDensity && (!form.density_g_per_ml || form.density_g_per_ml <= 0))
        return t(
          "Necesitas densidad para convertir peso↔volumen (ej: aceite 0.92 g/ml)",
          "Density is required to convert weight↔volume",
        );
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep();
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  };
  const goPrev = () => setStep((s) => Math.max(s - 1, 1));

  const handleSave = async () => {
    const err = validateStep();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand || null,
        category: form.category,
        inventory_type: "food",
        unit: form.base_unit,
        cost_per_unit: costPerBase,
        stock_quantity: parseFloat(form.stock_quantity) || 0,
        par_level: parseFloat(form.par_level) || 0,
        min_stock_level: 0,
        sku: form.sku || null,
        // v2 unit system
        base_unit: form.base_unit,
        cost_per_base_unit: costPerBase,
        density_g_per_ml: form.density_g_per_ml || null,
        purchase_unit: form.purchase_unit,
        purchase_quantity_per_unit: parseFloat(form.purchase_quantity_per_unit) || 1,
        purchase_cost: parseFloat(form.purchase_cost) || 0,
      };
      if (initial?.ingredient_id) {
        await axios.put(`${API}/api/inventory/ingredients/${initial.ingredient_id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/inventory/ingredients`, payload, { withCredentials: true });
      }
      toast.success(t("Ingrediente guardado", "Ingredient saved"));
      onSaved?.();
      onClose?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Error";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  // ── Step renderers ───────────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-4">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="flex items-center gap-2 flex-1">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              n < step ? "bg-emerald-500 text-white"
              : n === step ? "bg-slate-900 text-white"
              : "bg-muted text-muted-foreground"
            }`}
          >
            {n < step ? <Check className="w-4 h-4" /> : n}
          </div>
          {n < 4 && <div className={`h-0.5 flex-1 ${n < step ? "bg-emerald-500" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  );

  const Step1 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-slate-900">
        <Tag className="w-5 h-5 text-emerald-600" />
        <h3 className="font-semibold">{t("Identidad", "Identity")}</h3>
      </div>
      <div>
        <Label>{t("Nombre del ingrediente", "Ingredient name")} *</Label>
        <Input
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder={t("Ej: Aceite de oliva extra virgen", "E.g., Extra virgin olive oil")}
          data-testid="wizard-name-input"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("Marca (opcional)", "Brand (optional)")}</Label>
          <Input value={form.brand} onChange={(e) => updateField("brand", e.target.value)} />
        </div>
        <div>
          <Label>SKU</Label>
          <Input value={form.sku} onChange={(e) => updateField("sku", e.target.value)} placeholder={t("Código interno", "Internal code")} />
        </div>
      </div>
      <div>
        <Label>{t("Categoría", "Category")} *</Label>
        <Select value={form.category} onValueChange={handleCategoryChange}>
          <SelectTrigger data-testid="wizard-category-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {cats.map((c) => (
              <SelectItem key={c.key || c.value} value={c.key || c.value}>
                {isEs ? (c.label_es || c.labelEs || c.key) : (c.label_en || c.labelEn || c.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {t("Sugerimos la unidad base según la categoría.", "We'll suggest a base unit from the category.")}
        </p>
      </div>
    </div>
  );

  const Step2 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-slate-900">
        <Package className="w-5 h-5 text-emerald-600" />
        <h3 className="font-semibold">{t("¿Cómo lo compras?", "How do you buy it?")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          "Cuéntanos cómo te lo venden. Esto nos permite calcular el costo real por unidad base.",
          "Tell us how the vendor sells it. We'll back-derive the cost per base unit.",
        )}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>{t("Unidad de compra", "Purchase unit")}</Label>
          <Select value={form.purchase_unit} onValueChange={(v) => updateField("purchase_unit", v)}>
            <SelectTrigger data-testid="wizard-purchase-unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PURCHASE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("Cantidad por compra", "Qty per purchase")}</Label>
          <Input
            type="number" min="0" step="0.01" value={form.purchase_quantity_per_unit}
            onChange={(e) => updateField("purchase_quantity_per_unit", parseFloat(e.target.value) || 0)}
            data-testid="wizard-purchase-qty"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {t(`Ej: 1 ${form.purchase_unit} = ? unidades base`, `E.g., 1 ${form.purchase_unit} = ? base units`)}
          </p>
        </div>
        <div>
          <Label>{t("Costo por compra ($)", "Cost per purchase ($)")}</Label>
          <Input
            type="number" min="0" step="0.01" value={form.purchase_cost}
            onChange={(e) => updateField("purchase_cost", parseFloat(e.target.value) || 0)}
            data-testid="wizard-purchase-cost"
          />
        </div>
      </div>
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-700">{t("Costo derivado", "Derived cost")}</p>
          <p className="text-lg font-bold text-emerald-900">
            ${costPerBase.toFixed(4)} <span className="text-xs font-normal text-emerald-700">/ {form.base_unit}</span>
          </p>
        </div>
        <Sparkles className="w-5 h-5 text-emerald-500" />
      </div>
    </div>
  );

  const Step3 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-slate-900">
        <Scale className="w-5 h-5 text-emerald-600" />
        <h3 className="font-semibold">{t("Unidad base de costeo", "Costing base unit")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          "Define la unidad atómica con la que costearemos las recetas. Lo demás se convierte automáticamente.",
          "The atomic unit we'll use to cost recipes. Everything else converts automatically.",
        )}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {BASE_UNITS.map((bu) => (
          <button
            key={bu.value}
            type="button"
            onClick={() => updateField("base_unit", bu.value)}
            className={`p-4 rounded-lg border text-left transition-all ${
              form.base_unit === bu.value
                ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200"
                : "bg-card hover:bg-muted/50"
            }`}
            data-testid={`wizard-base-unit-${bu.value}`}
          >
            <p className="font-semibold text-sm">{bu.value}</p>
            <p className="text-xs text-muted-foreground">{isEs ? bu.labelEs : bu.labelEn}</p>
          </button>
        ))}
      </div>

      {needsDensity && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Beaker className="w-5 h-5 text-amber-600" />
            <h4 className="font-semibold text-amber-900 text-sm">{t("Densidad necesaria", "Density required")}</h4>
          </div>
          <p className="text-xs text-amber-800">
            {t(
              `Compras en ${form.purchase_unit} (${purchaseKind === "weight" ? "peso" : "volumen"}) pero la base es ${form.base_unit} (${baseKind === "weight" ? "peso" : "volumen"}). Necesitamos la densidad en g/ml para convertir.`,
              `You buy in ${form.purchase_unit} (${purchaseKind}) but base is ${form.base_unit} (${baseKind}). We need density in g/ml to convert.`,
            )}
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number" min="0" step="0.01" value={form.density_g_per_ml || ""}
              onChange={(e) => updateField("density_g_per_ml", parseFloat(e.target.value) || null)}
              placeholder="g / ml"
              className="w-32"
              data-testid="wizard-density-input"
            />
            {densityHint && (
              <Button
                variant="outline" size="sm"
                onClick={() => updateField("density_g_per_ml", densityHint)}
                data-testid="wizard-density-suggest"
              >
                <Sparkles className="w-3 h-3 mr-1" /> {t("Usar sugerido", "Use suggested")}: {densityHint}
              </Button>
            )}
          </div>
          <p className="text-[10px] text-amber-700">
            {t("Pista: agua=1.00, aceite=0.92, miel=1.42, leche=1.03", "Hint: water=1.00, oil=0.92, honey=1.42, milk=1.03")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-2">
        <div>
          <Label>{t("Stock inicial", "Initial stock")} ({form.base_unit})</Label>
          <Input
            type="number" min="0" step="0.01" value={form.stock_quantity}
            onChange={(e) => updateField("stock_quantity", parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label>{t("Nivel mínimo (par)", "Par level")} ({form.base_unit})</Label>
          <Input
            type="number" min="0" step="0.01" value={form.par_level}
            onChange={(e) => updateField("par_level", parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );

  const Step4 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-slate-900">
        <Check className="w-5 h-5 text-emerald-600" />
        <h3 className="font-semibold">{t("Revisión final", "Final review")}</h3>
      </div>

      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{form.name}</span>
          {form.brand && <Badge variant="secondary">{form.brand}</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <div className="text-muted-foreground">{t("Categoría", "Category")}</div>
          <div className="text-right font-medium">{form.category}</div>

          <div className="text-muted-foreground">{t("Compra", "Purchase")}</div>
          <div className="text-right font-medium">
            ${form.purchase_cost} / {form.purchase_quantity_per_unit} {form.purchase_unit}
          </div>

          <div className="text-muted-foreground">{t("Unidad base", "Base unit")}</div>
          <div className="text-right font-medium">{form.base_unit}</div>

          {form.density_g_per_ml ? (
            <>
              <div className="text-muted-foreground">{t("Densidad", "Density")}</div>
              <div className="text-right font-medium">{form.density_g_per_ml} g/ml</div>
            </>
          ) : null}

          <div className="text-muted-foreground">{t("Stock inicial", "Initial stock")}</div>
          <div className="text-right font-medium">{form.stock_quantity} {form.base_unit}</div>
        </div>

        <div className="border-t pt-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("Costo por", "Cost per")} {form.base_unit}</span>
          <span className="text-xl font-bold text-emerald-700">${costPerBase.toFixed(4)}</span>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          {t(
            "Ahora puedes usar este ingrediente en recetas con cualquier unidad compatible (oz, lb, cup, ml...) y el costo se calculará automáticamente.",
            "You can now use this ingredient in recipes with any compatible unit (oz, lb, cup, ml...) and the cost will compute automatically.",
          )}
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-2xl" data-testid="ingredient-wizard-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            {initial?.ingredient_id
              ? t("Reparar ingrediente", "Repair ingredient")
              : t("Crear ingrediente (asistente)", "Create ingredient (wizard)")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Te guiamos en 4 pasos para configurar el ingrediente con costeo correcto.",
              "We'll guide you in 4 steps to configure costing correctly.",
            )}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 />}

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={goPrev} disabled={saving} data-testid="wizard-prev-btn">
                <ArrowLeft className="w-4 h-4 mr-1" /> {t("Atrás", "Back")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving} data-testid="wizard-cancel-btn">
              {t("Cancelar", "Cancel")}
            </Button>
            {step < 4 ? (
              <Button onClick={goNext} disabled={saving} data-testid="wizard-next-btn">
                {t("Siguiente", "Next")} <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving} data-testid="wizard-save-btn">
                <Check className="w-4 h-4 mr-1" />
                {saving ? t("Guardando...", "Saving...") : t("Guardar ingrediente", "Save ingredient")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
