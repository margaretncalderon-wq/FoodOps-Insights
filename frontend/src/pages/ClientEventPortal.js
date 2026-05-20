import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { 
  FileText, Loader2, Calendar, MapPin, Users, Building2, 
  FileSignature, Receipt, ClipboardList, Truck, Clock, 
  CheckCircle, ExternalLink, PlayCircle, ChefHat
} from "lucide-react";
import { formatDateOnly } from "../utils/dates";

export default function ClientEventPortal() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("documents");

  const isEs = true; // Default to Spanish

  useEffect(() => {
    fetchEventData();
  }, [eventId]);

  const fetchEventData = async () => {
    try {
      const response = await axios.get(`${API}/portal/event/${eventId}/all-documents`);
      setData(response.data);
    } catch (error) {
      console.error("Failed to fetch event data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDocTypeIcon = (type) => {
    const icons = {
      proposal: FileText,
      quote: FileText,
      contract: FileSignature,
      invoice: Receipt,
      kitchen_sheet: ChefHat,
      packing_list: ClipboardList,
      beo: ClipboardList,
      mise_en_place: ClipboardList
    };
    return icons[type] || FileText;
  };

  const getDocTypeLabel = (type) => {
    const labels = {
      proposal: isEs ? "Propuesta" : "Proposal",
      quote: isEs ? "Cotización" : "Quote",
      contract: isEs ? "Contrato" : "Contract",
      invoice: isEs ? "Factura" : "Invoice",
      receipt: isEs ? "Recibo" : "Receipt",
      statement: isEs ? "Estado de Cuenta" : "Account Statement",
      kitchen_sheet: isEs ? "Hoja de Cocina" : "Kitchen Sheet",
      packing_list: isEs ? "Lista de Montaje" : "Packing List",
      beo: isEs ? "Orden de Evento" : "Banquet Event Order",
      mise_en_place: "Mise en Place"
    };
    return labels[type] || type;
  };

  const getStatusBadge = (doc) => {
    if (doc.status === "signed") {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" /> {isEs ? "Firmado" : "Signed"}</Badge>;
    }
    if (doc.requires_signature) {
      return <Badge variant="outline" className="text-amber-600 border-amber-300">{isEs ? "Pendiente Firma" : "Pending Signature"}</Badge>;
    }
    return <Badge variant="secondary">{isEs ? "Activo" : "Active"}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || !data.event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="font-heading text-xl font-semibold mb-2">
              {isEs ? "Evento No Encontrado" : "Event Not Found"}
            </h2>
            <p className="text-muted-foreground">
              {isEs ? "Este enlace puede haber expirado o ser inválido." : "This link may have expired or is invalid."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { event, client, company, documents, delivery_notes, blueprint } = data;

  // Filter client-facing documents
  // Filter client-facing documents only
  const clientDocuments = documents?.filter(d => 
    ["proposal", "quote", "contract", "invoice", "receipt", "statement"].includes(d.document_type)
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {company?.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="h-10 w-auto" />
              ) : (
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: company?.primary_color || '#3A4D3F' }}
                >
                  {company?.name?.charAt(0) || 'K'}
                </div>
              )}
              <div>
                <h1 className="font-heading text-lg font-semibold">{event.name}</h1>
                <p className="text-sm text-muted-foreground">{company?.name}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-base px-3 py-1">
              <Calendar className="w-4 h-4 mr-2" />
              {event.event_date ? formatDateOnly(event.event_date) : "-"}
            </Badge>
          </div>
        </div>
      </header>

      {/* Event Info Banner */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {client && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{client.name}</span>
              </div>
            )}
            {event.venue && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{event.venue}</span>
              </div>
            )}
            {event.guest_count && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span>{event.guest_count} {isEs ? "invitados" : "guests"}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4" />
              {isEs ? "Documentos" : "Documents"}
            </TabsTrigger>
            <TabsTrigger value="event-design" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              {isEs ? "Diseño del Evento" : "Event Design"}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-2">
              <Clock className="w-4 h-4" />
              Run of Show
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-2">
              <Truck className="w-4 h-4" />
              {isEs ? "Conduces" : "Delivery"}
            </TabsTrigger>
          </TabsList>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            {/* Main Documents */}
            <div>
              <h3 className="font-heading font-semibold mb-4 flex items-center gap-2">
                <FileSignature className="w-5 h-5" />
                {isEs ? "Documentos Principales" : "Main Documents"}
              </h3>
              {clientDocuments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    {isEs ? "No hay documentos disponibles aún" : "No documents available yet"}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {clientDocuments.map(doc => {
                    const Icon = getDocTypeIcon(doc.document_type);
                    return (
                      <Card key={doc.document_id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Icon className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h4 className="font-medium">{doc.title || getDocTypeLabel(doc.document_type)}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {getDocTypeLabel(doc.document_type)}
                                </p>
                                <div className="mt-2">
                                  {getStatusBadge(doc)}
                                </div>
                              </div>
                            </div>
                            <Link to={`/portal/${doc.document_id}`}>
                              <Button variant="outline" size="sm">
                                <ExternalLink className="w-4 h-4 mr-1" />
                                {isEs ? "Ver" : "View"}
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Event Design Tab */}
          <TabsContent value="event-design">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" />
                  {isEs ? "Diseño del Evento" : "Event Design"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {blueprint ? (
                  <div className="space-y-6">
                    {/* Event Overview */}
                    {blueprint.overview && (
                      <div>
                        <h4 className="font-semibold mb-2">{isEs ? "Visión General" : "Overview"}</h4>
                        <p className="text-muted-foreground">{blueprint.overview}</p>
                      </div>
                    )}
                    
                    {/* Theme & Style */}
                    {(blueprint.theme || blueprint.color_palette) && (
                      <div>
                        <h4 className="font-semibold mb-2">{isEs ? "Tema y Estilo" : "Theme & Style"}</h4>
                        {blueprint.theme && <p className="text-muted-foreground">{blueprint.theme}</p>}
                        {blueprint.color_palette && (
                          <div className="flex gap-2 mt-2">
                            {blueprint.color_palette.map((color, idx) => (
                              <div 
                                key={idx} 
                                className="w-8 h-8 rounded-lg border" 
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Layout / Floor Plan */}
                    {blueprint.layout_notes && (
                      <div>
                        <h4 className="font-semibold mb-2">{isEs ? "Distribución" : "Layout"}</h4>
                        <p className="text-muted-foreground whitespace-pre-wrap">{blueprint.layout_notes}</p>
                      </div>
                    )}

                    {/* Special Requirements */}
                    {blueprint.special_requirements && (
                      <div>
                        <h4 className="font-semibold mb-2">{isEs ? "Requerimientos Especiales" : "Special Requirements"}</h4>
                        <p className="text-muted-foreground">{blueprint.special_requirements}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{isEs ? "El diseño del evento aún no está disponible" : "Event design not yet available"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Run of Show Tab */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Run of Show
                </CardTitle>
              </CardHeader>
              <CardContent>
                {blueprint?.timeline && blueprint.timeline.length > 0 ? (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    
                    <div className="space-y-6">
                      {blueprint.timeline.map((item, idx) => (
                        <div key={idx} className="flex gap-4 relative">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center z-10">
                            <PlayCircle className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline">{item.time}</Badge>
                              <span className="font-semibold">{item.activity}</span>
                            </div>
                            {item.notes && (
                              <p className="text-sm text-muted-foreground">{item.notes}</p>
                            )}
                            {item.responsible && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {isEs ? "Responsable:" : "Responsible:"} {item.responsible}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{isEs ? "El timeline del evento aún no está disponible" : "Event timeline not yet available"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Delivery Notes Tab */}
          <TabsContent value="delivery">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  {isEs ? "Conduces de Entrega" : "Delivery Notes"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {delivery_notes && delivery_notes.length > 0 ? (
                  <div className="space-y-4">
                    {delivery_notes.map((note, idx) => (
                      <div key={note.note_id || idx} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-semibold">{note.note_number}</h4>
                            <p className="text-sm text-muted-foreground">
                              {note.checkout_date ? new Date(note.checkout_date).toLocaleDateString() : "-"}
                            </p>
                          </div>
                          <Badge variant={note.status === "completed" ? "default" : "secondary"}>
                            {note.status === "completed" ? (isEs ? "Completado" : "Completed") : (isEs ? "Pendiente" : "Pending")}
                          </Badge>
                        </div>
                        
                        <div className="text-sm">
                          <p><strong>{note.items?.length || 0}</strong> {isEs ? "items" : "items"}</p>
                        </div>

                        <Link to={`/portal/delivery/${eventId}`}>
                          <Button variant="outline" size="sm" className="mt-3">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            {isEs ? "Ver Detalle" : "View Details"}
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{isEs ? "No hay conduces de entrega" : "No delivery notes"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-8">
        <div className="max-w-5xl mx-auto px-6 py-4 text-center text-sm text-muted-foreground">
          <p>
            {isEs ? "¿Preguntas? Contáctanos" : "Questions? Contact us"}: {client?.email || company?.name}
          </p>
        </div>
      </footer>
    </div>
  );
}
