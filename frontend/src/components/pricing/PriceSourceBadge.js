import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Info } from "lucide-react";

/**
 * PriceSourceBadge — visualiza de dónde proviene un precio resuelto
 * por la cascada de `services/pricing.py` (Fase 1a).
 *
 * source (backend):
 *   - manual_override        → "Manual"        (color slate)
 *   - format                 → "Formato"       (color amber)
 *   - recipe_method          → "Método receta" (color indigo)
 *   - company_method         → "Método empresa"(color purple)
 *   - cost_plus_fallback     → "Sólo costo"    (color rose)
 *   - menu_method            → "Sugerido"      (color blue)
 *
 * Se puede usar en:
 *   - Recipe costing panel
 *   - Portion format rows
 *   - Plated menu editor
 */
const STYLES = {
  manual_override: {
    label_es: "Manual",
    label_en: "Manual",
    className: "bg-slate-100 text-slate-700 border-slate-300",
    tooltip_es: "Precio ingresado manualmente. Anula todos los cálculos automáticos.",
    tooltip_en: "Manually entered price. Overrides any automatic calculation.",
  },
  format: {
    label_es: "Formato",
    label_en: "Format",
    className: "bg-amber-50 text-amber-800 border-amber-300",
    tooltip_es: "Precio sugerido para este formato de porción.",
    tooltip_en: "Suggested price for this portion format.",
  },
  recipe_method: {
    label_es: "Método receta",
    label_en: "Recipe method",
    className: "bg-indigo-50 text-indigo-800 border-indigo-300",
    tooltip_es: "Calculado con el método elegido en la receta (Food Cost / Prime / Markup).",
    tooltip_en: "Computed via the recipe pricing method (Food Cost / Prime / Markup).",
  },
  company_method: {
    label_es: "Método empresa",
    label_en: "Company method",
    className: "bg-purple-50 text-purple-800 border-purple-300",
    tooltip_es: "Derivado del target de la empresa (Settings → Política de Precio).",
    tooltip_en: "Derived from the company target (Settings → Pricing Policy).",
  },
  cost_plus_fallback: {
    label_es: "Sólo costo",
    label_en: "Cost only",
    className: "bg-rose-50 text-rose-700 border-rose-300",
    tooltip_es: "No hay precio configurado. Se muestra sólo el costo. Define un target o precio manual.",
    tooltip_en: "No price configured. Only the cost is shown. Set a target or manual price.",
  },
  menu_method: {
    label_es: "Sugerido calculado",
    label_en: "Suggested calculated",
    className: "bg-blue-50 text-blue-800 border-blue-300",
    tooltip_es: "Precio sugerido calculado desde el costo del menú y el margen objetivo.",
    tooltip_en: "Suggested price computed from menu cost and target margin.",
  },
};

export default function PriceSourceBadge({
  source,
  method = null,
  targetPct = null,
  language = "es",
  size = "sm",
  showIcon = true,
  testId = null,
}) {
  const spec = STYLES[source] || STYLES.cost_plus_fallback;
  const label = language === "es" ? spec.label_es : spec.label_en;
  const tooltip = language === "es" ? spec.tooltip_es : spec.tooltip_en;

  // Enrich the label with method+target when recipe/company method resolves it.
  let enriched = label;
  if ((source === "recipe_method" || source === "company_method") && method) {
    const methodLabel = { food_cost: "Food Cost", prime_cost: "Prime Cost", markup: "Markup", target_margin_pct: "Margen" }[method] || method;
    enriched = targetPct ? `${label}: ${methodLabel} ${Number(targetPct).toFixed(0)}%` : `${label}: ${methodLabel}`;
  }

  const sizeCls = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-[11px] px-2 py-0.5";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${spec.className} ${sizeCls} font-medium border inline-flex items-center gap-1`}
            data-testid={testId || `price-source-badge-${source}`}
          >
            {enriched}
            {showIcon && <Info className="w-2.5 h-2.5 opacity-60" />}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Determina el `source` esperado a partir del state del recipe form,
 * sin llamar al backend, replicando la Cascada A de services/pricing.py.
 * Usado para el editor en vivo (mientras el usuario tipea).
 */
export function computeRecipePriceSource({ recipeSellPrice, methodPref, methodPrice }) {
  if (Number(recipeSellPrice) > 0) return { source: "manual_override", method: null };
  if (Number(methodPrice) > 0) return { source: "recipe_method", method: methodPref || "food_cost" };
  return { source: "cost_plus_fallback", method: null };
}

/**
 * Igual pero para un portion format row.
 */
export function computeFormatPriceSource({ formatSellPrice, formatSuggestedPrice }) {
  if (Number(formatSellPrice) > 0) return { source: "manual_override", method: null };
  if (Number(formatSuggestedPrice) > 0) return { source: "format", method: null };
  return { source: "cost_plus_fallback", method: null };
}

/**
 * Igual pero para un plated menu.
 */
export function computeMenuPriceSource({ sellPricePerGuest, suggestedPricePerGuest }) {
  if (Number(sellPricePerGuest) > 0) return { source: "manual_override", method: null };
  if (Number(suggestedPricePerGuest) > 0) return { source: "menu_method", method: null };
  return { source: "cost_plus_fallback", method: null };
}
