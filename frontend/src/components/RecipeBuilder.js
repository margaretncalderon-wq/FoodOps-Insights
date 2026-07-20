import { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import RecipeScalePanel from "./RecipeScalePanel";
import { ScrollArea } from "./ui/scroll-area";
import { formatQtyUnit, formatPerUnit } from "../utils/portionUnits";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "./ui/command";

// Icons
import { Plus, Search, Edit, Trash2, ChefHat, Copy, X, AlertTriangle, Link2, DollarSign, History, Percent, Info, Layers, Utensils, Beaker, CookingPot, ArrowRight, RefreshCw, Check, Package, AlertOctagon, Tag, Upload, Image, FileText, BookOpen, Sparkles } from "lucide-react";

import { KoraLoader } from "./KoraLoader";
import { API_BASE as API } from "../utils/api";
import IngredientWizard from "./culinary/IngredientWizard";
import { formatDateOnly } from "../utils/dates";
import { fmtNum } from "../utils/format";

const RECIPE_TYPES = [
  { value: "base", label: "Base Recipe", labelEs: "Receta Base", icon: Beaker, color: "bg-purple-100 text-purple-700", description: "Salsas, fondos, masas básicas" },
  { value: "component", label: "Component", labelEs: "Componente", icon: Layers, color: "bg-blue-100 text-blue-700", description: "Guarniciones, elementos" },
  { value: "final_dish", label: "Final Dish", labelEs: "Plato Final", icon: Utensils, color: "bg-green-100 text-green-700", description: "Plato listo para servir" },
];

const RECIPE_CATEGORIES = [
  { value: "appetizer", label: "Appetizer", labelEs: "Entrada" },
  { value: "salad", label: "Salad", labelEs: "Ensalada" },
  { value: "soup", label: "Soup", labelEs: "Sopa" },
  { value: "main", label: "Main Course", labelEs: "Plato Principal" },
  { value: "side", label: "Side Dish", labelEs: "Guarnición" },
  { value: "dessert", label: "Dessert", labelEs: "Postre" },
  { value: "sauce", label: "Sauce", labelEs: "Salsa" },
  { value: "base", label: "Base", labelEs: "Base" },
  { value: "beverage", label: "Beverage", labelEs: "Bebida" },
  { value: "bread", label: "Bread", labelEs: "Pan" },
];

const WORK_CATEGORIES = [
  { value: "cold", label: "Cold Station", labelEs: "Partida Fría" },
  { value: "hot", label: "Hot Station", labelEs: "Partida Caliente" },
  { value: "grill", label: "Grill", labelEs: "Parrilla" },
  { value: "pastry", label: "Pastry", labelEs: "Pastelería" },
  { value: "prep", label: "Prep", labelEs: "Preparación" },
  { value: "garde_manger", label: "Garde Manger", labelEs: "Garde Manger" },
];

const VERIFIED_STATUSES = [
  { value: "Draft", label: "Draft", labelEs: "Borrador" },
  { value: "Verified", label: "Verified", labelEs: "Verificado" },
];

const UNITS = ["g", "kg", "ml", "L", "oz", "lb", "oz_fl", "cup", "tbsp", "tsp", "unit", "portion", "serving", "dozen"];
const PORTION_UNITS = ["serving", "plate", "bowl", "tray", "piece", "ml", "oz", "g", "portion"];

// Group units for the unit picker (helps the chef see compatible options)
const UNIT_GROUPS = [
  { label: "Peso", units: ["g", "kg", "mg", "oz", "lb"] },
  { label: "Volumen", units: ["ml", "L", "oz_fl", "cup", "tbsp", "tsp", "gal"] },
  { label: "Unidad", units: ["unit", "dozen", "portion", "serving"] },
];

/**
 * IngredientPicker — Searchable combobox to add an ingredient to a recipe.
 * - Type to filter by name, brand, SKU, or category.
 * - Shows price + base unit so chefs pick the right item fast.
 * - Disabled items already added are hidden from the list (avoids dupes).
 */
function IngredientPicker({ ingredients, alreadyAddedIds, onPick, onRepair, isEs, type = "ingredient" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ingredients.filter((ing) => {
      if (alreadyAddedIds.includes(ing.ingredient_id || ing.recipe_id)) return false;
      if (!q) return true;
      const haystack = [
        ing.name, ing.brand, ing.sku, ing.category,
        ing.base_unit, ing.unit,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    }).slice(0, 80); // cap rows for snappy rendering with 800+ items
  }, [ingredients, alreadyAddedIds, query]);

  const handlePick = (id) => {
    onPick(id);
    setOpen(false);
    setQuery("");
  };

  const triggerLabel = isEs
    ? (type === "recipe" ? "+ Buscar sub-receta..." : "+ Buscar ingrediente...")
    : (type === "recipe" ? "+ Search sub-recipe..." : "+ Search ingredient...");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-64 justify-between font-normal text-muted-foreground hover:text-foreground"
          data-testid={type === "recipe" ? "sub-recipe-picker-trigger" : "ingredient-picker-trigger"}
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 opacity-60" />
            {triggerLabel}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end" data-testid="ingredient-picker-content">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={isEs ? "Escribe para buscar (nombre, marca, SKU)..." : "Type to search (name, brand, SKU)..."}
            data-testid="ingredient-picker-search"
          />
          <CommandList>
            <CommandEmpty>{isEs ? "Sin resultados" : "No results"}</CommandEmpty>
            <CommandGroup>
              {available.map((ing) => {
                const id = ing.ingredient_id || ing.recipe_id;
                const baseUnit = ing.base_unit || ing.unit || ing.yield_unit || "—";
                const cost = ing.cost_per_base_unit || ing.cost_per_unit || ing.cost_per_yield || 0;
                const needsReview = type === "ingredient" && (!ing.base_unit || !ing.cost_per_base_unit);
                return (
                  <CommandItem
                    key={id}
                    value={id}
                    onSelect={() => {
                      if (needsReview && onRepair) {
                        onRepair(ing);
                        setOpen(false);
                        setQuery("");
                      } else {
                        handlePick(id);
                      }
                    }}
                    className="flex items-start gap-3 py-2 cursor-pointer"
                    data-testid={`ingredient-picker-option-${id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{ing.name}</p>
                        {needsReview && (
                          <span title={isEs ? "Necesita revisión — click para reparar" : "Needs review — click to fix"} className="text-amber-600 text-xs flex-shrink-0">⚠️</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {ing.brand ? `${ing.brand} · ` : ""}{ing.category || ""}{ing.sku ? ` · ${ing.sku}` : ""}
                        {needsReview && (
                          <span className="ml-1 text-amber-700">{isEs ? "· reparar antes de usar" : "· fix before use"}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-mono">${fmtNum(cost)}</p>
                      <p className="text-[10px] text-muted-foreground">/ {baseUnit}</p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * SubRecipeRow — Renders one sub-recipe line with live cost preview.
 * Mirrors IngredientRow: whenever quantity_used or unit changes, hits
 * `/api/recipes/sub-recipe-cost-preview` which returns the converted
 * cost. The sub-recipe MASTER document is never touched.
 */
function SubRecipeRow({ sub, onChange, onRemove }) {
  const [preview, setPreview] = useState({
    cost: sub.total_cost || 0, compatible: true, message: null,
  });
  const [loading, setLoading] = useState(false);
  const [formats, setFormats] = useState([]);

  // Load available portion formats for this sub-recipe (once).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!sub.child_recipe_id) return;
      try {
        const res = await axios.get(
          `${API}/api/recipes/${sub.child_recipe_id}/portion-formats`,
          { withCredentials: true },
        );
        if (alive) setFormats(res.data || []);
      } catch {
        if (alive) setFormats([]);
      }
    })();
    return () => { alive = false; };
  }, [sub.child_recipe_id]);

  useEffect(() => {
    if (!sub.child_recipe_id || !sub.quantity_used || sub.quantity_used <= 0) {
      setPreview({ cost: 0, compatible: true, message: null });
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.post(
          `${API}/api/recipes/sub-recipe-cost-preview`,
          {
            child_recipe_id: sub.child_recipe_id,
            quantity: sub.quantity_used,
            unit: sub.unit,
            portion_format_id: sub.portion_format_id || null,
          },
          { withCredentials: true },
        );
        setPreview(res.data);
        if (typeof res.data.cost === "number") {
          onChange("total_cost", res.data.cost);
        }
      } catch {
        // ignore — keep last preview
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.child_recipe_id, sub.quantity_used, sub.unit, sub.portion_format_id]);

  const handleFormatChange = (formatId) => {
    if (formatId === "__default__") {
      onChange("portion_format_id", null);
      onChange("portion_format_name", null);
      // keep unit as-is (user can edit)
      return;
    }
    const fmt = formats.find((f) => f.format_id === formatId);
    if (fmt) {
      onChange("portion_format_id", fmt.format_id);
      onChange("portion_format_name", fmt.format_name);
      onChange("unit", fmt.portion_unit);
    }
  };

  const convErr = preview.conversion_error;

  return (
    <TableRow className={convErr ? "bg-rose-50/70" : ""}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5">
          {sub.child_recipe_name}
          {convErr && (
            <span
              title={`No conversion between ${convErr.from_unit} and ${convErr.to_unit}: ${convErr.reason}`}
              className="inline-flex items-center gap-1 text-rose-700 text-xs bg-rose-100 px-1.5 py-0.5 rounded"
              data-testid={`sub-conversion-error-${sub.child_recipe_id}`}
            >⚠️ sin conv. {convErr.from_unit}→{convErr.to_unit}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number" min="0" step="0.01" className="w-20 text-right"
          value={sub.quantity_used}
          onChange={(e) => onChange("quantity_used", parseFloat(e.target.value) || 0)}
          data-testid={`sub-recipe-qty-${sub.child_recipe_id}`}
        />
      </TableCell>
      <TableCell>
        {formats.length > 0 ? (
          <Select
            value={sub.portion_format_id || "__default__"}
            onValueChange={handleFormatChange}
          >
            <SelectTrigger
              className="w-full min-w-[140px] h-8 text-xs"
              data-testid={`sub-recipe-format-${sub.child_recipe_id}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                Default ({sub.unit || "portion"})
              </SelectItem>
              {formats.map((f) => (
                <SelectItem key={f.format_id} value={f.format_id}>
                  {f.format_name} ({f.portion_unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground text-xs">{sub.unit}</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        <div className="flex items-center justify-end gap-1.5">
          {loading && <KoraLoader size={12} />}
          <span className={convErr ? "text-rose-700" : "text-foreground"}>
            ${(preview.cost || 0).toFixed(2)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <X className="w-4 h-4 text-red-500" />
        </Button>
      </TableCell>
    </TableRow>
  );
}



/**
 * IngredientRow — Renders one recipe ingredient line with:
 * - Editable quantity + unit
 * - Live cost preview (calls /api/inventory/ingredients/cost-preview)
 * - Visual warning if the unit is incompatible with the ingredient's base unit
 */
function IngredientRow({ ing, onChange, onRemove, isEs }) {
  const [preview, setPreview] = useState({ cost: ing.total_cost || ing.cost || 0, compatible: true, message: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ing.item_id || !ing.quantity || ing.quantity <= 0) {
      setPreview({ cost: 0, compatible: true, message: null });
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const body = {
          ingredient_id: ing.item_id,
          quantity: ing.quantity,
          unit: ing.unit,
        };
        // Only send waste_factor_pct if the chef explicitly set one (number, not undefined/null).
        // This lets the backend fall back to the ingredient's default yield_waste_percent.
        if (typeof ing.waste_factor_pct === "number") {
          body.waste_factor_pct = ing.waste_factor_pct;
        }
        const res = await axios.post(`${API}/api/inventory/ingredients/cost-preview`, body, { withCredentials: true });
        setPreview(res.data);
        if (typeof res.data.cost === "number") {
          onChange("total_cost", res.data.cost);
          onChange("cost", res.data.cost);
        }
        // Propagate conversion_error up to the parent form so the recipe-level
        // "Costo incompleto" banner can count unresolved lines.
        onChange("conversion_error", res.data.conversion_error || null);
      } catch {
        // ignore — keep last preview
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ing.item_id, ing.quantity, ing.unit, ing.waste_factor_pct]);

  const showWarning = !preview.compatible && ing.quantity > 0;
  const convErr = preview.conversion_error;
  const usingDefaultWaste = typeof ing.waste_factor_pct !== "number" && (preview.default_waste_pct || 0) > 0;

  return (
    <TableRow data-testid={`ingredient-row-${ing.item_id}`}
              className={convErr ? "bg-rose-50/70" : (showWarning ? "bg-amber-50/50" : "")}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5">
          {ing.item_name}
          {convErr && (
            <span
              title={preview.message || `No conversion between ${convErr.from_unit} and ${convErr.to_unit}: ${convErr.reason}`}
              className="inline-flex items-center gap-1 text-rose-700 text-xs bg-rose-100 px-1.5 py-0.5 rounded"
              data-testid={`conversion-error-${ing.item_id}`}
            >
              ⚠️ {ing.item_name && ing.unit
                    ? `sin conv. ${convErr.from_unit}→${convErr.to_unit}`
                    : "sin conv."}
            </span>
          )}
          {!convErr && showWarning && (
            <span title={preview.message || ""} className="text-amber-600 text-xs">⚠️</span>
          )}
        </div>
        {showWarning && (
          <p className="text-[10px] text-amber-700 mt-0.5">{preview.message}</p>
        )}
      </TableCell>
      <TableCell>
        <Input
          type="number" min="0" step="0.01" className="w-20 text-right"
          value={ing.quantity}
          onChange={(e) => onChange("quantity", parseFloat(e.target.value) || 0)}
          data-testid={`ingredient-qty-${ing.item_id}`}
        />
      </TableCell>
      <TableCell>
        <Select value={ing.unit} onValueChange={(v) => onChange("unit", v)}>
          <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNIT_GROUPS.map((grp) => (
              <div key={grp.label}>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{grp.label}</div>
                {grp.units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </div>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number" min="0" max="99" step="1"
            className={`w-20 text-right ${usingDefaultWaste ? "border-dashed border-amber-300" : ""}`}
            value={typeof ing.waste_factor_pct === "number" ? ing.waste_factor_pct : ""}
            placeholder={usingDefaultWaste ? `${preview.default_waste_pct}` : "0"}
            onChange={(e) => {
              const v = e.target.value;
              onChange("waste_factor_pct", v === "" ? null : parseFloat(v) || 0);
            }}
            data-testid={`ingredient-waste-${ing.item_id}`}
            title={usingDefaultWaste
              ? (isEs ? `Usando merma por defecto del ingrediente: ${preview.default_waste_pct}%` : `Using ingredient default waste: ${preview.default_waste_pct}%`)
              : (isEs ? "Sobrescribe la merma del ingrediente para esta receta" : "Overrides the ingredient default for this recipe")}
          />
          {usingDefaultWaste && (
            <span className="text-[9px] text-amber-600 leading-none" title={isEs ? "Default del ingrediente" : "Ingredient default"}>★</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">
        <div className="flex items-center justify-end gap-1.5">
          {loading && <KoraLoader size={12} />}
          <span className={showWarning ? "text-amber-700" : "text-foreground"}>
            ${(preview.cost || 0).toFixed(2)}
          </span>
        </div>
        {preview.quantity_in_base != null && preview.compatible && (
          <p className="text-[9px] text-muted-foreground" data-testid={`ingredient-conversion-${ing.item_id}`}>
            = {fmtNum(preview.quantity_in_base, 2)} {preview.base_unit}
          </p>
        )}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <X className="w-4 h-4 text-red-500" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function RecipeBuilder({ onClose, onSave, initialRecipe = null, ingredients = [], allRecipes = [] }) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  
  // Data
  const [allergens, setAllergens] = useState([]);
  const [portionFormats, setPortionFormats] = useState([]);
  const [packagingFormats, setPackagingFormats] = useState([]);
  const [costHistory, setCostHistory] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [company, setCompany] = useState({});
  
  // Dialogs
  const [costHistoryOpen, setCostHistoryOpen] = useState(false);
  const [portionDialogOpen, setPortionDialogOpen] = useState(false);
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [repairIngredient, setRepairIngredient] = useState(null); // when set, opens IngredientWizard in repair mode
  // Generate Picklist Items from Formats
  const [genPicklistOpen, setGenPicklistOpen] = useState(false);
  const [genSelectedFormatIds, setGenSelectedFormatIds] = useState([]);
  const [genCategoryId, setGenCategoryId] = useState("");
  const [genNamePrefix, setGenNamePrefix] = useState("");
  const [genCategories, setGenCategories] = useState([]);
  const [genSubmitting, setGenSubmitting] = useState(false);
  
  // Local ingredients cache — refreshed after a repair so the picker sees the new base_unit/cost
  const [localIngredients, setLocalIngredients] = useState(ingredients);
  useEffect(() => { setLocalIngredients(ingredients); }, [ingredients]);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  
  // Form states
  const [portionForm, setPortionForm] = useState({
    format_name: "", portions_obtained: 1, portion_unit: "serving",
    sell_price: 0, target_margin_pct: 30, is_default: false
  });
  const [packagingForm, setPackagingForm] = useState({
    packaging_inventory_item_id: "", qty_per_portion: 1, notes: ""
  });
  
  const [form, setForm] = useState({
    name: "", description: "", recipe_type: "final_dish", category: "main",
    yield_quantity: 1, yield_unit: "portion", portion_size: 1, portion_unit: "serving",
    portions_per_yield: 1, prep_time_minutes: 0, cook_time_minutes: 0, labor_minutes: 0,
    ingredients: [], sub_recipes: [], instructions: [], notes: "", sell_price: 0,
    allergens: [], work_category: "", recipe_code: "", verified_status: "Draft",
    is_on_menu: false, min_margin_pct: "",
  });

  const [instructionText, setInstructionText] = useState("");

  // Fetch allergens and company
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [allergensRes, companyRes] = await Promise.all([
          axios.get(`${API}/api/allergens`, { withCredentials: true }),
          axios.get(`${API}/api/settings/company`, { withCredentials: true })
        ]);
        setAllergens(allergensRes.data);
        setCompany(companyRes.data || {});
      } catch (error) {
        console.error("Error loading initial data", error);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch portion and packaging formats if editing
  useEffect(() => {
    if (initialRecipe?.recipe_id) {
      const fetchFormats = async () => {
        try {
          const [portionRes, packagingRes] = await Promise.all([
            axios.get(`${API}/api/recipes/${initialRecipe.recipe_id}/portion-formats`, { withCredentials: true }),
            axios.get(`${API}/api/recipes/${initialRecipe.recipe_id}/packaging-formats`, { withCredentials: true })
          ]);
          setPortionFormats(portionRes.data);
          setPackagingFormats(packagingRes.data);
        } catch (error) {
          console.error("Error loading formats", error);
        }
      };
      fetchFormats();
    }
  }, [initialRecipe]);

  useEffect(() => {
    if (initialRecipe) {
      setForm({
        name: initialRecipe.name || "",
        description: initialRecipe.description || "",
        recipe_type: (initialRecipe.recipe_type === "Final" ? "final_dish"
                    : initialRecipe.recipe_type === "Base" ? "base"
                    : initialRecipe.recipe_type === "Component" ? "component"
                    : initialRecipe.recipe_type) || "final_dish",
        category: initialRecipe.category || "main",
        yield_quantity: initialRecipe.yield_quantity || 1,
        yield_unit: initialRecipe.yield_unit || "portion",
        portion_size: initialRecipe.portion_size || 1,
        portion_unit: initialRecipe.portion_unit || "serving",
        portions_per_yield: initialRecipe.portions_per_yield || 1,
        prep_time_minutes: initialRecipe.prep_time_minutes || initialRecipe.prep_time || 0,
        cook_time_minutes: initialRecipe.cook_time_minutes || initialRecipe.cook_time || 0,
        labor_minutes: initialRecipe.labor_minutes || 0,
        ingredients: initialRecipe.ingredients || [],
        sub_recipes: initialRecipe.sub_recipes || [],
        instructions: initialRecipe.instructions || [],
        notes: initialRecipe.notes || "",
        sell_price: initialRecipe.sell_price || 0,
        allergens: initialRecipe.allergens || [],
        work_category: initialRecipe.work_category || "",
        recipe_code: initialRecipe.recipe_code || "",
        verified_status: initialRecipe.verified_status || "Draft",
        is_on_menu: initialRecipe.is_on_menu || false,
        min_margin_pct: initialRecipe.min_margin_pct != null ? initialRecipe.min_margin_pct : "",
      });
      // Load image
      if (initialRecipe.image_url) {
        setImageUrl(initialRecipe.image_url);
      }
      if (initialRecipe.instructions?.length > 0) {
        setInstructionText(Array.isArray(initialRecipe.instructions) 
          ? initialRecipe.instructions.join("\n") 
          : initialRecipe.instructions);
      }
    }
  }, [initialRecipe]);

  const t = (key) => {
    const translations = {
      name: { en: "Name", es: "Nombre" },
      description: { en: "Description", es: "Descripción" },
      recipeType: { en: "Recipe Type", es: "Tipo de Receta" },
      category: { en: "Category", es: "Categoría" },
      yield: { en: "Yield", es: "Rendimiento" },
      portions: { en: "Portions", es: "Porciones" },
      portionsPerYield: { en: "Portions per yield", es: "Porciones por rendimiento" },
      prepTime: { en: "Prep Time (min)", es: "Tiempo Prep (min)" },
      cookTime: { en: "Cook Time (min)", es: "Tiempo Cocción (min)" },
      laborTime: { en: "Labor Time (min)", es: "Mano de Obra (min)" },
      ingredients: { en: "Ingredients", es: "Ingredientes" },
      subRecipes: { en: "Sub-Recipes", es: "Sub-Recetas" },
      instructions: { en: "Instructions", es: "Instrucciones" },
      notes: { en: "Notes", es: "Notas" },
      sellPrice: { en: "Sell Price", es: "Precio de Venta" },
      save: { en: "Save Recipe", es: "Guardar Receta" },
      cancel: { en: "Cancel", es: "Cancelar" },
      addIngredient: { en: "Add Ingredient", es: "Agregar Ingrediente" },
      addSubRecipe: { en: "Add Sub-Recipe", es: "Agregar Sub-Receta" },
      quantity: { en: "Qty", es: "Cant" },
      unit: { en: "Unit", es: "Unidad" },
      wasteFactor: { en: "Waste %", es: "Merma %" },
      cost: { en: "Cost", es: "Costo" },
      totalCost: { en: "Total Cost", es: "Costo Total" },
      costPerPortion: { en: "Cost per Portion", es: "Costo por Porción" },
      costHistory: { en: "Cost History", es: "Historial de Costos" },
      foodCostPercent: { en: "Food Cost %", es: "% Costo Comida" },
      margin: { en: "Margin", es: "Margen" },
      noIngredients: { en: "No ingredients added", es: "Sin ingredientes" },
      noSubRecipes: { en: "No sub-recipes added", es: "Sin sub-recetas" },
      selectIngredient: { en: "Select ingredient...", es: "Seleccionar ingrediente..." },
      selectSubRecipe: { en: "Select sub-recipe...", es: "Seleccionar sub-receta..." },
      baseRecipes: { en: "Base Recipes", es: "Recetas Base" },
      componentRecipes: { en: "Components", es: "Componentes" },
      wasteInfo: { en: "Waste factor increases required quantity to account for prep loss", es: "La merma aumenta la cantidad requerida para compensar pérdidas en preparación" },
      allergens: { en: "Allergens", es: "Alérgenos" },
      workCategory: { en: "Work Station", es: "Partida de Trabajo" },
      recipeCode: { en: "Recipe Code", es: "Código de Receta" },
      verifiedStatus: { en: "Status", es: "Estado" },
      portionFormats: { en: "Portion Formats", es: "Formatos de Porción" },
      packagingFormats: { en: "Packaging", es: "Empaque" },
      addPortionFormat: { en: "Add Format", es: "Agregar Formato" },
      addPackaging: { en: "Add Packaging", es: "Agregar Empaque" },
      formatName: { en: "Format Name", es: "Nombre del Formato" },
      portionsObtained: { en: "Portions Obtained", es: "Porciones Obtenidas" },
      targetMargin: { en: "Target Margin %", es: "Margen Objetivo %" },
      suggestedPrice: { en: "Suggested Price", es: "Precio Sugerido" },
      isDefault: { en: "Default", es: "Predeterminado" },
      basic: { en: "Basic", es: "Básico" },
      costing: { en: "Costing", es: "Costeo" },
      details: { en: "Details", es: "Detalles" },
      packaging: { en: "Packaging", es: "Empaque" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  };

  // Calculate total cost — separated so UI can show breakdown
  // PASE A · Single source of truth. The backend `GET /api/recipes/{id}`
  // recomputes total_cost + every line.total_cost fresh on each request
  // (using cost_for_recipe_line, which respects base_unit conversions and
  // waste). The FE simply sums what the BE gave us — no local aritmetic on
  // `invItem.cost_per_unit × qty` (that was the source of the drift where
  // the total said $4,840 but the visible lines summed to $1,347).
  const calculateIngredientsCost = () => {
    let total = 0;
    for (const ing of form.ingredients) {
      total += Number(ing.total_cost || ing.cost || 0);
    }
    return total;
  };

  const calculateSubRecipesCost = () => {
    let total = 0;
    for (const sub of form.sub_recipes) {
      total += Number(sub.total_cost || 0);
    }
    return total;
  };

  const calculateTotalCost = () => calculateIngredientsCost() + calculateSubRecipesCost();
  const ingredientsCost = calculateIngredientsCost();
  const subRecipesCost = calculateSubRecipesCost();

  const totalCost = calculateTotalCost();

  // "Costo incompleto" — count lines with an unresolved conversion so the UI
  // can surface a red banner near the cost totals (blocks silent $0 drift).
  const ingredientsWithConvError = (form.ingredients || []).filter(
    (i) => i && i.conversion_error,
  );
  const subRecipesWithConvError = (form.sub_recipes || []).filter((s) => {
    const rec = allRecipes.find((r) => r.recipe_id === s.child_recipe_id);
    return rec && rec.has_conversion_errors;
  });
  const conversionErrorCount =
    ingredientsWithConvError.length + subRecipesWithConvError.length;
  const hasConversionErrors = conversionErrorCount > 0;
  const conversionErrorTooltip = [
    ...ingredientsWithConvError.map((i) => {
      const ce = i.conversion_error || {};
      return `• ${i.item_name || i.name || "Ingrediente"}: ${ce.from_unit || "?"}→${ce.to_unit || "?"} (${ce.reason || "conv."})`;
    }),
    ...subRecipesWithConvError.map(
      (s) => `• Sub-receta: ${s.child_recipe_name || s.child_recipe_id}`,
    ),
  ].join("\n");
  // Total portions = yield_quantity × portions_per_yield  (matches backend compute_full_recipe_costing)
  const totalPortions = Math.max(
    1,
    (Number(form.yield_quantity) || 1) * (Number(form.portions_per_yield) || 1),
  );
  const costPerPortion = totalCost / totalPortions;
  const foodCostPercent = form.sell_price > 0 ? (costPerPortion / form.sell_price * 100) : 0;
  const margin = form.sell_price - costPerPortion;

  // Sprint P0 — Full recipe costing (labor + overhead + contribution)
  const [showCostingConfig, setShowCostingConfig] = useState(false);
  const [costingConfig, setCostingConfig] = useState({
    chef_hourly_rate: 20,
    recipe_overhead_percent: 15,
    recipe_target_food_cost_percent: 30,
    recipe_target_prime_cost_percent: 55,
    recipe_target_gross_margin_percent: 65,
  });
  const saveCostingConfig = (patch) => {
    const next = { ...costingConfig, ...patch };
    setCostingConfig(next);
    axios.put(`${API}/settings/company`, next, { withCredentials: true }).catch((err) => {
      console.error("Save costing config failed", err);
    });
  };
  useEffect(() => {
    let alive = true;
    axios.get(`${API}/settings/company`, { withCredentials: true }).then((res) => {
      if (!alive) return;
      const c = res.data || {};
      setCostingConfig({
        chef_hourly_rate: Number(c.chef_hourly_rate ?? 20),
        recipe_overhead_percent: Number(c.recipe_overhead_percent ?? 15),
        recipe_target_food_cost_percent: Number(c.recipe_target_food_cost_percent ?? 30),
        recipe_target_prime_cost_percent: Number(c.recipe_target_prime_cost_percent ?? 55),
        recipe_target_gross_margin_percent: Number(c.recipe_target_gross_margin_percent ?? 65),
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const totalLaborMinutes = Number(form.prep_time_minutes || 0) + Number(form.cook_time_minutes || 0) + Number(form.labor_minutes || 0);
  const laborCost = (totalLaborMinutes / 60) * costingConfig.chef_hourly_rate;
  const overheadCost = totalCost * (costingConfig.recipe_overhead_percent / 100);
  const totalCostFull = totalCost + laborCost + overheadCost;
  // Use totalPortions (yield_quantity × portions_per_yield) — same denominator as backend
  const portionsDenom = totalPortions;
  const costPerPortionFoodOnly = totalCost / portionsDenom;
  const laborPerPortion = laborCost / portionsDenom;
  const primeCostPerPortion = costPerPortionFoodOnly + laborPerPortion;
  const totalCostPerPortionFull = totalCostFull / portionsDenom;
  const totalCostPercent = form.sell_price > 0 ? (totalCostPerPortionFull / form.sell_price * 100) : 0;
  const contributionDollar = form.sell_price - totalCostPerPortionFull;
  const contributionPercent = form.sell_price > 0 ? (contributionDollar / form.sell_price * 100) : 0;
  const targetFoodCostPct = costingConfig.recipe_target_food_cost_percent;
  const targetPrimeCostPct = costingConfig.recipe_target_prime_cost_percent;
  const targetGrossMarginPct = costingConfig.recipe_target_gross_margin_percent;
  // Method A — Food Cost (industry default, matches Gastrokaisen)
  const suggestedPriceFoodCost = targetFoodCostPct > 0 ? costPerPortionFoodOnly / (targetFoodCostPct / 100) : 0;
  // Method B — Prime Cost
  const suggestedPricePrime = targetPrimeCostPct > 0 ? primeCostPerPortion / (targetPrimeCostPct / 100) : 0;
  // Method C — Gross Margin Markup
  const marginDenom = Math.max(0.01, 1 - targetGrossMarginPct / 100);
  const suggestedPriceMarkup = totalCostPerPortionFull / marginDenom;
  // Backwards-compat variable name used elsewhere in JSX
  const suggestedSellPriceByFoodCost = suggestedPriceFoodCost;

  // Margin policy → suggested sale price (Food default unless category overrides)
  const [marginPolicy, setMarginPolicy] = useState({ by_type: {}, by_category: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get(`${API}/settings/margin-policy`, { withCredentials: true });
        if (alive) setMarginPolicy(res.data || { by_type: {}, by_category: [] });
      } catch (e) { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);
  const targetMarginPct = (() => {
    const cat = form.category;
    const ruleByCat = (marginPolicy.by_category || []).find(
      (r) => (r.item_type === "Food" || !r.item_type) && r.category === cat
    );
    if (ruleByCat?.min_margin_pct != null) return Number(ruleByCat.min_margin_pct);
    return Number(marginPolicy.by_type?.Food ?? 35);
  })();
  const suggestedSellPrice =
    targetMarginPct > 0 && targetMarginPct < 100 && costPerPortion > 0
      ? costPerPortion / (1 - targetMarginPct / 100)
      : null;

  // Ingredient management
  const addIngredient = (ingredientId) => {
    const ingredient = localIngredients.find(i => i.ingredient_id === ingredientId);
    if (!ingredient) return;
    if (form.ingredients.find(i => i.item_id === ingredientId)) {
      toast.error(language === "es" ? "Ya agregado" : "Already added");
      return;
    }
    setForm(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, {
        item_id: ingredientId, item_type: "ingredient", item_name: ingredient.name,
        quantity: 1, unit: ingredient.unit, waste_factor_pct: 0,
        // PASE A · Cost fields start empty. The IngredientRow useEffect
        // fires the /cost-preview call which returns the properly converted
        // total_cost (respecting base_unit vs purchase_unit). Never
        // initialize with `ingredient.cost_per_unit` because in PASE A
        // that field is $/purchase_unit (price of the whole container),
        // not $/line_unit.
        cost_per_unit: 0, total_cost: 0, net_quantity: 1
      }]
    }));
  };

  const updateIngredient = (itemId, field, value) => {
    // PASE A · Client-side is display-only. We store whatever field the
    // user just edited (quantity, unit, waste_factor_pct) and let the
    // IngredientRow's useEffect trigger a /cost-preview HTTPS call that
    // returns the properly converted line cost. That preview response
    // arrives via onChange("total_cost", ...) and onChange("cost", ...)
    // — those are ALSO routed through this handler, so we must NOT
    // recompute or overwrite them locally.
    //
    // The previous version multiplied quantity × invItem.cost_per_unit
    // without unit conversion, which after PASE A produced values like
    // 1000 ml × $3450/galón = $3,450,000 for one line of oil.
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.map(ing => {
        if (ing.item_id !== itemId) return ing;
        return { ...ing, [field]: value };
      })
    }));
  };

  const removeIngredient = (itemId) => {
    setForm(prev => ({ ...prev, ingredients: prev.ingredients.filter(i => i.item_id !== itemId) }));
  };

  // Sub-recipe management
  const addSubRecipe = (recipeId) => {
    const recipe = allRecipes.find(r => r.recipe_id === recipeId);
    if (!recipe) return;
    if (form.sub_recipes.find(s => s.child_recipe_id === recipeId)) {
      toast.error(language === "es" ? "Ya agregado" : "Already added");
      return;
    }
    if (initialRecipe && recipeId === initialRecipe.recipe_id) {
      toast.error(language === "es" ? "No puedes agregar la misma receta" : "Cannot add self as sub-recipe");
      return;
    }
    setForm(prev => ({
      ...prev,
      sub_recipes: [...prev.sub_recipes, {
        child_recipe_id: recipeId, child_recipe_name: recipe.name,
        quantity_used: 1, unit: recipe.yield_unit || "portion",
        // PASE A · Cost fields start empty. The parent recipe's next save
        // (or the fresh recompute on GET /api/recipes/{id}) will fill in
        // total_cost with the properly converted value (parent unit →
        // child.yield_unit). Never initialize with cost_per_yield alone.
        cost_per_unit: 0, total_cost: 0
      }]
    }));
  };

  const updateSubRecipe = (recipeId, field, value) => {
    // PASE A · Display-only. Backend re-costs on save / on GET. No local
    // multiplication of quantity × cost_per_yield here — that path did not
    // convert parent_unit → child.yield_unit and produced silent drifts
    // when the sub-recipe was consumed in a different unit than it yields.
    setForm(prev => ({
      ...prev,
      sub_recipes: prev.sub_recipes.map(sub => {
        if (sub.child_recipe_id !== recipeId) return sub;
        return { ...sub, [field]: value };
      })
    }));
  };

  const removeSubRecipe = (recipeId) => {
    setForm(prev => ({ ...prev, sub_recipes: prev.sub_recipes.filter(s => s.child_recipe_id !== recipeId) }));
  };

  // Allergen toggle
  const toggleAllergen = (allergenId) => {
    setForm(prev => ({
      ...prev,
      allergens: prev.allergens.includes(allergenId)
        ? prev.allergens.filter(id => id !== allergenId)
        : [...prev.allergens, allergenId]
    }));
  };

  // Portion format management
  const handleAddPortionFormat = async () => {
    if (!initialRecipe?.recipe_id) {
      toast.error(language === "es" ? "Guarda la receta primero" : "Save recipe first");
      return;
    }
    try {
      const res = await axios.post(
        `${API}/api/recipes/${initialRecipe.recipe_id}/portion-formats`,
        portionForm,
        { withCredentials: true }
      );
      setPortionFormats(prev => [...prev, res.data]);
      setPortionDialogOpen(false);
      setPortionForm({ format_name: "", portions_obtained: 1, portion_unit: "serving", sell_price: 0, target_margin_pct: 30, is_default: false });
      toast.success(language === "es" ? "Formato agregado" : "Format added");
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleDeletePortionFormat = async (formatId) => {
    try {
      await axios.delete(`${API}/api/recipes/${initialRecipe.recipe_id}/portion-formats/${formatId}`, { withCredentials: true });
      setPortionFormats(prev => prev.filter(f => f.format_id !== formatId));
      toast.success(language === "es" ? "Eliminado" : "Deleted");
    } catch (error) {
      toast.error("Error");
    }
  };

  // Open "Generate Picklist Items from Formats" dialog
  const openGeneratePicklist = async () => {
    if (!initialRecipe?.recipe_id || portionFormats.length === 0) return;
    try {
      const res = await axios.get(`${API}/api/settings/categories`, { withCredentials: true });
      setGenCategories(res.data || []);
      // Default category: first Food category, else first
      const foodCat = (res.data || []).find(c => (c.name || "").toLowerCase().includes("food") || (c.name_es || "").toLowerCase().includes("comida"));
      setGenCategoryId((foodCat || res.data?.[0])?.category_id || "");
    } catch (e) {
      setGenCategories([]);
    }
    setGenSelectedFormatIds(portionFormats.map(f => f.format_id));
    setGenNamePrefix(form.name || initialRecipe.name || "");
    setGenPicklistOpen(true);
  };

  const handleGeneratePicklistItems = async () => {
    if (genSelectedFormatIds.length === 0) {
      toast.error(language === "es" ? "Selecciona al menos un formato" : "Select at least one format");
      return;
    }
    if (!genCategoryId) {
      toast.error(language === "es" ? "Selecciona una categoría" : "Select a category");
      return;
    }
    setGenSubmitting(true);
    try {
      const res = await axios.post(
        `${API}/api/recipes/${initialRecipe.recipe_id}/generate-picklist-items`,
        {
          format_ids: genSelectedFormatIds,
          category_id: genCategoryId,
          name_prefix: genNamePrefix || undefined,
          item_type: "Food",
          skip_if_exists: true,
        },
        { withCredentials: true }
      );
      const created = res.data?.created || 0;
      const skipped = res.data?.skipped || 0;
      toast.success(
        language === "es"
          ? `${created} ítem(s) creado(s)${skipped ? ` · ${skipped} ya existían` : ""}`
          : `${created} item(s) created${skipped ? ` · ${skipped} already existed` : ""}`
      );
      setGenPicklistOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    } finally {
      setGenSubmitting(false);
    }
  };

  // Packaging format management
  const handleAddPackagingFormat = async () => {
    if (!initialRecipe?.recipe_id) {
      toast.error(language === "es" ? "Guarda la receta primero" : "Save recipe first");
      return;
    }
    try {
      const res = await axios.post(
        `${API}/api/recipes/${initialRecipe.recipe_id}/packaging-formats`,
        packagingForm,
        { withCredentials: true }
      );
      setPackagingFormats(prev => [...prev, res.data]);
      setPackagingDialogOpen(false);
      setPackagingForm({ packaging_inventory_item_id: "", qty_per_portion: 1, notes: "" });
      toast.success(language === "es" ? "Empaque agregado" : "Packaging added");
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleDeletePackagingFormat = async (formatId) => {
    try {
      await axios.delete(`${API}/api/recipes/${initialRecipe.recipe_id}/packaging-formats/${formatId}`, { withCredentials: true });
      setPackagingFormats(prev => prev.filter(f => f.format_id !== formatId));
      toast.success(language === "es" ? "Eliminado" : "Deleted");
    } catch (error) {
      toast.error("Error");
    }
  };

  // Image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!initialRecipe?.recipe_id) {
      toast.error(language === "es" ? "Guarda la receta primero" : "Save recipe first");
      return;
    }
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error(language === "es" ? "Tipo de archivo no válido" : "Invalid file type");
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === "es" ? "Archivo muy grande (max 5MB)" : "File too large (max 5MB)");
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await axios.post(
        `${API}/api/recipes/${initialRecipe.recipe_id}/image`,
        formData,
        { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setImageUrl(res.data.image_url);
      toast.success(language === "es" ? "Imagen subida" : "Image uploaded");
    } catch (error) {
      toast.error(language === "es" ? "Error al subir imagen" : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!initialRecipe?.recipe_id) return;
    
    try {
      await axios.delete(`${API}/api/recipes/${initialRecipe.recipe_id}/image`, { withCredentials: true });
      setImageUrl(null);
      toast.success(language === "es" ? "Imagen eliminada" : "Image deleted");
    } catch (error) {
      toast.error("Error");
    }
  };

  // Export PDF Technical Sheet
  const handleExportPDF = () => {
    const recipe = initialRecipe;
    if (!recipe) return;
    
    // Build allergens string
    const recipeAllergens = form.allergens.map(id => {
      const a = allergens.find(al => al.allergen_id === id);
      return a?.name || id;
    }).join(', ') || 'Ninguno';
    
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${form.name} - Ficha Técnica</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #333; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a365d; padding-bottom: 15px; margin-bottom: 15px; }
          .header-left { flex: 1; }
          .recipe-name { font-size: 22px; font-weight: bold; color: #1a365d; margin-bottom: 5px; }
          .recipe-code { font-size: 12px; color: #666; }
          .recipe-type { display: inline-block; background: #e2e8f0; padding: 4px 12px; border-radius: 20px; font-size: 10px; text-transform: uppercase; margin-top: 5px; }
          .header-right { text-align: right; }
          .header-right img { max-width: 150px; max-height: 100px; object-fit: cover; border-radius: 8px; }
          .company-name { font-size: 14px; font-weight: bold; color: #1a365d; }
          
          .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
          .meta-item { background: #f7fafc; padding: 10px; border-radius: 6px; text-align: center; }
          .meta-label { font-size: 9px; color: #666; text-transform: uppercase; margin-bottom: 3px; }
          .meta-value { font-size: 14px; font-weight: bold; color: #1a365d; }
          
          .section { margin-bottom: 15px; }
          .section-title { font-size: 12px; font-weight: bold; color: #1a365d; text-transform: uppercase; padding: 6px 10px; background: #e2e8f0; margin-bottom: 8px; border-radius: 4px; }
          
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { background: #f7fafc; font-size: 10px; text-transform: uppercase; color: #666; font-weight: 600; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          
          .cost-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
          .cost-box { background: #f0fff4; border: 1px solid #9ae6b4; padding: 12px; border-radius: 6px; text-align: center; }
          .cost-box.highlight { background: #1a365d; color: white; border-color: #1a365d; }
          .cost-label { font-size: 9px; text-transform: uppercase; margin-bottom: 3px; }
          .cost-value { font-size: 18px; font-weight: bold; }
          
          .portion-formats { margin-top: 10px; }
          .portion-formats table th { background: #ebf4ff; }
          
          .allergens { background: #fff5f5; border: 1px solid #feb2b2; padding: 10px; border-radius: 6px; margin-top: 10px; }
          .allergens-title { font-weight: bold; color: #c53030; margin-bottom: 5px; }
          
          .instructions { background: #fffaf0; padding: 12px; border-radius: 6px; }
          .instructions ol { padding-left: 20px; }
          .instructions li { margin-bottom: 6px; }
          
          .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #666; }
          
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <div class="recipe-name">${form.name}</div>
            ${form.recipe_code ? `<div class="recipe-code">Código: ${form.recipe_code}</div>` : ''}
            <span class="recipe-type">${form.recipe_type === 'base' ? 'Base' : form.recipe_type === 'component' ? 'Componente' : 'Plato Final'}</span>
          </div>
          <div class="header-right">
            ${imageUrl ? `<img src="${imageUrl.startsWith('/api') ? API + imageUrl : imageUrl}" alt="${form.name}" />` : `<div class="company-name">${company.legal_name || company.trade_name || company.name || ''}</div>`}
          </div>
        </div>
        
        <div class="meta-grid">
          <div class="meta-item">
            <div class="meta-label">Rendimiento</div>
            <div class="meta-value">${form.yield_quantity} ${form.yield_unit}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Porciones</div>
            <div class="meta-value">${form.portions_per_yield}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Prep + Cocción</div>
            <div class="meta-value">${form.prep_time_minutes + form.cook_time_minutes} min</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Categoría</div>
            <div class="meta-value">${form.category}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">🥗 Ingredientes</div>
          <table>
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th class="text-center">Cantidad</th>
                <th class="text-center">Unidad</th>
                <th class="text-center">Merma %</th>
                <th class="text-right">Costo Unit.</th>
                <th class="text-right">Costo Total</th>
              </tr>
            </thead>
            <tbody>
              ${form.ingredients.map(ing => {
                const waste = ing.waste_factor_pct || 0;
                // PASE A · The print/export view mirrors what the UI shows:
                // the backend-provided `ing.total_cost` (already respects
                // unit conversion + waste). Do NOT recompute here with
                // qty × ing.cost_per_unit — that path multiplied ml by
                // $/purchase_unit and inflated the total.
                const cost = Number(ing.total_cost || ing.cost || 0);
                const qtyDisplay = ing.quantity;
                return `
                  <tr>
                    <td>${ing.item_name || ing.item_id}</td>
                    <td class="text-center">${qtyDisplay}</td>
                    <td class="text-center">${ing.unit}</td>
                    <td class="text-center">${waste > 0 ? waste + '%' : '-'}</td>
                    <td class="text-right">$${fmtNum(qtyDisplay > 0 ? cost / qtyDisplay : 0)}</td>
                    <td class="text-right">$${fmtNum(cost)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <div class="cost-summary">
            <div class="cost-box">
              <div class="cost-label">Costo Total</div>
              <div class="cost-value">$${fmtNum(totalCost)}</div>
            </div>
            <div class="cost-box">
              <div class="cost-label">Costo / Porción</div>
              <div class="cost-value">$${fmtNum(costPerPortion)}</div>
            </div>
            <div class="cost-box highlight">
              <div class="cost-label">Precio Venta</div>
              <div class="cost-value">$${fmtNum(form.sell_price)}</div>
            </div>
          </div>
        </div>
        
        ${portionFormats.length > 0 ? `
          <div class="section portion-formats">
            <div class="section-title">📦 Formatos de Porción</div>
            <table>
              <thead>
                <tr>
                  <th>Formato</th>
                  <th class="text-center">Porciones</th>
                  <th class="text-right">Costo/Porción</th>
                  <th class="text-right">PVP</th>
                  <th class="text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                ${portionFormats.map(pf => `
                  <tr>
                    <td>${pf.format_name}${pf.is_default ? ' ⭐' : ''}</td>
                    <td class="text-center">${pf.portions_obtained}</td>
                    <td class="text-right">$${fmtNum(pf.cost_per_portion) || '0.00'}</td>
                    <td class="text-right">$${fmtNum(pf.sell_price) || '0.00'}</td>
                    <td class="text-right">${pf.margin_pct?.toFixed(1) || '0'}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
        
        ${form.allergens.length > 0 ? `
          <div class="allergens">
            <div class="allergens-title">⚠️ Alérgenos</div>
            <div>${recipeAllergens}</div>
          </div>
        ` : ''}
        
        ${Array.isArray(form.instructions) && form.instructions.length > 0 ? `
          <div class="section">
            <div class="section-title">📝 Procedimiento</div>
            <div class="instructions">
              <ol>
                ${form.instructions.map(inst => `<li>${inst}</li>`).join('')}
              </ol>
            </div>
          </div>
        ` : form.instructions && typeof form.instructions === 'string' && form.instructions.trim() ? `
          <div class="section">
            <div class="section-title">📝 Procedimiento</div>
            <div class="instructions">
              <ol>
                ${form.instructions.split('\n').filter(line => line.trim()).map(inst => `<li>${inst}</li>`).join('')}
              </ol>
            </div>
          </div>
        ` : ''}
        
        <div class="footer">
          <div>${company.legal_name || company.trade_name || company.name || ''}</div>
          <div>${formatDateOnly(new Date(), language)} ${new Date().toLocaleTimeString()}</div>
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  // Fetch cost history
  const fetchCostHistory = async () => {
    if (!initialRecipe) return;
    try {
      const res = await axios.get(`${API}/api/recipes/${initialRecipe.recipe_id}/cost-history`, { withCredentials: true });
      setCostHistory(res.data);
      setCostHistoryOpen(true);
    } catch (error) {
      toast.error("Error fetching cost history");
    }
  };

  // Save recipe
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(language === "es" ? "Nombre requerido" : "Name required");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        instructions: instructionText.trim() || null,
        min_margin_pct: form.min_margin_pct === "" || form.min_margin_pct == null
          ? null
          : Number(form.min_margin_pct),
      };
      
      if (initialRecipe) {
        await axios.put(`${API}/api/recipes/${initialRecipe.recipe_id}`, payload, { withCredentials: true });
        // Update extended fields
        await axios.put(`${API}/api/recipes/${initialRecipe.recipe_id}/extended`, {
          allergens: form.allergens,
          work_category: form.work_category,
          recipe_code: form.recipe_code,
          verified_status: form.verified_status
        }, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/recipes`, payload, { withCredentials: true });
      }
      toast.success(language === "es" ? "Receta guardada" : "Recipe saved");
      onSave?.();
      onClose?.();
    } catch (error) {
      const detail = error?.response?.data?.detail;
      let msg;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d) => d?.msg || JSON.stringify(d)).join(" · ");
      } else if (detail) {
        msg = JSON.stringify(detail);
      } else {
        msg = error?.message || (language === "es" ? "Error al guardar receta" : "Error saving recipe");
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Filter recipes that can be added as sub-recipes
  const availableSubRecipes = allRecipes.filter(r => 
    (r.recipe_type === "base" || r.recipe_type === "component") &&
    (!initialRecipe || r.recipe_id !== initialRecipe.recipe_id)
  );

  // Filter packaging items
  const packagingItems = ingredients.filter(i => 
    i.inventory_type === "packaging" || i.inventory_type === "disposable"
  );

  const getRecipeTypeInfo = (type) => RECIPE_TYPES.find(t => t.value === type);

  return (
    <div className="space-y-4">
      {/* Header with PDF Export */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">{t("basic")}</TabsTrigger>
            <TabsTrigger value="costing">{t("costing")}</TabsTrigger>
            <TabsTrigger value="details">{t("details")}</TabsTrigger>
            <TabsTrigger value="packaging" disabled={!initialRecipe}>{t("packaging")}</TabsTrigger>
            <TabsTrigger value="scale" disabled={!initialRecipe} data-testid="recipe-scale-tab">
              {language === "es" ? "Escalar" : "Scale"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {initialRecipe && (
          <Button variant="outline" size="sm" className="ml-4" onClick={handleExportPDF}>
            <FileText className="w-4 h-4 mr-2" />
            {language === "es" ? "Ficha Técnica" : "Technical Sheet"}
          </Button>
        )}
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="hidden">
          <TabsTrigger value="basic" />
          <TabsTrigger value="costing" />
          <TabsTrigger value="details" />
          <TabsTrigger value="packaging" />
          <TabsTrigger value="scale" />
        </TabsList>

        {/* BASIC TAB */}
        <TabsContent value="basic" className="space-y-4 mt-4">
          {/* Recipe Type */}
          <div>
            <Label className="mb-2 block">{t("recipeType")}</Label>
            <div className="flex gap-2 flex-wrap">
              {RECIPE_TYPES.map(type => (
                <button key={type.value} type="button"
                  onClick={() => setForm(prev => ({ ...prev, recipe_type: type.value }))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    form.recipe_type === type.value 
                      ? `${type.color} border-current font-medium` 
                      : "bg-muted/30 hover:bg-muted/50"
                  }`}>
                  <type.icon className="w-4 h-4" />
                  <span>{language === "es" ? type.labelEs : type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Base Menu Toggle — only for sellable dishes */}
          {(["final_dish", "dish", "Final"].includes(form.recipe_type)) && (
            <div
              className="flex items-center justify-between p-3 rounded-lg border bg-gradient-to-r from-emerald-50/60 to-white"
              data-testid="is-on-menu-toggle-row"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {language === "es" ? "En mi menú base" : "On my base menu"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {language === "es"
                      ? "Marca esta receta como parte de tu carta estándar para que aparezca primero al cotizar."
                      : "Mark this recipe as part of your signature menu — it'll surface first in proposals."}
                  </p>
                </div>
              </div>
              <Checkbox
                checked={!!form.is_on_menu}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, is_on_menu: !!v }))}
                data-testid="is-on-menu-checkbox"
              />
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Image Section */}
            <div className="md:row-span-3">
              <Label className="mb-2 block">{language === "es" ? "Imagen de Receta" : "Recipe Image"}</Label>
              <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[200px] bg-muted/20">
                {imageUrl ? (
                  <div className="relative w-full">
                    <img 
                      src={imageUrl.startsWith('/api') ? `${API}${imageUrl}` : imageUrl} 
                      alt={form.name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={handleDeleteImage}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Image className="w-12 h-12 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground text-center mb-3">
                      {language === "es" ? "Sin imagen" : "No image"}
                    </p>
                    {initialRecipe ? (
                      <label className="cursor-pointer">
                        <input 
                          type="file" 
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <Button variant="outline" size="sm" disabled={uploading} asChild>
                          <span>
                            <Upload className="w-4 h-4 mr-2" />
                            {uploading 
                              ? (language === "es" ? "Subiendo..." : "Uploading...") 
                              : (language === "es" ? "Subir Imagen" : "Upload Image")}
                          </span>
                        </Button>
                      </label>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {language === "es" ? "Guarda primero" : "Save first"}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {/* Name and Description */}
            <div className="md:col-span-2">
              <Label>{t("name")} *</Label>
              <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label>{t("description")}</Label>
              <Textarea value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>{t("category")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm(prev => ({ ...prev, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECIPE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{language === "es" ? cat.labelEs : cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("sellPrice")}</Label>
              <Input type="number" min="0" step="0.01" value={form.sell_price} onChange={(e) => setForm(prev => ({ ...prev, sell_price: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>

          {/* Margin policy override */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5">
                {language === "es" ? "Margen mínimo (override)" : "Min margin (override)"}
                <span className="text-[10px] text-muted-foreground font-normal">
                  {language === "es" ? "opcional" : "optional"}
                </span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.min_margin_pct}
                  onChange={(e) => setForm(prev => ({ ...prev, min_margin_pct: e.target.value }))}
                  placeholder={language === "es" ? "Usa la política de la compañía" : "Use company policy"}
                  className="pr-8"
                  data-testid="recipe-min-margin-pct"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {language === "es"
                  ? "Si lo dejas vacío, hereda del tipo/categoría en Settings → Política de Margen."
                  : "Leave empty to inherit from type/category in Settings → Margin Policy."}
              </p>
            </div>
          </div>

          {/* Yield */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>{t("yield")}</Label><Input type="number" min="0.01" step="0.01" value={form.yield_quantity} onChange={(e) => setForm(prev => ({ ...prev, yield_quantity: parseFloat(e.target.value) || 1 }))} /></div>
            <div><Label>{t("unit")}</Label><Select value={form.yield_unit} onValueChange={(v) => setForm(prev => ({ ...prev, yield_unit: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{t("portionsPerYield")}</Label><Input type="number" min="1" value={form.portions_per_yield} onChange={(e) => setForm(prev => ({ ...prev, portions_per_yield: parseFloat(e.target.value) || 1 }))} /></div>
            <div><Label>{t("portions")} {t("unit")}</Label><Select value={form.portion_unit} onValueChange={(v) => setForm(prev => ({ ...prev, portion_unit: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
          </div>

          {/* Instructions */}
          <div>
            <Label>{t("instructions")}</Label>
            <Textarea value={instructionText} onChange={(e) => setInstructionText(e.target.value)} rows={4} placeholder={language === "es" ? "Una instrucción por línea..." : "One instruction per line..."} />
          </div>

          {/* Notes */}
          <div>
            <Label>{t("notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
          </div>
        </TabsContent>

        {/* COSTING TAB */}
        <TabsContent value="costing" className="space-y-4 mt-4">
          {/* Ingredients */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{t("ingredients")}</h3>
                <Badge variant="outline">{form.ingredients.length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!form.name) {
                      toast.error(language === "es" ? "Ingresa nombre primero" : "Enter name first");
                      return;
                    }
                    setAiSuggesting(true);
                    try {
                      const res = await axios.post(
                        `${API}/recipes/suggest-ingredients`,
                        { name: form.name, servings: form.portions_per_yield || 1, language },
                        { withCredentials: true }
                      );
                      const sugg = (res.data?.ingredients || []).map((i, idx) => ({
                        item_id: `temp_ai_${Date.now()}_${idx}`,
                        name: i.name,
                        quantity: Number(i.quantity || 0),
                        unit: i.unit || "unidad",
                        waste_factor: 0,
                        cost: Number(i.cost || 0),
                        cost_per_unit: Number(i.cost || 0) / (Number(i.quantity) || 1),
                        notes: i.notes || "",
                        ai_suggested: true,
                      }));
                      if (sugg.length === 0) {
                        toast.error(language === "es" ? "Sin sugerencias" : "No suggestions");
                        return;
                      }
                      setForm((prev) => ({
                        ...prev,
                        ingredients: [...prev.ingredients, ...sugg],
                        prep_time_minutes: prev.prep_time_minutes || res.data?.prep_time_minutes || 0,
                        cook_time_minutes: prev.cook_time_minutes || res.data?.cook_time_minutes || 0,
                        allergens: prev.allergens?.length ? prev.allergens : (res.data?.allergens || []),
                        dietary_tags: prev.dietary_tags?.length ? prev.dietary_tags : (res.data?.dietary_tags || []),
                      }));
                      toast.success(
                        language === "es"
                          ? `${sugg.length} ingredientes sugeridos · revisa antes de guardar`
                          : `${sugg.length} ingredients suggested · review before saving`
                      );
                    } catch (err) {
                      toast.error(language === "es" ? "Error con IA" : "AI error");
                    } finally {
                      setAiSuggesting(false);
                    }
                  }}
                  disabled={aiSuggesting || !form.name}
                  className="gap-2"
                  data-testid="recipe-ai-suggest-ingredients"
                >
                  {aiSuggesting ? <KoraLoader size={14} /> : <Sparkles className="w-3.5 h-3.5" />}
                  {language === "es" ? "Sugerir con IA" : "Suggest with AI"}
                </Button>
                <IngredientPicker
                  ingredients={localIngredients.filter(i => i.inventory_type === "food")}
                  alreadyAddedIds={form.ingredients.map(i => i.item_id)}
                  onPick={addIngredient}
                  onRepair={(ing) => setRepairIngredient(ing)}
                  isEs={language === "es"}
                  type="ingredient"
                />
              </div>
            </div>

            {form.ingredients.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">{t("noIngredients")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "Ingrediente" : "Ingredient"}</TableHead>
                    <TableHead className="w-24 text-right">{t("quantity")}</TableHead>
                    <TableHead className="w-28">{t("unit")}</TableHead>
                    <TableHead className="w-24 text-right">{t("wasteFactor")}</TableHead>
                    <TableHead className="w-28 text-right">{t("cost")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.ingredients.map(ing => (
                    <IngredientRow
                      key={ing.item_id}
                      ing={ing}
                      onChange={(field, value) => updateIngredient(ing.item_id, field, value)}
                      onRemove={() => removeIngredient(ing.item_id)}
                      isEs={language === "es"}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Sub-Recipes (only for component and final_dish) */}
          {form.recipe_type !== "base" && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t("subRecipes")}</h3>
                  <Badge variant="outline">{form.sub_recipes.length}</Badge>
                </div>
                <IngredientPicker
                  ingredients={availableSubRecipes}
                  alreadyAddedIds={form.sub_recipes.map(s => s.child_recipe_id)}
                  onPick={addSubRecipe}
                  isEs={language === "es"}
                  type="recipe"
                />
              </div>

              {form.sub_recipes.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground">{t("noSubRecipes")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Sub-Receta" : "Sub-Recipe"}</TableHead>
                      <TableHead className="w-24 text-right">{t("quantity")}</TableHead>
                      <TableHead className="w-40">{language === "es" ? "Formato" : "Format"}</TableHead>
                      <TableHead className="w-24 text-right">{t("cost")}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.sub_recipes.map(sub => (
                      <SubRecipeRow
                        key={sub.child_recipe_id}
                        sub={sub}
                        onChange={(field, value) => updateSubRecipe(sub.child_recipe_id, field, value)}
                        onRemove={() => removeSubRecipe(sub.child_recipe_id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* Cost Summary — Sprint P0: Full breakdown (food + labor + overhead + contribution) */}
          <Card className="bg-muted/30" data-testid="recipe-cost-summary">
            <CardContent className="pt-4 space-y-4">
              {/* "Costo incompleto" banner — surfaces any unresolved unit
                  conversion or child sub-recipe with unresolved conversions.
                  Prevents users from trusting a total that silently missed lines. */}
              {hasConversionErrors && (
                <div
                  className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800"
                  data-testid="recipe-cost-incomplete-banner"
                  title={conversionErrorTooltip}
                >
                  <span aria-hidden="true">⚠️</span>
                  <div>
                    <p className="font-semibold" data-testid="recipe-cost-incomplete-message">
                      {language === "es"
                        ? `Costo incompleto — ${conversionErrorCount} ${
                            conversionErrorCount === 1
                              ? "ingrediente sin conversión resuelta"
                              : "ingredientes sin conversión resuelta"
                          }`
                        : `Incomplete cost — ${conversionErrorCount} ${
                            conversionErrorCount === 1
                              ? "ingredient with unresolved conversion"
                              : "ingredients with unresolved conversions"
                          }`}
                    </p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {language === "es"
                        ? "Define la densidad (g/ml) o el peso por unidad (g) del ingrediente para completar el cálculo."
                        : "Set density (g/ml) or weight per unit (g) on the ingredient to complete the calculation."}
                    </p>
                  </div>
                </div>
              )}

              {/* Simple financial view — matches Gastrokaisen approach.
                  Advanced parameters (presets, chef rate, overhead %, target %, prime %, margin %)
                  moved to Settings → Recipe Costing. */}
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {language === "es" ? "Costeo y Precio" : "Costing & Price"}
                </div>
                <Badge variant="outline" className="text-[11px]" data-testid="recipe-portions-badge">
                  {language === "es" ? "Rinde:" : "Yields:"}{" "}
                  <span className="font-semibold ml-1">{totalPortions} {language === "es" ? "porciones" : "portions"}</span>
                </Badge>
              </div>

              {/* Cost summary — 3 clear numbers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-lg border bg-white">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    {language === "es" ? "Costo Total Receta" : "Total Recipe Cost"}
                    {hasConversionErrors && (
                      <span
                        className="ml-1 text-rose-700"
                        title={conversionErrorTooltip}
                        data-testid="recipe-total-cost-warning"
                      >⚠️</span>
                    )}
                  </p>
                  <p className="text-2xl font-bold text-slate-800" data-testid="recipe-total-cost">${fmtNum(totalCost)}</p>
                  {/* Breakdown — makes any future drift instantly visible */}
                  <div className="mt-1.5 text-[10px] text-muted-foreground font-mono" data-testid="recipe-cost-breakdown">
                    <span data-testid="breakdown-ingredients">
                      {language === "es" ? "Ing." : "Ing."}: ${fmtNum(ingredientsCost)}
                    </span>
                    <span className="mx-1">+</span>
                    <span data-testid="breakdown-subrecipes">
                      {language === "es" ? "Sub" : "Sub"}: ${fmtNum(subRecipesCost)}
                    </span>
                    <span className="mx-1">=</span>
                    <span className="font-semibold" data-testid="breakdown-total">
                      ${fmtNum(totalCost)}
                    </span>
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-white">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    {language === "es" ? "Porciones" : "Portions"}
                  </p>
                  <p className="text-2xl font-bold text-slate-800" data-testid="recipe-portions">{totalPortions}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {(Number(form.yield_quantity) || 1)} × {(Number(form.portions_per_yield) || 1)}
                  </p>
                </div>
                <div className="p-4 rounded-lg border bg-white">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    {language === "es" ? "Costo por Porción" : "Cost per Portion"}
                    {hasConversionErrors && (
                      <span
                        className="ml-1 text-rose-700"
                        title={conversionErrorTooltip}
                        data-testid="recipe-cost-per-portion-warning"
                      >⚠️</span>
                    )}
                  </p>
                  <p className="text-2xl font-bold text-green-700" data-testid="recipe-cost-per-portion">${fmtNum(costPerPortion)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {language === "es" ? "Food cost únicamente" : "Food cost only"}
                  </p>
                </div>
              </div>

              {/* Suggested price — pick method (Food Cost / Prime / Markup) */}
              {(suggestedPriceFoodCost > 0 || suggestedPricePrime > 0 || suggestedPriceMarkup > 0) && (() => {
                const method = form.pricing_method_preference || "food_cost";
                const currentPrice =
                  method === "prime_cost" ? suggestedPricePrime
                    : method === "markup" ? suggestedPriceMarkup
                    : suggestedPriceFoodCost;
                const currentLabel = language === "es"
                  ? (method === "prime_cost" ? `Prime Cost — (food+labor) ÷ ${targetPrimeCostPct.toFixed(0)}%`
                    : method === "markup" ? `Markup — total ÷ (100% − ${targetGrossMarginPct.toFixed(0)}%)`
                    : `Food Cost — food ÷ ${targetFoodCostPct.toFixed(0)}%`)
                  : (method === "prime_cost" ? `Prime Cost — (food+labor) ÷ ${targetPrimeCostPct.toFixed(0)}%`
                    : method === "markup" ? `Markup — total ÷ (100% − ${targetGrossMarginPct.toFixed(0)}%)`
                    : `Food Cost — food ÷ ${targetFoodCostPct.toFixed(0)}%`);
                return (
                  <div className="flex flex-col gap-2 px-4 py-3 rounded-lg border border-blue-200 bg-blue-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase text-blue-700 tracking-wide font-semibold">
                          {language === "es" ? "Precio de venta sugerido" : "Suggested sell price"}
                        </p>
                        <p className="text-2xl font-bold text-blue-700" data-testid="suggested-price-selected">
                          ${fmtNum(currentPrice)}
                          <span className="text-xs text-blue-800 ml-1 font-normal">/ {language === "es" ? "porción" : "portion"}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{currentLabel}</p>
                      </div>
                      <div className="flex flex-col gap-2 items-end shrink-0">
                        <Select
                          value={method}
                          onValueChange={(v) => setForm((prev) => ({ ...prev, pricing_method_preference: v }))}
                        >
                          <SelectTrigger className="w-40 h-8 text-xs bg-white" data-testid="pricing-method-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="food_cost">
                              {language === "es" ? "Food Cost" : "Food Cost"} — ${fmtNum(suggestedPriceFoodCost)}
                            </SelectItem>
                            <SelectItem value="prime_cost">
                              {language === "es" ? "Prime Cost" : "Prime Cost"} — ${fmtNum(suggestedPricePrime)}
                            </SelectItem>
                            <SelectItem value="markup">
                              {language === "es" ? "Markup" : "Markup"} — ${fmtNum(suggestedPriceMarkup)}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="bg-white"
                          onClick={() => setForm((prev) => ({ ...prev, sell_price: Number(currentPrice.toFixed(2)) }))}
                          data-testid="apply-suggested-price"
                        >
                          {language === "es" ? "Aplicar" : "Apply"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Current sell price + profitability quick chip (only if set) */}
              {form.sell_price > 0 && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-white text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">
                      {language === "es" ? "Precio actual:" : "Current price:"}
                      <span className="font-semibold text-slate-800 ml-1">${fmtNum(form.sell_price)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {language === "es" ? "Food Cost:" : "Food Cost:"}
                      <span className={`font-semibold ml-1 ${foodCostPercent > 35 ? "text-red-600" : foodCostPercent > 30 ? "text-amber-600" : "text-green-600"}`} data-testid="food-cost-pct">
                        {foodCostPercent.toFixed(1)}%
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {language === "es" ? "Margen:" : "Margin:"}
                      <span className={`font-semibold ml-1 ${margin < 0 ? "text-red-600" : "text-emerald-600"}`}>${fmtNum(margin)}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Link to advanced settings — takes user to /settings/recipe-costing */}
              <div className="text-right">
                <a
                  href="/settings/recipe-costing"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  data-testid="link-recipe-costing-settings"
                >
                  {language === "es" ? "⚙️ Configurar labor, overhead y métodos avanzados" : "⚙️ Configure labor, overhead & advanced methods"}
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Portion Formats */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{t("portionFormats")}</h3>
                <Badge variant="outline">{portionFormats.length}</Badge>
              </div>
              {initialRecipe ? (
                <div className="flex gap-2">
                  {portionFormats.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openGeneratePicklist}
                      data-testid="generate-picklist-from-formats-btn"
                      title={language === "es" ? "Crear ítems de catálogo desde estos formatos" : "Create catalog items from these formats"}
                    >
                      <Package className="w-4 h-4 mr-1" />
                      {language === "es" ? "Generar ítems de catálogo" : "Generate catalog items"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => {
                    // Calculate suggested price when opening dialog
                    const costPer = totalCost / 1; // portions_obtained default is 1
                    const margin = 30; // default margin
                    const suggestedPrice = margin < 100 ? costPer / (1 - margin / 100) : costPer;
                    setPortionForm({
                      format_name: "", 
                      portions_obtained: 1, 
                      portion_unit: "serving",
                      sell_price: Math.round(suggestedPrice * 100) / 100, 
                      target_margin_pct: margin, 
                      is_default: false
                    });
                    setPortionDialogOpen(true);
                  }}>
                    <Plus className="w-4 h-4 mr-1" />{t("addPortionFormat")}
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  {language === "es" ? "Guarda primero para agregar formatos" : "Save first to add formats"}
                </Badge>
              )}
            </div>

            {!initialRecipe ? (
              <p className="text-center py-4 text-muted-foreground text-sm">
                {language === "es" 
                  ? "💡 Guarda la receta primero, luego podrás agregar formatos de porción (Almuerzo 10oz, Cena 6oz, Mini 4oz, etc.)" 
                  : "💡 Save the recipe first, then you can add portion formats (Lunch 10oz, Dinner 6oz, Mini 4oz, etc.)"}
              </p>
            ) : portionFormats.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">{language === "es" ? "Sin formatos de porción" : "No portion formats"}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("formatName")}</TableHead>
                      <TableHead className="text-right">{t("portionsObtained")}</TableHead>
                      <TableHead className="text-right">{t("costPerPortion")}</TableHead>
                      <TableHead className="text-right">{t("sellPrice")}</TableHead>
                      <TableHead className="text-right">{t("margin")} %</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portionFormats.map(pf => (
                      <TableRow key={pf.format_id}>
                        <TableCell className="font-medium">
                          {pf.format_name}
                          {pf.is_default && <Badge variant="secondary" className="ml-2">{language === "es" ? "Predeterminado" : "Default"}</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{formatQtyUnit(pf.portions_obtained, pf.portion_unit)}</TableCell>
                        <TableCell className="text-right">${fmtNum(pf.cost_per_portion)}</TableCell>
                        <TableCell className="text-right">${fmtNum(pf.sell_price)}</TableCell>
                        <TableCell className="text-right">
                          <span className={pf.margin_pct < 30 ? "text-red-500" : pf.margin_pct < 50 ? "text-yellow-500" : "text-green-500"}>
                            {pf.margin_pct?.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell><Button variant="ghost" size="icon" onClick={() => handleDeletePortionFormat(pf.format_id)}><Trash2 className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
        </TabsContent>

        {/* DETAILS TAB */}
        <TabsContent value="details" className="space-y-4 mt-4">
          {/* Time */}
          <div className="grid grid-cols-3 gap-4">
            <div><Label>{t("prepTime")}</Label><Input type="number" min="0" value={form.prep_time_minutes} onChange={(e) => setForm(prev => ({ ...prev, prep_time_minutes: parseInt(e.target.value) || 0 }))} /></div>
            <div><Label>{t("cookTime")}</Label><Input type="number" min="0" value={form.cook_time_minutes} onChange={(e) => setForm(prev => ({ ...prev, cook_time_minutes: parseInt(e.target.value) || 0 }))} /></div>
            <div><Label>{t("laborTime")}</Label><Input type="number" min="0" value={form.labor_minutes} onChange={(e) => setForm(prev => ({ ...prev, labor_minutes: parseInt(e.target.value) || 0 }))} /></div>
          </div>

          {/* Work Category, Recipe Code, Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>{t("workCategory")}</Label>
              <Select value={form.work_category} onValueChange={(v) => setForm(prev => ({ ...prev, work_category: v }))}>
                <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} /></SelectTrigger>
                <SelectContent>
                  {WORK_CATEGORIES.map(wc => (
                    <SelectItem key={wc.value} value={wc.value}>{language === "es" ? wc.labelEs : wc.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("recipeCode")}</Label>
              <Input value={form.recipe_code} onChange={(e) => setForm(prev => ({ ...prev, recipe_code: e.target.value }))} placeholder="REC-001" />
            </div>
            <div>
              <Label>{t("verifiedStatus")}</Label>
              <Select value={form.verified_status} onValueChange={(v) => setForm(prev => ({ ...prev, verified_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VERIFIED_STATUSES.map(vs => (
                    <SelectItem key={vs.value} value={vs.value}>{language === "es" ? vs.labelEs : vs.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Allergens */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertOctagon className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold">{t("allergens")}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {allergens.map(allergen => (
                <label key={allergen.allergen_id} 
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    form.allergens.includes(allergen.allergen_id) 
                      ? "bg-orange-100 border-orange-300 text-orange-800" 
                      : "hover:bg-muted/50"
                  }`}>
                  <Checkbox 
                    checked={form.allergens.includes(allergen.allergen_id)}
                    onCheckedChange={() => toggleAllergen(allergen.allergen_id)}
                  />
                  <span className="text-sm">{language === "es" ? allergen.name_es : allergen.name}</span>
                </label>
              ))}
            </div>
            {form.allergens.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">{language === "es" ? "Alérgenos seleccionados:" : "Selected allergens:"}</p>
                <div className="flex flex-wrap gap-1">
                  {form.allergens.map(id => {
                    const a = allergens.find(x => x.allergen_id === id);
                    return a ? <Badge key={id} variant="destructive">{language === "es" ? a.name_es : a.name}</Badge> : null;
                  })}
                </div>
              </div>
            )}
          </div>

          {initialRecipe && (
            <Button variant="outline" onClick={fetchCostHistory}>
              <History className="w-4 h-4 mr-2" />{t("costHistory")}
            </Button>
          )}
        </TabsContent>

        {/* PACKAGING TAB */}
        <TabsContent value="packaging" className="space-y-4 mt-4">
          {!initialRecipe ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{language === "es" ? "Guarda la receta primero para agregar empaques" : "Save recipe first to add packaging"}</p>
            </div>
          ) : (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  <h3 className="font-semibold">{t("packagingFormats")}</h3>
                  <Badge variant="outline">{packagingFormats.length}</Badge>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPackagingDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />{t("addPackaging")}
                </Button>
              </div>

              {packagingFormats.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground">{language === "es" ? "Sin formatos de empaque" : "No packaging formats"}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Artículo de Empaque" : "Packaging Item"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Cant./Porción" : "Qty/Portion"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo Unit." : "Unit Cost"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo/Porción" : "Cost/Portion"}</TableHead>
                      <TableHead>{t("notes")}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packagingFormats.map(pf => {
                      const item = ingredients.find(i => i.ingredient_id === pf.packaging_inventory_item_id);
                      const unitCost = item?.cost_per_unit || pf.cost_per_unit || 0;
                      const costPerPortion = unitCost * (pf.qty_per_portion || 1);
                      return (
                        <TableRow key={pf.format_id}>
                          <TableCell className="font-medium">{pf.packaging_item_name || item?.name || pf.packaging_inventory_item_id}</TableCell>
                          <TableCell className="text-right">{pf.qty_per_portion}</TableCell>
                          <TableCell className="text-right text-muted-foreground">${fmtNum(unitCost)}</TableCell>
                          <TableCell className="text-right font-medium">${costPerPortion.toFixed(2)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{pf.notes || "-"}</TableCell>
                          <TableCell><Button variant="ghost" size="icon" onClick={() => handleDeletePackagingFormat(pf.format_id)}><Trash2 className="w-4 h-4 text-red-500" /></Button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </TabsContent>

        {/* SCALE TAB */}
        <TabsContent value="scale" className="space-y-4 mt-4">
          <RecipeScalePanel recipe={initialRecipe ? { ...initialRecipe, ...form, recipe_id: initialRecipe.recipe_id } : null} />
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onClose} disabled={loading}>{t("cancel")}</Button>
        <Button onClick={handleSave} disabled={loading || !form.name.trim()}>
          {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          {t("save")}
        </Button>
      </div>

      {/* Add Portion Format Dialog */}
      <Dialog open={portionDialogOpen} onOpenChange={setPortionDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addPortionFormat")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {language === "es" 
                ? "Define formatos de porción como en GastroKaizen (4oz Mini, 8oz Plato del día, etc.)"
                : "Define portion formats like GastroKaizen (4oz Mini, 8oz Plato del día, etc.)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Format name with examples */}
            <div>
              <Label>{t("formatName")} *</Label>
              <Input 
                value={portionForm.format_name} 
                onChange={(e) => setPortionForm(prev => ({ ...prev, format_name: e.target.value }))} 
                placeholder={language === "es" ? "Ej: Porción 8oz [Plato del día]" : "E.g., 8oz Portion [Daily Special]"} 
              />
            </div>
            
            {/* Portions obtained from yield */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{language === "es" ? "Raciones Obtenidas" : "Portions Obtained"}</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={portionForm.portions_obtained} 
                  onChange={(e) => {
                    const portions = parseFloat(e.target.value) || 1;
                    const costPer = totalCost / portions;
                    const margin = portionForm.target_margin_pct || 30;
                    const suggestedPrice = margin < 100 ? costPer / (1 - margin / 100) : costPer;
                    setPortionForm(prev => ({ 
                      ...prev, 
                      portions_obtained: portions,
                      sell_price: Math.round(suggestedPrice * 100) / 100
                    }));
                  }} 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "es" ? "Cuántas porciones salen del yield total" : "How many portions from total yield"}
                </p>
              </div>
              <div>
                <Label>{t("unit")}</Label>
                <Select value={portionForm.portion_unit} onValueChange={(v) => setPortionForm(prev => ({ ...prev, portion_unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PORTION_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Cost per portion (calculated) */}
            {totalCost > 0 && portionForm.portions_obtained > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-800">{language === "es" ? "Costo por Ración:" : "Cost per Portion:"}</span>
                  <span className="text-lg font-bold text-blue-900">
                    ${fmtNum((totalCost / portionForm.portions_obtained))}
                  </span>
                </div>
              </div>
            )}
            
            {/* Margin-based pricing */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{language === "es" ? "Margen Objetivo %" : "Target Margin %"}</Label>
                <Input 
                  type="number" 
                  min="0" 
                  max="99" 
                  value={portionForm.target_margin_pct} 
                  onChange={(e) => {
                    const margin = parseFloat(e.target.value) || 0;
                    const costPer = totalCost / (portionForm.portions_obtained || 1);
                    const suggestedPrice = margin < 100 ? costPer / (1 - margin / 100) : costPer;
                    setPortionForm(prev => ({ 
                      ...prev, 
                      target_margin_pct: margin,
                      sell_price: Math.round(suggestedPrice * 100) / 100
                    }));
                  }} 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "es" ? "El precio se calcula automáticamente" : "Price is auto-calculated"}
                </p>
              </div>
              <div>
                <Label>{language === "es" ? "PVP (Precio de Venta)" : "Sell Price"}</Label>
                <Input 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={portionForm.sell_price} 
                  onChange={(e) => {
                    const price = parseFloat(e.target.value) || 0;
                    const costPer = totalCost / (portionForm.portions_obtained || 1);
                    const calculatedMargin = price > 0 ? ((price - costPer) / price * 100) : 0;
                    setPortionForm(prev => ({ 
                      ...prev, 
                      sell_price: price,
                      target_margin_pct: Math.round(calculatedMargin * 10) / 10
                    }));
                  }} 
                />
              </div>
            </div>
            
            {/* Pricing summary */}
            {totalCost > 0 && portionForm.portions_obtained > 0 && portionForm.sell_price > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-x-4 text-sm">
                  <span className="text-green-700">{language === "es" ? "Costo Ración:" : "Portion Cost:"}</span>
                  <span className="font-medium text-right">${fmtNum((totalCost / portionForm.portions_obtained))}</span>
                  
                  <span className="text-green-700">{language === "es" ? "Precio de Venta:" : "Sell Price:"}</span>
                  <span className="font-medium text-right">${fmtNum(portionForm.sell_price)}</span>
                  
                  <span className="text-green-700">{language === "es" ? "Margen Bruto:" : "Gross Margin:"}</span>
                  <span className="font-bold text-right text-green-800">
                    ${fmtNum((portionForm.sell_price - totalCost / portionForm.portions_obtained))} ({portionForm.target_margin_pct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Checkbox id="is_default" checked={portionForm.is_default} onCheckedChange={(c) => setPortionForm(prev => ({ ...prev, is_default: c }))} />
              <Label htmlFor="is_default">{language === "es" ? "Formato predeterminado" : "Default format"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPortionDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleAddPortionFormat} disabled={!portionForm.format_name}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Picklist Items from Portion Formats Dialog */}
      <Dialog open={genPicklistOpen} onOpenChange={setGenPicklistOpen}>
        <DialogContent className="sm:max-w-xl" data-testid="generate-picklist-dialog">
          <DialogHeader>
            <DialogTitle>
              {language === "es" ? "Generar ítems de catálogo desde formatos" : "Generate catalog items from formats"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {language === "es"
                ? "Crea un ítem de catálogo por cada formato seleccionado. Cada ítem queda vinculado al formato y hereda su costo y precio."
                : "Creates one catalog item per selected format. Each item is linked to its format and inherits cost & price."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{language === "es" ? "Prefijo del nombre" : "Name prefix"}</Label>
              <Input
                value={genNamePrefix}
                onChange={(e) => setGenNamePrefix(e.target.value)}
                placeholder={initialRecipe?.name || form.name}
                data-testid="gen-picklist-name-prefix"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {language === "es"
                  ? `Ejemplo: "${genNamePrefix || form.name || "Receta"} - Galón"`
                  : `Example: "${genNamePrefix || form.name || "Recipe"} - Gallon"`}
              </p>
            </div>

            <div>
              <Label>{language === "es" ? "Categoría del catálogo" : "Catalog category"} *</Label>
              <Select value={genCategoryId} onValueChange={setGenCategoryId}>
                <SelectTrigger data-testid="gen-picklist-category-select">
                  <SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {genCategories.map(c => (
                    <SelectItem key={c.category_id} value={c.category_id}>
                      {language === "es" ? (c.name_es || c.name) : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{language === "es" ? "Formatos a crear" : "Formats to create"}</Label>
              <div className="mt-2 border rounded-md divide-y">
                {portionFormats.map(pf => {
                  const checked = genSelectedFormatIds.includes(pf.format_id);
                  return (
                    <label
                      key={pf.format_id}
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50"
                      data-testid={`gen-picklist-format-${pf.format_id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            setGenSelectedFormatIds(prev =>
                              c ? [...prev, pf.format_id] : prev.filter(id => id !== pf.format_id)
                            );
                          }}
                        />
                        <div>
                          <div className="font-medium text-sm">
                            {pf.format_name}
                            {pf.is_default && <Badge variant="secondary" className="ml-2 text-xs">{language === "es" ? "Predeterminado" : "Default"}</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {language === "es" ? "Costo" : "Cost"}: ${fmtNum((pf.cost_per_portion || 0))} · {language === "es" ? "Precio" : "Price"}: ${fmtNum((pf.sell_price || 0))}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {genNamePrefix || form.name || "Item"} - {pf.format_name}
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {language === "es"
                  ? "💡 Si ya existe un ítem vinculado al mismo formato, se omitirá."
                  : "💡 If an item already linked to a format exists, it will be skipped."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenPicklistOpen(false)}>{t("cancel")}</Button>
            <Button
              onClick={handleGeneratePicklistItems}
              disabled={genSubmitting || genSelectedFormatIds.length === 0 || !genCategoryId}
              data-testid="gen-picklist-submit-btn"
            >
              {genSubmitting
                ? (language === "es" ? "Creando..." : "Creating...")
                : (language === "es" ? `Crear ${genSelectedFormatIds.length} ítem(s)` : `Create ${genSelectedFormatIds.length} item(s)`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Packaging Dialog */}
      <Dialog open={packagingDialogOpen} onOpenChange={setPackagingDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addPackaging")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {language === "es" 
                ? "Agrega items de empaque (contenedores, vasos, etc.) y calcula el costo por porción"
                : "Add packaging items (containers, cups, etc.) and calculate cost per portion"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{language === "es" ? "Artículo de Empaque" : "Packaging Item"} *</Label>
              <Select value={packagingForm.packaging_inventory_item_id} onValueChange={(v) => setPackagingForm(prev => ({ ...prev, packaging_inventory_item_id: v }))}>
                <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} /></SelectTrigger>
                <SelectContent>
                  {packagingItems.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">{language === "es" ? "Agrega items de empaque al inventario primero" : "Add packaging items to inventory first"}</div>
                  ) : (
                    packagingItems.map(item => (
                      <SelectItem key={item.ingredient_id} value={item.ingredient_id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{item.name}</span>
                          <span className="text-muted-foreground text-sm">${fmtNum(item.cost_per_unit)}/{item.unit}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {/* Selected item details */}
            {packagingForm.packaging_inventory_item_id && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                {(() => {
                  const selectedItem = packagingItems.find(i => i.ingredient_id === packagingForm.packaging_inventory_item_id);
                  const costPerUnit = selectedItem?.cost_per_unit || 0;
                  const costPerPortion = costPerUnit * packagingForm.qty_per_portion;
                  return (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-blue-700">{language === "es" ? "Costo Unitario:" : "Unit Cost:"}</span>
                      <span className="text-right font-medium">${fmtNum(costPerUnit)}/{selectedItem?.unit}</span>
                      <span className="text-blue-700">{language === "es" ? "Cantidad por Porción:" : "Qty per Portion:"}</span>
                      <span className="text-right font-medium">{packagingForm.qty_per_portion}</span>
                      <span className="text-blue-800 font-semibold">{language === "es" ? "Costo por Porción:" : "Cost per Portion:"}</span>
                      <span className="text-right font-bold text-blue-900">${costPerPortion.toFixed(2)}</span>
                    </div>
                  );
                })()}
              </div>
            )}
            
            <div>
              <Label>{language === "es" ? "Cantidad por Porción" : "Qty per Portion"}</Label>
              <Input type="number" min="0.01" step="0.01" value={packagingForm.qty_per_portion} onChange={(e) => setPackagingForm(prev => ({ ...prev, qty_per_portion: parseFloat(e.target.value) || 1 }))} />
              <p className="text-xs text-muted-foreground mt-1">
                {language === "es" ? "Cuántas unidades de este empaque se usan por porción" : "How many units of this packaging per portion"}
              </p>
            </div>
            <div>
              <Label>{t("notes")}</Label>
              <Input value={packagingForm.notes} onChange={(e) => setPackagingForm(prev => ({ ...prev, notes: e.target.value }))} placeholder={language === "es" ? "Ej: Usar vaso 4oz para salsa" : "E.g., Use 4oz cup for sauce"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPackagingDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleAddPackagingFormat} disabled={!packagingForm.packaging_inventory_item_id}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cost History Dialog */}
      <Dialog open={costHistoryOpen} onOpenChange={setCostHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5" />{t("costHistory")}: {costHistory?.recipe_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {costHistory?.ingredient_cost_history?.length > 0 ? (
              <div className="space-y-4">
                {costHistory.ingredient_cost_history.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{item.item_name}</span>
                      <Badge>${fmtNum(item.current_cost)}</Badge>
                    </div>
                    {item.price_history?.length > 0 ? (
                      <div className="space-y-1">
                        {item.price_history.slice(-5).reverse().map((ph, i) => (
                          <div key={i} className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>{formatDateOnly(ph.date, language)}</span>
                            <span className="font-medium text-foreground">${fmtNum(ph.price)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{language === "es" ? "Sin historial de cambios" : "No price changes recorded"}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">{language === "es" ? "Sin historial disponible" : "No history available"}</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Inline ingredient repair wizard — opened when user clicks a ⚠️ ingredient in the picker */}
      <IngredientWizard
        key={repairIngredient?.ingredient_id || "rb-wiz-none"}
        open={!!repairIngredient}
        initial={repairIngredient}
        onClose={() => setRepairIngredient(null)}
        onSaved={async () => {
          // refresh that one ingredient so the picker shows it as repaired
          try {
            const id = repairIngredient?.ingredient_id;
            if (id) {
              const res = await axios.get(`${API}/api/inventory/ingredients/${id}`, { withCredentials: true });
              setLocalIngredients(prev => prev.map(i => i.ingredient_id === id ? { ...i, ...res.data } : i));
            }
          } catch { /* swallow */ }
          setRepairIngredient(null);
        }}
      />
    </div>
  );
}
