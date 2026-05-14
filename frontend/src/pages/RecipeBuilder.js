import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Sparkles, Loader2 } from "lucide-react";


const CATEGORIES = ["appetizer", "main", "dessert", "beverage", "side", "sauce", "other"];

export default function RecipeBuilder() {
  const { recipeId } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "main",
    servings: 1,
    prep_time_minutes: 0,
    cook_time_minutes: 0,
    instructions: [""],
    image_url: "",
  });
  const [ingredientForm, setIngredientForm] = useState({
    ingredient_id: "",
    name: "",
    quantity: 0,
    unit: "kg",
    cost_per_unit: 0,
  });

  useEffect(() => {
    if (recipeId) {
      fetchRecipe();
    }
    fetchIngredients();
  }, [recipeId]);

  const fetchRecipe = async () => {
    try {
      const response = await axios.get(`${API}/recipes/${recipeId}`, { withCredentials: true });
      const recipe = response.data;
      setFormData({
        name: recipe.name,
        description: recipe.description || "",
        category: recipe.category,
        servings: recipe.servings,
        prep_time_minutes: recipe.prep_time_minutes,
        cook_time_minutes: recipe.cook_time_minutes,
        instructions: recipe.instructions && recipe.instructions.length > 0 ? recipe.instructions : [""],
        image_url: recipe.image_url || "",
      });
      setIngredientsList(recipe.ingredients || []);
    } catch (error) {
      console.error("Failed to fetch recipe:", error);
      toast.error("Recipe not found");
      navigate("/recipes");
    }
  };

  const fetchIngredients = async () => {
    try {
      const response = await axios.get(`${API}/inventory/ingredients`, { withCredentials: true });
      setIngredients(response.data);
    } catch (error) {
      console.error("Failed to fetch ingredients:", error);
    }
  };

  const [ingredientsList, setIngredientsList] = useState([]);

  const handleAddIngredient = () => {
    if (!ingredientForm.name || ingredientForm.quantity <= 0) {
      toast.error(language === "es" ? "Complete los datos del ingrediente" : "Fill in ingredient details");
      return;
    }
    setIngredientsList([
      ...ingredientsList,
      {
        ...ingredientForm,
        ingredient_id: ingredientForm.ingredient_id || `temp_${Date.now()}`,
      },
    ]);
    setIngredientForm({ ingredient_id: "", name: "", quantity: 0, unit: "kg", cost_per_unit: 0 });
  };

  const handleRemoveIngredient = (index) => {
    setIngredientsList(ingredientsList.filter((_, i) => i !== index));
  };

  const handleSelectIngredient = (ingredientId) => {
    const selected = ingredients.find((i) => i.ingredient_id === ingredientId);
    if (selected) {
      setIngredientForm({
        ingredient_id: selected.ingredient_id,
        name: selected.name,
        quantity: 0,
        unit: selected.unit,
        cost_per_unit: selected.cost_per_unit,
      });
    }
  };

  const handleAddInstruction = () => {
    setFormData({ ...formData, instructions: [...formData.instructions, ""] });
  };

  const handleUpdateInstruction = (index, value) => {
    const updated = [...formData.instructions];
    updated[index] = value;
    setFormData({ ...formData, instructions: updated });
  };

  const handleRemoveInstruction = (index) => {
    setFormData({
      ...formData,
      instructions: formData.instructions.filter((_, i) => i !== index),
    });
  };

  const handleAIAnalyze = async () => {
    if (!formData.name) {
      toast.error(language === "es" ? "Ingrese nombre de receta" : "Enter recipe name");
      return;
    }
    setAiLoading(true);
    try {
      const response = await axios.post(
        `${API}/recipes/ai-analyze`,
        {
          name: formData.name,
          servings: formData.servings,
          ingredients: ingredientsList.map((i) => i.name),
        },
        { withCredentials: true }
      );
      
      const suggestions = response.data;
      
      // Apply AI suggestions
      if (suggestions.estimated_prep_time_minutes) {
        setFormData((prev) => ({
          ...prev,
          prep_time_minutes: suggestions.estimated_prep_time_minutes,
          cook_time_minutes: suggestions.estimated_cook_time_minutes || prev.cook_time_minutes,
        }));
      }
      
      if (suggestions.cooking_tips?.length > 0) {
        toast.success(
          <div>
            <p className="font-medium mb-2">{language === "es" ? "Sugerencias del AI:" : "AI Suggestions:"}</p>
            <ul className="text-sm list-disc pl-4">
              {suggestions.cooking_tips.slice(0, 3).map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>,
          { duration: 10000 }
        );
      }
      
      toast.success(language === "es" ? "Análisis completado" : "Analysis complete");
    } catch (error) {
      console.error("AI analysis failed:", error);
      toast.error(language === "es" ? "Error en análisis AI" : "AI analysis failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (ingredientsList.length === 0) {
      toast.error(language === "es" ? "Agregue al menos un ingrediente" : "Add at least one ingredient");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...formData,
        instructions: Array.isArray(formData.instructions)
          ? formData.instructions.filter((i) => i.trim()).join("\n") || null
          : (formData.instructions || null),
        ingredients: ingredientsList,
      };
      
      if (recipeId) {
        await axios.put(`${API}/recipes/${recipeId}`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Receta actualizada" : "Recipe updated");
      } else {
        await axios.post(`${API}/recipes`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Receta creada" : "Recipe created");
      }
      navigate("/recipes");
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
        msg = error?.message || "Failed to save recipe";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const totalCost = ingredientsList.reduce((sum, i) => sum + i.quantity * i.cost_per_unit, 0);
  const costPerServing = formData.servings > 0 ? totalCost / formData.servings : 0;

  return (
    <Layout>
      <div className="space-y-6" data-testid="recipe-builder-page">
        {/* Back Button */}
        <Link to="/recipes" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          {language === "es" ? "Volver a Recetas" : "Back to Recipes"}
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              {recipeId ? t("edit") : t("addRecipe")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === "es" ? "Construye tu receta con costos precisos" : "Build your recipe with accurate costs"}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleAIAnalyze}
            disabled={aiLoading}
            className="gap-2"
            data-testid="ai-analyze-btn"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {t("aiAssistant")}
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">
                    {language === "es" ? "Información Básica" : "Basic Information"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("name")} *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        data-testid="recipe-name-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("category")}</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "es" ? "Descripción" : "Description"}</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("servings")}</Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.servings}
                        onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("prepTime")} (min)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.prep_time_minutes}
                        onChange={(e) => setFormData({ ...formData, prep_time_minutes: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("cookTime")} (min)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.cook_time_minutes}
                        onChange={(e) => setFormData({ ...formData, cook_time_minutes: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "es" ? "URL de Imagen" : "Image URL"}</Label>
                    <Input
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Ingredients */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">{t("ingredients")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add ingredient form */}
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4 space-y-2">
                      <Label>{t("name")}</Label>
                      <Select onValueChange={handleSelectIngredient}>
                        <SelectTrigger>
                          <SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredients.map((ing) => (
                            <SelectItem key={ing.ingredient_id} value={ing.ingredient_id}>
                              {ing.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>{language === "es" ? "Cantidad" : "Qty"}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={ingredientForm.quantity}
                        onChange={(e) => setIngredientForm({ ...ingredientForm, quantity: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>{t("unit")}</Label>
                      <Input
                        value={ingredientForm.unit}
                        onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>{language === "es" ? "Costo/U" : "Cost/U"}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={ingredientForm.cost_per_unit}
                        onChange={(e) => setIngredientForm({ ...ingredientForm, cost_per_unit: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Button type="button" onClick={handleAddIngredient} className="w-full">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {language === "es" ? "O ingresa manualmente:" : "Or enter manually:"}
                  </div>
                  <Input
                    placeholder={language === "es" ? "Nombre del ingrediente" : "Ingredient name"}
                    value={ingredientForm.name}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value, ingredient_id: "" })}
                  />

                  {/* Ingredients list */}
                  {ingredientsList.length > 0 && (
                    <div className="border rounded-lg divide-y">
                      {ingredientsList.map((ing, index) => (
                        <div key={index} className="flex items-center justify-between p-3">
                          <div className="flex-1">
                            <span className="font-medium">{ing.name}</span>
                            <span className="text-muted-foreground ml-2">
                              {ing.quantity} {ing.unit} @ ${ing.cost_per_unit}/{ing.unit}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-mono">${(ing.quantity * ing.cost_per_unit).toFixed(2)}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveIngredient(index)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Instructions */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="font-heading text-lg">{t("instructions")}</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddInstruction}>
                    <Plus className="w-4 h-4 mr-2" />
                    {language === "es" ? "Agregar Paso" : "Add Step"}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {formData.instructions.map((instruction, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {index + 1}
                      </span>
                      <Textarea
                        value={instruction}
                        onChange={(e) => handleUpdateInstruction(index, e.target.value)}
                        placeholder={language === "es" ? "Describe el paso..." : "Describe the step..."}
                        rows={2}
                        className="flex-1"
                      />
                      {formData.instructions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveInstruction(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Cost Summary Sidebar */}
            <div className="space-y-6">
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle className="font-heading text-lg">
                    {language === "es" ? "Resumen de Costos" : "Cost Summary"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">{t("ingredients")}</span>
                    <span className="font-medium">{ingredientsList.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">{t("servings")}</span>
                    <span className="font-medium">{formData.servings}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">{t("totalCost")}</span>
                    <span className="font-heading text-xl font-bold">${totalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">{t("costPerServing")}</span>
                    <span className="font-heading text-2xl font-bold text-primary">
                      ${costPerServing.toFixed(2)}
                    </span>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading} data-testid="save-recipe-btn">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("save")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}
