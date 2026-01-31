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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";

// Icons
import { 
  Plus, Search, Edit, Trash2, ChefHat, X, Calculator, 
  Layers, Utensils, FlaskConical, AlertCircle, RefreshCw
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const RECIPE_TYPES = [
  { value: "base", label: "Base Recipe", labelEs: "Receta Base", desc: "Sauces, stocks, seasonings" },
  { value: "component", label: "Component", labelEs: "Componente", desc: "Sub-preparations" },
  { value: "final_dish", label: "Final Dish", labelEs: "Platillo Final", desc: "Sellable menu item" },
];

const RECIPE_CATEGORIES = [
  "appetizer", "soup", "salad", "main", "side", "dessert", 
  "sauce", "stock", "seasoning", "beverage", "bread"
];

export default function RecipeBuilderAdvanced() {
  const { language } = useLanguage();
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  
  // Form state
  const [recipeForm, setRecipeForm] = useState({
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
    instructions: "",
    notes: "",
    sell_price: 0
  });

  const t = useCallback((key) => {
    const translations = {
      recipes: { en: "Recipes", es: "Recetas" },
      newRecipe: { en: "New Recipe", es: "Nueva Receta" },
      editRecipe: { en: "Edit Recipe", es: "Editar Receta" },
      name: { en: "Name", es: "Nombre" },
      type: { en: "Type", es: "Tipo" },
      category: { en: "Category", es: "Categoría" },
      yield: { en: "Yield", es: "Rendimiento" },
      portion: { en: "Portion", es: "Porción" },
      ingredients: { en: "Ingredients", es: "Ingredientes" },
      subRecipes: { en: "Sub-Recipes", es: "Sub-Recetas" },
      instructions: { en: "Instructions", es: "Instrucciones" },
      totalCost: { en: "Total Cost", es: "Costo Total" },
      costPerPortion: { en: "Cost per Portion", es: "Costo por Porción" },
      waste: { en: "Waste %", es: "Merma %" },
      save: { en: "Save", es: "Guardar" },
      cancel: { en: "Cancel", es: "Cancelar" },
      search: { en: "Search...", es: "Buscar..." },
      all: { en: "All", es: "Todos" },
      prepTime: { en: "Prep Time", es: "Tiempo Prep" },
      cookTime: { en: "Cook Time", es: "Tiempo Cocción" },
      sellPrice: { en: "Sell Price", es: "Precio Venta" },
      foodCost: { en: "Food Cost %", es: "% Costo Alimento" },
      quantity: { en: "Qty", es: "Cant" },
      unit: { en: "Unit", es: "Unidad" },
      addIngredient: { en: "Add Ingredient", es: "Agregar Ingrediente" },
      addSubRecipe: { en: "Add Sub-Recipe", es: "Agregar Sub-Receta" },
      noRecipes: { en: "No recipes found", es: "No hay recetas" },
      base: { en: "Base", es: "Base" },
      component: { en: "Component", es: "Componente" },
      final_dish: { en: "Final Dish", es: "Platillo Final" },
      recalculate: { en: "Recalculate All", es: "Recalcular Todo" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  }, [language]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recipesRes, ingredientsRes] = await Promise.all([
        axios.get(`${API}/api/recipes`, { withCredentials: true }),
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true })
      ]);
      setRecipes(recipesRes.data);
      setIngredients(ingredientsRes.data);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    try {
      const payload = {
        ...recipeForm,
        instructions: recipeForm.instructions.split('\n').filter(l => l.trim())
      };
      
      if (editingRecipe) {
        await axios.put(`${API}/api/recipes/${editingRecipe.recipe_id}`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Receta actualizada" : "Recipe updated");
      } else {
        await axios.post(`${API}/api/recipes`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Receta creada" : "Recipe created");
      }
      setDialogOpen(false);
      setEditingRecipe(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving recipe");
    }
  };

  const handleDelete = async (recipeId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar esta receta?" : "Delete this recipe?")) return;
    try {
      await axios.delete(`${API}/api/recipes/${recipeId}`, { withCredentials: true });
      toast.success(language === "es" ? "Eliminado" : "Deleted");
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleEdit = (recipe) => {
    setEditingRecipe(recipe);
    setRecipeForm({
      name: recipe.name || "",
      description: recipe.description || "",
      recipe_type: recipe.recipe_type || "final_dish",
      category: recipe.category || "main",
      yield_quantity: recipe.yield_quantity || 1,
      yield_unit: recipe.yield_unit || "portion",
      portion_size: recipe.portion_size || 1,
      portion_unit: recipe.portion_unit || "serving",
      portions_per_yield: recipe.portions_per_yield || 1,
      prep_time_minutes: recipe.prep_time_minutes || 0,
      cook_time_minutes: recipe.cook_time_minutes || 0,
      labor_minutes: recipe.labor_minutes || 0,
      ingredients: recipe.ingredients || [],
      sub_recipes: recipe.sub_recipes || [],
      instructions: Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : (recipe.instructions || ""),
      notes: recipe.notes || "",
      sell_price: recipe.sell_price || 0
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setRecipeForm({
      name: "", description: "", recipe_type: "final_dish", category: "main",
      yield_quantity: 1, yield_unit: "portion", portion_size: 1, portion_unit: "serving",
      portions_per_yield: 1, prep_time_minutes: 0, cook_time_minutes: 0, labor_minutes: 0,
      ingredients: [], sub_recipes: [], instructions: "", notes: "", sell_price: 0
    });
  };

  const addIngredient = (ingredientId) => {
    const ingredient = ingredients.find(i => i.ingredient_id === ingredientId);
    if (!ingredient) return;
    if (recipeForm.ingredients.find(i => i.item_id === ingredientId)) {
      toast.error(language === "es" ? "Ingrediente ya agregado" : "Ingredient already added");
      return;
    }
    
    setRecipeForm({
      ...recipeForm,
      ingredients: [...recipeForm.ingredients, {
        item_id: ingredientId,
        item_type: "ingredient",
        item_name: ingredient.name,
        quantity: 1,
        unit: ingredient.unit,
        waste_factor_pct: 0,
        cost_per_unit: ingredient.cost_per_unit || 0,
        total_cost: ingredient.cost_per_unit || 0
      }]
    });
  };

  const updateIngredient = (itemId, field, value) => {
    setRecipeForm({
      ...recipeForm,
      ingredients: recipeForm.ingredients.map(i => {
        if (i.item_id === itemId) {
          const updated = { ...i, [field]: value };
          // Recalculate cost with waste factor
          if (field === "quantity" || field === "waste_factor_pct") {
            const baseIngredient = ingredients.find(ing => ing.ingredient_id === itemId);
            const baseCost = baseIngredient?.cost_per_unit || i.cost_per_unit || 0;
            const waste = updated.waste_factor_pct || 0;
            const effectiveCost = waste > 0 && waste < 100 ? baseCost / (1 - waste / 100) : baseCost;
            updated.cost_per_unit = effectiveCost;
            updated.total_cost = updated.quantity * effectiveCost;
          }
          return updated;
        }
        return i;
      })
    });
  };

  const removeIngredient = (itemId) => {
    setRecipeForm({
      ...recipeForm,
      ingredients: recipeForm.ingredients.filter(i => i.item_id !== itemId)
    });
  };

  const addSubRecipe = (recipeId) => {
    const subRecipe = recipes.find(r => r.recipe_id === recipeId);
    if (!subRecipe) return;
    if (editingRecipe && recipeId === editingRecipe.recipe_id) {
      toast.error(language === "es" ? "No puedes agregar la misma receta" : "Cannot add self-reference");
      return;
    }
    if (subRecipe.recipe_type === "final_dish" && recipeForm.recipe_type !== "final_dish") {
      toast.error(language === "es" ? "Solo platillos finales pueden usar otros platillos" : "Only final dishes can use other final dishes");
      return;
    }
    if (recipeForm.sub_recipes.find(s => s.child_recipe_id === recipeId)) {
      toast.error(language === "es" ? "Sub-receta ya agregada" : "Sub-recipe already added");
      return;
    }
    
    setRecipeForm({
      ...recipeForm,
      sub_recipes: [...recipeForm.sub_recipes, {
        child_recipe_id: recipeId,
        child_recipe_name: subRecipe.name,
        quantity_used: 1,
        unit: subRecipe.yield_unit,
        cost_per_unit: subRecipe.cost_per_yield || 0,
        total_cost: subRecipe.cost_per_yield || 0
      }]
    });
  };

  const updateSubRecipe = (recipeId, field, value) => {
    setRecipeForm({
      ...recipeForm,
      sub_recipes: recipeForm.sub_recipes.map(s => {
        if (s.child_recipe_id === recipeId) {
          const updated = { ...s, [field]: value };
          if (field === "quantity_used") {
            updated.total_cost = value * s.cost_per_unit;
          }
          return updated;
        }
        return s;
      })
    });
  };

  const removeSubRecipe = (recipeId) => {
    setRecipeForm({
      ...recipeForm,
      sub_recipes: recipeForm.sub_recipes.filter(s => s.child_recipe_id !== recipeId)
    });
  };

  const calculateTotalCost = () => {
    const ingredientsCost = recipeForm.ingredients.reduce((sum, i) => sum + (i.total_cost || 0), 0);
    const subRecipesCost = recipeForm.sub_recipes.reduce((sum, s) => sum + (s.total_cost || 0), 0);
    return ingredientsCost + subRecipesCost;
  };

  const handleRecalculateAll = async () => {
    try {
      const res = await axios.post(`${API}/api/recipes/recalculate-all`, {}, { withCredentials: true });
      toast.success(`${res.data.updated_recipes} ${language === "es" ? "recetas actualizadas" : "recipes updated"}`);
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || r.recipe_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getTypeIcon = (type) => {
    switch(type) {
      case "base": return <FlaskConical className="w-4 h-4" />;
      case "component": return <Layers className="w-4 h-4" />;
      default: return <Utensils className="w-4 h-4" />;
    }
  };

  const getTypeBadgeVariant = (type) => {
    switch(type) {
      case "base": return "secondary";
      case "component": return "outline";
      default: return "default";
    }
  };

  // Get available sub-recipes (Base and Component only, exclude self)
  const availableSubRecipes = recipes.filter(r => 
    (r.recipe_type === "base" || r.recipe_type === "component") &&
    (!editingRecipe || r.recipe_id !== editingRecipe.recipe_id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="recipe-builder">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("recipes")}</h2>
          <p className="text-muted-foreground">
            {language === "es" ? "Base recipes, componentes y platillos finales con cálculo de merma" : "Base recipes, components, and final dishes with waste calculation"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRecalculateAll}>
            <RefreshCw className="w-4 h-4 mr-2" />{t("recalculate")}
          </Button>
          <Button onClick={() => { resetForm(); setEditingRecipe(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />{t("newRecipe")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            {RECIPE_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {language === "es" ? type.labelEs : type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Recipe Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRecipes.map(recipe => (
          <Card key={recipe.recipe_id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getTypeBadgeVariant(recipe.recipe_type)} className="flex items-center gap-1">
                      {getTypeIcon(recipe.recipe_type)}
                      {t(recipe.recipe_type)}
                    </Badge>
                    <Badge variant="outline" className="capitalize">{recipe.category}</Badge>
                  </div>
                  <CardTitle className="text-lg">{recipe.name}</CardTitle>
                  <CardDescription>{recipe.yield_quantity} {recipe.yield_unit}</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(recipe)}><Edit className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(recipe.recipe_id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ingredients")}</span>
                  <span>{recipe.ingredients?.length || 0}</span>
                </div>
                {recipe.sub_recipes?.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("subRecipes")}</span>
                    <span>{recipe.sub_recipes.length}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("totalCost")}</span>
                    <span className="font-semibold text-green-600">${recipe.total_cost?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("costPerPortion")}</span>
                    <span className="font-semibold">${recipe.cost_per_portion?.toFixed(2)}</span>
                  </div>
                  {recipe.sell_price > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("foodCost")}</span>
                      <span className={recipe.food_cost_percent > 35 ? "text-red-500" : "text-green-600"}>
                        {recipe.food_cost_percent?.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredRecipes.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <ChefHat className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{t("noRecipes")}</p>
          </div>
        )}
      </div>

      {/* Recipe Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecipe ? t("editRecipe") : t("newRecipe")}</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">{language === "es" ? "Básico" : "Basic"}</TabsTrigger>
              <TabsTrigger value="ingredients">{t("ingredients")} ({recipeForm.ingredients.length})</TabsTrigger>
              <TabsTrigger value="subrecipes">{t("subRecipes")} ({recipeForm.sub_recipes.length})</TabsTrigger>
              <TabsTrigger value="costing">{language === "es" ? "Costeo" : "Costing"}</TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>{t("name")}</Label>
                  <Input value={recipeForm.name} onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })} placeholder={language === "es" ? "Nombre de la receta" : "Recipe name"} />
                </div>
                <div>
                  <Label>{t("type")}</Label>
                  <Select value={recipeForm.recipe_type} onValueChange={(v) => setRecipeForm({ ...recipeForm, recipe_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECIPE_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex flex-col">
                            <span>{language === "es" ? type.labelEs : type.label}</span>
                            <span className="text-xs text-muted-foreground">{type.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("category")}</Label>
                  <Select value={recipeForm.category} onValueChange={(v) => setRecipeForm({ ...recipeForm, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECIPE_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("yield")} {t("quantity")}</Label>
                  <Input type="number" min="0.01" step="0.01" value={recipeForm.yield_quantity} onChange={(e) => setRecipeForm({ ...recipeForm, yield_quantity: parseFloat(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label>{t("yield")} {t("unit")}</Label>
                  <Select value={recipeForm.yield_unit} onValueChange={(v) => setRecipeForm({ ...recipeForm, yield_unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["portion", "serving", "kg", "lb", "L", "unit", "batch"].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{language === "es" ? "Porciones por Rendimiento" : "Portions per Yield"}</Label>
                  <Input type="number" min="1" step="1" value={recipeForm.portions_per_yield} onChange={(e) => setRecipeForm({ ...recipeForm, portions_per_yield: parseFloat(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label>{t("prepTime")} (min)</Label>
                  <Input type="number" min="0" value={recipeForm.prep_time_minutes} onChange={(e) => setRecipeForm({ ...recipeForm, prep_time_minutes: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>{t("cookTime")} (min)</Label>
                  <Input type="number" min="0" value={recipeForm.cook_time_minutes} onChange={(e) => setRecipeForm({ ...recipeForm, cook_time_minutes: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="col-span-2">
                  <Label>{t("instructions")}</Label>
                  <Textarea rows={4} value={recipeForm.instructions} onChange={(e) => setRecipeForm({ ...recipeForm, instructions: e.target.value })} placeholder={language === "es" ? "Una instrucción por línea" : "One instruction per line"} />
                </div>
              </div>
            </TabsContent>

            {/* Ingredients Tab */}
            <TabsContent value="ingredients" className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Select onValueChange={addIngredient}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={t("addIngredient")} /></SelectTrigger>
                  <SelectContent>
                    {ingredients.filter(i => i.inventory_type === "food").map(ing => (
                      <SelectItem key={ing.ingredient_id} value={ing.ingredient_id}>
                        {ing.name} (${ing.cost_per_unit?.toFixed(2)}/{ing.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {recipeForm.ingredients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{language === "es" ? "Sin ingredientes" : "No ingredients added"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Ingrediente" : "Ingredient"}</TableHead>
                      <TableHead className="w-24">{t("quantity")}</TableHead>
                      <TableHead className="w-20">{t("unit")}</TableHead>
                      <TableHead className="w-32">{t("waste")} (Merma)</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipeForm.ingredients.map(ing => (
                      <TableRow key={ing.item_id}>
                        <TableCell className="font-medium">{ing.item_name}</TableCell>
                        <TableCell>
                          <Input type="number" min="0" step="0.01" className="w-20" value={ing.quantity} onChange={(e) => updateIngredient(ing.item_id, "quantity", parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{ing.unit}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[ing.waste_factor_pct || 0]}
                              min={0}
                              max={50}
                              step={1}
                              onValueChange={([v]) => updateIngredient(ing.item_id, "waste_factor_pct", v)}
                              className="w-20"
                            />
                            <span className="text-sm w-10">{ing.waste_factor_pct || 0}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">${ing.total_cost?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeIngredient(ing.item_id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Sub-Recipes Tab */}
            <TabsContent value="subrecipes" className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Select onValueChange={addSubRecipe}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={t("addSubRecipe")} /></SelectTrigger>
                  <SelectContent>
                    {availableSubRecipes.map(r => (
                      <SelectItem key={r.recipe_id} value={r.recipe_id}>
                        <div className="flex items-center gap-2">
                          <Badge variant={getTypeBadgeVariant(r.recipe_type)} className="text-xs">
                            {t(r.recipe_type)}
                          </Badge>
                          {r.name} (${r.cost_per_yield?.toFixed(2)}/{r.yield_unit})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {recipeForm.sub_recipes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{language === "es" ? "Sin sub-recetas" : "No sub-recipes added"}</p>
                  <p className="text-sm">{language === "es" ? "Agrega salsas, stocks o componentes" : "Add sauces, stocks, or components"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Sub-Receta" : "Sub-Recipe"}</TableHead>
                      <TableHead className="w-24">{t("quantity")}</TableHead>
                      <TableHead className="w-20">{t("unit")}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipeForm.sub_recipes.map(sub => (
                      <TableRow key={sub.child_recipe_id}>
                        <TableCell className="font-medium">{sub.child_recipe_name}</TableCell>
                        <TableCell>
                          <Input type="number" min="0" step="0.01" className="w-20" value={sub.quantity_used} onChange={(e) => updateSubRecipe(sub.child_recipe_id, "quantity_used", parseFloat(e.target.value) || 0)} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{sub.unit}</TableCell>
                        <TableCell className="text-right font-mono">${sub.total_cost?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeSubRecipe(sub.child_recipe_id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Costing Tab */}
            <TabsContent value="costing" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    {language === "es" ? "Resumen de Costos" : "Cost Summary"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">{language === "es" ? "Costo Ingredientes" : "Ingredients Cost"}</p>
                      <p className="text-2xl font-bold">${recipeForm.ingredients.reduce((sum, i) => sum + (i.total_cost || 0), 0).toFixed(2)}</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">{language === "es" ? "Costo Sub-Recetas" : "Sub-Recipes Cost"}</p>
                      <p className="text-2xl font-bold">${recipeForm.sub_recipes.reduce((sum, s) => sum + (s.total_cost || 0), 0).toFixed(2)}</p>
                    </div>
                    <div className="p-4 bg-primary/10 rounded-lg">
                      <p className="text-sm text-muted-foreground">{t("totalCost")}</p>
                      <p className="text-3xl font-bold text-primary">${calculateTotalCost().toFixed(2)}</p>
                    </div>
                    <div className="p-4 bg-green-100 dark:bg-green-900/20 rounded-lg">
                      <p className="text-sm text-muted-foreground">{t("costPerPortion")}</p>
                      <p className="text-3xl font-bold text-green-600">
                        ${(calculateTotalCost() / (recipeForm.yield_quantity * recipeForm.portions_per_yield) || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <Label>{t("sellPrice")}</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <Input type="number" min="0" step="0.01" value={recipeForm.sell_price} onChange={(e) => setRecipeForm({ ...recipeForm, sell_price: parseFloat(e.target.value) || 0 })} className="w-32" />
                      {recipeForm.sell_price > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{t("foodCost")}:</span>
                          <Badge variant={
                            (calculateTotalCost() / (recipeForm.yield_quantity * recipeForm.portions_per_yield) / recipeForm.sell_price * 100) > 35 
                              ? "destructive" 
                              : "success"
                          }>
                            {((calculateTotalCost() / (recipeForm.yield_quantity * recipeForm.portions_per_yield) / recipeForm.sell_price * 100) || 0).toFixed(1)}%
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
