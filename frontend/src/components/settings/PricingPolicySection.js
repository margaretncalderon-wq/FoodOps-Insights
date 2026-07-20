import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API } from "../../utils/api";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { RefreshCw, Percent, Calculator, DollarSign, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { toast } from "sonner";

import MarginPolicySection from "./MarginPolicySection";

/**
 * PricingPolicySection — Fase 1b · Settings consolidados.
 *
 * Este componente reemplaza el tab suelto "Política de Margen" con una vista
 * de dos bloques claros, ambos independientes pero adyacentes:
 *
 *   A · Motor de precio  → cómo se CALCULA el precio sugerido.
 *   B · Margen mínimo    → alerta cuando un precio final cae por DEBAJO del piso.
 *
 * Los rótulos son deliberadamente distintos ("Food 30% es TARGET DE CÁLCULO"
 * vs "Food 35% es PISO DE ALERTA") para evitar la confusión histórica entre
 * ambas cascadas.
 */
export default function PricingPolicySection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [engine, setEngine] = useState({
    recipe_target_food_cost_percent: 30,
    recipe_target_prime_cost_percent: 55,
    recipe_target_gross_margin_percent: 65,
    chef_hourly_rate: 20,
    recipe_overhead_percent: 15,
  });

  const loadEngine = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/settings/company`, { withCredentials: true });
      const c = res.data || {};
      setEngine({
        recipe_target_food_cost_percent: Number(c.recipe_target_food_cost_percent ?? 30),
        recipe_target_prime_cost_percent: Number(c.recipe_target_prime_cost_percent ?? 55),
        recipe_target_gross_margin_percent: Number(c.recipe_target_gross_margin_percent ?? 65),
        chef_hourly_rate: Number(c.chef_hourly_rate ?? 20),
        recipe_overhead_percent: Number(c.recipe_overhead_percent ?? 15),
      });
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error cargando motor de precio" : "Error loading pricing engine"));
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => { loadEngine(); }, [loadEngine]);

  const handleEngineChange = (field, raw) => {
    const num = parseFloat(raw);
    setEngine((s) => ({ ...s, [field]: isNaN(num) ? 0 : num }));
  };

  const handleSaveEngine = async () => {
    if (engine.recipe_target_food_cost_percent <= 0 || engine.recipe_target_food_cost_percent >= 100) {
      toast.error(isEs ? "Food Cost target debe estar entre 1% y 99%" : "Food Cost target must be between 1% and 99%");
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/settings/company`, engine, { withCredentials: true });
      toast.success(isEs ? "Motor de precio guardado" : "Pricing engine saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al guardar" : "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="pricing-policy-section">
      {/* Header banner clarifying the two independent cascades */}
      <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
          <div className="text-sm text-emerald-900 leading-relaxed">
            <p className="font-semibold mb-1">
              {isEs
                ? "Dos cascadas independientes, no las confundas:"
                : "Two independent cascades, do NOT confuse them:"}
            </p>
            <ul className="space-y-1 text-[13px] pl-4 list-disc marker:text-emerald-600">
              <li>
                <b>{isEs ? "A · Motor de precio" : "A · Pricing engine"}</b>{" — "}
                {isEs
                  ? "Food Cost 30% es un TARGET DE CÁLCULO. El precio sugerido = costo ÷ 30% = costo × 3.33."
                  : "Food Cost 30% is a COMPUTE TARGET. Suggested price = cost ÷ 30% = cost × 3.33."}
              </li>
              <li>
                <b>{isEs ? "B · Margen mínimo" : "B · Minimum margin"}</b>{" — "}
                {isEs
                  ? "Food 35% es un PISO DE ALERTA. Si el precio final marca margen < 35% te avisa; NO recalcula precios."
                  : "Food 35% is an ALERT FLOOR. Warns if final margin drops below 35%; NEVER recomputes prices."}
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Sub-bloque A · Motor de precio */}
      <Card data-testid="pricing-engine-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-600" />
                {isEs ? "A · Motor de precio" : "A · Pricing engine"}
              </CardTitle>
              <CardDescription>
                {isEs
                  ? "Cómo se calcula el precio SUGERIDO en recetas y menús. Estos valores son targets, no pisos."
                  : "How the SUGGESTED price is computed for recipes and menus. These are targets, not floors."}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadEngine} disabled={loading} data-testid="pricing-engine-reload-btn">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              {isEs ? "Recargar" : "Reload"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="flex items-center gap-1.5 text-xs font-semibold">
                {isEs ? "Food Cost target" : "Food Cost target"}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      {isEs
                        ? "Objetivo % de food cost. precio = costo ÷ target. 30% es el estándar Gastronomía."
                        : "Target food cost %. price = cost ÷ target. 30% is the industry default."}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative mt-1">
                <Input
                  type="number" min="1" max="99" step="0.5"
                  value={engine.recipe_target_food_cost_percent}
                  onChange={(e) => handleEngineChange("recipe_target_food_cost_percent", e.target.value)}
                  className="pr-8"
                  data-testid="engine-food-cost-target"
                />
                <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {isEs ? "precio = costo comida ÷ target" : "price = food cost ÷ target"}
              </p>
            </div>
            <div>
              <Label className="text-xs font-semibold">
                {isEs ? "Prime Cost target" : "Prime Cost target"}
              </Label>
              <div className="relative mt-1">
                <Input
                  type="number" min="1" max="99" step="0.5"
                  value={engine.recipe_target_prime_cost_percent}
                  onChange={(e) => handleEngineChange("recipe_target_prime_cost_percent", e.target.value)}
                  className="pr-8"
                  data-testid="engine-prime-cost-target"
                />
                <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {isEs ? "precio = (food+labor) ÷ target" : "price = (food+labor) ÷ target"}
              </p>
            </div>
            <div>
              <Label className="text-xs font-semibold">
                {isEs ? "Markup / Gross margin" : "Markup / Gross margin"}
              </Label>
              <div className="relative mt-1">
                <Input
                  type="number" min="1" max="99" step="0.5"
                  value={engine.recipe_target_gross_margin_percent}
                  onChange={(e) => handleEngineChange("recipe_target_gross_margin_percent", e.target.value)}
                  className="pr-8"
                  data-testid="engine-markup-target"
                />
                <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {isEs ? "precio = costo total ÷ (1 − margen)" : "price = total cost ÷ (1 − margin)"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t">
            <div>
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" />
                {isEs ? "Tarifa chef ($/hora)" : "Chef rate ($/hour)"}
              </Label>
              <Input
                type="number" min="0" step="0.5"
                value={engine.chef_hourly_rate}
                onChange={(e) => handleEngineChange("chef_hourly_rate", e.target.value)}
                className="mt-1"
                data-testid="engine-chef-hourly-rate"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {isEs ? "Se usa para calcular labor cost por receta." : "Used to compute labor cost per recipe."}
              </p>
            </div>
            <div>
              <Label className="text-xs font-semibold">
                {isEs ? "Overhead sobre costo comida" : "Overhead on food cost"}
              </Label>
              <div className="relative mt-1">
                <Input
                  type="number" min="0" max="100" step="0.5"
                  value={engine.recipe_overhead_percent}
                  onChange={(e) => handleEngineChange("recipe_overhead_percent", e.target.value)}
                  className="pr-8"
                  data-testid="engine-overhead-percent"
                />
                <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {isEs ? "Overhead adicional aplicado al food cost." : "Overhead applied on top of food cost."}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                {isEs ? "Target" : "Target"}
              </Badge>
              {isEs
                ? "Estos valores son objetivos de cálculo. NO son pisos de alerta."
                : "These are compute targets. They are NOT alert floors."}
            </div>
            <Button onClick={handleSaveEngine} disabled={saving || loading} data-testid="pricing-engine-save-btn">
              {saving
                ? (<><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />{isEs ? "Guardando..." : "Saving..."}</>)
                : (isEs ? "Guardar motor de precio" : "Save pricing engine")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sub-bloque B · Margen mínimo (existente MarginPolicySection reused) */}
      <div>
        <div className="mb-2 px-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            {isEs ? "B · Margen mínimo de alerta" : "B · Minimum margin alert"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isEs
              ? "Piso de alerta. Si un ítem se vende por debajo, la UI lo marcará en rojo. NUNCA modifica precios."
              : "Alert floor. UI flags any item selling below it. NEVER modifies prices."}
          </p>
        </div>
        <MarginPolicySection />
      </div>
    </div>
  );
}
