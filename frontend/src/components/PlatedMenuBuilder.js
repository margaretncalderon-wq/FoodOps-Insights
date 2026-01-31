import { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";

// Icons
import { 
  Plus, X, GripVertical, ChefHat, Utensils, Check, RefreshCw,
  DollarSign, Users, Percent
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const MENU_TYPES = [
  { value: "plated", label: "Plated", labelEs: "Emplatado" },
  { value: "buffet", label: "Buffet", labelEs: "Buffet" },
  { value: "cocktail", label: "Cocktail", labelEs: "Coctel" },
  { value: "grab_and_go", label: "Grab & Go", labelEs: "Para Llevar" },
];

const SERVING_STYLES = [
  { value: "plated", label: "Plated Service", labelEs: "Servicio Emplatado" },
  { value: "family_style", label: "Family Style", labelEs: "Estilo Familiar" },
  { value: "stations", label: "Stations", labelEs: "Estaciones" },
];

const DEFAULT_COURSES = [
  { name: "appetizer", labelEn: "Appetizer", labelEs: "Entrada" },
  { name: "salad", labelEn: "Salad", labelEs: "Ensalada" },
  { name: "soup", labelEn: "Soup", labelEs: "Sopa" },
  { name: "entree", labelEn: "Main Course", labelEs: "Plato Principal" },
  { name: "dessert", labelEn: "Dessert", labelEs: "Postre" },
];

export default function PlatedMenuBuilder({ onClose, onSave, initialMenu = null, recipes = [] }) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    menu_type: "plated",
    pricing_model: "per_guest",
    serving_style: "plated",
    courses: [],
    buffer_percentage: 0,
    notes: ""
  });

  useEffect(() => {
    if (initialMenu) {
      setForm({
        name: initialMenu.name || "",
        description: initialMenu.description || "",
        menu_type: initialMenu.menu_type || "plated",
        pricing_model: initialMenu.pricing_model || "per_guest",
        serving_style: initialMenu.serving_style || "plated",
        courses: initialMenu.courses || [],
        buffer_percentage: initialMenu.buffer_percentage || 0,
        notes: initialMenu.notes || ""
      });
    }
  }, [initialMenu]);

  const t = (key) => {
    const translations = {
      name: { en: "Menu Name", es: "Nombre del Menú" },
      description: { en: "Description", es: "Descripción" },
      menuType: { en: "Menu Type", es: "Tipo de Menú" },
      servingStyle: { en: "Serving Style", es: "Estilo de Servicio" },
      bufferPercent: { en: "Buffer %", es: "% Reserva" },
      courses: { en: "Courses", es: "Tiempos" },
      addCourse: { en: "Add Course", es: "Agregar Tiempo" },
      addDish: { en: "Add Dish", es: "Agregar Plato" },
      selectRecipe: { en: "Select a recipe...", es: "Seleccionar receta..." },
      notes: { en: "Notes", es: "Notas" },
      save: { en: "Save Menu", es: "Guardar Menú" },
      cancel: { en: "Cancel", es: "Cancelar" },
      costPerGuest: { en: "Cost per Guest", es: "Costo por Comensal" },
      costWithBuffer: { en: "With Buffer", es: "Con Reserva" },
      noCourses: { en: "No courses added. Click 'Add Course' to start building your menu.", es: "Sin tiempos. Haz clic en 'Agregar Tiempo' para comenzar." },
      noDishes: { en: "No dishes in this course", es: "Sin platos en este tiempo" },
      portionsPerGuest: { en: "Portions/Guest", es: "Porciones/Comensal" },
      courseName: { en: "Course Name", es: "Nombre del Tiempo" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  };

  // Add a new course
  const addCourse = (courseType = null) => {
    const courseId = `course_${Date.now()}`;
    const defaultCourse = courseType 
      ? DEFAULT_COURSES.find(c => c.name === courseType)
      : null;
    
    setForm(prev => ({
      ...prev,
      courses: [...prev.courses, {
        course_id: courseId,
        course_name: defaultCourse ? defaultCourse.name : "",
        course_order: prev.courses.length,
        items: []
      }]
    }));
  };

  // Remove a course
  const removeCourse = (courseId) => {
    setForm(prev => ({
      ...prev,
      courses: prev.courses.filter(c => c.course_id !== courseId)
    }));
  };

  // Update course name
  const updateCourseName = (courseId, name) => {
    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => 
        c.course_id === courseId ? { ...c, course_name: name } : c
      )
    }));
  };

  // Add dish to course
  const addDishToCourse = (courseId, recipeId) => {
    const recipe = recipes.find(r => r.recipe_id === recipeId);
    if (!recipe) return;

    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => {
        if (c.course_id !== courseId) return c;
        // Check if already added
        if (c.items.find(item => item.recipe_id === recipeId)) {
          toast.error(language === "es" ? "Ya agregado" : "Already added");
          return c;
        }
        return {
          ...c,
          items: [...c.items, {
            recipe_id: recipeId,
            recipe_name: recipe.name,
            portions_per_guest: 1,
            cost_per_portion: recipe.cost_per_portion || 0,
            notes: ""
          }]
        };
      })
    }));
  };

  // Remove dish from course
  const removeDishFromCourse = (courseId, recipeId) => {
    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => {
        if (c.course_id !== courseId) return c;
        return {
          ...c,
          items: c.items.filter(item => item.recipe_id !== recipeId)
        };
      })
    }));
  };

  // Update dish portions
  const updateDishPortions = (courseId, recipeId, portions) => {
    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => {
        if (c.course_id !== courseId) return c;
        return {
          ...c,
          items: c.items.map(item => 
            item.recipe_id === recipeId 
              ? { ...item, portions_per_guest: parseFloat(portions) || 1 }
              : item
          )
        };
      })
    }));
  };

  // Calculate total cost per guest
  const calculateCostPerGuest = () => {
    let total = 0;
    for (const course of form.courses) {
      for (const item of course.items) {
        const recipe = recipes.find(r => r.recipe_id === item.recipe_id);
        const costPerPortion = recipe?.cost_per_portion || item.cost_per_portion || 0;
        total += costPerPortion * (item.portions_per_guest || 1);
      }
    }
    return total;
  };

  const costPerGuest = calculateCostPerGuest();
  const costWithBuffer = costPerGuest * (1 + (form.buffer_percentage || 0) / 100);

  // Get available final dish recipes
  const finalDishRecipes = recipes.filter(r => r.recipe_type === "final_dish");

  // Save menu
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(language === "es" ? "Nombre requerido" : "Name required");
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        ...form,
        cost_per_guest: costPerGuest,
        cost_with_buffer: costWithBuffer
      };
      
      if (initialMenu) {
        await axios.put(`${API}/api/plated-menus/${initialMenu.menu_id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/plated-menus`, payload, { withCredentials: true });
      }
      toast.success(language === "es" ? "Menú guardado" : "Menu saved");
      onSave?.();
      onClose?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving menu");
    } finally {
      setLoading(false);
    }
  };

  const getCourseLabel = (name) => {
    const course = DEFAULT_COURSES.find(c => c.name === name);
    return course ? (language === "es" ? course.labelEs : course.labelEn) : name;
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>{t("name")} *</Label>
          <Input 
            value={form.name} 
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder={language === "es" ? "Ej: Menú Degustación Primavera" : "E.g., Spring Tasting Menu"}
          />
        </div>
        <div className="md:col-span-2">
          <Label>{t("description")}</Label>
          <Textarea 
            value={form.description} 
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            rows={2}
          />
        </div>
        <div>
          <Label>{t("menuType")}</Label>
          <Select value={form.menu_type} onValueChange={(v) => setForm(prev => ({ ...prev, menu_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MENU_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  {language === "es" ? type.labelEs : type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("servingStyle")}</Label>
          <Select value={form.serving_style} onValueChange={(v) => setForm(prev => ({ ...prev, serving_style: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SERVING_STYLES.map(style => (
                <SelectItem key={style.value} value={style.value}>
                  {language === "es" ? style.labelEs : style.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("bufferPercent")}</Label>
          <Input 
            type="number" 
            min="0" 
            max="50"
            value={form.buffer_percentage} 
            onChange={(e) => setForm(prev => ({ ...prev, buffer_percentage: parseFloat(e.target.value) || 0 }))}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {language === "es" ? "Porcentaje extra para merma/imprevistos" : "Extra percentage for waste/contingency"}
          </p>
        </div>
      </div>

      {/* Courses Section */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{t("courses")}</h3>
            <Badge variant="outline">{form.courses.length}</Badge>
          </div>
          <div className="flex gap-2">
            <Select onValueChange={(v) => addCourse(v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t("addCourse")} />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_COURSES.map(course => (
                  <SelectItem key={course.name} value={course.name}>
                    {language === "es" ? course.labelEs : course.labelEn}
                  </SelectItem>
                ))}
                <SelectItem value="custom">
                  {language === "es" ? "Tiempo Personalizado" : "Custom Course"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {form.courses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ChefHat className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{t("noCourses")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {form.courses.map((course, courseIndex) => (
              <Card key={course.course_id} className="border-l-4 border-l-primary">
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <span className="text-sm font-semibold text-muted-foreground">
                      {courseIndex + 1}.
                    </span>
                    {course.course_name && DEFAULT_COURSES.find(c => c.name === course.course_name) ? (
                      <span className="font-medium">{getCourseLabel(course.course_name)}</span>
                    ) : (
                      <Input 
                        value={course.course_name}
                        onChange={(e) => updateCourseName(course.course_id, e.target.value)}
                        placeholder={t("courseName")}
                        className="h-8 w-48"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(v) => addDishToCourse(course.course_id, v)}>
                      <SelectTrigger className="w-48 h-8">
                        <SelectValue placeholder={t("addDish")} />
                      </SelectTrigger>
                      <SelectContent>
                        {finalDishRecipes.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {language === "es" ? "Crea recetas tipo 'Plato Final' primero" : "Create 'Final Dish' recipes first"}
                          </div>
                        ) : (
                          finalDishRecipes.map(recipe => (
                            <SelectItem key={recipe.recipe_id} value={recipe.recipe_id}>
                              <div className="flex items-center justify-between w-full">
                                <span>{recipe.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ${recipe.cost_per_portion?.toFixed(2)}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => removeCourse(course.course_id)}>
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  {course.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("noDishes")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === "es" ? "Plato" : "Dish"}</TableHead>
                          <TableHead className="w-32 text-right">{t("portionsPerGuest")}</TableHead>
                          <TableHead className="w-28 text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {course.items.map(item => {
                          const recipe = recipes.find(r => r.recipe_id === item.recipe_id);
                          const costPerPortion = recipe?.cost_per_portion || item.cost_per_portion || 0;
                          const lineCost = costPerPortion * (item.portions_per_guest || 1);
                          return (
                            <TableRow key={item.recipe_id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Utensils className="w-4 h-4 text-green-500" />
                                  <span className="font-medium">{item.recipe_name}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input 
                                  type="number" 
                                  min="0.1" 
                                  step="0.1"
                                  className="w-20 text-right ml-auto"
                                  value={item.portions_per_guest} 
                                  onChange={(e) => updateDishPortions(course.course_id, item.recipe_id, e.target.value)}
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${lineCost.toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => removeDishFromCourse(course.course_id, item.recipe_id)}>
                                  <X className="w-4 h-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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

      {/* Cost Summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                <Users className="w-3 h-3" />
                {t("costPerGuest")}
              </div>
              <p className="text-2xl font-bold text-green-600">${costPerGuest.toFixed(2)}</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                <Percent className="w-3 h-3" />
                {t("bufferPercent")}
              </div>
              <p className="text-2xl font-bold">{form.buffer_percentage}%</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                <DollarSign className="w-3 h-3" />
                {t("costWithBuffer")}
              </div>
              <p className="text-2xl font-bold text-primary">${costWithBuffer.toFixed(2)}</p>
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
    </div>
  );
}
