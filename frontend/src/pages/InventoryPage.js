import { useEffect, useState } from "react";
import { API } from "../utils/api";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Package, AlertTriangle, Truck, MoreHorizontal, Trash2, Edit } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { fmtNum } from "../utils/format";


const CATEGORIES = ["produce", "meat", "dairy", "dry_goods", "spices", "beverages", "other"];
const UNITS = ["kg", "g", "lb", "oz", "l", "ml", "unit", "dozen", "bunch"];

export default function InventoryPage() {
  const { t, language } = useLanguage();
  const [ingredients, setIngredients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [ingredientDialogOpen, setIngredientDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [ingredientForm, setIngredientForm] = useState({
    name: "",
    category: "produce",
    unit: "kg",
    cost_per_unit: 0,
    stock_quantity: 0,
    min_stock_level: 0,
    supplier_id: "",
  });
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ingredientsRes, suppliersRes, lowStockRes] = await Promise.all([
        axios.get(`${API}/inventory/ingredients`, { withCredentials: true }),
        axios.get(`${API}/inventory/suppliers`, { withCredentials: true }),
        axios.get(`${API}/inventory/low-stock`, { withCredentials: true }),
      ]);
      setIngredients(ingredientsRes.data);
      setSuppliers(suppliersRes.data);
      setLowStock(lowStockRes.data);
    } catch (error) {
      console.error("Failed to fetch inventory:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitIngredient = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...ingredientForm,
        cost_per_unit: parseFloat(ingredientForm.cost_per_unit) || 0,
        stock_quantity: parseFloat(ingredientForm.stock_quantity) || 0,
        min_stock_level: parseFloat(ingredientForm.min_stock_level) || 0,
      };
      if (editingIngredient) {
        await axios.put(`${API}/inventory/ingredients/${editingIngredient.ingredient_id}`, payload, {
          withCredentials: true,
        });
        toast.success(language === "es" ? "Ingrediente actualizado" : "Ingredient updated");
      } else {
        await axios.post(`${API}/inventory/ingredients`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Ingrediente creado" : "Ingredient created");
      }
      fetchData();
      setIngredientDialogOpen(false);
      resetIngredientForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save ingredient");
    }
  };

  const handleSubmitSupplier = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/inventory/suppliers`, supplierForm, { withCredentials: true });
      toast.success(language === "es" ? "Proveedor creado" : "Supplier created");
      fetchData();
      setSupplierDialogOpen(false);
      setSupplierForm({ name: "", contact_name: "", email: "", phone: "", address: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save supplier");
    }
  };

  const handleDeleteIngredient = async (ingredientId) => {
    if (!confirm(language === "es" ? "¿Eliminar ingrediente?" : "Delete ingredient?")) return;
    try {
      await axios.delete(`${API}/inventory/ingredients/${ingredientId}`, { withCredentials: true });
      toast.success(language === "es" ? "Ingrediente eliminado" : "Ingredient deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete ingredient");
    }
  };

  const handleEditIngredient = (ingredient) => {
    setEditingIngredient(ingredient);
    setIngredientForm({
      name: ingredient.name,
      category: ingredient.category,
      unit: ingredient.unit,
      cost_per_unit: ingredient.cost_per_unit,
      stock_quantity: ingredient.stock_quantity,
      min_stock_level: ingredient.min_stock_level,
      supplier_id: ingredient.supplier_id || "",
    });
    setIngredientDialogOpen(true);
  };

  const resetIngredientForm = () => {
    setEditingIngredient(null);
    setIngredientForm({
      name: "",
      category: "produce",
      unit: "kg",
      cost_per_unit: 0,
      stock_quantity: 0,
      min_stock_level: 0,
      supplier_id: "",
    });
  };

  const filteredIngredients = ingredients.filter(
    (ing) =>
      ing.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ing.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6" data-testid="inventory-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">{t("inventory")}</h1>
            <p className="text-muted-foreground mt-1">
              {language === "es" ? "Gestiona ingredientes y proveedores" : "Manage ingredients and suppliers"}
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Truck className="w-4 h-4" />
                  {t("addSupplier")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-heading">{t("addSupplier")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitSupplier} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("name")} *</Label>
                    <Input
                      value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Contacto" : "Contact"}</Label>
                      <Input
                        value={supplierForm.contact_name}
                        onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("phone")}</Label>
                      <Input
                        value={supplierForm.phone}
                        onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("email")}</Label>
                    <Input
                      type="email"
                      value={supplierForm.email}
                      onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("address")}</Label>
                    <Input
                      value={supplierForm.address}
                      onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setSupplierDialogOpen(false)}>
                      {t("cancel")}
                    </Button>
                    <Button type="submit">{t("save")}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog
              open={ingredientDialogOpen}
              onOpenChange={(open) => {
                setIngredientDialogOpen(open);
                if (!open) resetIngredientForm();
              }}
            >
              <DialogTrigger asChild>
                <Button className="rounded-full gap-2" data-testid="add-ingredient-btn">
                  <Plus className="w-4 h-4" />
                  {t("addIngredient")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-heading">
                    {editingIngredient ? t("edit") : t("addIngredient")}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitIngredient} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("name")} *</Label>
                    <Input
                      value={ingredientForm.name}
                      onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                      required
                      data-testid="ingredient-name-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("category")}</Label>
                      <Select
                        value={ingredientForm.category}
                        onValueChange={(value) => setIngredientForm({ ...ingredientForm, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat.replace("_", " ").charAt(0).toUpperCase() + cat.slice(1).replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("unit")}</Label>
                      <Select
                        value={ingredientForm.unit}
                        onValueChange={(value) => setIngredientForm({ ...ingredientForm, unit: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t("costPerUnit")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={ingredientForm.cost_per_unit}
                        onChange={(e) => setIngredientForm({ ...ingredientForm, cost_per_unit: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("stockQuantity")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={ingredientForm.stock_quantity}
                        onChange={(e) => setIngredientForm({ ...ingredientForm, stock_quantity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("minStockLevel")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={ingredientForm.min_stock_level}
                        onChange={(e) => setIngredientForm({ ...ingredientForm, min_stock_level: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("supplier")}</Label>
                    <Select
                      value={ingredientForm.supplier_id}
                      onValueChange={(value) => setIngredientForm({ ...ingredientForm, supplier_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((sup) => (
                          <SelectItem key={sup.supplier_id} value={sup.supplier_id}>
                            {sup.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIngredientDialogOpen(false)}>
                      {t("cancel")}
                    </Button>
                    <Button type="submit" data-testid="save-ingredient-btn">
                      {t("save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <Card className="border-warning bg-warning/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <span className="font-medium text-warning">
                  {lowStock.length} {language === "es" ? "ingredientes con stock bajo" : "ingredients with low stock"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="ingredients" className="space-y-6">
          <TabsList>
            <TabsTrigger value="ingredients">{t("ingredients")}</TabsTrigger>
            <TabsTrigger value="suppliers">{t("suppliers")}</TabsTrigger>
          </TabsList>

          {/* Ingredients Tab */}
          <TabsContent value="ingredients">
            {/* Search */}
            <div className="relative max-w-md mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-4 font-medium">{t("name")}</th>
                        <th className="text-left p-4 font-medium">{t("category")}</th>
                        <th className="text-right p-4 font-medium">{t("stockQuantity")}</th>
                        <th className="text-right p-4 font-medium">{t("costPerUnit")}</th>
                        <th className="text-right p-4 font-medium">{t("actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIngredients.map((ing) => (
                        <tr
                          key={ing.ingredient_id}
                          className="border-b hover:bg-muted/30 transition-colors"
                          data-testid={`ingredient-row-${ing.ingredient_id}`}
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                                <Package className="w-5 h-5 text-secondary-foreground" />
                              </div>
                              <span className="font-medium">{ing.name}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="capitalize">
                              {ing.category.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="p-4 text-right">
                            <span
                              className={
                                ing.stock_quantity <= ing.min_stock_level
                                  ? "text-destructive font-medium"
                                  : ""
                              }
                            >
                              {ing.stock_quantity} {ing.unit}
                            </span>
                            {ing.stock_quantity <= ing.min_stock_level && (
                              <AlertTriangle className="w-4 h-4 text-warning inline ml-2" />
                            )}
                          </td>
                          <td className="p-4 text-right font-mono">
                            ${fmtNum(ing.cost_per_unit)}/{ing.unit}
                          </td>
                          <td className="p-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditIngredient(ing)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  {t("edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteIngredient(ing.ingredient_id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t("delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                      {filteredIngredients.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-muted-foreground">
                            {t("noResults")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Suppliers Tab */}
          <TabsContent value="suppliers">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {suppliers.map((supplier) => (
                <Card key={supplier.supplier_id} className="hover:shadow-card transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Truck className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-heading font-semibold">{supplier.name}</h3>
                        {supplier.contact_name && (
                          <p className="text-sm text-muted-foreground">{supplier.contact_name}</p>
                        )}
                        {supplier.email && (
                          <a href={`mailto:${supplier.email}`} className="text-sm text-primary hover:underline block mt-1">
                            {supplier.email}
                          </a>
                        )}
                        {supplier.phone && (
                          <p className="text-sm text-muted-foreground mt-1">{supplier.phone}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {suppliers.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Truck className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">{t("noResults")}</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
