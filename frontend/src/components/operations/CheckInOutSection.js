import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { 
  Plus, Edit, Trash2, AlertTriangle, Truck, ClipboardList, Calendar, 
  Clock, CheckCircle2, Save, Printer, Package
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { fmtNum } from "../../utils/format";

export function CheckInOutSection() {
  const { language } = useLanguage();
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [packingListItems, setPackingListItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [viewingNote, setViewingNote] = useState(null);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [availableInventory, setAvailableInventory] = useState([]);
  
  // Date fields for delivery note
  const [checkoutDate, setCheckoutDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [notesRes, eventsRes, invRes] = await Promise.all([
        axios.get(`${API}/api/delivery-notes`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/events/confirmed`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setDeliveryNotes(notesRes.data || []);
      setEvents(eventsRes.data || []);
      const opsItems = (invRes.data || []).filter(i => 
        ["equipment", "disposable", "event_supply"].includes(i.inventory_type)
      );
      setInventory(opsItems);
    } catch (error) {
      console.error("Error:", error);
    }
    setLoading(false);
  };

  const handleEventSelect = async (eventId) => {
    setSelectedEvent(eventId);
    if (!eventId) {
      setPackingListItems([]);
      return;
    }
    
    try {
      const res = await axios.get(`${API}/api/events/${eventId}/packing-list-supplies`, { withCredentials: true }).catch(() => ({ data: [] }));
      setPackingListItems(res.data || []);
      setSelectedItems(res.data?.map(item => ({
        ...item,
        qty_out: item.quantity || 1,
        qty_returned: 0,
        status: "pending"
      })) || []);
    } catch (error) {
      setPackingListItems([]);
    }
  };

  const handleCreateDeliveryNote = async () => {
    if (!selectedEvent || selectedItems.length === 0) {
      toast.error(language === "es" ? "Selecciona un evento e items" : "Select an event and items");
      return;
    }

    try {
      await axios.post(`${API}/api/delivery-notes`, {
        event_id: selectedEvent,
        checkout_date: checkoutDate,
        expected_return_date: expectedReturnDate,
        notes: notes,
        items: selectedItems.map(item => ({
          inventory_item_id: item.inventory_item_id || item.ingredient_id,
          name: item.name,
          inventory_type: item.inventory_type,
          qty_out: item.qty_out,
          qty_returned: 0,
          replacement_cost: item.replacement_cost || 0,
          unit: item.unit
        }))
      }, { withCredentials: true });

      toast.success(language === "es" ? "Conduce creado" : "Delivery note created");
      setCreateDialogOpen(false);
      setSelectedEvent("");
      setSelectedItems([]);
      setCheckoutDate(new Date().toISOString().split('T')[0]);
      setExpectedReturnDate("");
      setNotes("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating delivery note");
    }
  };

  const handleCheckIn = async (note) => {
    setViewingNote(note);
    setCheckInDialogOpen(true);
  };

  const handlePrintDeliveryNote = (note) => {
    const eventName = getEventName(note.event_id);
    const printWindow = window.open('', '_blank');
    
    const equipmentItems = note.items?.filter(i => i.inventory_type === "equipment") || [];
    const disposableItems = note.items?.filter(i => i.inventory_type !== "equipment") || [];
    
    const itemRows = note.items?.map(item => {
      const itemData = inventory.find(inv => inv.ingredient_id === item.item_id);
      const photoHtml = itemData?.image_url 
        ? `<img src="${itemData.image_url}" alt="${item.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; margin-right: 10px;" />`
        : `<div style="width: 40px; height: 40px; background: #f0f0f0; border-radius: 4px; margin-right: 10px; display: inline-flex; align-items: center; justify-content: center; color: #999;">📦</div>`;
      
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">
            <div style="display: flex; align-items: center;">
              ${photoHtml}
              <span>${item.name}</span>
            </div>
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.inventory_type === "equipment" ? "↩️ Equipo" : "🚫 Desechable"}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;">${item.qty_out} ${item.unit || "unit"}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"></td>
        </tr>
      `;
    }).join('') || '';

    const itemsWithPhotos = note.items?.filter(item => {
      const itemData = inventory.find(inv => inv.ingredient_id === item.item_id);
      return itemData?.image_url;
    }) || [];
    
    const photoGalleryHtml = itemsWithPhotos.length > 0 ? `
      <div class="photo-gallery">
        <h3 style="margin-bottom: 15px; font-size: 14px;">📷 Referencia Visual de Items</h3>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          ${itemsWithPhotos.map(item => {
            const itemData = inventory.find(inv => inv.ingredient_id === item.item_id);
            return `
              <div style="text-align: center;">
                <img src="${itemData?.image_url}" alt="${item.name}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" />
                <p style="font-size: 10px; margin-top: 4px; color: #666;">${item.name} (${item.qty_out})</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Conduce ${note.note_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 24px; }
          .header p { margin: 5px 0; color: #666; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .info-box { background: #f5f5f5; padding: 15px; border-radius: 8px; }
          .info-box label { font-size: 12px; color: #666; display: block; margin-bottom: 4px; }
          .info-box span { font-size: 16px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #333; color: white; padding: 12px; text-align: left; }
          .summary { margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 8px; }
          .signatures { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .signature-box { border-top: 1px solid #333; padding-top: 10px; text-align: center; }
          .signature-box p { margin: 5px 0; font-size: 12px; color: #666; }
          .notes { margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107; }
          .photo-gallery { margin-top: 30px; padding: 15px; background: #f0f8ff; border-radius: 8px; page-break-inside: avoid; }
          @media print { body { padding: 0; } .photo-gallery { page-break-before: auto; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📋 CONDUCE DE ENTREGA</h1>
          <p><strong>${note.note_number}</strong></p>
        </div>
        
        <div class="info-grid">
          <div class="info-box"><label>Evento</label><span>${eventName}</span></div>
          <div class="info-box"><label>Fecha de Salida</label><span>${note.checkout_date ? formatDateOnly(note.checkout_date, language) : formatDateOnly(new Date(), language)}</span></div>
          <div class="info-box"><label>Equipo (Debe Regresar)</label><span>${equipmentItems.length} items</span></div>
          <div class="info-box"><label>Desechables (No Regresan)</label><span>${disposableItems.length} items</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th style="text-align: center;">Tipo</th>
              <th style="text-align: center;">Cantidad Salida</th>
              <th style="text-align: center;">Cantidad Devuelta</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <div class="summary">
          <strong>Resumen:</strong> ${note.items?.length || 0} items total | 
          ${equipmentItems.length} equipos (deben regresar) | 
          ${disposableItems.length} desechables
        </div>

        ${note.notes ? `<div class="notes"><strong>Notas:</strong> ${note.notes}</div>` : ''}
        ${photoGalleryHtml}

        <div class="signatures">
          <div class="signature-box">
            <p><strong>Entregado por:</strong></p>
            <p>Nombre: _______________________</p>
            <p>Firma: _______________________</p>
            <p>Fecha: _______________________</p>
          </div>
          <div class="signature-box">
            <p><strong>Recibido por:</strong></p>
            <p>Nombre: _______________________</p>
            <p>Firma: _______________________</p>
            <p>Fecha: _______________________</p>
          </div>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveCheckIn = async () => {
    if (!viewingNote) return;

    try {
      await axios.put(`${API}/api/delivery-notes/${viewingNote.note_id}/check-in`, {
        items: viewingNote.items
      }, { withCredentials: true });

      toast.success(language === "es" ? "Check-in guardado" : "Check-in saved");
      setCheckInDialogOpen(false);
      setViewingNote(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving check-in");
    }
  };

  const updateCheckInItem = (index, field, value) => {
    if (!viewingNote) return;
    const updatedItems = [...viewingNote.items];
    updatedItems[index][field] = value;
    
    if (updatedItems[index].inventory_type === "equipment") {
      const qtyOut = updatedItems[index].qty_out || 0;
      const qtyReturned = updatedItems[index].qty_returned || 0;
      const lost = Math.max(0, qtyOut - qtyReturned);
      updatedItems[index].qty_lost = lost;
      updatedItems[index].loss_cost = lost * (updatedItems[index].replacement_cost || 0);
    }
    
    setViewingNote({ ...viewingNote, items: updatedItems });
  };

  const getEventName = (eventId) => {
    const event = events.find(e => e.event_id === eventId);
    return event?.name || eventId;
  };

  const getStatusBadge = (note) => {
    if (note.status === "returned") {
      return <Badge className="bg-green-600">{language === "es" ? "Devuelto" : "Returned"}</Badge>;
    }
    if (note.status === "partial") {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{language === "es" ? "Parcial" : "Partial"}</Badge>;
    }
    return <Badge variant="outline">{language === "es" ? "Pendiente" : "Pending"}</Badge>;
  };

  const handleEditNote = async (note) => {
    if (note.status !== "pending") {
      toast.error(language === "es" ? "Solo se pueden editar conduces pendientes" : "Can only edit pending notes");
      return;
    }
    
    try {
      const res = await axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true });
      const opsItems = (res.data || []).filter(i => 
        ["equipment", "disposable", "event_supply"].includes(i.inventory_type)
      );
      setAvailableInventory(opsItems);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
    
    setEditingNote({
      ...note,
      items: note.items.map(item => ({ ...item }))
    });
    setEditDialogOpen(true);
  };

  const updateEditingItem = (index, field, value) => {
    if (!editingNote) return;
    const updatedItems = [...editingNote.items];
    updatedItems[index][field] = value;
    setEditingNote({ ...editingNote, items: updatedItems });
  };

  const addItemToEditingNote = (invItem) => {
    if (!editingNote) return;
    
    if (editingNote.items.find(i => i.inventory_item_id === invItem.ingredient_id)) {
      toast.error(language === "es" ? "Item ya agregado" : "Item already added");
      return;
    }
    
    const newItem = {
      inventory_item_id: invItem.ingredient_id,
      name: invItem.name,
      inventory_type: invItem.inventory_type,
      category: invItem.category,
      qty_out: 1,
      qty_returned: 0,
      qty_lost: 0,
      loss_cost: 0,
      replacement_cost: invItem.replacement_cost || 0,
      unit: invItem.unit,
      notes: "",
      status: "pending"
    };
    
    setEditingNote({
      ...editingNote,
      items: [...editingNote.items, newItem]
    });
  };

  const removeItemFromEditingNote = (index) => {
    if (!editingNote) return;
    const updatedItems = editingNote.items.filter((_, i) => i !== index);
    setEditingNote({ ...editingNote, items: updatedItems });
  };

  const handleSaveEditedNote = async () => {
    if (!editingNote) return;
    
    try {
      await axios.put(`${API}/api/delivery-notes/${editingNote.note_id}`, {
        items: editingNote.items,
        notes: editingNote.notes
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "Conduce actualizado" : "Delivery note updated");
      setEditDialogOpen(false);
      setEditingNote(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error updating note");
    }
  };

  const handleCancelNote = async (note) => {
    if (note.status !== "pending") {
      toast.error(language === "es" ? "Solo se pueden cancelar conduces pendientes" : "Can only cancel pending notes");
      return;
    }
    
    if (!window.confirm(language === "es" 
      ? "¿Seguro que quieres cancelar este conduce? Los items regresarán al inventario." 
      : "Are you sure you want to cancel this delivery note? Items will return to inventory.")) {
      return;
    }
    
    try {
      await axios.delete(`${API}/api/delivery-notes/${note.note_id}`, { withCredentials: true });
      toast.success(language === "es" ? "Conduce cancelado" : "Delivery note cancelled");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error cancelling note");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Conduces Activos" : "Active Notes"}</p>
                <p className="text-2xl font-bold">{deliveryNotes.filter(n => n.status !== "returned").length}</p>
              </div>
              <Truck className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Pendiente Devolución" : "Pending Return"}</p>
                <p className="text-2xl font-bold text-amber-600">
                  {deliveryNotes.filter(n => n.status === "pending").length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Pérdidas Acumuladas" : "Total Losses"}</p>
                <p className="text-2xl font-bold text-red-600">
                  ${fmtNum(deliveryNotes.reduce((sum, n) => sum + (n.total_loss_cost || 0), 0))}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                {language === "es" ? "Conduces de Evento" : "Event Delivery Notes"}
              </CardTitle>
              <CardDescription>
                {language === "es" 
                  ? "Control de salida y devolución de equipos y suministros" 
                  : "Track equipment and supplies check-out and return"}
              </CardDescription>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {language === "es" ? "Nuevo Conduce" : "New Delivery Note"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deliveryNotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{language === "es" ? "No hay conduces" : "No delivery notes"}</p>
              <p className="text-sm">{language === "es" ? "Crea uno desde un evento con packing list" : "Create one from an event with packing list"}</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "# Conduce" : "Note #"}</TableHead>
                    <TableHead>{language === "es" ? "Evento" : "Event"}</TableHead>
                    <TableHead>{language === "es" ? "Salida" : "Out"}</TableHead>
                    <TableHead>{language === "es" ? "Retorno" : "Return"}</TableHead>
                    <TableHead className="text-center">{language === "es" ? "Equipo" : "Equipment"}</TableHead>
                    <TableHead>{language === "es" ? "Estado" : "Status"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryNotes.map(note => {
                    const equipmentItems = note.items?.filter(i => i.inventory_type === "equipment") || [];
                    const disposableItems = note.items?.filter(i => i.inventory_type === "disposable" || i.inventory_type === "event_supply") || [];
                    const isOverdue = note.expected_return_date && new Date(note.expected_return_date) < new Date() && note.status !== "completed";
                    
                    return (
                      <TableRow key={note.note_id} className={isOverdue ? "bg-red-50" : ""}>
                        <TableCell className="font-mono">{note.note_number || note.note_id?.slice(-8)}</TableCell>
                        <TableCell className="font-medium">{getEventName(note.event_id)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            {note.checkout_date ? formatDateOnly(note.checkout_date, language) : "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {note.expected_return_date ? (
                            <div className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
                              <Clock className="w-3 h-3" />
                              {formatDateOnly(note.expected_return_date, language)}
                              {isOverdue && <AlertTriangle className="w-3 h-3 ml-1" />}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Badge variant="outline" className="bg-blue-50">
                              {equipmentItems.length} ↩️
                            </Badge>
                            <Badge variant="outline" className="bg-gray-50">
                              {disposableItems.length} 🚫
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(note)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handlePrintDeliveryNote(note)} title={language === "es" ? "Imprimir" : "Print"}>
                              <Printer className="w-4 h-4" />
                            </Button>
                            {note.status === "pending" && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => handleEditNote(note)} title={language === "es" ? "Editar" : "Edit"}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleCancelNote(note)} title={language === "es" ? "Cancelar" : "Cancel"}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" onClick={() => handleCheckIn(note)}>
                              {note.status === "returned" 
                                ? (language === "es" ? "Ver" : "View")
                                : (language === "es" ? "Check-in" : "Check-in")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Delivery Note Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {language === "es" ? "Nuevo Conduce" : "New Delivery Note"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Selecciona un evento para cargar items del packing list" 
                : "Select an event to load items from packing list"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{language === "es" ? "Evento" : "Event"}</Label>
              <Select value={selectedEvent} onValueChange={handleEventSelect}>
                <SelectTrigger>
                  <SelectValue placeholder={language === "es" ? "Seleccionar evento" : "Select event"} />
                </SelectTrigger>
                <SelectContent>
                  {events.map(e => (
                    <SelectItem key={e.event_id} value={e.event_id}>
                      {e.name} - {e.event_date ? formatDateOnly(e.event_date, language) : "TBD"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {language === "es" ? "Fecha de Salida" : "Checkout Date"}
                </Label>
                <Input
                  type="date"
                  value={checkoutDate}
                  onChange={(e) => setCheckoutDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {language === "es" ? "Retorno Esperado" : "Expected Return"}
                </Label>
                <Input
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => setExpectedReturnDate(e.target.value)}
                  min={checkoutDate}
                />
              </div>
            </div>

            <div>
              <Label>{language === "es" ? "Notas" : "Notes"}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={language === "es" ? "Instrucciones especiales, contacto, etc." : "Special instructions, contact, etc."}
              />
            </div>

            {selectedItems.length > 0 && (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                      <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo Rep." : "Rep. Cost"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant={item.inventory_type === "equipment" ? "default" : "secondary"}>
                            {item.inventory_type === "equipment" 
                              ? (language === "es" ? "Equipo ↩️" : "Equipment ↩️")
                              : (language === "es" ? "Desechable 🚫" : "Disposable 🚫")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            value={item.qty_out}
                            onChange={(e) => {
                              const updated = [...selectedItems];
                              updated[idx].qty_out = parseInt(e.target.value) || 0;
                              setSelectedItems(updated);
                            }}
                            className="w-20 h-8 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.inventory_type === "equipment" 
                            ? `$${fmtNum((item.replacement_cost || 0))}`
                            : <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {selectedEvent && selectedItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{language === "es" ? "No hay items de suministros en el packing list" : "No supply items in packing list"}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateDeliveryNote} disabled={!selectedEvent || selectedItems.length === 0}>
              <Truck className="w-4 h-4 mr-2" />
              {language === "es" ? "Crear Conduce" : "Create Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-in Dialog */}
      <Dialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              {language === "es" ? "Check-in de Conduce" : "Delivery Note Check-in"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Registra la devolución de equipos. Los desechables no requieren devolución." 
                : "Record equipment returns. Disposables don't require return."}
            </DialogDescription>
          </DialogHeader>

          {viewingNote && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div><strong>{language === "es" ? "Evento:" : "Event:"}</strong> {getEventName(viewingNote.event_id)}</div>
                <div><strong>{language === "es" ? "Salida:" : "Check-out:"}</strong> {viewingNote.checkout_date ? formatDateOnly(viewingNote.checkout_date, language) : "-"}</div>
              </div>

              <div className="border rounded-lg max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                      <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Salió" : "Out"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Devuelto" : "Returned"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Perdido" : "Lost"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo Pérdida" : "Loss Cost"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingNote.items?.map((item, idx) => {
                      const isEquipment = item.inventory_type === "equipment";
                      const qtyLost = Math.max(0, (item.qty_out || 0) - (item.qty_returned || 0));
                      const lossCost = isEquipment ? qtyLost * (item.replacement_cost || 0) : 0;
                      
                      return (
                        <TableRow key={idx} className={!isEquipment ? "bg-gray-50" : ""}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Badge variant={isEquipment ? "default" : "secondary"}>
                              {isEquipment 
                                ? (language === "es" ? "Equipo ↩️" : "Equipment ↩️")
                                : (language === "es" ? "Desechable 🚫" : "Disposable 🚫")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono">{item.qty_out}</TableCell>
                          <TableCell className="text-center">
                            {isEquipment ? (
                              <Input
                                type="number"
                                value={item.qty_returned || 0}
                                onChange={(e) => updateCheckInItem(idx, "qty_returned", parseInt(e.target.value) || 0)}
                                className="w-20 h-8 text-center mx-auto"
                                max={item.qty_out}
                              />
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEquipment ? (
                              <span className={qtyLost > 0 ? "text-red-600 font-bold" : "text-green-600"}>
                                {qtyLost}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {isEquipment ? (
                              lossCost > 0 ? (
                                <span className="text-red-600">${fmtNum(lossCost)}</span>
                              ) : (
                                <span className="text-green-600">$0.00</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <span className="font-medium">{language === "es" ? "Total Pérdida:" : "Total Loss:"}</span>
                <span className={`text-xl font-bold ${
                  viewingNote.items?.reduce((sum, i) => {
                    if (i.inventory_type !== "equipment") return sum;
                    const lost = Math.max(0, (i.qty_out || 0) - (i.qty_returned || 0));
                    return sum + lost * (i.replacement_cost || 0);
                  }, 0) > 0 ? "text-red-600" : "text-green-600"
                }`}>
                  ${viewingNote.items?.reduce((sum, i) => {
                    if (i.inventory_type !== "equipment") return sum;
                    const lost = Math.max(0, (i.qty_out || 0) - (i.qty_returned || 0));
                    return sum + lost * (i.replacement_cost || 0);
                  }, 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInDialogOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveCheckIn} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {language === "es" ? "Guardar Check-in" : "Save Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Delivery Note Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              {language === "es" ? "Editar Conduce" : "Edit Delivery Note"}
              {editingNote && <Badge variant="outline" className="ml-2">{editingNote.note_number}</Badge>}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Modifica los items antes de realizar el check-in. El inventario se ajustará automáticamente." 
                : "Modify items before check-in. Inventory will be adjusted automatically."}
            </DialogDescription>
          </DialogHeader>

          {editingNote && (
            <div className="space-y-4 flex-1 overflow-y-auto">
              <div className="flex gap-4 text-sm p-3 bg-muted/50 rounded-lg">
                <div><strong>{language === "es" ? "Evento:" : "Event:"}</strong> {getEventName(editingNote.event_id)}</div>
                <div><strong>{language === "es" ? "Salida:" : "Check-out:"}</strong> {editingNote.checkout_date ? formatDateOnly(editingNote.checkout_date, language) : "-"}</div>
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {language === "es" ? "Items en el Conduce" : "Items in Delivery Note"}
                  <Badge variant="secondary">{editingNote.items?.length || 0}</Badge>
                </h4>
                
                {editingNote.items?.length > 0 ? (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                          <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                          <TableHead className="text-center">{language === "es" ? "Cantidad" : "Quantity"}</TableHead>
                          <TableHead>{language === "es" ? "Notas" : "Notes"}</TableHead>
                          <TableHead className="text-right">{language === "es" ? "Costo Reposición" : "Replace Cost"}</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editingNote.items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>
                              <Badge variant={item.inventory_type === "equipment" ? "default" : "secondary"}>
                                {item.inventory_type === "equipment" ? "↩️" : "🚫"} {item.inventory_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                value={item.qty_out || 0}
                                onChange={(e) => updateEditingItem(idx, "qty_out", parseInt(e.target.value) || 0)}
                                className="w-20 h-8 text-center"
                                min={1}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.notes || ""}
                                onChange={(e) => updateEditingItem(idx, "notes", e.target.value)}
                                placeholder={language === "es" ? "Notas..." : "Notes..."}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              ${fmtNum((item.replacement_cost || 0))}
                            </TableCell>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-red-600 hover:text-red-700"
                                onClick={() => removeItemFromEditingNote(idx)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>{language === "es" ? "No hay items en el conduce" : "No items in delivery note"}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {language === "es" ? "Agregar Items" : "Add Items"}
                </h4>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === "es" ? "Item Disponible" : "Available Item"}</TableHead>
                        <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                        <TableHead className="text-center">{language === "es" ? "Stock" : "Stock"}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableInventory
                        .filter(inv => !editingNote.items?.find(i => i.inventory_item_id === inv.ingredient_id))
                        .map(inv => (
                          <TableRow key={inv.ingredient_id}>
                            <TableCell className="font-medium">{inv.name}</TableCell>
                            <TableCell>
                              <Badge variant={inv.inventory_type === "equipment" ? "default" : "secondary"}>
                                {inv.inventory_type === "equipment" ? "↩️" : "🚫"} {inv.inventory_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">{inv.stock_quantity} {inv.unit}</TableCell>
                            <TableCell>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addItemToEditingNote(inv)}
                                disabled={inv.stock_quantity <= 0}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                {language === "es" ? "Agregar" : "Add"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <Label>{language === "es" ? "Notas del Conduce" : "Delivery Note Notes"}</Label>
                <Input
                  value={editingNote.notes || ""}
                  onChange={(e) => setEditingNote({ ...editingNote, notes: e.target.value })}
                  placeholder={language === "es" ? "Notas adicionales..." : "Additional notes..."}
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingNote(null); }}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveEditedNote} disabled={!editingNote?.items?.length}>
              <Save className="w-4 h-4 mr-2" />
              {language === "es" ? "Guardar Cambios" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
