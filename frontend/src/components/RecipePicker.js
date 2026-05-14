import { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";

import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "./ui/command";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Search, ChefHat, Loader2, ArrowLeft, Sparkles, AlertTriangle, Check } from "lucide-react";

import { API_BASE as API } from "../utils/api";

/**
 * RecipePicker — Two-stage searchable picker for adding a recipe to a quote / proposal.
 *
 *  Stage A — Search recipes (filters by name, code, type, category, allergens).
 *  Stage B — Once a recipe is picked, list its PortionFormats with cost/price/margin.
 *
 * onPick({ recipe, portionFormat | null, internal_cost, unit_price, suggested_price, allergens, description })
 *   - portionFormat is null when the recipe has no formats yet → falls back to recipe.cost_per_portion
 */
export default function RecipePicker({
  recipes,
  onPick,
  triggerLabel,
  triggerTestId = "recipe-picker-trigger",
  disabled = false,
  filterTypes = ["final_dish", "dish"],
}) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [portionFormats, setPortionFormats] = useState([]);
  const [loadingFormats, setLoadingFormats] = useState(false);

  // Filter recipes to dishes only (or per filterTypes)
  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => filterTypes.includes(r.recipe_type))
      .filter((r) => {
        if (!q) return true;
        const hay = [r.name, r.recipe_code, r.category, r.work_category, ...(r.allergens || [])]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [recipes, query, filterTypes]);

  // Fetch portion formats when a recipe is picked
  useEffect(() => {
    if (!selectedRecipe?.recipe_id) {
      setPortionFormats([]);
      return;
    }
    let cancelled = false;
    setLoadingFormats(true);
    axios
      .get(`${API}/api/recipes/${selectedRecipe.recipe_id}/portion-formats`, { withCredentials: true })
      .then((res) => {
        if (!cancelled) setPortionFormats(res.data || []);
      })
      .catch(() => { if (!cancelled) setPortionFormats([]); })
      .finally(() => { if (!cancelled) setLoadingFormats(false); });
    return () => { cancelled = true; };
  }, [selectedRecipe]);

  const reset = () => {
    setSelectedRecipe(null);
    setQuery("");
    setPortionFormats([]);
  };

  const handlePickRecipe = (recipeId) => {
    const r = recipes.find((x) => x.recipe_id === recipeId);
    if (r) setSelectedRecipe(r);
  };

  const handlePickFormat = (format) => {
    const recipe = selectedRecipe;
    const internal_cost = format ? (format.cost_per_portion || 0) : (recipe.cost_per_portion || recipe.cost_per_serving || 0);
    // Prefer sell_price configured by chef; fall back to suggested_price; fall back to cost*3 (33% food cost rule)
    const unit_price = format?.sell_price || format?.suggested_price || (internal_cost > 0 ? internal_cost * 3 : 0);
    onPick({
      recipe,
      portionFormat: format || null,
      internal_cost,
      unit_price,
      suggested_price: format?.suggested_price || internal_cost * 3,
      allergens: recipe.allergens || [],
      description: format ? `${recipe.name} — ${format.format_name}` : recipe.name,
    });
    setOpen(false);
    reset();
  };

  const label = triggerLabel || (isEs ? "+ Buscar receta..." : "+ Search recipe...");

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal text-muted-foreground hover:text-foreground"
          disabled={disabled}
          data-testid={triggerTestId}
        >
          <span className="flex items-center gap-2 truncate">
            <ChefHat className="w-4 h-4 opacity-60" />
            {label}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="end" data-testid="recipe-picker-content">
        {!selectedRecipe ? (
          // STAGE A — Search recipes
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={isEs ? "Buscar receta por nombre, código, categoría..." : "Search recipe by name, code, category..."}
              data-testid="recipe-picker-search"
            />
            <CommandList>
              <CommandEmpty>{isEs ? "Sin resultados" : "No results"}</CommandEmpty>
              <CommandGroup>
                {filteredRecipes.map((r) => {
                  const cost = r.cost_per_portion || r.cost_per_serving || 0;
                  return (
                    <CommandItem
                      key={r.recipe_id}
                      value={r.recipe_id}
                      onSelect={() => handlePickRecipe(r.recipe_id)}
                      className="flex items-start gap-3 py-2 cursor-pointer"
                      data-testid={`recipe-picker-option-${r.recipe_id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{r.name}</p>
                          {(r.allergens || []).length > 0 && (
                            <span title={`${(r.allergens || []).length} ${isEs ? "alérgenos" : "allergens"}`} className="text-orange-500 text-xs">⚠️</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {r.recipe_code ? `${r.recipe_code} · ` : ""}{r.category || ""}{r.work_category ? ` · ${r.work_category}` : ""}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-mono">${cost.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">/ {r.portion_unit || "porción"}</p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          // STAGE B — Pick portion format
          <div className="flex flex-col" data-testid="recipe-format-picker">
            <div className="flex items-center justify-between p-3 border-b">
              <Button variant="ghost" size="sm" onClick={reset} className="h-8 px-2" data-testid="format-picker-back">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> {isEs ? "Atrás" : "Back"}
              </Button>
              <div className="flex-1 text-center px-2">
                <p className="text-sm font-semibold truncate">{selectedRecipe.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {isEs ? "Elige el formato de porción" : "Pick a portion format"}
                </p>
              </div>
            </div>

            {loadingFormats ? (
              <div className="p-6 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-xs">{isEs ? "Cargando formatos..." : "Loading formats..."}</span>
              </div>
            ) : portionFormats.length === 0 ? (
              <div className="p-4 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-900">
                      {isEs ? "Sin formatos definidos" : "No formats defined"}
                    </p>
                    <p className="text-[11px] text-amber-800">
                      {isEs
                        ? "Usaremos el costo por porción base. Configura formatos en la receta para ofrecer tamaños (10oz, 6oz, etc.)."
                        : "We'll use the base cost per portion. Add formats on the recipe to offer sizes."}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handlePickFormat(null)}
                  data-testid="format-picker-default"
                >
                  <Check className="w-4 h-4 mr-1" />
                  {isEs ? "Usar costo base" : "Use base cost"} (${(selectedRecipe.cost_per_portion || 0).toFixed(2)})
                </Button>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto py-1">
                {portionFormats.map((f) => {
                  const margin = f.margin_pct ?? 0;
                  const marginColor =
                    margin >= 40 ? "text-emerald-600"
                    : margin >= 20 ? "text-amber-600"
                    : "text-red-500";
                  return (
                    <button
                      key={f.format_id}
                      onClick={() => handlePickFormat(f)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/60 border-b last:border-b-0 flex items-start gap-3 transition-colors"
                      data-testid={`format-picker-option-${f.format_id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{f.format_name}</p>
                          {f.is_default && <Badge variant="secondary" className="text-[9px] h-4 px-1">{isEs ? "Default" : "Default"}</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {f.portions_obtained} {f.portion_unit} · {isEs ? "costo" : "cost"} ${(f.cost_per_portion || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-mono font-semibold">${(f.sell_price || f.suggested_price || 0).toFixed(2)}</p>
                        <p className={`text-[10px] font-medium ${marginColor}`}>
                          {margin.toFixed(0)}% {isEs ? "margen" : "margin"}
                        </p>
                      </div>
                    </button>
                  );
                })}
                <div className="border-t bg-muted/30 p-2">
                  <Button
                    variant="ghost" size="sm" className="w-full text-xs"
                    onClick={() => handlePickFormat(null)}
                    data-testid="format-picker-skip"
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    {isEs ? "O usar costo base sin formato" : "Or use base cost without format"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
