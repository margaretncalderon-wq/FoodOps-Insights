import { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { 
  ShoppingCart, RefreshCw, CheckCircle, Truck, AlertTriangle, 
  Package, Download, ChevronDown, ChevronRight 
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

import { API_BASE as API } from "../utils/api";

export default function EventPurchaseList({ eventId, eventName }) {
  const { language } = useLanguage();
  const [purchaseData, setPurchaseData] = useState(null);
  const [savedLists, setSavedLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedSuppliers, setExpandedSuppliers] = useState({});

  const t = (key) => {
    const translations = {
      purchaseList: { en: "Purchase List", es: "Lista de Compras" },
      generateList: { en: "Generate List", es: "Generar Lista" },
      noItems: { en: "No items to purchase", es: "No hay artículos para comprar" },
      inStock: { en: "In Stock", es: "En Stock" },
      short: { en: "Short", es: "Faltante" },
      unknown: { en: "Unknown", es: "Desconocido" },
      required: { en: "Required", es: "Requerido" },
      available: { en: "Available", es: "Disponible" },
      toPurchase: { en: "To Purchase", es: "Por Comprar" },
      unitCost: { en: "Unit Cost", es: "Costo Unit." },
      total: { en: "Total", es: "Total" },
      supplier: { en: "Supplier", es: "Proveedor" },
      noSupplier: { en: "No Supplier", es: "Sin Proveedor" },
      savePurchaseList: { en: "Save Purchase List", es: "Guardar Lista" },
      markOrdered: { en: "Mark as Ordered", es: "Marcar Ordenado" },
      markReceived: { en: "Mark as Received", es: "Marcar Recibido" },
      savedLists: { en: "Saved Lists", es: "Listas Guardadas" },
      status: { en: "Status", es: "Estado" },
      items: { en: "items", es: "artículos" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  };

  const fetchPurchaseList = async () => {
    setLoading(true);
    try {
      const [generateRes, savedRes] = await Promise.all([
        axios.get(`${API}/api/purchase-lists/event/${eventId}/generate`, { withCredentials: true }),
        axios.get(`${API}/api/purchase-lists?event_id=${eventId}`, { withCredentials: true })
      ]);
      setPurchaseData(generateRes.data);
      setSavedLists(savedRes.data);
      
      // Expand all suppliers by default
      const expanded = {};
      Object.keys(generateRes.data.items_by_supplier || {}).forEach(sid => {
        expanded[sid] = true;
      });
      setExpandedSuppliers(expanded);
    } catch (error) {
      toast.error("Error loading purchase list");
    }
    setLoading(false);
  };

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      if (!eventId || !isMounted) return;
      setLoading(true);
      try {
        const [generateRes, savedRes] = await Promise.all([
          axios.get(`${API}/api/purchase-lists/event/${eventId}/generate`, { withCredentials: true }),
          axios.get(`${API}/api/purchase-lists?event_id=${eventId}`, { withCredentials: true })
        ]);
        if (isMounted) {
          setPurchaseData(generateRes.data);
          setSavedLists(savedRes.data);
          const expanded = {};
          Object.keys(generateRes.data.items_by_supplier || {}).forEach(sid => {
            expanded[sid] = true;
          });
          setExpandedSuppliers(expanded);
        }
      } catch (error) {
        if (isMounted) toast.error("Error loading purchase list");
      }
      if (isMounted) setLoading(false);
    };
    
    loadData();
    return () => { isMounted = false; };
  }, [eventId]);

  const handleSavePurchaseList = async (supplierId, supplierData) => {
    try {
      await axios.post(`${API}/api/purchase-lists`, {
        event_id: eventId,
        supplier_id: supplierId === "no_supplier" ? null : supplierId,
        supplier_name: supplierData.supplier_name,
        items: supplierData.items,
        total_cost: supplierData.total_cost
      }, { withCredentials: true });
      toast.success(language === "es" ? "Lista guardada" : "List saved");
      fetchPurchaseList();
    } catch (error) {
      toast.error("Error saving purchase list");
    }
  };

  const handleUpdateStatus = async (purchaseListId, newStatus) => {
    try {
      await axios.put(`${API}/api/purchase-lists/${purchaseListId}/status`, {
        status: newStatus,
        create_transactions: newStatus === "Received"
      }, { withCredentials: true });
      toast.success(language === "es" ? "Estado actualizado" : "Status updated");
      fetchPurchaseList();
    } catch (error) {
      toast.error("Error updating status");
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      "Draft": "secondary",
      "Ordered": "default",
      "Received": "success"
    };
    const labels = {
      "Draft": language === "es" ? "Borrador" : "Draft",
      "Ordered": language === "es" ? "Ordenado" : "Ordered",
      "Received": language === "es" ? "Recibido" : "Received"
    };
    return <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>;
  };

  const getItemStatusBadge = (status) => {
    const variants = {
      "InStock": "success",
      "Short": "destructive",
      "Unknown": "secondary"
    };
    return <Badge variant={variants[status] || "secondary"}>{t(status.toLowerCase())}</Badge>;
  };

  const toggleSupplier = (supplierId) => {
    setExpandedSuppliers(prev => ({
      ...prev,
      [supplierId]: !prev[supplierId]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const itemsBySupplier = purchaseData?.items_by_supplier || {};
  const hasItems = Object.keys(itemsBySupplier).length > 0;

  return (
    <div className="space-y-6" data-testid="event-purchase-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">{t("purchaseList")}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPurchaseList}>
          <RefreshCw className="w-4 h-4 mr-2" /> {t("generateList")}
        </Button>
      </div>

      {/* Generated Purchase List */}
      {!hasItems ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{purchaseData?.message || t("noItems")}</p>
            <p className="text-sm mt-2">
              {language === "es" 
                ? "Agrega artículos de tipo Food con recetas vinculadas para generar la lista" 
                : "Add Food type items with linked recipes to generate the list"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(itemsBySupplier).map(([supplierId, supplierData]) => (
            <Card key={supplierId}>
              <Collapsible open={expandedSuppliers[supplierId]} onOpenChange={() => toggleSupplier(supplierId)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedSuppliers[supplierId] ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <Truck className="w-5 h-5 text-blue-500" />
                        <CardTitle className="text-base">
                          {supplierData.supplier_name || t("noSupplier")}
                        </CardTitle>
                        <Badge variant="outline">
                          {supplierData.items.length} {t("items")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-lg">
                          ${supplierData.total_cost?.toFixed(2) || "0.00"}
                        </span>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSavePurchaseList(supplierId, supplierData);
                          }}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          {t("savePurchaseList")}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === "es" ? "Artículo" : "Item"}</TableHead>
                          <TableHead className="text-right">{t("required")}</TableHead>
                          <TableHead className="text-right">{t("available")}</TableHead>
                          <TableHead className="text-right">{t("toPurchase")}</TableHead>
                          <TableHead className="text-right">{t("unitCost")}</TableHead>
                          <TableHead className="text-right">{t("total")}</TableHead>
                          <TableHead>{t("status")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierData.items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.item_name}</TableCell>
                            <TableCell className="text-right">{item.required_qty} {item.unit}</TableCell>
                            <TableCell className="text-right">{item.in_stock_qty} {item.unit}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {item.to_purchase_qty > 0 ? (
                                <span className="text-red-500">{item.to_purchase_qty} {item.unit}</span>
                              ) : (
                                <span className="text-green-500">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">${item.unit_cost?.toFixed(2)}</TableCell>
                            <TableCell className="text-right">${item.total_cost?.toFixed(2)}</TableCell>
                            <TableCell>{getItemStatusBadge(item.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Saved Purchase Lists */}
      {savedLists.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              {t("savedLists")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("supplier")}</TableHead>
                  <TableHead>{t("items")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedLists.map(list => (
                  <TableRow key={list.purchase_list_id}>
                    <TableCell className="font-medium">
                      {list.supplier_name || t("noSupplier")}
                    </TableCell>
                    <TableCell>{list.items?.length || 0} {t("items")}</TableCell>
                    <TableCell className="text-right">${list.total_cost?.toFixed(2)}</TableCell>
                    <TableCell>{getStatusBadge(list.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {list.status === "Draft" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleUpdateStatus(list.purchase_list_id, "Ordered")}
                          >
                            {t("markOrdered")}
                          </Button>
                        )}
                        {list.status === "Ordered" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleUpdateStatus(list.purchase_list_id, "Received")}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {t("markReceived")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
