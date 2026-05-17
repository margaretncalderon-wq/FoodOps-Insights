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
import { SearchableSelect } from "./ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

// Icons
import { 
  Plus, X, GripVertical, ChefHat, Utensils, Check, RefreshCw,
  DollarSign, Users, Percent, Target, Info, Lightbulb
} from "lucide-react";

import { API_BASE as API } from "../utils/api";

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
  const [portionFormats, setPortionFormats] = useState({}); // Store portion formats by recipe_id
  const [selectedFormat, setSelectedFormat] = useState({}); // Store selected format per recipe
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    menu_type: "plated",
    pricing_model: "per_guest",
    serving_style: "plated",
    courses: [],
    buffer_percentage: 10,
    notes: "",
    // Enhanced pricing fields
    default_guest_count: 50,
    sell_price_per_guest: 0,
    target_margin_pct: 35,
    tax_included: false,
    // Buffet selection package fields
    base_price_per_guest: 0
  });

  // Load portion formats for a recipe
  const loadPortionFormats = async (recipeId) => {
    if (portionFormats[recipeId]) return portionFormats[recipeId];
    try {
      const res = await axios.get(`${API}/api/recipes/${recipeId}/portion-formats`, { withCredentials: true });
      setPortionFormats(prev => ({ ...prev, [recipeId]: res.data }));
      return res.data;
    } catch (error) {
      console.error("Error loading portion formats", error);
      return [];
    }
  };

  useEffect(() => {
    if (initialMenu) {
      setForm({
        name: initialMenu.name || "",
        description: initialMenu.description || "",
        menu_type: initialMenu.menu_type || "plated",
        pricing_model: initialMenu.pricing_model || "per_guest",
        serving_style: initialMenu.serving_style || "plated",
        courses: initialMenu.courses || [],
        buffer_percentage: initialMenu.buffer_percentage || 10,
        notes: initialMenu.notes || "",
        default_guest_count: initialMenu.default_guest_count || 50,
        sell_price_per_guest: initialMenu.sell_price_per_guest || 0,
        target_margin_pct: initialMenu.target_margin_pct || 35,
        tax_included: initialMenu.tax_included || false,
        base_price_per_guest: initialMenu.base_price_per_guest || 0
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
      // Enhanced pricing translations
      pricing: { en: "Pricing", es: "Precios" },
      defaultGuestCount: { en: "Default Guest Count", es: "Comensales por Defecto" },
      sellPricePerGuest: { en: "Sell Price per Guest", es: "Precio por Comensal" },
      targetMargin: { en: "Target Margin %", es: "Margen Objetivo %" },
      suggestedPrice: { en: "Suggested Price", es: "Precio Sugerido" },
      taxIncluded: { en: "Tax Included", es: "Impuesto Incluido" },
      actualMargin: { en: "Actual Margin", es: "Margen Real" },
      totalRevenue: { en: "Total Revenue", es: "Ingreso Total" },
      totalCost: { en: "Total Cost", es: "Costo Total" },
      profit: { en: "Profit", es: "Ganancia" },
      pricingTip: { en: "Set your target margin to auto-calculate suggested price", es: "Define tu margen objetivo para calcular precio sugerido" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  };

  // Add a new course
  const addCourse = (courseType = null) => {
    const courseId = `course_${Date.now()}`;
    const defaultCourse = courseType ? DEFAULT_COURSES.find(c => c.name === courseType) : null;
    
    setForm(prev => ({
      ...prev,
      courses: [...prev.courses, {
        course_id: courseId,
        course_name: defaultCourse ? defaultCourse.name : "",
        course_order: prev.courses.length,
        items: [],
        min_choices: null,
        max_choices: null,
        extra_choice_price: 0
      }]
    }));
  };

  const updateCourseRule = (courseId, field, value) => {
    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => c.course_id === courseId ? { ...c, [field]: value } : c)
    }));
  };

  const removeCourse = (courseId) => {
    setForm(prev => ({ ...prev, courses: prev.courses.filter(c => c.course_id !== courseId) }));
  };

  const updateCourseName = (courseId, name) => {
    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => c.course_id === courseId ? { ...c, course_name: name } : c)
    }));
  };

  const addDishToCourse = async (courseId, recipeId) => {
    const recipe = recipes.find(r => r.recipe_id === recipeId);
    if (!recipe) return;

    // Load portion formats for this recipe
    const formats = await loadPortionFormats(recipeId);
    
    // Get default format or use recipe's base cost
    const defaultFormat = formats.find(f => f.is_default) || formats[0];
    const costPerPortion = defaultFormat?.cost_per_portion || recipe.cost_per_portion || 0;
    const formatId = defaultFormat?.format_id || null;
    const formatName = defaultFormat?.format_name || null;

    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => {
        if (c.course_id !== courseId) return c;
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
            cost_per_portion: costPerPortion,
            portion_format_id: formatId,
            portion_format_name: formatName,
            notes: ""
          }]
        };
      })
    }));
  };

  const updateDishPortionFormat = (courseId, recipeId, formatId) => {
    const formats = portionFormats[recipeId] || [];
    const selectedFmt = formats.find(f => f.format_id === formatId);
    
    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => {
        if (c.course_id !== courseId) return c;
        return {
          ...c,
          items: c.items.map(item => 
            item.recipe_id === recipeId 
              ? { 
                  ...item, 
                  portion_format_id: formatId,
                  portion_format_name: selectedFmt?.format_name || null,
                  cost_per_portion: selectedFmt?.cost_per_portion || item.cost_per_portion
                }
              : item
          )
        };
      })
    }));
  };

  const removeDishFromCourse = (courseId, recipeId) => {
    setForm(prev => ({
      ...prev,
      courses: prev.courses.map(c => {
        if (c.course_id !== courseId) return c;
        return { ...c, items: c.items.filter(item => item.recipe_id !== recipeId) };
      })
    }));
  };

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

  // Calculate costs
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
  
  // Calculate suggested price based on target margin
  const suggestedPricePerGuest = form.target_margin_pct > 0 && form.target_margin_pct < 100
    ? costWithBuffer / (1 - form.target_margin_pct / 100)
    : costWithBuffer * 1.5;
  
  // Calculate actual margin based on sell price
  const actualMarginPct = form.sell_price_per_guest > 0
    ? ((form.sell_price_per_guest - costWithBuffer) / form.sell_price_per_guest * 100)
    : 0;
  
  // Calculate totals for default guest count
  const totalRevenue = form.sell_price_per_guest * form.default_guest_count;
  const totalCost = costWithBuffer * form.default_guest_count;
  const totalProfit = totalRevenue - totalCost;

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
        cost_with_buffer: costWithBuffer,
        suggested_sell_price_per_guest: suggestedPricePerGuest
      };
      
      if (initialMenu) {
        await axios.put(`${API}/api/plated-menus/${initialMenu.menu_id}`, payload, { withCredentials: true });
        // Update extended fields
        await axios.put(`${API}/api/plated-menus/${initialMenu.menu_id}/extended`, {
          default_guest_count: form.default_guest_count,
          sell_price_per_guest: form.sell_price_per_guest,
          target_margin_pct: form.target_margin_pct,
          tax_included: form.tax_included
        }, { withCredentials: true });
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

  // Use suggested price
  const useSuggestedPrice = () => {
    setForm(prev => ({ ...prev, sell_price_per_guest: Math.ceil(suggestedPricePerGuest) }));
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
      </div>

      {/* Courses Section */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{t("courses")}</h3>
            <Badge variant="outline">{form.courses.length}</Badge>
          </div>
          <Select onValueChange={(v) => addCourse(v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t("addCourse")} /></SelectTrigger>
            <SelectContent>
              {DEFAULT_COURSES.map(course => (
                <SelectItem key={course.name} value={course.name}>
                  {language === "es" ? course.labelEs : course.labelEn}
                </SelectItem>
              ))}
              <SelectItem value="custom">{language === "es" ? "Tiempo Personalizado" : "Custom Course"}</SelectItem>
            </SelectContent>
          </Select>
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
                    <span className="text-sm font-semibold text-muted-foreground">{courseIndex + 1}.</span>
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
                    {finalDishRecipes.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground border rounded">
                        {language === "es" ? "Crea recetas tipo 'Plato Final' primero" : "Create 'Final Dish' recipes first"}
                      </div>
                    ) : (
                      <SearchableSelect
                        value={null}
                        onValueChange={(rid) => { if (rid) addDishToCourse(course.course_id, rid); }}
                        options={[...finalDishRecipes]
                          .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                          .map(r => ({
                            value: r.recipe_id,
                            label: r.name,
                            secondary: r.cost_per_portion != null ? `$${(r.cost_per_portion || 0).toFixed(2)}` : null,
                            keywords: [r.recipe_code || ""].filter(Boolean),
                          }))}
                        placeholder={t("addDish")}
                        searchPlaceholder={language === "es" ? "Buscar receta..." : "Search recipe..."}
                        emptyText={language === "es" ? "Sin resultados" : "No results"}
                        triggerClassName="w-56 h-8 text-xs"
                        contentClassName="min-w-[18rem]"
                        testId={`add-dish-${course.course_id}`}
                      />
                    )}
                    <Button variant="ghost" size="icon" onClick={() => removeCourse(course.course_id)}>
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  {/* Buffet selection rules: Min/Max choices and extra price (visible when buffet/cocktail/etc.) */}
                  {(form.menu_type === "buffet" || form.menu_type === "cocktail" || form.menu_type === "grab_and_go") && (
                    <div className="mb-3 p-3 bg-amber-50/60 border border-amber-200 rounded-md grid grid-cols-1 md:grid-cols-3 gap-3" data-testid={`course-rules-${course.course_id}`}>
                      <div>
                        <Label className="text-xs">{language === "es" ? "Mín. a elegir" : "Min choices"}</Label>
                        <Input
                          type="number" min="0" step="1"
                          className="h-8 text-xs"
                          value={course.min_choices ?? ""}
                          onChange={(e) => updateCourseRule(course.course_id, "min_choices", e.target.value === "" ? null : parseInt(e.target.value))}
                          placeholder={language === "es" ? "sin regla" : "no rule"}
                          data-testid={`course-min-${course.course_id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{language === "es" ? "Máx. incluidas" : "Max in base price"}</Label>
                        <Input
                          type="number" min="0" step="1"
                          className="h-8 text-xs"
                          value={course.max_choices ?? ""}
                          onChange={(e) => updateCourseRule(course.course_id, "max_choices", e.target.value === "" ? null : parseInt(e.target.value))}
                          placeholder={language === "es" ? "todas" : "all"}
                          data-testid={`course-max-${course.course_id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{language === "es" ? "Precio extra c/u (por invitado)" : "Extra price each (per guest)"}</Label>
                        <Input
                          type="number" min="0" step="0.01"
                          className="h-8 text-xs"
                          value={course.extra_choice_price ?? 0}
                          onChange={(e) => updateCourseRule(course.course_id, "extra_choice_price", parseFloat(e.target.value) || 0)}
                          data-testid={`course-extra-${course.course_id}`}
                        />
                      </div>
                      <div className="md:col-span-3 text-xs text-amber-700">
                        {language === "es"
                          ? `Ej: "Elige ${course.min_choices || 1} de ${(course.items || []).length}". Si eligen más de ${course.max_choices ?? "todas"}, se cobra $${(course.extra_choice_price || 0).toFixed(2)} extra por invitado por cada adicional.`
                          : `E.g., "Choose ${course.min_choices || 1} of ${(course.items || []).length}". Selecting more than ${course.max_choices ?? "all"} adds $${(course.extra_choice_price || 0).toFixed(2)} per guest each.`}
                      </div>
                    </div>
                  )}
                  {course.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("noDishes")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === "es" ? "Plato" : "Dish"}</TableHead>
                          <TableHead className="w-40">{language === "es" ? "Formato" : "Format"}</TableHead>
                          <TableHead className="w-24 text-right">{t("portionsPerGuest")}</TableHead>
                          <TableHead className="w-24 text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {course.items.map(item => {
                          const recipe = recipes.find(r => r.recipe_id === item.recipe_id);
                          const formats = portionFormats[item.recipe_id] || [];
                          const costPerPortion = item.cost_per_portion || recipe?.cost_per_portion || 0;
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
                                {formats.length > 0 ? (
                                  <Select 
                                    value={item.portion_format_id || "default"} 
                                    onValueChange={(v) => updateDishPortionFormat(course.course_id, item.recipe_id, v === "default" ? null : v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder={language === "es" ? "Estándar" : "Standard"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="default">{language === "es" ? "Estándar" : "Standard"} (${recipe?.cost_per_portion?.toFixed(2) || "0.00"})</SelectItem>
                                      {formats.map(fmt => (
                                        <SelectItem key={fmt.format_id} value={fmt.format_id}>
                                          {fmt.format_name} (${fmt.cost_per_portion?.toFixed(2)})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{language === "es" ? "Estándar" : "Standard"}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Input 
                                  type="number" min="0.1" step="0.1"
                                  className="w-16 text-right ml-auto h-8 text-xs"
                                  value={item.portions_per_guest} 
                                  onChange={(e) => updateDishPortions(course.course_id, item.recipe_id, e.target.value)}
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">${lineCost.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeDishFromCourse(course.course_id, item.recipe_id)}>
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

      {/* ENHANCED PRICING SECTION */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">{t("pricing")}</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger><Info className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent><p className="max-w-xs">{t("pricingTip")}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>{t("bufferPercent")}</Label>
            <Input 
              type="number" min="0" max="50"
              value={form.buffer_percentage} 
              onChange={(e) => setForm(prev => ({ ...prev, buffer_percentage: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label>{t("defaultGuestCount")}</Label>
            <Input 
              type="number" min="1"
              value={form.default_guest_count} 
              onChange={(e) => setForm(prev => ({ ...prev, default_guest_count: parseInt(e.target.value) || 50 }))}
            />
          </div>
          <div>
            <Label>{t("targetMargin")} %</Label>
            <Input 
              type="number" min="0" max="99" step="1"
              value={form.target_margin_pct} 
              onChange={(e) => setForm(prev => ({ ...prev, target_margin_pct: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <Label>{t("sellPricePerGuest")}</Label>
            <div className="flex gap-2">
              <Input 
                type="number" min="0" step="0.01"
                value={form.sell_price_per_guest} 
                onChange={(e) => setForm(prev => ({ ...prev, sell_price_per_guest: parseFloat(e.target.value) || 0 }))}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={useSuggestedPrice}>
                      <Lightbulb className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("suggestedPrice")}: ${suggestedPricePerGuest.toFixed(2)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Buffet base package price (per guest) */}
        <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-md flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs flex items-center gap-1">
              {language === "es" ? "Precio Base por Invitado (Paquete Buffet)" : "Base Price per Guest (Buffet Package)"}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      {language === "es"
                        ? "Si está > 0, este precio se usa al cotizar el menú como paquete. Los extras seleccionados (más allá del máx. por curso) suman al total."
                        : "If > 0, this is used when quoting the menu as a package. Extra selections beyond the max per course add to the total."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              type="number" min="0" step="0.01"
              value={form.base_price_per_guest}
              onChange={(e) => setForm(prev => ({ ...prev, base_price_per_guest: parseFloat(e.target.value) || 0 }))}
              data-testid="menu-base-price-per-guest"
            />
          </div>
          <div className="text-xs text-amber-800 md:max-w-xs">
            {language === "es"
              ? "Deja en 0 para usar la suma de precios de recetas."
              : "Leave at 0 to use the sum of recipe prices."}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox 
            id="tax_included"
            checked={form.tax_included}
            onCheckedChange={(c) => setForm(prev => ({ ...prev, tax_included: c }))}
          />
          <Label htmlFor="tax_included" className="cursor-pointer">{t("taxIncluded")}</Label>
        </div>

        {/* Cost Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 border-t">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <DollarSign className="w-3 h-3" />
              {t("costPerGuest")}
            </div>
            <p className="text-xl font-bold">${costPerGuest.toFixed(2)}</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <Percent className="w-3 h-3" />
              {t("costWithBuffer")}
            </div>
            <p className="text-xl font-bold">${costWithBuffer.toFixed(2)}</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-center gap-1 text-xs text-blue-600 mb-1">
              <Lightbulb className="w-3 h-3" />
              {t("suggestedPrice")}
            </div>
            <p className="text-xl font-bold text-blue-600">${suggestedPricePerGuest.toFixed(2)}</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              <Target className="w-3 h-3" />
              {t("actualMargin")}
            </div>
            <p className={`text-xl font-bold ${actualMarginPct < 30 ? "text-red-500" : actualMarginPct < 40 ? "text-yellow-500" : "text-green-500"}`}>
              {actualMarginPct.toFixed(1)}%
            </p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-center gap-1 text-xs text-green-600 mb-1">
              <Users className="w-3 h-3" />
              {t("profit")} ({form.default_guest_count} pax)
            </div>
            <p className={`text-xl font-bold ${totalProfit < 0 ? "text-red-500" : "text-green-600"}`}>
              ${totalProfit.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Revenue breakdown for default guest count */}
        {form.sell_price_per_guest > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg text-sm">
            <p className="font-medium mb-2">{language === "es" ? "Resumen para" : "Summary for"} {form.default_guest_count} {language === "es" ? "comensales" : "guests"}:</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-muted-foreground">{t("totalRevenue")}</p>
                <p className="font-semibold text-lg">${totalRevenue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("totalCost")}</p>
                <p className="font-semibold text-lg">${totalCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("profit")}</p>
                <p className={`font-semibold text-lg ${totalProfit < 0 ? "text-red-500" : "text-green-600"}`}>
                  ${totalProfit.toFixed(2)}
                </p>
              </div>
            </div>
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

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onClose} disabled={loading}>{t("cancel")}</Button>
        <Button onClick={handleSave} disabled={loading || !form.name.trim()}>
          {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
