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
  Clock, CheckCircle2, Save, Printer, Package, Search, X, Camera, LayoutTemplate, Sparkles
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { fmtNum } from "../../utils/format";
import { PendingReturnsPanel } from "./PendingReturnsPanel";

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
  // Photos: quick capture for the delivery note itself (feature 2).
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Photos captured before the note exists — flushed to /photos after create.
  const [pendingPhotos, setPendingPhotos] = useState([]);
  // Free-text filter for the "Agregar artículo" combobox in the create
  // delivery-note dialog. Matches on `name` (case-insensitive).
  const [itemPickerSearch, setItemPickerSearch] = useState("");
  // Type-based filter chip. `null` = all types.
  const [itemPickerType, setItemPickerType] = useState(null);
  // Packing templates the tenant has created. Loaded lazily when the
  // create-conduce dialog opens.
  const [templates, setTemplates] = useState([]);
  const [applyingTemplateId, setApplyingTemplateId] = useState(null);
  // Photos pulled from an applied template. Rendered as an extra strip in
  // the "Fotos del montaje" panel so the operator sees the reference photos.
  // On save, these URLs are copied to the delivery note's `setup_photos`
  // (they already live in /api/uploads/ so no re-upload is needed).
  const [selectedTemplatePhotos, setSelectedTemplatePhotos] = useState([]);
  // Conflict analysis for the currently-staged items. `null` = not yet
  // checked; empty array = no conflicts; populated = show alert panel.
  const [conflictReport, setConflictReport] = useState(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const uploadNotePhoto = async (file, noteId) => {
    if (!file || !noteId) return null;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await axios.post(
        `${API}/api/delivery-notes/${noteId}/photos`,
        fd,
        { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data.photo_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || (language === "es" ? "Error al subir foto" : "Upload failed"));
      return null;
    }
  };
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
      const [notesRes, eventsRes, invRes, tplRes] = await Promise.all([
        axios.get(`${API}/api/delivery-notes`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/events/confirmed`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/packing-templates`, { withCredentials: true }).catch(() => ({ data: [] })),
      ]);
      setDeliveryNotes(notesRes.data || []);
      setEvents(eventsRes.data || []);
      // Show the ENTIRE inventory in the picker — the previous filter
      // ["equipment", "disposable", "event_supply"] was hiding 919 of 922
      // rows because 99.7% of tenant data is `inventory_type: "food"`.
      // Ops need to be able to reference food supplies from a delivery note
      // too (e.g. an ice cream cart delivering both the machine AND cones).
      setInventory(invRes.data || []);
      setTemplates(tplRes.data || []);
    } catch (error) {
      console.error("Error:", error);
    }
    setLoading(false);
  };

  const handleEventSelect = async (eventId) => {
    setSelectedEvent(eventId);
    if (!eventId) {
      setPackingListItems([]);
      setSelectedItems([]);
      setItemPickerSearch("");
      return;
    }
    
    try {
      const res = await axios.get(`${API}/api/events/${eventId}/packing-list-supplies`, { withCredentials: true }).catch(() => ({ data: [] }));
      setPackingListItems(res.data || []);
      // Start with an EMPTY delivery note. Users complained they had to
      // delete up to 100 items to build a small conduce — now the pattern
      // is additive: pick only what actually goes out.
      setSelectedItems([]);
      setItemPickerSearch("");
    } catch (error) {
      setPackingListItems([]);
      setSelectedItems([]);
    }
  };

  // ---- Add-item flow ------------------------------------------------------
  // Users can add individual items from the packing list one-by-one, or
  // bulk-add everything from the packing list with a single click. Every
  // added item can then have its qty edited or be removed with the × button.

  const addItemToDeliveryNote = (item) => {
    // Always resolve the canonical inventory id — prefer explicit
    // inventory_item_id, else fall back to ingredient_id (for items coming
    // from db.ingredients). This guarantees every selected line is
    // linked back to inventory when the note is created.
    const key = item.inventory_item_id || item.ingredient_id;
    if (!key) return;  // defensive — never accept a "phantom" item
    setSelectedItems((prev) => {
      const idx = prev.findIndex((p) => (p.inventory_item_id || p.ingredient_id) === key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty_out: (copy[idx].qty_out || 1) + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          ...item,
          // Force the canonical id so downstream POST doesn't need fallbacks.
          inventory_item_id: key,
          ingredient_id: key,
          qty_out: item.quantity || 1,
          qty_returned: 0,
          status: "pending",
        },
      ];
    });
  };

  const addAllFromPackingList = () => {
    if (packingListItems.length === 0) return;
    // Merge — additive semantics so users can add from packing then extras
    // from inventory without losing their picks.
    packingListItems.forEach((it) => addItemToDeliveryNote(it));
    toast.success(
      language === "es"
        ? `${packingListItems.length} artículo(s) agregado(s) del packing list`
        : `${packingListItems.length} item(s) added from packing list`
    );
  };

  const removeItemFromDeliveryNote = (idx) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== idx));
    // Any change to selection invalidates the conflict report — force
    // re-check before saving.
    setConflictReport(null);
  };

  // ---- Smart template matching --------------------------------------------
  // Rank templates by how well they match the selected event's event_type
  // and theme. Rank 2 = both match, 1 = one matches, 0 = neither.
  const matchScore = (tpl, event) => {
    if (!event) return 0;
    let score = 0;
    const et = (event.event_type || "").toLowerCase();
    const eth = (event.theme || event.event_theme || "").toLowerCase();
    const tt = (tpl.event_type || "").toLowerCase();
    const th = (tpl.theme || "").toLowerCase();
    if (et && tt && et === tt) score += 2;
    if (eth && th && (eth === th || eth.includes(th) || th.includes(eth))) score += 2;
    // Fuzzy fallback: name/description contains the event theme text.
    if (eth && !th) {
      const hay = `${tpl.name || ""} ${tpl.description || ""}`.toLowerCase();
      if (hay.includes(eth)) score += 1;
    }
    return score;
  };

  // ---- Conflict check ------------------------------------------------------
  const checkConflicts = async () => {
    if (selectedItems.length === 0) {
      setConflictReport({ has_conflict: false, items: [] });
      return;
    }
    setCheckingConflicts(true);
    try {
      const payload = {
        event_id: selectedEvent || null,
        checkout_date: checkoutDate,
        expected_return_date: expectedReturnDate,
        items: selectedItems.map((it) => ({
          inventory_item_id: it.inventory_item_id || it.ingredient_id,
          qty_out: Number(it.qty_out) || 0,
        })),
      };
      const res = await axios.post(
        `${API}/api/delivery-notes/check-conflicts`,
        payload,
        { withCredentials: true }
      );
      setConflictReport(res.data || { has_conflict: false, items: [] });
      if (res.data?.has_conflict) {
        toast.warning(
          language === "es"
            ? "Hay conflictos de disponibilidad. Revisa el panel amarillo."
            : "Availability conflicts detected. See the yellow panel."
        );
      } else {
        toast.success(
          language === "es" ? "Todos los ítems están disponibles" : "All items available"
        );
      }
    } catch (e) {
      toast.error(
        e.response?.data?.detail ||
        (language === "es" ? "Error al verificar conflictos" : "Conflict check failed")
      );
    } finally {
      setCheckingConflicts(false);
    }
  };

  // Substitute an item with an alternative from the conflict report.
  // Removes the original from the note, adds the substitute at the same qty.
  const substituteWithAlternative = (originalItemId, alternative, qty) => {
    setSelectedItems((prev) => {
      // Remove all lines that had the original id.
      const filtered = prev.filter(
        (p) => (p.inventory_item_id || p.ingredient_id) !== originalItemId
      );
      // Add the alternative — mimic addItemToDeliveryNote shape.
      return [
        ...filtered,
        {
          inventory_item_id: alternative.inventory_item_id,
          ingredient_id: alternative.inventory_item_id,
          name: alternative.name,
          unit: alternative.unit,
          inventory_type: "item",
          replacement_cost: alternative.replacement_cost || 0,
          qty_out: qty,
          qty_returned: 0,
          status: "pending",
        },
      ];
    });
    setConflictReport(null);
    toast.success(
      language === "es"
        ? `Sustituido con ${alternative.name}`
        : `Substituted with ${alternative.name}`
    );
  };

  // ---- Apply template ------------------------------------------------------
  // Pulls items + pre-setup photos from a saved packing template and stages
  // them into the current delivery-note draft. Closes the P2 loop: template
  // in Resource Management → conduce with the same items + photos, in 1 tap.
  const applyTemplateToNote = async (templateId) => {
    if (!templateId || !selectedEvent) {
      toast.error(language === "es" ? "Selecciona un evento primero" : "Select an event first");
      return;
    }
    setApplyingTemplateId(templateId);
    try {
      // /preview computes suggested qty by guest_count without reserving stock.
      // Perfect for delivery-note staging where we just need the items list.
      const res = await axios.post(
        `${API}/api/packing-templates/${templateId}/preview`,
        { event_id: selectedEvent },
        { withCredentials: true }
      );
      const data = res.data || {};
      const items = data.items || [];
      const photos = data.setup_photos || [];

      // Enrich each preview item with the inventory row so we can render
      // the right badge + carry replacement_cost forward. Falls back to
      // stubs when the ingredient was deleted from inventory.
      const invById = new Map(
        inventory.map((i) => [i.ingredient_id || i.item_id, i])
      );
      let added = 0;
      items.forEach((it) => {
        const inv = invById.get(it.inventory_item_id) || {};
        addItemToDeliveryNote({
          ...inv,
          inventory_item_id: it.inventory_item_id,
          ingredient_id: it.inventory_item_id,
          name: it.item_name || inv.name,
          quantity: it.suggested_qty,
          unit: it.unit || inv.unit,
          inventory_type: inv.inventory_type || "item",
          replacement_cost: inv.replacement_cost || 0,
        });
        added += 1;
      });

      // Show template photos in the "Fotos del montaje" panel by fetching
      // them and staging as File-like references. Simpler: keep them as
      // URLs the user sees BUT don't try to re-upload (that would duplicate).
      // We surface them read-only as "de la plantilla" preview.
      setSelectedTemplatePhotos(photos);

      toast.success(
        language === "es"
          ? `${added} artículo(s) agregado(s) de la plantilla${photos.length ? ` · ${photos.length} foto(s) adjuntas` : ""}`
          : `${added} article(s) added from template${photos.length ? ` · ${photos.length} photo(s) attached` : ""}`
      );
    } catch (e) {
      toast.error(
        e.response?.data?.detail ||
        (language === "es" ? "Error al aplicar plantilla" : "Failed to apply template")
      );
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const handleCreateDeliveryNote = async () => {
    if (!selectedEvent || selectedItems.length === 0) {
      toast.error(language === "es" ? "Selecciona un evento e items" : "Select an event and items");
      return;
    }

    try {
      const created = await axios.post(`${API}/api/delivery-notes`, {
        event_id: selectedEvent,
        checkout_date: checkoutDate,
        expected_return_date: expectedReturnDate,
        notes: notes,
        // Copy the applied-template photos into the delivery note's own
        // `setup_photos`. They already live under /api/uploads/ so we're just
        // pointing at the same file — no duplication on disk.
        setup_photos: selectedTemplatePhotos,
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

      // Flush any photos the user snapped BEFORE saving. We couldn't upload
      // them earlier because we didn't have a note_id — now we do.
      const newNoteId = created.data?.note_id;
      if (newNoteId && pendingPhotos.length > 0) {
        for (const f of pendingPhotos) {
          await uploadNotePhoto(f, newNoteId);
        }
      }

      toast.success(language === "es" ? "Conduce creado" : "Delivery note created");
      setCreateDialogOpen(false);
      setSelectedEvent("");
      setSelectedItems([]);
      setPendingPhotos([]);
      setSelectedTemplatePhotos([]);
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
      // Send only the fields Sprint C accepts
      const items = viewingNote.items.map((i) => ({
        inventory_item_id: i.inventory_item_id,
        name: i.name,
        qty_returned: i.qty_returned || 0,
        condition: i.condition || "bueno",
        condition_note: i.condition_note || "",
        photo_url: i.photo_url || null,
      }));
      await axios.put(`${API}/api/delivery-notes/${viewingNote.note_id}/check-in`, {
        items,
      }, { withCredentials: true });

      toast.success(language === "es" ? "Check-in guardado" : "Check-in saved");
      setCheckInDialogOpen(false);
      setViewingNote(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving check-in");
    }
  };

  const uploadConditionPhoto = async (index, file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/api/upload`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      updateCheckInItem(index, "photo_url", res.data.url || res.data.file_url);
      toast.success(language === "es" ? "Foto subida" : "Photo uploaded");
    } catch (e) {
      toast.error(language === "es" ? "Error subiendo foto" : "Photo upload failed");
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
      {/* Pending Returns Dashboard */}
      <PendingReturnsPanel
        refreshKey={deliveryNotes.length}
        onOpenNote={(lite) => {
          const full = deliveryNotes.find((n) => n.note_id === lite.note_id);
          if (full) handleCheckIn(full);
        }}
      />

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
                    <TableHead>{language === "es" ? "Dir." : "Dir."}</TableHead>
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
                        <TableCell>
                          {note.direction === "return" ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              {language === "es" ? "Retorno" : "Return"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {language === "es" ? "Salida" : "Outbound"}
                            </Badge>
                          )}
                        </TableCell>
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

            {/* Photo capture — feature 2. For quick jobs where the operator
                snaps a picture of the setup right on their phone. Multiple
                photos supported. They're staged locally until the note is
                created, then uploaded server-side. */}
            <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-sky-600" />
                  {language === "es" ? "Fotos del montaje" : "Setup photos"}
                </Label>
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-sky-300 bg-white text-sky-700 text-xs font-medium cursor-pointer hover:bg-sky-100 transition-colors" data-testid="dn-photo-upload-label">
                  <Plus className="w-3.5 h-3.5" />
                  {language === "es" ? "Agregar foto" : "Add photo"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setPendingPhotos((prev) => [...prev, f]);
                        toast.success(language === "es" ? "Foto lista para subir" : "Photo queued");
                      }
                      e.target.value = "";
                    }}
                    data-testid="dn-photo-input"
                  />
                </label>
              </div>
              {pendingPhotos.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {pendingPhotos.map((f, i) => (
                    <div key={i} className="relative group aspect-square rounded overflow-hidden border">
                      <img
                        src={URL.createObjectURL(f)}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPendingPhotos((prev) => prev.filter((_, k) => k !== i))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {language === "es"
                    ? "Opcional. Sube o toma una foto del montaje ideal. Se guardarán con el conduce."
                    : "Optional. Upload or snap a photo of the ideal setup. Attached to the delivery note."}
                </p>
              )}
              {/* Photos inherited from the applied template. Rendered as a
                  distinct strip so the operator knows these come FROM the
                  template (not photos they snapped themselves). They copy
                  over to the delivery note on save without re-upload. */}
              {selectedTemplatePhotos.length > 0 && (
                <div className="pt-2 border-t border-sky-100">
                  <p className="text-[10px] font-medium text-sky-700 mb-1.5 uppercase tracking-wide">
                    {language === "es" ? "De la plantilla" : "From template"}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedTemplatePhotos.map((url, i) => (
                      <div key={i} className="relative group aspect-square rounded overflow-hidden border border-sky-200">
                        <img
                          src={`${API}${url}`}
                          alt="template setup"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => window.open(`${API}${url}`, "_blank")}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedTemplatePhotos((prev) => prev.filter((_, k) => k !== i))}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          aria-label="drop template photo"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedEvent && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2" data-testid="dn-item-picker">
                {/* Template applier — one-click hydration from a saved packing
                    template. Populates items + photos + suggested quantities
                    computed from the event's guest_count.
                    Templates are RANKED by match against the selected event's
                    event_type + theme so the operator sees the best fit first,
                    starred visually. */}
                {templates.length > 0 && (
                  <div className="pb-2 mb-1 border-b border-emerald-100">
                    <Label className="text-xs font-medium mb-1.5 block">
                      {language === "es" ? "O aplicar una plantilla" : "Or apply a template"}
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[...templates]
                        .map((tpl) => ({
                          ...tpl,
                          _score: matchScore(tpl, events.find((e) => e.event_id === selectedEvent)),
                        }))
                        .sort((a, b) => b._score - a._score)
                        .map((tpl) => (
                          <Button
                            key={tpl.template_id}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={applyingTemplateId === tpl.template_id}
                            onClick={() => applyTemplateToNote(tpl.template_id)}
                            className={`h-7 text-xs transition-all ${
                              tpl._score >= 2
                                ? "border-yellow-400 bg-yellow-50 hover:bg-yellow-100 shadow-sm"
                                : "border-emerald-300 hover:bg-emerald-100"
                            }`}
                            data-testid={`dn-apply-tpl-${tpl.template_id}`}
                            title={tpl._score >= 2
                              ? (language === "es"
                                  ? `Recomendada: coincide con tipo/tema del evento (${tpl.event_type}${tpl.theme ? " · " + tpl.theme : ""})`
                                  : `Recommended: matches event type/theme (${tpl.event_type}${tpl.theme ? " · " + tpl.theme : ""})`)
                              : (tpl.theme ? `${tpl.event_type} · ${tpl.theme}` : tpl.event_type)}
                          >
                            {tpl._score >= 2 && (
                              <Sparkles className="w-3 h-3 mr-1 text-yellow-600" />
                            )}
                            {tpl._score < 2 && (
                              <LayoutTemplate className="w-3 h-3 mr-1" />
                            )}
                            {tpl.name}
                            {(tpl.setup_photos || []).length > 0 && (
                              <Camera className="w-3 h-3 ml-1 text-emerald-600" />
                            )}
                            {applyingTemplateId === tpl.template_id && (
                              <span className="ml-1 animate-pulse">…</span>
                            )}
                          </Button>
                        ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">
                    {language === "es" ? "Agregar artículos" : "Add articles"}
                  </Label>
                  {packingListItems.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addAllFromPackingList}
                      className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                      data-testid="dn-add-all-btn"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {language === "es"
                        ? `Agregar todos (${packingListItems.length})`
                        : `Add all (${packingListItems.length})`}
                    </Button>
                  )}
                </div>
                {/* Combined pool: packing-list items first (higher signal),
                    then inventory extras. Users can filter to find fast. */}
                {(() => {
                  const pool = [];
                  const seen = new Set();
                  for (const it of packingListItems) {
                    const k = it.inventory_item_id || it.ingredient_id;
                    if (!seen.has(k)) { pool.push({ ...it, _fromPacking: true }); seen.add(k); }
                  }
                  for (const it of inventory) {
                    const k = it.ingredient_id || it.item_id;
                    if (!seen.has(k)) {
                      pool.push({
                        ...it,
                        inventory_item_id: k,
                        _fromPacking: false,
                      });
                      seen.add(k);
                    }
                  }
                  // Type-based counts for the filter chip labels — computed
                  // once BEFORE the search filter so counts don't change as
                  // the user types (would feel jumpy).
                  const typeCounts = pool.reduce((acc, p) => {
                    const t = p.inventory_type || "item";
                    acc[t] = (acc[t] || 0) + 1;
                    return acc;
                  }, {});
                  const typeChips = [
                    { key: null, label: language === "es" ? "Todos" : "All" },
                    { key: "equipment", label: language === "es" ? "Equipos" : "Equipment" },
                    { key: "food", label: language === "es" ? "Alimentos" : "Food" },
                    { key: "disposable", label: language === "es" ? "Desechables" : "Disposable" },
                    { key: "event_supply", label: language === "es" ? "Suministros" : "Supplies" },
                  ];
                  const q = itemPickerSearch.trim().toLowerCase();
                  const filtered = pool.filter((p) => {
                    if (itemPickerType && (p.inventory_type || "item") !== itemPickerType) return false;
                    if (!q) return true;
                    return (p.name || "").toLowerCase().includes(q);
                  });
                  return (
                    <>
                      {/* Type filter chips — only show categories that
                          actually have items in the pool. Keeps the row
                          tight and avoids empty-click dead ends. */}
                      <div className="flex flex-wrap gap-1">
                        {typeChips.map((chip) => {
                          const count = chip.key === null
                            ? pool.length
                            : (typeCounts[chip.key] || 0);
                          if (chip.key !== null && count === 0) return null;
                          const isActive = itemPickerType === chip.key;
                          return (
                            <button
                              key={chip.key || "all"}
                              type="button"
                              onClick={() => setItemPickerType(chip.key)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                                isActive
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"
                              }`}
                              data-testid={`dn-type-chip-${chip.key || "all"}`}
                            >
                              {chip.label} ({count})
                            </button>
                          );
                        })}
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          value={itemPickerSearch}
                          onChange={(e) => setItemPickerSearch(e.target.value)}
                          placeholder={language === "es"
                            ? "Buscar artículo…"
                            : "Search article…"}
                          className="pl-8 h-8 text-sm"
                          data-testid="dn-item-picker-search"
                        />
                      </div>
                      {(itemPickerSearch || itemPickerType) && (
                        <div className="max-h-40 overflow-y-auto space-y-0.5" data-testid="dn-item-picker-results">
                          {filtered.length === 0 && (
                            <p className="text-xs text-muted-foreground italic py-2 text-center">
                              {language === "es" ? "Sin coincidencias" : "No matches"}
                            </p>
                          )}
                          {filtered.slice(0, 30).map((it) => {
                            const key = it.inventory_item_id || it.ingredient_id || it.item_id;
                            // Prefer the tenant-provided `inventory_type`
                            // ("equipment" / "disposable" / "food" / etc.) — falls
                            // back to a neutral "item" for legacy rows. This
                            // is what the UI badge shows so the operator knows
                            // whether the picked line will need a return check-in.
                            const itype = it.inventory_type || "item";
                            const typeLabel = itype === "equipment"
                              ? (language === "es" ? "Equipo" : "Equipment")
                              : itype === "disposable"
                              ? (language === "es" ? "Desechable" : "Disposable")
                              : itype === "food"
                              ? (language === "es" ? "Alimento" : "Food")
                              : itype === "event_supply"
                              ? (language === "es" ? "Suministro" : "Supply")
                              : itype;
                            const typeColor = itype === "equipment"
                              ? "border-blue-400 text-blue-700 bg-blue-50"
                              : itype === "disposable"
                              ? "border-orange-400 text-orange-700 bg-orange-50"
                              : itype === "food"
                              ? "border-purple-400 text-purple-700 bg-purple-50"
                              : "border-slate-300 text-slate-600 bg-slate-50";
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  addItemToDeliveryNote(it);
                                  setItemPickerSearch("");
                                }}
                                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-white hover:shadow-sm transition-all"
                                data-testid={`dn-item-add-${key}`}
                              >
                                <span className="flex-1 truncate flex items-center gap-1.5">
                                  <span className="font-medium">{it.name}</span>
                                  <Badge variant="outline" className={`text-[9px] py-0 px-1 ${typeColor}`}>
                                    {typeLabel}
                                  </Badge>
                                  {it._fromPacking && (
                                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-emerald-400 text-emerald-700 bg-white">
                                      packing
                                    </Badge>
                                  )}
                                </span>
                                <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              </button>
                            );
                          })}
                          {filtered.length > 30 && (
                            <p className="text-[10px] text-muted-foreground italic px-2 py-1">
                              {language === "es"
                                ? `Mostrando 30 de ${filtered.length}. Refina la búsqueda.`
                                : `Showing 30 of ${filtered.length}. Refine your search.`}
                            </p>
                          )}
                        </div>
                      )}
                      {!itemPickerSearch && !itemPickerType && (
                        <p className="text-[11px] text-muted-foreground">
                          {language === "es"
                            ? "Escribe para buscar o filtra por tipo. Click en un artículo para agregarlo al conduce."
                            : "Type to search or filter by type. Click an article to add it to the delivery note."}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                      <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo Rep." : "Rep. Cost"}</TableHead>
                      <TableHead className="w-10"></TableHead>
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
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeItemFromDeliveryNote(idx)}
                            data-testid={`dn-item-remove-${idx}`}
                            aria-label="remove item"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] text-muted-foreground">
                  {language === "es"
                    ? `${selectedItems.length} artículo(s) en el conduce`
                    : `${selectedItems.length} article(s) in the delivery note`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={checkConflicts}
                  disabled={checkingConflicts}
                  className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
                  data-testid="dn-check-conflicts-btn"
                >
                  <AlertTriangle className={`w-3 h-3 mr-1 ${checkingConflicts ? "animate-pulse" : ""}`} />
                  {checkingConflicts
                    ? (language === "es" ? "Verificando…" : "Checking…")
                    : (language === "es" ? "Verificar disponibilidad" : "Check availability")}
                </Button>
              </div>
            )}

            {conflictReport && (
              <div
                className={`rounded-lg border p-3 space-y-2 ${
                  conflictReport.has_conflict
                    ? "border-amber-300 bg-amber-50"
                    : "border-emerald-300 bg-emerald-50"
                }`}
                data-testid="dn-conflict-panel"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">
                    {conflictReport.has_conflict ? (
                      <span className="text-amber-800">
                        ⚠ {language === "es"
                          ? "Conflictos detectados. Revisa cada ítem:"
                          : "Conflicts detected. Review each item:"}
                      </span>
                    ) : (
                      <span className="text-emerald-800">
                        ✓ {language === "es"
                          ? "Todos los ítems están disponibles."
                          : "All items are available."}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setConflictReport(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    aria-label="dismiss"
                  >
                    ×
                  </button>
                </div>
                {conflictReport.has_conflict && (
                  <div className="space-y-2">
                    {(conflictReport.items || []).filter((it) => it.conflict).map((it) => (
                      <div key={it.inventory_item_id} className="rounded bg-white border border-amber-200 p-2 text-xs">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <p className="font-medium text-slate-800">{it.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {language === "es"
                                ? `Pedido: ${it.qty_requested} · Disponible: ${it.available} · Faltante: ${it.shortage}`
                                : `Requested: ${it.qty_requested} · Available: ${it.available} · Short: ${it.shortage}`}
                            </p>
                            {(it.currently_checked_out > 0 || it.already_reserved > 0) && (
                              <p className="text-[10px] text-amber-700 mt-0.5">
                                {it.currently_checked_out > 0 && (
                                  <span>
                                    🚚 {it.currently_checked_out} {language === "es" ? "en uso" : "checked out"}
                                    {it.blocking_notes?.length > 0 && ` (${it.blocking_notes.map(n => n.note_number).filter(Boolean).slice(0, 2).join(", ")})`}
                                  </span>
                                )}
                                {it.currently_checked_out > 0 && it.already_reserved > 0 && " · "}
                                {it.already_reserved > 0 && (
                                  <span>
                                    📌 {it.already_reserved} {language === "es" ? "reservados" : "reserved"}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        {(it.alternatives || []).length > 0 ? (
                          <div className="mt-2 pt-2 border-t border-amber-100 space-y-1">
                            <p className="text-[10px] font-medium text-amber-800 uppercase tracking-wide">
                              {language === "es" ? "Alternativas sugeridas" : "Suggested alternatives"}
                            </p>
                            {it.alternatives.map((alt) => (
                              <button
                                key={alt.inventory_item_id}
                                type="button"
                                onClick={() => substituteWithAlternative(it.inventory_item_id, alt, it.qty_requested)}
                                className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs hover:bg-amber-100 transition-colors text-left"
                                data-testid={`dn-alt-${alt.inventory_item_id}`}
                              >
                                <span>
                                  <span className="font-medium">{alt.name}</span>
                                  <span className="text-muted-foreground ml-1">
                                    ({alt.available} {alt.unit || ""} {language === "es" ? "disponibles" : "available"})
                                  </span>
                                </span>
                                <span className="text-emerald-700 font-medium">
                                  {language === "es" ? "Sustituir →" : "Substitute →"}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[10px] italic text-muted-foreground">
                            {language === "es"
                              ? "Sin alternativas con stock suficiente en el inventario."
                              : "No alternatives with enough stock in inventory."}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedEvent && selectedItems.length === 0 && (
              <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {language === "es"
                    ? "Aún no has agregado artículos al conduce."
                    : "You haven't added any articles yet."}
                </p>
                <p className="text-xs mt-1">
                  {language === "es"
                    ? "Usa el buscador de arriba o el botón \"Agregar todos\"."
                    : "Use the search box above or the \"Add all\" button."}
                </p>
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
                      <TableHead>{language === "es" ? "Condición" : "Condition"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo Pérdida" : "Loss Cost"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingNote.items?.map((item, idx) => {
                      const isEquipment = item.inventory_type === "equipment";
                      const qtyLost = Math.max(0, (item.qty_out || 0) - (item.qty_returned || 0));
                      const condition = item.condition || "bueno";
                      // Loss cost applies if faltante, or if dañado (reposición), or missing qty
                      const chargeLoss = qtyLost > 0 || condition === "dañado" || condition === "faltante";
                      const chargeQty = condition === "dañado"
                        ? (item.qty_out || 0)
                        : qtyLost;
                      const lossCost = isEquipment && chargeLoss ? chargeQty * (item.replacement_cost || 0) : 0;

                      return (
                        <TableRow
                          key={idx}
                          className={!isEquipment ? "bg-gray-50" : condition === "dañado" ? "bg-orange-50" : condition === "faltante" ? "bg-red-50" : ""}
                          data-testid={`checkin-row-${idx}`}
                        >
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Badge variant={isEquipment ? "default" : "secondary"}>
                              {isEquipment
                                ? (language === "es" ? "Equipo" : "Equipment")
                                : (language === "es" ? "Desechable" : "Disposable")}
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
                                data-testid={`checkin-qty-returned-${idx}`}
                              />
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEquipment ? (
                              <div className="space-y-1">
                                <Select
                                  value={condition}
                                  onValueChange={(v) => updateCheckInItem(idx, "condition", v)}
                                >
                                  <SelectTrigger
                                    className={`w-36 h-8 ${condition === "dañado" ? "border-orange-400" : condition === "faltante" ? "border-red-400" : ""}`}
                                    data-testid={`checkin-condition-${idx}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="bueno">{language === "es" ? "Bueno" : "Good"}</SelectItem>
                                    <SelectItem value="dañado">{language === "es" ? "Dañado" : "Damaged"}</SelectItem>
                                    <SelectItem value="faltante">{language === "es" ? "Faltante" : "Missing"}</SelectItem>
                                  </SelectContent>
                                </Select>
                                {(condition === "dañado" || condition === "faltante") && (
                                  <div className="space-y-1 pt-1">
                                    <Input
                                      value={item.condition_note || ""}
                                      onChange={(e) => updateCheckInItem(idx, "condition_note", e.target.value)}
                                      placeholder={language === "es" ? "Nota (opcional)" : "Note (optional)"}
                                      className="h-7 text-xs"
                                      data-testid={`checkin-note-${idx}`}
                                    />
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="file"
                                        accept="image/*"
                                        className="h-7 text-xs file:mr-2 file:text-xs"
                                        onChange={(e) => uploadConditionPhoto(idx, e.target.files?.[0])}
                                        data-testid={`checkin-photo-${idx}`}
                                      />
                                      {item.photo_url && (
                                        <a href={item.photo_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                                          {language === "es" ? "Ver foto" : "View photo"}
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
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
