import { useState, useEffect, useCallback } from "react";
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
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Checkbox } from "./ui/checkbox";

// Icons
import { 
  Plus, Search, Edit, Trash2, ChefHat, Copy, X, AlertTriangle,
  Link2, DollarSign, History, Percent, Info, Layers, Utensils,
  Beaker, CookingPot, ArrowRight, RefreshCw, Check, Package,
  AlertOctagon, Tag
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

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

const UNITS = ["g", "kg", "ml", "L", "oz", "lb", "unit", "portion", "serving", "cup", "tbsp", "tsp"];
const PORTION_UNITS = ["serving", "plate", "bowl", "tray", "piece", "ml", "oz", "g", "portion"];

export default function RecipeBuilder({ onClose, onSave, initialRecipe = null, ingredients = [], allRecipes = [] }) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  
  // Data
  const [allergens, setAllergens] = useState([]);
  const [portionFormats, setPortionFormats] = useState([]);
  const [packagingFormats, setPackagingFormats] = useState([]);
  const [costHistory, setCostHistory] = useState(null);
  
  // Dialogs
  const [costHistoryOpen, setCostHistoryOpen] = useState(false);
  const [portionDialogOpen, setPortionDialogOpen] = useState(false);
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  
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
    allergens: [], work_category: "", recipe_code: "", verified_status: "Draft"
  });

  const [instructionText, setInstructionText] = useState("");

  // Fetch allergens
  useEffect(() => {
    const fetchAllergens = async () => {
      try {
        const res = await axios.get(`${API}/api/allergens`, { withCredentials: true });
        setAllergens(res.data);
      } catch (error) {
        console.error("Error loading allergens", error);
      }
    };
    fetchAllergens();
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
        recipe_type: initialRecipe.recipe_type || "final_dish",
        category: initialRecipe.category || "main",
        yield_quantity: initialRecipe.yield_quantity || 1,
        yield_unit: initialRecipe.yield_unit || "portion",
        portion_size: initialRecipe.portion_size || 1,
        portion_unit: initialRecipe.portion_unit || "serving",
        portions_per_yield: initialRecipe.portions_per_yield || 1,
        prep_time_minutes: initialRecipe.prep_time_minutes || 0,
        cook_time_minutes: initialRecipe.cook_time_minutes || 0,
        labor_minutes: initialRecipe.labor_minutes || 0,
        ingredients: initialRecipe.ingredients || [],
        sub_recipes: initialRecipe.sub_recipes || [],
        instructions: initialRecipe.instructions || [],
        notes: initialRecipe.notes || "",
        sell_price: initialRecipe.sell_price || 0,
        allergens: initialRecipe.allergens || [],
        work_category: initialRecipe.work_category || "",
        recipe_code: initialRecipe.recipe_code || "",
        verified_status: initialRecipe.verified_status || "Draft"
      });
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

  // Calculate total cost
  const calculateTotalCost = () => {
    let total = 0;
    for (const ing of form.ingredients) {
      const invItem = ingredients.find(i => i.ingredient_id === ing.item_id);
      if (invItem) {
        const wasteFactor = ing.waste_factor_pct || 0;
        const effectiveCost = wasteFactor > 0 && wasteFactor < 100
          ? invItem.cost_per_unit / (1 - wasteFactor / 100)
          : invItem.cost_per_unit;
        total += (ing.quantity || 0) * effectiveCost;
      }
    }
    for (const sub of form.sub_recipes) {
      const subRecipe = allRecipes.find(r => r.recipe_id === sub.child_recipe_id);
      if (subRecipe) {
        total += (sub.quantity_used || 0) * (subRecipe.cost_per_yield || 0);
      }
    }
    return total;
  };

  const totalCost = calculateTotalCost();
  const costPerPortion = form.portions_per_yield > 0 ? totalCost / form.portions_per_yield : totalCost;
  const foodCostPercent = form.sell_price > 0 ? (costPerPortion / form.sell_price * 100) : 0;
  const margin = form.sell_price - costPerPortion;

  // Ingredient management
  const addIngredient = (ingredientId) => {
    const ingredient = ingredients.find(i => i.ingredient_id === ingredientId);
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
        cost_per_unit: ingredient.cost_per_unit, total_cost: ingredient.cost_per_unit, net_quantity: 1
      }]
    }));
  };

  const updateIngredient = (itemId, field, value) => {
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.map(ing => {
        if (ing.item_id !== itemId) return ing;
        const updated = { ...ing, [field]: value };
        const invItem = ingredients.find(i => i.ingredient_id === itemId);
        if (invItem) {
          const wasteFactor = updated.waste_factor_pct || 0;
          const effectiveCost = wasteFactor > 0 && wasteFactor < 100
            ? invItem.cost_per_unit / (1 - wasteFactor / 100)
            : invItem.cost_per_unit;
          updated.cost_per_unit = effectiveCost;
          updated.total_cost = (updated.quantity || 0) * effectiveCost;
          updated.net_quantity = (updated.quantity || 0) * (1 + wasteFactor / 100);
        }
        return updated;
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
        cost_per_unit: recipe.cost_per_yield || 0, total_cost: recipe.cost_per_yield || 0
      }]
    }));
  };

  const updateSubRecipe = (recipeId, field, value) => {
    setForm(prev => ({
      ...prev,
      sub_recipes: prev.sub_recipes.map(sub => {
        if (sub.child_recipe_id !== recipeId) return sub;
        const updated = { ...sub, [field]: value };
        const recipe = allRecipes.find(r => r.recipe_id === recipeId);
        if (recipe) {
          updated.total_cost = (updated.quantity_used || 0) * (recipe.cost_per_yield || 0);
        }
        return updated;
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
        instructions: instructionText.split("\n").filter(l => l.trim())
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
      toast.error(error.response?.data?.detail || "Error saving recipe");
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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">{t("basic")}</TabsTrigger>
          <TabsTrigger value="costing">{t("costing")}</TabsTrigger>
          <TabsTrigger value="details">{t("details")}</TabsTrigger>
          <TabsTrigger value="packaging" disabled={!initialRecipe}>{t("packaging")}</TabsTrigger>
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

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{t("ingredients")}</h3>
                <Badge variant="outline">{form.ingredients.length}</Badge>
              </div>
              <Select onValueChange={addIngredient}>
                <SelectTrigger className="w-64"><SelectValue placeholder={t("selectIngredient")} /></SelectTrigger>
                <SelectContent>
                  {ingredients.filter(i => i.inventory_type === "food").map(ing => (
                    <SelectItem key={ing.ingredient_id} value={ing.ingredient_id}>
                      {ing.name} (${ing.cost_per_unit?.toFixed(2)}/{ing.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.ingredients.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">{t("noIngredients")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "Ingrediente" : "Ingredient"}</TableHead>
                    <TableHead className="w-24 text-right">{t("quantity")}</TableHead>
                    <TableHead className="w-20">{t("unit")}</TableHead>
                    <TableHead className="w-24 text-right">{t("wasteFactor")}</TableHead>
                    <TableHead className="w-24 text-right">{t("cost")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.ingredients.map(ing => (
                    <TableRow key={ing.item_id}>
                      <TableCell className="font-medium">{ing.item_name}</TableCell>
                      <TableCell><Input type="number" min="0" step="0.01" className="w-20 text-right" value={ing.quantity} onChange={(e) => updateIngredient(ing.item_id, "quantity", parseFloat(e.target.value) || 0)} /></TableCell>
                      <TableCell className="text-muted-foreground">{ing.unit}</TableCell>
                      <TableCell><Input type="number" min="0" max="99" step="1" className="w-20 text-right" value={ing.waste_factor_pct || 0} onChange={(e) => updateIngredient(ing.item_id, "waste_factor_pct", parseFloat(e.target.value) || 0)} /></TableCell>
                      <TableCell className="text-right font-mono">${(ing.total_cost || 0).toFixed(2)}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => removeIngredient(ing.item_id)}><X className="w-4 h-4 text-red-500" /></Button></TableCell>
                    </TableRow>
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
                <Select onValueChange={addSubRecipe} disabled={availableSubRecipes.length === 0}>
                  <SelectTrigger className="w-64"><SelectValue placeholder={t("selectSubRecipe")} /></SelectTrigger>
                  <SelectContent>
                    {availableSubRecipes.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">{language === "es" ? "Crea primero recetas Base o Componentes" : "Create Base or Component recipes first"}</div>
                    ) : (
                      availableSubRecipes.map(recipe => (
                        <SelectItem key={recipe.recipe_id} value={recipe.recipe_id}>
                          {recipe.name} (${recipe.cost_per_yield?.toFixed(2)}/{recipe.yield_unit})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {form.sub_recipes.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground">{t("noSubRecipes")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Sub-Receta" : "Sub-Recipe"}</TableHead>
                      <TableHead className="w-24 text-right">{t("quantity")}</TableHead>
                      <TableHead className="w-20">{t("unit")}</TableHead>
                      <TableHead className="w-24 text-right">{t("cost")}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.sub_recipes.map(sub => (
                      <TableRow key={sub.child_recipe_id}>
                        <TableCell className="font-medium">{sub.child_recipe_name}</TableCell>
                        <TableCell><Input type="number" min="0" step="0.01" className="w-20 text-right" value={sub.quantity_used} onChange={(e) => updateSubRecipe(sub.child_recipe_id, "quantity_used", parseFloat(e.target.value) || 0)} /></TableCell>
                        <TableCell className="text-muted-foreground">{sub.unit}</TableCell>
                        <TableCell className="text-right font-mono">${(sub.total_cost || 0).toFixed(2)}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" onClick={() => removeSubRecipe(sub.child_recipe_id)}><X className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* Cost Summary */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-background rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("totalCost")}</p>
                  <p className="text-2xl font-bold text-green-600">${totalCost.toFixed(2)}</p>
                </div>
                <div className="text-center p-3 bg-background rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("costPerPortion")}</p>
                  <p className="text-2xl font-bold">${costPerPortion.toFixed(2)}</p>
                </div>
                <div className="text-center p-3 bg-background rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("foodCostPercent")}</p>
                  <p className={`text-2xl font-bold ${foodCostPercent > 35 ? "text-red-500" : foodCostPercent > 30 ? "text-yellow-500" : "text-green-500"}`}>
                    {foodCostPercent.toFixed(1)}%
                  </p>
                </div>
                <div className="text-center p-3 bg-background rounded-lg">
                  <p className="text-xs text-muted-foreground">{t("margin")}</p>
                  <p className={`text-2xl font-bold ${margin < 0 ? "text-red-500" : "text-green-500"}`}>${margin.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portion Formats */}
          {initialRecipe && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t("portionFormats")}</h3>
                  <Badge variant="outline">{portionFormats.length}</Badge>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPortionDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />{t("addPortionFormat")}
                </Button>
              </div>

              {portionFormats.length === 0 ? (
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
                        <TableCell className="text-right">{pf.portions_obtained} {pf.portion_unit}</TableCell>
                        <TableCell className="text-right">${pf.cost_per_portion?.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${pf.sell_price?.toFixed(2)}</TableCell>
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
          )}
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
                      <TableHead className="text-right">{language === "es" ? "Cant. por Porción" : "Qty per Portion"}</TableHead>
                      <TableHead>{t("notes")}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packagingFormats.map(pf => (
                      <TableRow key={pf.format_id}>
                        <TableCell className="font-medium">{pf.packaging_item_name || pf.packaging_inventory_item_id}</TableCell>
                        <TableCell className="text-right">{pf.qty_per_portion}</TableCell>
                        <TableCell className="text-muted-foreground">{pf.notes || "-"}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" onClick={() => handleDeletePackagingFormat(pf.format_id)}><Trash2 className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
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
                  onChange={(e) => setPortionForm(prev => ({ ...prev, portions_obtained: parseFloat(e.target.value) || 1 }))} 
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
                    ${(totalCost / portionForm.portions_obtained).toFixed(2)}
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
                  <span className="font-medium text-right">${(totalCost / portionForm.portions_obtained).toFixed(2)}</span>
                  
                  <span className="text-green-700">{language === "es" ? "Precio de Venta:" : "Sell Price:"}</span>
                  <span className="font-medium text-right">${portionForm.sell_price.toFixed(2)}</span>
                  
                  <span className="text-green-700">{language === "es" ? "Margen Bruto:" : "Gross Margin:"}</span>
                  <span className="font-bold text-right text-green-800">
                    ${(portionForm.sell_price - totalCost / portionForm.portions_obtained).toFixed(2)} ({portionForm.target_margin_pct.toFixed(1)}%)
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

      {/* Add Packaging Dialog */}
      <Dialog open={packagingDialogOpen} onOpenChange={setPackagingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addPackaging")}</DialogTitle>
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
                      <SelectItem key={item.ingredient_id} value={item.ingredient_id}>{item.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{language === "es" ? "Cantidad por Porción" : "Qty per Portion"}</Label><Input type="number" min="0.01" step="0.01" value={packagingForm.qty_per_portion} onChange={(e) => setPackagingForm(prev => ({ ...prev, qty_per_portion: parseFloat(e.target.value) || 1 }))} /></div>
            <div><Label>{t("notes")}</Label><Input value={packagingForm.notes} onChange={(e) => setPackagingForm(prev => ({ ...prev, notes: e.target.value }))} placeholder={language === "es" ? "Ej: Usar vaso 4oz para salsa" : "E.g., Use 4oz cup for sauce"} /></div>
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
                      <Badge>${item.current_cost?.toFixed(2)}</Badge>
                    </div>
                    {item.price_history?.length > 0 ? (
                      <div className="space-y-1">
                        {item.price_history.slice(-5).reverse().map((ph, i) => (
                          <div key={i} className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>{new Date(ph.date).toLocaleDateString()}</span>
                            <span className="font-medium text-foreground">${ph.price?.toFixed(2)}</span>
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
    </div>
  );
}
