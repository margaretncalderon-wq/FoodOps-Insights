import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Plus, ShoppingCart, ClipboardList } from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export function PurchasingSection() {
  const { language } = useLanguage();
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPurchaseOrders();
  }, []);

  const fetchPurchaseOrders = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/purchase-orders`, { withCredentials: true });
      setPurchaseOrders(res.data || []);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                {language === "es" ? "Órdenes de Compra" : "Purchase Orders"}
              </CardTitle>
              <CardDescription>
                {language === "es" ? "Gestión de compras de suministros de operaciones" : "Operations supplies purchase management"}
              </CardDescription>
            </div>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {language === "es" ? "Nueva Orden" : "New Order"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{language === "es" ? "No hay órdenes de compra" : "No purchase orders"}</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "# Orden" : "Order #"}</TableHead>
                    <TableHead>{language === "es" ? "Proveedor" : "Supplier"}</TableHead>
                    <TableHead>{language === "es" ? "Fecha" : "Date"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Total" : "Total"}</TableHead>
                    <TableHead>{language === "es" ? "Estado" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map(po => (
                    <TableRow key={po.po_id}>
                      <TableCell className="font-mono">{po.po_number}</TableCell>
                      <TableCell>{po.supplier_name}</TableCell>
                      <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right font-mono">${(po.total_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={po.status === "received" ? "default" : po.status === "sent" ? "secondary" : "outline"}>
                          {po.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
