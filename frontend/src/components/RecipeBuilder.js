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

// Icons
import { 
  Plus, Search, Edit, Trash2, ChefHat, Copy, X, AlertTriangle,
  Link2, DollarSign, History, Percent, Info, Layers, Utensils,
  Beaker, CookingPot, ArrowRight, RefreshCw, Check
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

const UNITS = ["g", "kg", "ml", "L", "oz", "lb", "unit", "portion", "serving", "cup", "tbsp", "tsp"];

export default function RecipeBuilder({ onClose, onSave, initialRecipe = null, ingredients = [], allRecipes = [] }) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [costHistoryOpen, setCostHistoryOpen] = useState(false);
  const [costHistory, setCostHistory] = useState(null);
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    recipe_type: "final_dish",
    category: "main",
    yield_quantity: 1,
    yield_unit: "portion",
    portion_size: 1,
    portion_unit: "serving",
    portions_per_yield: 1,
    prep_time_minutes: 0,
    cook_time_minutes: 0,
    labor_minutes: 0,
    ingredients: [],
    sub_recipes: [],
    instructions: [],
    notes: "",
    sell_price: 0,
    image_url: ""
  });

  const [instructionText, setInstructionText] = useState("");

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
        image_url: initialRecipe.image_url || ""
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

  // Add ingredient
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
        item_id: ingredientId,
        item_type: "ingredient",
        item_name: ingredient.name,
        quantity: 1,
        unit: ingredient.unit,
        waste_factor_pct: 0,
        cost_per_unit: ingredient.cost_per_unit,
        total_cost: ingredient.cost_per_unit,
        net_quantity: 1
      }]
    }));
  };

  // Add sub-recipe
  const addSubRecipe = (recipeId) => {
    const recipe = allRecipes.find(r => r.recipe_id === recipeId);
    if (!recipe) return;
    if (form.sub_recipes.find(s => s.child_recipe_id === recipeId)) {
      toast.error(language === "es" ? "Ya agregado" : "Already added");
      return;
    }
    // Prevent adding self
    if (initialRecipe && recipeId === initialRecipe.recipe_id) {
      toast.error(language === "es" ? "No puedes agregar la misma receta" : "Cannot add self as sub-recipe");
      return;
    }
    
    setForm(prev => ({
      ...prev,
      sub_recipes: [...prev.sub_recipes, {
        child_recipe_id: recipeId,
        child_recipe_name: recipe.name,
        quantity_used: 1,
        unit: recipe.yield_unit || "portion",
        cost_per_unit: recipe.cost_per_yield || 0,
        total_cost: recipe.cost_per_yield || 0
      }]
    }));
  };

  // Update ingredient
  const updateIngredient = (itemId, field, value) => {
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.map(ing => {
        if (ing.item_id !== itemId) return ing;
        const updated = { ...ing, [field]: value };
        
        // Recalculate costs
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

  // Update sub-recipe
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

  // Remove ingredient
  const removeIngredient = (itemId) => {
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter(i => i.item_id !== itemId)
    }));
  };

  // Remove sub-recipe
  const removeSubRecipe = (recipeId) => {
    setForm(prev => ({
      ...prev,
      sub_recipes: prev.sub_recipes.filter(s => s.child_recipe_id !== recipeId)
    }));
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

  // Filter recipes that can be added as sub-recipes (base and component types)
  const availableSubRecipes = allRecipes.filter(r => 
    (r.recipe_type === "base" || r.recipe_type === "component") &&
    (!initialRecipe || r.recipe_id !== initialRecipe.recipe_id)
  );

  const getRecipeTypeInfo = (type) => RECIPE_TYPES.find(t => t.value === type);

  return (
    <div className="space-y-6">
      {/* Header with Recipe Type Selector */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Label className="mb-2 block">{t("recipeType")}</Label>
          <div className="flex gap-2 flex-wrap">
            {RECIPE_TYPES.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, recipe_type: type.value }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  form.recipe_type === type.value 
                    ? `${type.color} border-current font-medium` 
                    : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <type.icon className="w-4 h-4" />
                <span>{language === "es" ? type.labelEs : type.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {getRecipeTypeInfo(form.recipe_type)?.description}
          </p>
        </div>
        
        {initialRecipe && (
          <Button variant="outline" size="sm" onClick={fetchCostHistory}>
            <History className="w-4 h-4 mr-1" />
            {t("costHistory")}
          </Button>
        )}
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>{t("name")} *</Label>
          <Input 
            value={form.name} 
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder={language === "es" ? "Nombre de la receta" : "Recipe name"}
          />
        </div>
        <div className="md:col-span-2">
          <Label>{t("description")}</Label>
          <Textarea 
            value={form.description} 
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            rows={2}
            placeholder={language === "es" ? "Descripción breve" : "Brief description"}
          />
        </div>
        <div>
          <Label>{t("category")}</Label>
          <Select value={form.category} onValueChange={(v) => setForm(prev => ({ ...prev, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECIPE_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>
                  {language === "es" ? cat.labelEs : cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("sellPrice")}</Label>
          <Input 
            type="number" 
            min="0" 
            step="0.01"
            value={form.sell_price} 
            onChange={(e) => setForm(prev => ({ ...prev, sell_price: parseFloat(e.target.value) || 0 }))}
          />
        </div>
      </div>

      {/* Yield & Portions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label>{t("yield")}</Label>
          <Input 
            type="number" 
            min="0.01" 
            step="0.01"
            value={form.yield_quantity} 
            onChange={(e) => setForm(prev => ({ ...prev, yield_quantity: parseFloat(e.target.value) || 1 }))}
          />
        </div>
        <div>
          <Label>{t("unit")}</Label>
          <Select value={form.yield_unit} onValueChange={(v) => setForm(prev => ({ ...prev, yield_unit: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("portionsPerYield")}</Label>
          <Input 
            type="number" 
            min="1" 
            value={form.portions_per_yield} 
            onChange={(e) => setForm(prev => ({ ...prev, portions_per_yield: parseFloat(e.target.value) || 1 }))}
          />
        </div>
        <div>
          <Label>{t("portions")} {t("unit")}</Label>
          <Select value={form.portion_unit} onValueChange={(v) => setForm(prev => ({ ...prev, portion_unit: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Time */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>{t("prepTime")}</Label>
          <Input 
            type="number" 
            min="0" 
            value={form.prep_time_minutes} 
            onChange={(e) => setForm(prev => ({ ...prev, prep_time_minutes: parseInt(e.target.value) || 0 }))}
          />
        </div>
        <div>
          <Label>{t("cookTime")}</Label>
          <Input 
            type="number" 
            min="0" 
            value={form.cook_time_minutes} 
            onChange={(e) => setForm(prev => ({ ...prev, cook_time_minutes: parseInt(e.target.value) || 0 }))}
          />
        </div>
        <div>
          <Label>{t("laborTime")}</Label>
          <Input 
            type="number" 
            min="0" 
            value={form.labor_minutes} 
            onChange={(e) => setForm(prev => ({ ...prev, labor_minutes: parseInt(e.target.value) || 0 }))}
          />
        </div>
      </div>

      {/* Ingredients Section */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{t("ingredients")}</h3>
            <Badge variant="outline">{form.ingredients.length}</Badge>
          </div>
          <Select onValueChange={addIngredient}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={t("selectIngredient")} />
            </SelectTrigger>
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
                <TableHead className="w-24 text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1">
                        {t("wasteFactor")}
                        <Info className="w-3 h-3" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{t("wasteInfo")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="w-24 text-right">{t("cost")}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.ingredients.map(ing => (
                <TableRow key={ing.item_id}>
                  <TableCell className="font-medium">{ing.item_name}</TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      min="0" 
                      step="0.01"
                      className="w-20 text-right"
                      value={ing.quantity} 
                      onChange={(e) => updateIngredient(ing.item_id, "quantity", parseFloat(e.target.value) || 0)}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ing.unit}</TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      min="0" 
                      max="99"
                      step="1"
                      className="w-20 text-right"
                      value={ing.waste_factor_pct || 0} 
                      onChange={(e) => updateIngredient(ing.item_id, "waste_factor_pct", parseFloat(e.target.value) || 0)}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${(ing.total_cost || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeIngredient(ing.item_id)}>
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Sub-Recipes Section (only for component and final_dish) */}
      {form.recipe_type !== "base" && (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{t("subRecipes")}</h3>
              <Badge variant="outline">{form.sub_recipes.length}</Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{language === "es" ? "Agrega recetas base o componentes para reutilizar" : "Add base recipes or components to reuse"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select onValueChange={addSubRecipe} disabled={availableSubRecipes.length === 0}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={t("selectSubRecipe")} />
              </SelectTrigger>
              <SelectContent>
                {availableSubRecipes.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {language === "es" ? "Crea primero recetas Base o Componentes" : "Create Base or Component recipes first"}
                  </div>
                ) : (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted">{t("baseRecipes")}</div>
                    {availableSubRecipes.filter(r => r.recipe_type === "base").map(recipe => (
                      <SelectItem key={recipe.recipe_id} value={recipe.recipe_id}>
                        <div className="flex items-center gap-2">
                          <Beaker className="w-3 h-3 text-purple-500" />
                          {recipe.name} (${recipe.cost_per_yield?.toFixed(2)}/{recipe.yield_unit})
                        </div>
                      </SelectItem>
                    ))}
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted">{t("componentRecipes")}</div>
                    {availableSubRecipes.filter(r => r.recipe_type === "component").map(recipe => (
                      <SelectItem key={recipe.recipe_id} value={recipe.recipe_id}>
                        <div className="flex items-center gap-2">
                          <Layers className="w-3 h-3 text-blue-500" />
                          {recipe.name} (${recipe.cost_per_yield?.toFixed(2)}/{recipe.yield_unit})
                        </div>
                      </SelectItem>
                    ))}
                  </>
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
                {form.sub_recipes.map(sub => {
                  const typeInfo = getRecipeTypeInfo(allRecipes.find(r => r.recipe_id === sub.child_recipe_id)?.recipe_type);
                  return (
                    <TableRow key={sub.child_recipe_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {typeInfo && <typeInfo.icon className={`w-4 h-4 ${typeInfo.color.includes("purple") ? "text-purple-500" : "text-blue-500"}`} />}
                          <span className="font-medium">{sub.child_recipe_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          min="0" 
                          step="0.01"
                          className="w-20 text-right"
                          value={sub.quantity_used} 
                          onChange={(e) => updateSubRecipe(sub.child_recipe_id, "quantity_used", parseFloat(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sub.unit}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${(sub.total_cost || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeSubRecipe(sub.child_recipe_id)}>
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Instructions */}
      <div>
        <Label>{t("instructions")}</Label>
        <Textarea 
          value={instructionText} 
          onChange={(e) => setInstructionText(e.target.value)}
          rows={4}
          placeholder={language === "es" ? "Una instrucción por línea..." : "One instruction per line..."}
        />
      </div>

      {/* Notes */}
      <div>
        <Label>{t("notes")}</Label>
        <Textarea 
          value={form.notes} 
          onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
          rows={2}
        />
      </div>

      {/* Cost Summary Card */}
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
              <p className={`text-2xl font-bold ${margin < 0 ? "text-red-500" : "text-green-500"}`}>
                ${margin.toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {t("cancel")}
        </Button>
        <Button onClick={handleSave} disabled={loading || !form.name.trim()}>
          {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          {t("save")}
        </Button>
      </div>

      {/* Cost History Dialog */}
      <Dialog open={costHistoryOpen} onOpenChange={setCostHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {t("costHistory")}: {costHistory?.recipe_name}
            </DialogTitle>
            <DialogDescription>
              {language === "es" ? "Historial de cambios de precios de ingredientes" : "Ingredient price change history"}
            </DialogDescription>
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
                            <span className="flex items-center gap-2">
                              {ph.previous && (
                                <>
                                  <span className="line-through">${ph.previous?.toFixed(2)}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </>
                              )}
                              <span className="font-medium text-foreground">${ph.price?.toFixed(2)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {language === "es" ? "Sin historial de cambios" : "No price changes recorded"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                {language === "es" ? "Sin historial disponible" : "No history available"}
              </p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
