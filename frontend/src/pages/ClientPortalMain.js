import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { FileText, Calendar, Users, Building2, FileSignature, Receipt, ChevronRight, Clock, CheckCircle, AlertCircle, CreditCard, DollarSign } from "lucide-react";
import { KoraLoader } from "../components/KoraLoader";
import { formatDateOnly } from "../utils/dates";
import { useTerminology } from "../hooks/useTerminology";

export default function ClientPortalMain() {
  const { clientId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const isEs = true; // Default to Spanish
  const { term } = useTerminology();
  const entityPlural = term("events", "entity_plural");
  const entitySingular = term("events", "entity_singular");

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    try {
      const response = await axios.get(`${API}/portal/client/${clientId}/summary`);
      setData(response.data);
    } catch (error) {
      console.error("Failed to fetch client data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: "bg-amber-100 text-amber-800",
      confirmed: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800"
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getDocIcon = (type) => {
    const icons = {
      contract: FileSignature,
      invoice: Receipt,
      proposal: FileText,
      quote: FileText,
      receipt: CreditCard,
      statement: DollarSign
    };
    return icons[type] || FileText;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <KoraLoader size={32} />
      </div>
    );
  }

  if (!data || !data.client) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="font-heading text-xl font-semibold mb-2">
              {isEs ? "Portal No Disponible" : "Portal Not Available"}
            </h2>
            <p className="text-muted-foreground">
              {isEs ? "Este enlace puede haber expirado o ser inválido." : "This link may have expired or is invalid."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { client, company, events, documents, financial_summary } = data;

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
                <h1 className="font-heading text-lg font-semibold">{isEs ? "Portal del Cliente" : "Client Portal"}</h1>
                <p className="text-sm text-muted-foreground">{company?.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Client Info */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-heading font-bold">{client.name}</h2>
              <p className="text-muted-foreground">{client.email}</p>
              {client.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        
        {/* Financial Summary */}
        {financial_summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">{isEs ? `Total ${entityPlural}` : `Total ${entityPlural}`}</div>
                <div className="text-2xl font-bold">{financial_summary.total_events || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">{isEs ? "Total Facturado" : "Total Billed"}</div>
                <div className="text-2xl font-bold">${(financial_summary.total_billed || 0).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">{isEs ? "Pagado" : "Paid"}</div>
                <div className="text-2xl font-bold text-green-600">${(financial_summary.total_paid || 0).toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">{isEs ? "Pendiente" : "Outstanding"}</div>
                <div className={`text-2xl font-bold ${(financial_summary.outstanding || 0) > 0 ? 'text-amber-600' : ''}`}>
                  ${(financial_summary.outstanding || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Events */}
        <div>
          <h3 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {isEs ? `Mis ${entityPlural}` : `My ${entityPlural}`}
          </h3>
          
          {(!events || events.length === 0) ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{isEs ? `No hay ${entityPlural.toLowerCase()} registrados` : `No ${entityPlural.toLowerCase()} registered`}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {events.map(event => (
                <Card key={event.event_id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{event.name}</h4>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {event.event_date ? formatDateOnly(event.event_date) : "TBD"}
                            </span>
                            {event.venue && (
                              <span className="truncate max-w-[200px]">{event.venue}</span>
                            )}
                            {event.guest_count && (
                              <span>{event.guest_count} {isEs ? "invitados" : "guests"}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={getStatusColor(event.status)}>
                          {event.status === "completed" ? (isEs ? "Completado" : "Completed") :
                           event.status === "confirmed" ? (isEs ? "Confirmado" : "Confirmed") :
                           event.status === "cancelled" ? (isEs ? "Cancelado" : "Cancelled") :
                           (isEs ? "Pendiente" : "Pending")}
                        </Badge>
                        <Link to={`/portal/event/${event.event_id}`}>
                          <Button variant="outline" size="sm">
                            {isEs ? "Ver Detalle" : "View Details"}
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent Documents */}
        <div>
          <h3 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isEs ? "Documentos Recientes" : "Recent Documents"}
          </h3>
          
          {(!documents || documents.length === 0) ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{isEs ? "No hay documentos" : "No documents"}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {documents.slice(0, 6).map(doc => {
                const Icon = getDocIcon(doc.document_type);
                const typeLabels = {
                  contract: isEs ? "Contrato" : "Contract",
                  invoice: isEs ? "Factura" : "Invoice",
                  proposal: isEs ? "Propuesta" : "Proposal",
                  quote: isEs ? "Cotización" : "Quote",
                  receipt: isEs ? "Recibo" : "Receipt",
                  statement: isEs ? "Estado de Cuenta" : "Statement"
                };
                
                return (
                  <Card key={doc.document_id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{doc.title || typeLabels[doc.document_type]}</h4>
                          <p className="text-xs text-muted-foreground">
                            {typeLabels[doc.document_type]} • {doc.event_name || ""}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {doc.status === "signed" ? (
                              <Badge className="bg-green-100 text-green-800 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {isEs ? "Firmado" : "Signed"}
                              </Badge>
                            ) : doc.requires_signature ? (
                              <Badge variant="outline" className="text-amber-600 text-xs">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {isEs ? "Pendiente" : "Pending"}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <Link to={`/portal/${doc.document_id}`}>
                          <Button variant="ghost" size="sm">
                            <ChevronRight className="w-4 h-4" />
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
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-8">
        <div className="max-w-5xl mx-auto px-6 py-4 text-center text-sm text-muted-foreground">
          <p>{company?.name} • {client.email}</p>
        </div>
      </footer>
    </div>
  );
}
