import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import SignatureCanvas from "react-signature-canvas";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { toast } from "sonner";
import { 
  FileText, CheckCircle, Calendar, Users, MapPin, ChefHat, Loader2,
  Utensils, Wine, Armchair, Package, Clock, DollarSign, CalendarDays
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Item type icons
const TYPE_ICONS = {
  Food: Utensils,
  Service: Package,
  Rental: Armchair,
  Fee: DollarSign,
  Other: Package
};

// Nice display names for item types
const TYPE_DISPLAY = {
  Food: { en: "Custom Menu", es: "Menú Personalizado" },
  Service: { en: "Services", es: "Servicios" },
  Rental: { en: "Rentals & Equipment", es: "Alquileres y Equipos" },
  Fee: { en: "Fees", es: "Cargos" },
  Other: { en: "Other Items", es: "Otros" }
};

export default function ClientPortal() {
  const { documentId } = useParams();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signedBy, setSignedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const sigCanvasRef = useRef(null);

  useEffect(() => {
    fetchDocument();
  }, [documentId]);

  const fetchDocument = async () => {
    try {
      const response = await axios.get(`${API}/portal/document/${documentId}`);
      setDocument(response.data);
    } catch (error) {
      console.error("Failed to fetch document:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      toast.error("Please sign first");
      return;
    }
    if (!signedBy.trim()) {
      toast.error("Please enter your name");
      return;
    }
    
    setSaving(true);
    const signature = sigCanvasRef.current.toDataURL();
    try {
      await axios.post(`${API}/portal/document/${documentId}/sign`, {
        signature,
        signed_by: signedBy,
      });
      toast.success("Document signed successfully!");
      fetchDocument();
      setSigning(false);
    } catch (error) {
      toast.error("Failed to sign document");
    } finally {
      setSaving(false);
    }
  };

  const handleClearSignature = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="font-heading text-xl font-semibold mb-2">Document Not Found</h2>
            <p className="text-muted-foreground">This document may have been removed or the link is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = document.content || {};
  const event = content.event || {};
  const client = content.client || {};
  const company = content.company || {};
  const financials = content.financials || {};
  const itemsByType = content.items_by_type || {};
  const itemsByDay = content.items_by_day || {};
  const isMultiday = content.is_multiday || false;
  const orderItems = content.order_items || [];
  const recipes = content.recipes || [];

  // Detect language from company or default to Spanish
  const lang = company.default_language || "es";
  const isEs = lang === "es" || lang === "ES";

  const docTypeLabels = {
    quote: isEs ? "Propuesta" : "Proposal",
    beo: isEs ? "Orden de Evento" : "Banquet Event Order",
    kitchen_sheet: isEs ? "Hoja de Cocina" : "Kitchen Sheet",
    packing_list: isEs ? "Lista de Montaje" : "Packing List",
    mise_en_place: "Mise en Place",
    contract: isEs ? "Contrato" : "Contract",
    invoice: isEs ? "Factura" : "Invoice",
    menu: isEs ? "Menú" : "Menu"
  };

  // Determine display order: Services/Rentals first, Food (Menu) last
  const typeOrder = ["Service", "Rental", "Fee", "Other", "Food"];

  // Helper to render items table
  const renderItemsTable = (items, showPrices = true) => {
    if (!items || items.length === 0) return null;
    
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left py-3 px-2 font-medium">{isEs ? "Descripción" : "Description"}</th>
            <th className="text-center py-3 px-2 font-medium w-20">{isEs ? "Cant." : "Qty"}</th>
            {showPrices && (
              <>
                <th className="text-right py-3 px-2 font-medium w-28">{isEs ? "Precio" : "Price"}</th>
                <th className="text-right py-3 px-2 font-medium w-28">{isEs ? "Total" : "Total"}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b hover:bg-muted/30">
              <td className="py-3 px-2">
                <p className="font-medium">{item.description}</p>
                {item.internal_notes && document.document_type !== "quote" && (
                  <p className="text-xs text-muted-foreground mt-1">{item.internal_notes}</p>
                )}
              </td>
              <td className="text-center py-3 px-2">{item.quantity}</td>
              {showPrices && (
                <>
                  <td className="text-right py-3 px-2 font-mono">
                    ${(item.unit_price || 0).toFixed(2)}
                  </td>
                  <td className="text-right py-3 px-2 font-mono font-medium">
                    ${((item.quantity || 1) * (item.unit_price || 0)).toFixed(2)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // Render items grouped by type (for single-day events)
  const renderItemsByType = () => {
    const showPrices = document.document_type === "quote" || document.document_type === "contract" || document.document_type === "invoice";
    
    return (
      <div className="space-y-8">
        {typeOrder.map(type => {
          const items = itemsByType[type] || [];
          if (items.length === 0) return null;
          
          const Icon = TYPE_ICONS[type] || Package;
          const displayName = TYPE_DISPLAY[type]?.[lang] || type;
          
          return (
            <div key={type} className={type === "Food" ? "pt-4" : ""}>
              {/* Special styling for Food/Menu section */}
              {type === "Food" ? (
                <div className="bg-gradient-to-r from-primary/5 to-transparent p-4 rounded-lg mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <ChefHat className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-heading text-lg font-semibold">
                        {isEs ? "Menú Personalizado" : "Custom Menu"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {isEs ? `Para ${event.guest_count || 0} invitados` : `For ${event.guest_count || 0} guests`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-heading font-semibold">{displayName}</h3>
                </div>
              )}
              
              <div className="border rounded-lg overflow-hidden">
                {renderItemsTable(items, showPrices)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render items grouped by day (for multi-day events)
  const renderItemsByDay = () => {
    const showPrices = document.document_type === "quote" || document.document_type === "contract" || document.document_type === "invoice";
    const days = Object.keys(itemsByDay).sort();
    
    return (
      <div className="space-y-10">
        {days.map((day, dayIdx) => {
          const dayItems = itemsByDay[day] || [];
          if (dayItems.length === 0) return null;
          
          // Group items by type for this day
          const dayItemsByType = {};
          dayItems.forEach(item => {
            const type = item.item_type || "Other";
            if (!dayItemsByType[type]) dayItemsByType[type] = [];
            dayItemsByType[type].push(item);
          });
          
          // Format day display
          let dayDisplay = day;
          if (day === "main") {
            dayDisplay = isEs ? "Día Principal" : "Main Day";
          } else {
            try {
              const dayDate = new Date(day);
              dayDisplay = dayDate.toLocaleDateString(isEs ? "es" : "en", { 
                weekday: "long", 
                month: "long", 
                day: "numeric" 
              });
            } catch (e) {
              dayDisplay = `${isEs ? "Día" : "Day"} ${dayIdx + 1}`;
            }
          }
          
          return (
            <div key={day}>
              {/* Day Header */}
              <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-primary/20">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-heading text-xl font-semibold capitalize">{dayDisplay}</h2>
              </div>
              
              {/* Items for this day, grouped by type */}
              <div className="space-y-6 pl-4 border-l-2 border-muted">
                {typeOrder.map(type => {
                  const items = dayItemsByType[type] || [];
                  if (items.length === 0) return null;
                  
                  const Icon = TYPE_ICONS[type] || Package;
                  const displayName = TYPE_DISPLAY[type]?.[lang] || type;
                  
                  return (
                    <div key={type}>
                      {type === "Food" ? (
                        <div className="bg-gradient-to-r from-primary/5 to-transparent p-3 rounded-lg mb-3 ml-[-8px]">
                          <div className="flex items-center gap-2">
                            <ChefHat className="w-5 h-5 text-primary" />
                            <h4 className="font-heading font-semibold">
                              {isEs ? "Menú Personalizado" : "Custom Menu"}
                            </h4>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <h4 className="font-medium text-sm">{displayName}</h4>
                        </div>
                      )}
                      <div className="border rounded-lg overflow-hidden">
                        {renderItemsTable(items, showPrices)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Legacy recipes display (fallback if no order_items)
  const renderLegacyRecipes = () => {
    if (!recipes || recipes.length === 0) return null;
    
    return (
      <div>
        <div className="bg-gradient-to-r from-primary/5 to-transparent p-4 rounded-lg mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold">
                {isEs ? "Menú Personalizado" : "Custom Menu"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isEs ? `Para ${event.guest_count || 0} invitados` : `For ${event.guest_count || 0} guests`}
              </p>
            </div>
          </div>
        </div>
        
        {document.document_type === "quote" ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-3 font-medium">{isEs ? "Plato" : "Dish"}</th>
                  <th className="text-center py-3 px-3 font-medium">{isEs ? "Porciones" : "Servings"}</th>
                  <th className="text-right py-3 px-3 font-medium">{isEs ? "Precio/Porción" : "Price/Serving"}</th>
                  <th className="text-right py-3 px-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe, index) => (
                  <tr key={index} className="border-b hover:bg-muted/30">
                    <td className="py-3 px-3">
                      <p className="font-medium">{recipe.name}</p>
                      {recipe.description && (
                        <p className="text-xs text-muted-foreground mt-1">{recipe.description}</p>
                      )}
                    </td>
                    <td className="text-center py-3 px-3">{event.guest_count}</td>
                    <td className="text-right py-3 px-3 font-mono">${(recipe.cost_per_serving || recipe.cost_per_portion || 0).toFixed(2)}</td>
                    <td className="text-right py-3 px-3 font-mono font-medium">
                      ${((recipe.cost_per_serving || recipe.cost_per_portion || 0) * (event.guest_count || 1)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            {recipes.map((recipe, index) => (
              <div key={index} className="p-4 border rounded-lg hover:bg-muted/30">
                <div className="flex items-center gap-2 mb-1">
                  <ChefHat className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold">{recipe.name}</h4>
                </div>
                {recipe.description && (
                  <p className="text-sm text-muted-foreground ml-6">{recipe.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background" data-testid="client-portal-page">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: company.primary_color || "#3A4D3F" }}
            >
              <span className="font-heading text-xl font-bold text-white">
                {company.name?.charAt(0) || "E"}
              </span>
            </div>
            <div>
              <h1 className="font-heading font-semibold">{company.name || "Events Platform"}</h1>
              <p className="text-xs text-muted-foreground">{isEs ? "Portal del Cliente" : "Client Portal"}</p>
            </div>
          </div>
          {document.status === "signed" && (
            <Badge className="bg-success/10 text-success">
              <CheckCircle className="w-3 h-3 mr-1" /> {isEs ? "Firmado" : "Signed"}
            </Badge>
          )}
        </div>
      </header>

      {/* Document */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="font-heading text-2xl">{document.title}</CardTitle>
                <Badge variant="outline" className="mt-2">
                  {docTypeLabels[document.document_type] || document.document_type}
                </Badge>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>{isEs ? "Fecha" : "Date"}: {new Date(content.generated_at || document.created_at).toLocaleDateString()}</p>
                <p>#{document.document_id?.slice(-8)}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Event & Client Info */}
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-heading font-semibold mb-4">{isEs ? "Detalles del Evento" : "Event Details"}</h3>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-lg">{event.name}</p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    {event.event_date ? new Date(event.event_date).toLocaleDateString() : "-"}
                    {isMultiday && event.end_date && (
                      <span> - {new Date(event.end_date).toLocaleDateString()}</span>
                    )}
                  </p>
                  {event.start_time && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {event.start_time}{event.end_time && ` - ${event.end_time}`}
                    </p>
                  )}
                  {event.venue && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {event.venue}
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {event.guest_count} {isEs ? "invitados" : "guests"}
                  </p>
                </div>
              </div>
              <div>
                <h3 className="font-heading font-semibold mb-4">{isEs ? "Cliente" : "Client"}</h3>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-lg">{client.name || client.display_name}</p>
                  {client.email && <p className="text-muted-foreground">{client.email}</p>}
                  {client.phone && <p className="text-muted-foreground">{client.phone}</p>}
                </div>
              </div>
            </div>

            <Separator />

            {/* Order Items - Organized Display */}
            {orderItems.length > 0 ? (
              isMultiday ? renderItemsByDay() : renderItemsByType()
            ) : (
              renderLegacyRecipes()
            )}

            {/* Financials Summary */}
            {(document.document_type === "quote" || document.document_type === "contract" || document.document_type === "invoice") && financials && (
              <div className="mt-8 pt-6 border-t">
                <div className="flex justify-end">
                  <div className="w-full max-w-xs space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{isEs ? "Subtotal" : "Subtotal"}</span>
                      <span className="font-mono">${(financials.subtotal || 0).toFixed(2)}</span>
                    </div>
                    {financials.discount_amount > 0 && (
                      <div className="flex justify-between text-sm text-success">
                        <span>{isEs ? "Descuento" : "Discount"} ({financials.discount_percent}%)</span>
                        <span className="font-mono">-${financials.discount_amount.toFixed(2)}</span>
                      </div>
                    )}
                    {financials.tax_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{isEs ? "Impuesto" : "Tax"} ({financials.tax_percent}%)</span>
                        <span className="font-mono">${financials.tax_amount.toFixed(2)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total</span>
                      <span className="font-mono">${(financials.total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Existing Signature */}
            {document.signature && (
              <div className="pt-8 border-t">
                <p className="text-sm text-muted-foreground mb-4">
                  {isEs ? "Firmado por" : "Signed by"}: {document.signed_by}
                </p>
                <img src={document.signature} alt="Signature" className="max-h-24" />
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(document.signed_at).toLocaleString()}
                </p>
              </div>
            )}

            {/* Sign Button */}
            {document.status !== "signed" && !signing && document.requires_signature && (
              <div className="pt-8 border-t">
                <Button onClick={() => setSigning(true)} className="w-full sm:w-auto" data-testid="start-sign-btn">
                  {isEs ? "Firmar Documento" : "Sign Document"}
                </Button>
              </div>
            )}

            {/* Signature Form */}
            {signing && (
              <div className="pt-8 border-t space-y-4">
                <h3 className="font-heading font-semibold">{isEs ? "Firmar Documento" : "Sign Document"}</h3>
                <div className="space-y-2">
                  <Label>{isEs ? "Su Nombre" : "Your Name"}</Label>
                  <Input
                    value={signedBy}
                    onChange={(e) => setSignedBy(e.target.value)}
                    placeholder={isEs ? "Ingrese su nombre completo" : "Enter your full name"}
                    data-testid="signature-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isEs ? "Firma" : "Signature"}</Label>
                  <div className="border rounded-lg bg-white">
                    <SignatureCanvas
                      ref={sigCanvasRef}
                      penColor="#1A1A1A"
                      canvasProps={{
                        width: 600,
                        height: 200,
                        className: "w-full rounded-lg",
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleClearSignature}>
                    {isEs ? "Limpiar" : "Clear"}
                  </Button>
                  <Button variant="outline" onClick={() => setSigning(false)}>
                    {isEs ? "Cancelar" : "Cancel"}
                  </Button>
                  <Button onClick={handleSign} disabled={saving} data-testid="confirm-portal-sign-btn">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {isEs ? "Firmar y Enviar" : "Sign & Submit"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signed Confirmation */}
        {document.status === "signed" && (
          <Card className="bg-success/5 border-success">
            <CardContent className="p-6 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-success mb-4" />
              <h3 className="font-heading text-xl font-semibold mb-2">
                {isEs ? "¡Gracias!" : "Thank You!"}
              </h3>
              <p className="text-muted-foreground">
                {isEs 
                  ? "Este documento ha sido firmado y enviado exitosamente."
                  : "This document has been signed and submitted successfully."}
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-4 text-center text-sm text-muted-foreground">
          Powered by Evoke OS
        </div>
      </footer>
    </div>
  );
}
