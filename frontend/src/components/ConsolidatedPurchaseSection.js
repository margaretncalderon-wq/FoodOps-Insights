import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { ScrollArea } from "./ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";

// Icons
import { 
  ShoppingCart, Package, Truck, RefreshCw, FileText, Check,
  Calendar, Users, ArrowRight, AlertTriangle, Download, CheckCircle,
  Printer, PackageMinus, Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function ConsolidatedPurchaseSection() {
  const { language } = useLanguage();
  const [events, setEvents] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [purchaseData, setPurchaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [creatingPO, setCreatingPO] = useState(null);
  const [processingSR, setProcessingSR] = useState(false);
  const [srDialogOpen, setSrDialogOpen] = useState(false);
  const printRef = useRef(null);

  const t = useCallback((key) => {
    const translations = {
      title: { en: "Consolidated Purchases", es: "Compras Consolidadas" },
      selectEvents: { en: "Select Events to Generate Purchase List", es: "Selecciona Eventos para Generar Lista" },
      generate: { en: "Generate Purchase List", es: "Generar Lista de Compras" },
      noEvents: { en: "No upcoming events", es: "No hay eventos próximos" },
      event: { en: "Event", es: "Evento" },
      date: { en: "Date", es: "Fecha" },
      guests: { en: "Guests", es: "Comensales" },
      totalRequired: { en: "Total Required", es: "Total Requerido" },
      inStock: { en: "In Stock", es: "En Stock" },
      toPurchase: { en: "To Purchase", es: "Por Comprar" },
      cost: { en: "Cost", es: "Costo" },
      totalCost: { en: "Total Cost", es: "Costo Total" },
      createPO: { en: "Create PO", es: "Crear OC" },
      noSupplier: { en: "No Supplier", es: "Sin Proveedor" },
      recipes: { en: "Recipes", es: "Recetas" },
      eventsSelected: { en: "events selected", es: "eventos seleccionados" },
      selectAll: { en: "Select All", es: "Seleccionar Todo" },
      clearAll: { en: "Clear All", es: "Limpiar Todo" },
      includeBuffer: { en: "Include 10% buffer", es: "Incluir 10% reserva" },
      compareStock: { en: "Compare with stock", es: "Comparar con inventario" },
      noItemsNeeded: { en: "No items needed to purchase", es: "No hay items que comprar" },
      poCreated: { en: "PO Created!", es: "¡OC Creada!" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  }, [language]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Only fetch confirmed (Won/Closed) events for cost & usage overview
      const res = await axios.get(`${API}/api/events/confirmed`, { withCredentials: true });
      // Filter to upcoming events with guest count
      const upcomingEvents = res.data.filter(e => {
        const eventDate = e.event_date ? new Date(e.event_date) : null;
        return !eventDate || eventDate >= new Date();
      });
      setEvents(upcomingEvents);
    } catch (error) {
      toast.error("Error loading events");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Toggle event selection
  const toggleEvent = (eventId) => {
    setSelectedEvents(prev => 
      prev.includes(eventId) 
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  // Generate purchase list
  const handleGenerate = async () => {
    if (selectedEvents.length === 0) {
      toast.error(language === "es" ? "Selecciona al menos un evento" : "Select at least one event");
      return;
    }
    
    setGenerating(true);
    try {
      const res = await axios.post(`${API}/api/events/generate-purchase-list`, {
        event_ids: selectedEvents,
        include_buffer: true,
        compare_inventory: true
      }, { withCredentials: true });
      
      setPurchaseData(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error generating list");
    }
    setGenerating(false);
  };

  // Process Stock Requisition - Deduct items from inventory
  const handleProcessSR = async () => {
    if (!purchaseData?.stock_requisition?.length) {
      toast.error(language === "es" ? "No hay items para requisicionar" : "No items to requisition");
      return;
    }
    
    setProcessingSR(true);
    try {
      // Create inventory transactions to deduct stock
      for (const item of purchaseData.stock_requisition) {
        await axios.post(`${API}/api/inventory/transaction`, {
          inventory_item_id: item.inventory_item_id,
          transaction_type: "Event Usage",
          quantity: -Math.abs(item.in_stock), // Negative to deduct
          notes: `SR for events: ${purchaseData.events?.map(e => e.event_name).join(", ")}`
        }, { withCredentials: true });
      }
      
      toast.success(language === "es" ? "Stock requisición procesada - Inventario actualizado" : "Stock requisition processed - Inventory updated");
      setSrDialogOpen(false);
      
      // Regenerate list to reflect new inventory
      handleGenerate();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error processing SR");
    }
    setProcessingSR(false);
  };

  // Print Stock Requisition
  const handlePrintSR = () => {
    if (!purchaseData?.stock_requisition?.length) {
      toast.error(language === "es" ? "No hay items para imprimir" : "No items to print");
      return;
    }
    
    const printContent = `
      <html>
        <head>
          <title>Stock Requisition</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            h2 { font-size: 14px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: bold; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .total { margin-top: 20px; font-weight: bold; text-align: right; }
            .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
            .signature { display: flex; justify-content: space-between; margin-top: 40px; }
            .signature div { width: 200px; border-top: 1px solid #333; padding-top: 5px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>STOCK REQUISITION (SR)</h1>
              <h2>${language === "es" ? "Requisición de Inventario" : "Inventory Requisition"}</h2>
            </div>
            <div style="text-align: right;">
              <p><strong>${language === "es" ? "Fecha" : "Date"}:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>${language === "es" ? "Eventos" : "Events"}:</strong> ${purchaseData.events?.map(e => e.event_name).join(", ")}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>${language === "es" ? "Item" : "Item"}</th>
                <th>${language === "es" ? "Cantidad" : "Quantity"}</th>
                <th>${language === "es" ? "Unidad" : "Unit"}</th>
                <th>${language === "es" ? "Recetas" : "Recipes"}</th>
              </tr>
            </thead>
            <tbody>
              ${purchaseData.stock_requisition.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${item.item_name}</td>
                  <td style="text-align: right;">${item.in_stock?.toFixed(2)}</td>
                  <td>${item.unit}</td>
                  <td>${item.recipes_used?.join(", ") || "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          
          <div class="total">
            ${language === "es" ? "Total Items" : "Total Items"}: ${purchaseData.stock_requisition.length}
          </div>
          
          <div class="signature">
            <div>${language === "es" ? "Solicitado por" : "Requested by"}</div>
            <div>${language === "es" ? "Entregado por" : "Issued by"}</div>
            <div>${language === "es" ? "Recibido por" : "Received by"}</div>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // Create PO from supplier items
  const handleCreatePO = async (supplierId, items) => {
    setCreatingPO(supplierId);
    try {
      const itemsToOrder = items.filter(i => i.to_purchase > 0);
      if (itemsToOrder.length === 0) {
        toast.error(language === "es" ? "No hay items para ordenar" : "No items to order");
        setCreatingPO(null);
        return;
      }
      
      await axios.post(`${API}/api/events/create-po-from-purchase-list`, {
        supplier_id: supplierId === "no_supplier" ? null : supplierId,
        items: itemsToOrder.map(i => ({
          inventory_item_id: i.inventory_item_id,
          item_name: i.item_name,
          to_purchase: parseFloat(i.to_purchase) || 0,
          unit: i.unit,
          unit_cost: parseFloat(i.unit_cost) || 0
        }))
      }, { withCredentials: true });
      
      toast.success(t("poCreated"));
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating PO");
    }
    setCreatingPO(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="consolidated-purchase-section">
      {/* Event Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t("selectEvents")}
          </CardTitle>
          <CardDescription>
            {selectedEvents.length} {t("eventsSelected")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t("noEvents")}</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={() => setSelectedEvents(events.map(e => e.event_id))}>
                  {t("selectAll")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedEvents([])}>
                  {t("clearAll")}
                </Button>
              </div>
              
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {events.map(event => (
                    <div 
                      key={event.event_id}
                      className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedEvents.includes(event.event_id) 
                          ? "bg-primary/10 border-primary" 
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => toggleEvent(event.event_id)}
                    >
                      <Checkbox checked={selectedEvents.includes(event.event_id)} />
                      <div className="flex-1">
                        <p className="font-medium">{event.name}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {event.event_date ? new Date(event.event_date).toLocaleDateString() : "TBD"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {event.guest_count || event.num_guests || 0} {language === "es" ? "personas" : "guests"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              <div className="mt-4 flex justify-end">
                <Button onClick={handleGenerate} disabled={selectedEvents.length === 0 || generating}>
                  {generating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                  {t("generate")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Generated Purchase List */}
      {purchaseData && (
        <div className="space-y-4">
          {/* Stock Requisition vs Purchase List Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Stock Requisition (SR) - Items in Stock */}
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>{language === "es" ? "Requisición de Inventario (SR)" : "Stock Requisition (SR)"}</span>
                    <Badge variant="secondary">
                      {purchaseData.stock_requisition?.length || 0}
                    </Badge>
                  </CardTitle>
                  {(purchaseData.stock_requisition?.length || 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handlePrintSR}
                        className="h-8"
                      >
                        <Printer className="w-4 h-4 mr-1" />
                        {language === "es" ? "Imprimir" : "Print"}
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => setSrDialogOpen(true)}
                        className="h-8 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <PackageMinus className="w-4 h-4 mr-1" />
                        {language === "es" ? "Procesar SR" : "Process SR"}
                      </Button>
                    </div>
                  )}
                </div>
                <CardDescription>
                  {language === "es" ? "Items disponibles en inventario actual" : "Items available from current inventory"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(purchaseData.stock_requisition?.length || 0) > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {purchaseData.stock_requisition.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border text-sm">
                        <span className="font-medium">{item.item_name || item.name}</span>
                        <div className="text-right">
                          <span className="font-mono">{(item.in_stock || item.quantity_needed || 0).toFixed(1)} {item.unit}</span>
                          <span className="text-xs text-emerald-600 ml-2">✓</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {language === "es" ? "No hay items cubiertos por inventario" : "No items covered by inventory"}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Purchase List (PL) - Items to Buy */}
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-amber-600" />
                  <span>{language === "es" ? "Lista de Compras (PL)" : "Purchase List (PL)"}</span>
                  <Badge variant="secondary" className="ml-auto">
                    {purchaseData.purchase_list?.length || 0}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {language === "es" ? "Items que necesitan ser comprados" : "Items that need to be purchased"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(purchaseData.purchase_list?.length || 0) > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {purchaseData.purchase_list.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border text-sm">
                        <span className="font-medium">{item.item_name || item.name}</span>
                        <div className="text-right">
                          <span className="font-mono text-amber-700">{(item.to_purchase || item.shortage || 0).toFixed(1)} {item.unit}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            (${((item.to_purchase || item.shortage || 0) * (item.unit_cost || item.cost_per_unit || 0)).toFixed(2)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-emerald-600 text-center py-4">
                    {language === "es" ? "✓ Todo cubierto con inventario" : "✓ All covered by inventory"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  {language === "es" ? "Detalle por Proveedor" : "Detail by Supplier"}
                </span>
                <Badge variant="outline" className="text-lg px-4 py-1">
                  {t("totalCost")}: ${purchaseData.total_cost?.toFixed(2)}
                </Badge>
              </CardTitle>
              <CardDescription>
                {purchaseData.events?.length} {language === "es" ? "eventos" : "events"} • 
                {" "}{Object.keys(purchaseData.items_by_supplier || {}).length} {language === "es" ? "proveedores" : "suppliers"}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Items by Supplier */}
          {Object.keys(purchaseData.items_by_supplier || {}).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>{t("noItemsNeeded")}</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(purchaseData.items_by_supplier).map(([supplierId, items]) => {
              const supplierTotal = items.reduce((sum, i) => sum + i.total_cost, 0);
              const itemsNeedPurchase = items.filter(i => i.to_purchase > 0);
              
              return (
                <Card key={supplierId}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Truck className="w-5 h-5 text-blue-500" />
                      <div>
                        <CardTitle className="text-base">
                          {items[0]?.supplier_name || t("noSupplier")}
                        </CardTitle>
                        <CardDescription>
                          {items.length} items • ${supplierTotal.toFixed(2)}
                        </CardDescription>
                      </div>
                    </div>
                    {itemsNeedPurchase.length > 0 && supplierId !== "no_supplier" && (
                      <Button 
                        onClick={() => handleCreatePO(supplierId, items)}
                        disabled={creatingPO === supplierId}
                      >
                        {creatingPO === supplierId ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4 mr-2" />
                        )}
                        {t("createPO")}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === "es" ? "Artículo" : "Item"}</TableHead>
                          <TableHead className="text-right">{t("totalRequired")}</TableHead>
                          <TableHead className="text-right">{t("inStock")}</TableHead>
                          <TableHead className="text-right">{t("toPurchase")}</TableHead>
                          <TableHead className="text-right">{t("cost")}</TableHead>
                          <TableHead>{t("recipes")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={idx} className={item.to_purchase <= 0 ? "opacity-50" : ""}>
                            <TableCell className="font-medium">{item.item_name}</TableCell>
                            <TableCell className="text-right">{item.total_required.toFixed(2)} {item.unit}</TableCell>
                            <TableCell className="text-right">{item.in_stock.toFixed(2)} {item.unit}</TableCell>
                            <TableCell className="text-right">
                              {item.to_purchase > 0 ? (
                                <span className="text-red-600 font-semibold">{item.to_purchase.toFixed(2)}</span>
                              ) : (
                                <span className="text-green-600">✓ OK</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              ${item.total_cost.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {item.recipes_used?.slice(0, 3).map((recipe, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {recipe}
                                  </Badge>
                                ))}
                                {item.recipes_used?.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{item.recipes_used.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Events included */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{language === "es" ? "Eventos Incluidos" : "Events Included"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {purchaseData.events?.map((event, idx) => (
                  <Badge key={idx} variant="secondary" className="flex items-center gap-2">
                    {event.event_name}
                    <span className="text-muted-foreground">
                      ({event.guest_count} {language === "es" ? "pers." : "guests"})
                    </span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
