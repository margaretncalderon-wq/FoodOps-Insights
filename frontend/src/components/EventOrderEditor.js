import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { toast } from "sonner";
import { 
  Plus, Trash2, FileText, Download, Eye, Utensils, Wine, 
  Armchair, Users, Flower2, Package, GripVertical, Percent,
  DollarSign, ChevronDown, ChevronRight, Loader2, AlertTriangle
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORY_ICONS = {
  utensils: Utensils,
  wine: Wine,
  armchair: Armchair,
  users: Users,
  flower: Flower2,
  package: Package,
};

export default function EventOrderEditor({ eventId, event, onDocumentGenerated }) {
  const { t, language } = useLanguage();
  const [order, setOrder] = useState(null);
  const [categories, setCategories] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Form state for new item
  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    category_id: "",
    quantity: 1,
    unit_price: 0,
    discount_amount: 0,
    recipe_id: "",
    internal_notes: "",
    event_date: "",
  });

  // Fetch all data on mount
  useEffect(() => {
    Promise.all([
      fetchOrder(),
      fetchCategories(),
      fetchTaxRates(),
      fetchPicklist(),
      fetchRecipes(),
    ]).finally(() => setLoading(false));
  }, [eventId]);

  const fetchOrder = async () => {
    try {
      const response = await axios.get(`${API}/event-orders/${eventId}`, { withCredentials: true });
      setOrder(response.data);
      // Expand all categories by default
      const expanded = {};
      response.data.items?.forEach(item => {
        expanded[item.category_id] = true;
      });
      setExpandedCategories(expanded);
    } catch (error) {
      console.error("Failed to fetch order:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/settings/categories`, { withCredentials: true });
      setCategories(response.data);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchTaxRates = async () => {
    try {
      const response = await axios.get(`${API}/settings/taxes`, { withCredentials: true });
      setTaxRates(response.data);
    } catch (error) {
      console.error("Failed to fetch taxes:", error);
    }
  };

  const fetchPicklist = async () => {
    try {
      const response = await axios.get(`${API}/settings/picklist`, { withCredentials: true });
      setPicklist(response.data);
    } catch (error) {
      console.error("Failed to fetch picklist:", error);
    }
  };

  const fetchRecipes = async () => {
    try {
      const response = await axios.get(`${API}/recipes`, { withCredentials: true });
      setRecipes(response.data);
    } catch (error) {
      console.error("Failed to fetch recipes:", error);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.category_id) {
      toast.error(language === "es" ? "Nombre y categoría son requeridos" : "Name and category are required");
      return;
    }

    try {
      await axios.post(`${API}/event-orders/${eventId}/items`, newItem, { withCredentials: true });
      toast.success(language === "es" ? "Ítem agregado" : "Item added");
      fetchOrder();
      setAddItemOpen(false);
      setNewItem({
        name: "",
        description: "",
        category_id: "",
        quantity: 1,
        unit_price: 0,
        discount_amount: 0,
        recipe_id: "",
        internal_notes: "",
        event_date: "",
      });
    } catch (error) {
      toast.error("Failed to add item");
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await axios.delete(`${API}/event-orders/${eventId}/items/${itemId}`, { withCredentials: true });
      toast.success(language === "es" ? "Ítem eliminado" : "Item deleted");
      fetchOrder();
    } catch (error) {
      toast.error("Failed to delete item");
    }
  };

  const handleUpdateOrder = async (updates) => {
    setSaving(true);
    try {
      const orderData = {
        items: order.items.map(item => ({
          name: item.name,
          description: item.description,
          category_id: item.category_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
          recipe_id: item.recipe_id,
          internal_notes: item.internal_notes,
          event_date: item.event_date,
          sort_order: item.sort_order,
        })),
        discount_amount: updates.discount_amount ?? order.discount_amount,
        tax_ids: updates.tax_ids ?? order.tax_details?.map(t => t.tax_id) ?? [],
        payment_terms: updates.payment_terms ?? order.payment_terms,
        client_notes: updates.client_notes ?? order.client_notes,
      };

      const response = await axios.put(`${API}/event-orders/${eventId}`, orderData, { withCredentials: true });
      setOrder(response.data);
      toast.success(language === "es" ? "Orden actualizada" : "Order updated");
    } catch (error) {
      toast.error("Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDocument = async (docType) => {
    try {
      const response = await axios.get(`${API}/event-orders/${eventId}/document/${docType}`, { withCredentials: true });
      toast.success(language === "es" ? "Documento generado" : "Document generated");
      if (onDocumentGenerated) onDocumentGenerated(response.data);
    } catch (error) {
      toast.error("Failed to generate document");
    }
  };

  const handleGenerateAllDocuments = async () => {
    const docTypes = ["proposal", "contract", "invoice", "kitchen_sheet", "packing_list"];
    let successCount = 0;
    
    for (const docType of docTypes) {
      try {
        const response = await axios.get(`${API}/event-orders/${eventId}/document/${docType}`, { withCredentials: true });
        if (onDocumentGenerated) onDocumentGenerated(response.data);
        successCount++;
      } catch (error) {
        console.error(`Failed to generate ${docType}:`, error);
      }
    }
    
    if (successCount === docTypes.length) {
      toast.success(language === "es" ? `${successCount} documentos generados` : `${successCount} documents generated`);
    } else {
      toast.warning(language === "es" ? `${successCount} de ${docTypes.length} documentos generados` : `${successCount} of ${docTypes.length} documents generated`);
    }
  };

  const handlePicklistSelect = (picklistItem) => {
    // Get recipe cost for price alert
    let priceAlert = null;
    if (picklistItem.recipe_id) {
      const recipe = recipes.find(r => r.recipe_id === picklistItem.recipe_id);
      if (recipe) {
        const recipeCost = recipe.cost_per_portion || recipe.cost_per_serving || 0;
        const sellPrice = picklistItem.default_price;
        const margin = sellPrice > 0 ? ((sellPrice - recipeCost) / sellPrice) * 100 : 0;
        
        if (margin < 20) {
          priceAlert = { type: "low", message: language === "es" ? `¡Alerta! Margen muy bajo (${margin.toFixed(0)}%). Costo: $${recipeCost.toFixed(2)}` : `Warning! Very low margin (${margin.toFixed(0)}%). Cost: $${recipeCost.toFixed(2)}` };
        } else if (margin > 80) {
          priceAlert = { type: "high", message: language === "es" ? `Nota: Margen alto (${margin.toFixed(0)}%). Costo: $${recipeCost.toFixed(2)}` : `Note: High margin (${margin.toFixed(0)}%). Cost: $${recipeCost.toFixed(2)}` };
        }
      }
    }

    setNewItem({
      ...newItem,
      name: picklistItem.name,
      description: picklistItem.description || "",
      category_id: picklistItem.category_id,
      unit_price: picklistItem.default_price,
      recipe_id: picklistItem.recipe_id || "",
      _priceAlert: priceAlert,
    });

    if (priceAlert) {
      if (priceAlert.type === "low") {
        toast.warning(priceAlert.message);
      } else {
        toast.info(priceAlert.message);
      }
    }
  };

  const handleRecipeSelect = (recipe) => {
    const recipeCost = recipe.cost_per_portion || recipe.cost_per_serving || 0;
    const suggestedPrice = recipeCost * 3; // 33% food cost target
    
    setNewItem({
      ...newItem,
      name: recipe.name,
      description: recipe.description || "",
      category_id: "cat_food",
      unit_price: suggestedPrice,
      recipe_id: recipe.recipe_id,
      _recipeCost: recipeCost,
    });

    toast.info(
      language === "es" 
        ? `Costo de receta: $${recipeCost.toFixed(2)}. Precio sugerido: $${suggestedPrice.toFixed(2)} (33% food cost)`
        : `Recipe cost: $${recipeCost.toFixed(2)}. Suggested price: $${suggestedPrice.toFixed(2)} (33% food cost)`
    );
  };

  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // Group items by category
  const itemsByCategory = {};
  categories.forEach(cat => {
    itemsByCategory[cat.category_id] = {
      category: cat,
      items: []
    };
  });
  
  order?.items?.forEach(item => {
    if (itemsByCategory[item.category_id]) {
      itemsByCategory[item.category_id].items.push(item);
    } else {
      // Put in "Other" if category doesn't exist
      if (itemsByCategory["cat_other"]) {
        itemsByCategory["cat_other"].items.push(item);
      }
    }
  });

  const getCategoryIcon = (iconName) => {
    const IconComponent = CATEGORY_ICONS[iconName] || Package;
    return IconComponent;
  };

  const documentTypes = [
    { type: "proposal", label: language === "es" ? "Propuesta" : "Proposal", icon: "📝" },
    { type: "contract", label: language === "es" ? "Contrato" : "Contract", icon: "📄" },
    { type: "invoice", label: language === "es" ? "Factura" : "Invoice", icon: "💰" },
    { type: "kitchen_sheet", label: language === "es" ? "Hoja de Cocina" : "Kitchen Sheet", icon: "👨‍🍳" },
    { type: "mise_en_place", label: "Mise en Place", icon: "🔪" },
    { type: "packing_list", label: language === "es" ? "Lista de Montaje" : "Packing List", icon: "📦" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="event-order-editor">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            {language === "es" ? "Contrato y Orden de Evento" : "Contract & Event Order"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {language === "es" 
              ? "Agrega ítems para generar propuestas, facturas y hojas de trabajo" 
              : "Add items to generate proposals, invoices, and work sheets"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAddItemOpen(true)} className="gap-2" data-testid="add-order-item-btn">
            <Plus className="w-4 h-4" />
            {language === "es" ? "Agregar Ítem" : "Add Item"}
          </Button>
          <Button 
            variant="secondary" 
            className="gap-2" 
            onClick={handleGenerateAllDocuments}
            disabled={!order?.items?.length}
            data-testid="generate-all-docs-btn"
          >
            <FileText className="w-4 h-4" />
            {language === "es" ? "Generar Todos los Docs" : "Generate All Docs"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="generate-doc-btn">
                <FileText className="w-4 h-4" />
                {language === "es" ? "Individual" : "Individual"}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {documentTypes.map(dt => (
                <DropdownMenuItem key={dt.type} onClick={() => handleGenerateDocument(dt.type)}>
                  <span className="mr-2">{dt.icon}</span>
                  {dt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Items by Category */}
      <div className="space-y-4">
        {Object.entries(itemsByCategory).map(([catId, { category, items }]) => {
          if (items.length === 0) return null;
          
          const IconComponent = getCategoryIcon(category.icon);
          const isExpanded = expandedCategories[catId];
          const categoryTotal = items.reduce((sum, item) => sum + item.subtotal, 0);

          return (
            <Card key={catId} data-testid={`category-${catId}`}>
              <CardHeader 
                className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
                onClick={() => toggleCategory(catId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <IconComponent className="w-4 h-4" style={{ color: category.color }} />
                    </div>
                    <div>
                      <CardTitle className="text-base font-medium">
                        {language === "es" ? category.name_es || category.name : category.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {items.length} {language === "es" ? "ítems" : "items"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    ${categoryTotal.toFixed(2)}
                  </Badge>
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="border rounded-lg divide-y">
                    {items.map((item) => (
                      <div 
                        key={item.item_id} 
                        className="flex items-center gap-4 p-3 hover:bg-muted/30 transition-colors"
                        data-testid={`order-item-${item.item_id}`}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          {item.description && (
                            <p className="text-sm text-muted-foreground truncate">{item.description}</p>
                          )}
                          {item.internal_notes && (
                            <p className="text-xs text-warning mt-1 italic">
                              📝 {item.internal_notes}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm">
                            {item.quantity} × ${item.unit_price.toFixed(2)}
                          </p>
                          {item.discount_amount > 0 && (
                            <p className="text-xs text-destructive">
                              -${item.discount_amount.toFixed(2)}
                            </p>
                          )}
                        </div>
                        <p className="font-medium w-24 text-right">
                          ${item.subtotal.toFixed(2)}
                        </p>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteItem(item.item_id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* Empty State */}
        {(!order?.items || order.items.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {language === "es" 
                  ? "No hay ítems en esta orden. Agrega ítems para comenzar." 
                  : "No items in this order. Add items to get started."}
              </p>
              <Button onClick={() => setAddItemOpen(true)} className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                {language === "es" ? "Agregar Primer Ítem" : "Add First Item"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Order Summary */}
      {order?.items?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {language === "es" ? "Resumen" : "Summary"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{language === "es" ? "Subtotal" : "Subtotal"}</span>
              <span className="font-mono">${order.subtotal?.toFixed(2) || "0.00"}</span>
            </div>

            {/* Discount */}
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground flex items-center gap-2">
                <Percent className="w-4 h-4" />
                {language === "es" ? "Descuento" : "Discount"}
              </span>
              <div className="flex-1 flex justify-end items-center gap-2">
                <span>$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-28 text-right"
                  value={order.discount_amount || 0}
                  onChange={(e) => handleUpdateOrder({ discount_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Taxes */}
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                {language === "es" ? "Impuestos" : "Taxes"}
              </span>
              <div className="flex-1 flex justify-end items-center gap-2">
                <Select
                  value={order.tax_details?.[0]?.tax_id || "none"}
                  onValueChange={(taxId) => handleUpdateOrder({ tax_ids: taxId === "none" ? [] : [taxId] })}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={language === "es" ? "Seleccionar impuesto" : "Select tax"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{language === "es" ? "Sin impuesto" : "No tax"}</SelectItem>
                    {taxRates.map(tax => (
                      <SelectItem key={tax.tax_id} value={tax.tax_id}>
                        {tax.name} ({tax.rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="font-mono w-24 text-right">
                  ${order.total_tax?.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-semibold text-lg">{language === "es" ? "Total" : "Total"}</span>
              <span className="font-heading text-2xl font-bold">
                ${order.total?.toFixed(2) || "0.00"}
              </span>
            </div>

            {/* Client Notes */}
            <div className="border-t pt-4">
              <Label className="mb-2 block">
                {language === "es" ? "Notas para el Cliente" : "Client Notes"}
              </Label>
              <Textarea
                placeholder={language === "es" ? "Notas visibles en propuestas y facturas..." : "Notes visible on proposals and invoices..."}
                value={order.client_notes || ""}
                onChange={(e) => setOrder({ ...order, client_notes: e.target.value })}
                onBlur={() => handleUpdateOrder({ client_notes: order.client_notes })}
                rows={2}
              />
            </div>

            {/* Payment Terms */}
            <div>
              <Label className="mb-2 block">
                {language === "es" ? "Términos de Pago" : "Payment Terms"}
              </Label>
              <Input
                placeholder={language === "es" ? "ej: 50% anticipo, 50% día del evento" : "e.g., 50% deposit, 50% on event day"}
                value={order.payment_terms || ""}
                onChange={(e) => setOrder({ ...order, payment_terms: e.target.value })}
                onBlur={() => handleUpdateOrder({ payment_terms: order.payment_terms })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === "es" ? "Agregar Ítem" : "Add Item"}
            </DialogTitle>
          </DialogHeader>
          
          {/* Quick Add from Picklist */}
          {picklist.length > 0 && (
            <div className="mb-4">
              <Label className="mb-2 block text-sm">
                {language === "es" ? "Selección Rápida" : "Quick Select"}
              </Label>
              <Select onValueChange={(id) => {
                const item = picklist.find(p => p.item_id === id);
                if (item) handlePicklistSelect(item);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={language === "es" ? "Seleccionar de lista..." : "Select from list..."} />
                </SelectTrigger>
                <SelectContent>
                  {picklist.map(item => (
                    <SelectItem key={item.item_id} value={item.item_id}>
                      {item.name} - ${item.default_price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Or from Recipes (for food) */}
          {recipes.length > 0 && (
            <div className="mb-4">
              <Label className="mb-2 block text-sm">
                {language === "es" ? "Desde Receta" : "From Recipe"}
              </Label>
              <Select onValueChange={(id) => {
                const recipe = recipes.find(r => r.recipe_id === id);
                if (recipe) handleRecipeSelect(recipe);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={language === "es" ? "Seleccionar receta..." : "Select recipe..."} />
                </SelectTrigger>
                <SelectContent>
                  {recipes.map(recipe => (
                    <SelectItem key={recipe.recipe_id} value={recipe.recipe_id}>
                      {recipe.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{language === "es" ? "Nombre" : "Name"} *</Label>
                <Input
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder={language === "es" ? "Nombre del ítem" : "Item name"}
                  required
                  data-testid="item-name-input"
                />
              </div>

              <div className="col-span-2">
                <Label>{language === "es" ? "Descripción" : "Description"}</Label>
                <Textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder={language === "es" ? "Descripción opcional" : "Optional description"}
                  rows={2}
                />
              </div>

              <div>
                <Label>{language === "es" ? "Categoría" : "Category"} *</Label>
                <Select 
                  value={newItem.category_id} 
                  onValueChange={(v) => setNewItem({ ...newItem, category_id: v })}
                  required
                >
                  <SelectTrigger data-testid="item-category-select">
                    <SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.category_id} value={cat.category_id}>
                        {language === "es" ? cat.name_es || cat.name : cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{language === "es" ? "Fecha" : "Date"}</Label>
                <Input
                  type="date"
                  value={newItem.event_date}
                  onChange={(e) => setNewItem({ ...newItem, event_date: e.target.value })}
                />
              </div>

              <div>
                <Label>{language === "es" ? "Cantidad" : "Quantity"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 1 })}
                  data-testid="item-quantity-input"
                />
              </div>

              <div>
                <Label>{language === "es" ? "Precio Unitario" : "Unit Price"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.unit_price}
                  onChange={(e) => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                  data-testid="item-price-input"
                />
                {/* Price Alert based on recipe cost */}
                {newItem._recipeCost > 0 && (
                  <div className={`mt-1 text-xs flex items-center gap-1 ${
                    newItem.unit_price < newItem._recipeCost * 1.5 
                      ? "text-destructive" 
                      : newItem.unit_price > newItem._recipeCost * 5 
                        ? "text-warning" 
                        : "text-success"
                  }`}>
                    <AlertTriangle className="w-3 h-3" />
                    {language === "es" ? "Costo" : "Cost"}: ${newItem._recipeCost.toFixed(2)} | 
                    {language === "es" ? " Margen" : " Margin"}: {newItem.unit_price > 0 ? (((newItem.unit_price - newItem._recipeCost) / newItem.unit_price) * 100).toFixed(0) : 0}%
                  </div>
                )}
              </div>

              <div>
                <Label>{language === "es" ? "Descuento" : "Discount"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.discount_amount}
                  onChange={(e) => setNewItem({ ...newItem, discount_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="col-span-2">
                <Label>{language === "es" ? "Notas Internas" : "Internal Notes"}</Label>
                <Textarea
                  value={newItem.internal_notes}
                  onChange={(e) => setNewItem({ ...newItem, internal_notes: e.target.value })}
                  placeholder={language === "es" ? "Notas para cocina/montaje (no visibles al cliente)" : "Notes for kitchen/setup (not visible to client)"}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setAddItemOpen(false)}>
                {language === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit" data-testid="save-order-item-btn">
                {language === "es" ? "Agregar Ítem" : "Add Item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
