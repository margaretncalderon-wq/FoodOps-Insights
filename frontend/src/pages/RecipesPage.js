import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, ChefHat, Clock, DollarSign, MoreHorizontal, Trash2, Edit } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";


export default function RecipesPage() {
  const { t, language } = useLanguage();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchRecipes();
  }, []);

  const fetchRecipes = async () => {
    try {
      const response = await axios.get(`${API}/recipes`, { withCredentials: true });
      setRecipes(response.data);
    } catch (error) {
      console.error("Failed to fetch recipes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recipeId) => {
    if (!confirm(language === "es" ? "¿Eliminar receta?" : "Delete recipe?")) return;
    try {
      await axios.delete(`${API}/recipes/${recipeId}`, { withCredentials: true });
      toast.success(language === "es" ? "Receta eliminada" : "Recipe deleted");
      fetchRecipes();
    } catch (error) {
      toast.error("Failed to delete recipe");
    }
  };

  const filteredRecipes = recipes.filter((recipe) =>
    recipe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    recipe.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = [...new Set(recipes.map((r) => r.category))];

  return (
    <Layout>
      <div className="space-y-6" data-testid="recipes-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">{t("recipes")}</h1>
            <p className="text-muted-foreground mt-1">
              {language === "es" ? "Gestiona tus recetas y costos" : "Manage your recipes and costs"}
            </p>
          </div>
          <Link to="/recipes/new">
            <Button className="rounded-full gap-2" data-testid="add-recipe-btn">
              <Plus className="w-4 h-4" />
              {t("addRecipe")}
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="recipe-search-input"
          />
        </div>

        {/* Categories filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={!searchTerm ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSearchTerm("")}
            >
              {language === "es" ? "Todos" : "All"}
            </Badge>
            {categories.map((category) => (
              <Badge
                key={category}
                variant={searchTerm === category ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSearchTerm(category)}
              >
                {category}
              </Badge>
            ))}
          </div>
        )}

        {/* Recipes Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => (
            <Card
              key={recipe.recipe_id}
              className="hover:shadow-card transition-all duration-300 group overflow-hidden"
              data-testid={`recipe-card-${recipe.recipe_id}`}
            >
              {recipe.image_url && (
                <div className="aspect-video relative overflow-hidden">
                  <img
                    src={recipe.image_url}
                    alt={recipe.name}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <Badge variant="outline">{recipe.category}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/recipes/${recipe.recipe_id}`}>
                          <Edit className="w-4 h-4 mr-2" />
                          {t("edit")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(recipe.recipe_id)} className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Link to={`/recipes/${recipe.recipe_id}`}>
                  <h3 className="font-heading text-xl font-semibold mb-2 hover:text-primary transition-colors">
                    {recipe.name}
                  </h3>
                </Link>
                {recipe.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{recipe.description}</p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)}m
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ChefHat className="w-4 h-4" />
                      {recipe.yield_quantity || recipe.servings || 1}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 font-medium text-primary">
                    <DollarSign className="w-4 h-4" />
                    {(recipe.cost_per_portion || recipe.cost_per_serving || 0).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredRecipes.length === 0 && (
            <div className="col-span-full text-center py-12">
              <ChefHat className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">{t("noResults")}</p>
              <Link to="/recipes/new" className="mt-4 inline-block">
                <Button variant="outline">{t("addRecipe")}</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
