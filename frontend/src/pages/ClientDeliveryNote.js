import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { 
  Truck, Package, Loader2, Calendar, MapPin, Clock, CheckCircle, XCircle, Image
} from "lucide-react";
import { formatDateOnly } from "../utils/dates";

export default function ClientDeliveryNote() {
  const { eventId } = useParams();
  const [notes, setNotes] = useState([]);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("es");

  const isEs = language === "es";

  useEffect(() => {
    fetchDeliveryNotes();
  }, [eventId]);

  const fetchDeliveryNotes = async () => {
    try {
      const response = await axios.get(`${API}/portal/event/${eventId}/delivery-notes`);
      setNotes(response.data || []);
    } catch (error) {
      console.error("Failed to fetch delivery notes:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="font-heading text-xl font-semibold mb-2">
              {isEs ? "Sin Conduces" : "No Delivery Notes"}
            </h2>
            <p className="text-muted-foreground">
              {isEs ? "No hay conduces de entrega para este evento." : "There are no delivery notes for this event."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-heading font-semibold">
                {isEs ? "Conduce de Entrega" : "Delivery Note"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isEs ? "Lista de items para su evento" : "Items list for your event"}
              </p>
            </div>
          </div>
          <Badge variant="outline">
            {notes.length} {isEs ? "conduce(s)" : "note(s)"}
          </Badge>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-8">
          {notes.map((note, idx) => {
            const equipmentItems = note.items?.filter(i => i.inventory_type === "equipment") || [];
            const otherItems = note.items?.filter(i => i.inventory_type !== "equipment") || [];
            const itemsWithPhotos = note.items?.filter(i => i.image_url) || [];

            return (
              <Card key={note.note_id || idx}>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <span className="text-lg">{note.note_number}</span>
                        <Badge variant={note.status === "completed" ? "default" : "secondary"}>
                          {note.status === "completed" 
                            ? (isEs ? "Completado" : "Completed")
                            : note.status === "checked_out"
                            ? (isEs ? "En Tránsito" : "In Transit")
                            : (isEs ? "Pendiente" : "Pending")
                          }
                        </Badge>
                      </CardTitle>
                      {note.checkout_date && (
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDateOnly(note.checkout_date)}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        {equipmentItems.length} {isEs ? "equipos (regresan)" : "equipment (returns)"}
                      </div>
                      <div className="flex items-center gap-2 text-amber-600 mt-1">
                        <XCircle className="w-4 h-4" />
                        {otherItems.length} {isEs ? "consumibles" : "consumables"}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Items Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-3 px-3 font-medium">Item</th>
                          <th className="text-center py-3 px-3 font-medium w-28">
                            {isEs ? "Tipo" : "Type"}
                          </th>
                          <th className="text-center py-3 px-3 font-medium w-28">
                            {isEs ? "Cantidad" : "Quantity"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {note.items?.map((item, itemIdx) => (
                          <tr key={itemIdx} className="border-b hover:bg-muted/30">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-3">
                                {item.image_url ? (
                                  <img 
                                    src={item.image_url} 
                                    alt={item.name} 
                                    className="w-12 h-12 rounded-lg object-cover border"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                    <Package className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                )}
                                <span className="font-medium">{item.name}</span>
                              </div>
                            </td>
                            <td className="text-center py-3 px-3">
                              <Badge variant={item.inventory_type === "equipment" ? "outline" : "secondary"}>
                                {item.inventory_type === "equipment" 
                                  ? (isEs ? "↩️ Equipo" : "↩️ Equipment")
                                  : (isEs ? "🚫 Consumible" : "🚫 Consumable")
                                }
                              </Badge>
                            </td>
                            <td className="text-center py-3 px-3 font-mono font-medium">
                              {item.qty_out} {item.unit || ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Photo Gallery */}
                  {itemsWithPhotos.length > 0 && (
                    <div className="border rounded-lg p-4 bg-blue-50/50">
                      <div className="flex items-center gap-2 mb-4">
                        <Image className="w-5 h-5 text-blue-600" />
                        <h4 className="font-semibold text-blue-900">
                          {isEs ? "Referencia Visual" : "Visual Reference"}
                        </h4>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {itemsWithPhotos.map((item, photoIdx) => (
                          <div key={photoIdx} className="text-center">
                            <img 
                              src={item.image_url} 
                              alt={item.name} 
                              className="w-full aspect-square object-cover rounded-lg border shadow-sm"
                            />
                            <p className="text-xs mt-1 text-muted-foreground truncate">
                              {item.name}
                            </p>
                            <p className="text-xs font-medium">
                              x{item.qty_out}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {note.notes && (
                    <div className="border rounded-lg p-4 bg-amber-50">
                      <p className="text-sm">
                        <span className="font-semibold">{isEs ? "Notas:" : "Notes:"}</span> {note.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            {isEs 
              ? "Los equipos marcados deben ser devueltos al finalizar el evento."
              : "Equipment items must be returned after the event."}
          </p>
        </div>
      </main>
    </div>
  );
}
