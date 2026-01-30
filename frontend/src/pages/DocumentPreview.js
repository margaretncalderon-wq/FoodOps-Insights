import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import SignatureCanvas from "react-signature-canvas";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText, CheckCircle, Calendar, Users, MapPin, DollarSign, ChefHat, Package } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DocumentPreview() {
  const { documentId } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const sigCanvasRef = useRef(null);

  useEffect(() => {
    fetchDocument();
  }, [documentId]);

  const fetchDocument = async () => {
    try {
      const response = await axios.get(`${API}/documents/${documentId}`, { withCredentials: true });
      setDocument(response.data);
    } catch (error) {
      console.error("Failed to fetch document:", error);
      toast.error("Document not found");
      navigate("/events");
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      toast.error(language === "es" ? "Por favor firme primero" : "Please sign first");
      return;
    }
    
    const signature = sigCanvasRef.current.toDataURL();
    try {
      await axios.post(`${API}/documents/${documentId}/sign`, {
        signature,
        signed_by: "Client",
      }, { withCredentials: true });
      toast.success(language === "es" ? "Documento firmado" : "Document signed");
      fetchDocument();
      setSigning(false);
    } catch (error) {
      toast.error("Failed to sign document");
    }
  };

  const handleClearSignature = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const docTypeLabels = {
    contract: { en: "Contract", es: "Contrato" },
    proposal: { en: "Proposal", es: "Propuesta" },
    invoice: { en: "Invoice", es: "Factura" },
    quote: { en: "Quote", es: "Cotización" },
    beo: { en: "Banquet Event Order", es: "Orden de Evento" },
    kitchen_sheet: { en: "Kitchen Sheet", es: "Hoja de Cocina" },
    packing_list: { en: "Packing List", es: "Lista de Montaje" },
    mise_en_place: { en: "Mise en Place", es: "Mise en Place" },
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">{t("loading")}</div>
        </div>
      </Layout>
    );
  }

  const content = document?.content || {};
  const event = content.event || {};
  const client = content.client || {};
  const company = content.company || {};
  const order = content.order || {};
  const itemsByCategory = content.items_by_category || {};
  const financials = content.financials || {};
  const showPrices = content.show_prices !== false;
  const showInternalNotes = content.show_internal_notes === true;

  // Legacy support for old document format
  const recipes = content.recipes || [];

  const getDocTypeLabel = () => {
    return docTypeLabels[document?.document_type]?.[language] || document?.document_type;
  };

  return (
    <Layout>
      <div className="space-y-6 no-print" data-testid="document-preview-page">
        {/* Back Button */}
        <Link 
          to={event.event_id ? `/events/${event.event_id}` : "/events"} 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          {language === "es" ? "Volver al Evento" : "Back to Event"}
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">{document?.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline">{getDocTypeLabel()}</Badge>
              <Badge className={document?.status === "signed" ? "bg-success/10 text-success" : "bg-muted"}>
                {document?.status === "signed" ? (
                  <><CheckCircle className="w-3 h-3 mr-1" /> {t("signed")}</>
                ) : (
                  t("draft")
                )}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Download className="w-4 h-4 mr-2" />
              {language === "es" ? "Imprimir" : "Print"}
            </Button>
            {document?.requires_signature && document?.status !== "signed" && (
              <Button onClick={() => setSigning(true)} data-testid="sign-document-btn">
                {t("sign")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Document Content */}
      <div className="bg-white shadow-md max-w-[210mm] mx-auto p-12 border-t-4 border-primary my-8 print:shadow-none print:border-0">
        {/* Company Header */}
        <div className="flex items-start justify-between mb-8 pb-8 border-b">
          <div>
            {company.logo_url && (
              <img src={company.logo_url} alt={company.name} className="h-12 mb-2" />
            )}
            <h2 className="font-heading text-2xl font-bold" style={{ color: company.primary_color || "#3A4D3F" }}>
              {company.name || "Company Name"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {getDocTypeLabel()}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>{language === "es" ? "Fecha" : "Date"}: {new Date(content.generated_at || document?.created_at).toLocaleDateString()}</p>
            <p>#{document?.document_id?.slice(-8)}</p>
          </div>
        </div>

        {/* Event & Client Info */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="font-heading font-semibold mb-4">{t("eventDetails")}</h3>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-lg">{event.name}</p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {event.event_date ? new Date(event.event_date).toLocaleDateString() : "-"}
                {event.end_date && event.is_booking && (
                  <span> - {new Date(event.end_date).toLocaleDateString()}</span>
                )}
              </p>
              {event.venue && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  {event.venue}
                </p>
              )}
              <p className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                {event.guest_count} {language === "es" ? "invitados" : "guests"}
              </p>
            </div>
          </div>
          <div>
            <h3 className="font-heading font-semibold mb-4">{language === "es" ? "Cliente" : "Client"}</h3>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-lg">{client.name}</p>
              {client.email && <p className="text-muted-foreground">{client.email}</p>}
              {client.phone && <p className="text-muted-foreground">{client.phone}</p>}
              {client.address && <p className="text-muted-foreground">{client.address}</p>}
            </div>
          </div>
        </div>

        {/* Items by Category - NEW FORMAT from Event Order */}
        {Object.keys(itemsByCategory).length > 0 && (
          <div className="mb-8">
            <h3 className="font-heading font-semibold mb-4">
              {language === "es" ? "Detalle de Ítems" : "Item Details"}
            </h3>
            
            {Object.entries(itemsByCategory).map(([catId, catData]) => (
              <div key={catId} className="mb-6">
                <h4 className="font-medium text-sm uppercase tracking-wide text-muted-foreground mb-3">
                  {catData.name}
                </h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">{language === "es" ? "Ítem" : "Item"}</th>
                      <th className="text-center py-2">{language === "es" ? "Cant." : "Qty"}</th>
                      {showPrices && (
                        <>
                          <th className="text-right py-2">{language === "es" ? "Precio" : "Price"}</th>
                          <th className="text-right py-2">{t("total")}</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {catData.items?.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="py-2">
                          <div>
                            <p>{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                            {showInternalNotes && item.internal_notes && (
                              <p className="text-xs text-warning italic mt-1">📝 {item.internal_notes}</p>
                            )}
                          </div>
                        </td>
                        <td className="text-center py-2">{item.quantity}</td>
                        {showPrices && (
                          <>
                            <td className="text-right py-2">${item.unit_price?.toFixed(2)}</td>
                            <td className="text-right py-2">
                              ${item.subtotal?.toFixed(2)}
                              {item.discount_amount > 0 && (
                                <span className="text-xs text-destructive block">
                                  (-${item.discount_amount?.toFixed(2)})
                                </span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Totals Section */}
            {showPrices && financials && (
              <div className="border-t pt-4 mt-4">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === "es" ? "Subtotal" : "Subtotal"}:</span>
                      <span>${financials.subtotal?.toFixed(2) || "0.00"}</span>
                    </div>
                    {financials.discount_amount > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>{language === "es" ? "Descuento" : "Discount"}:</span>
                        <span>-${financials.discount_amount?.toFixed(2)}</span>
                      </div>
                    )}
                    {financials.tax_details?.map((tax, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{tax.name} ({tax.rate}%):</span>
                        <span>${tax.amount?.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>{t("total")}:</span>
                      <span>${financials.total?.toFixed(2) || "0.00"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legacy Support: Old recipe-based documents */}
        {recipes.length > 0 && Object.keys(itemsByCategory).length === 0 && (
          <div className="mb-8">
            <h3 className="font-heading font-semibold mb-4">{t("menu")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">{language === "es" ? "Plato" : "Item"}</th>
                  <th className="text-center py-2">{t("servings")}</th>
                  <th className="text-right py-2">{language === "es" ? "Precio/Porción" : "Price/Serving"}</th>
                  <th className="text-right py-2">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{recipe.name}</td>
                    <td className="text-center py-2">{event.guest_count}</td>
                    <td className="text-right py-2">${(recipe.cost_per_serving || recipe.cost_per_portion || 0).toFixed(2)}</td>
                    <td className="text-right py-2">${((recipe.cost_per_serving || recipe.cost_per_portion || 0) * event.guest_count).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={3} className="py-4 text-right">{t("total")}:</td>
                  <td className="py-4 text-right">
                    ${recipes.reduce((sum, r) => sum + ((r.cost_per_serving || r.cost_per_portion || 0) * event.guest_count), 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Payment Terms & Client Notes */}
        {(content.payment_terms || content.client_notes) && (
          <div className="mb-8 p-4 bg-muted/30 rounded-lg">
            {content.payment_terms && (
              <div className="mb-3">
                <p className="font-medium text-sm">{language === "es" ? "Términos de Pago" : "Payment Terms"}:</p>
                <p className="text-sm text-muted-foreground">{content.payment_terms}</p>
              </div>
            )}
            {content.client_notes && (
              <div>
                <p className="font-medium text-sm">{language === "es" ? "Notas" : "Notes"}:</p>
                <p className="text-sm text-muted-foreground">{content.client_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Signature */}
        {document?.signature && (
          <div className="mt-8 pt-8 border-t">
            <p className="text-sm text-muted-foreground mb-4">
              {language === "es" ? "Firmado por" : "Signed by"}: {document.signed_by}
            </p>
            <img src={document.signature} alt="Signature" className="max-h-24" />
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(document.signed_at).toLocaleString()}
            </p>
          </div>
        )}

        {/* Signature Line for unsigned documents */}
        {document?.requires_signature && !document?.signature && (
          <div className="mt-8 pt-8 border-t">
            <div className="flex justify-between items-end">
              <div className="w-64">
                <div className="border-b border-dashed border-gray-400 mb-2 h-12"></div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Firma del Cliente" : "Client Signature"}</p>
              </div>
              <div className="w-48">
                <div className="border-b border-dashed border-gray-400 mb-2 h-12"></div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Fecha" : "Date"}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {signing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-print">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle className="font-heading">{t("signDocument")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor="#1A1A1A"
                  canvasProps={{
                    width: 450,
                    height: 200,
                    className: "w-full",
                  }}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClearSignature} className="flex-1">
                  {language === "es" ? "Limpiar" : "Clear"}
                </Button>
                <Button variant="outline" onClick={() => setSigning(false)} className="flex-1">
                  {t("cancel")}
                </Button>
                <Button onClick={handleSign} className="flex-1" data-testid="confirm-sign-btn">
                  {t("sign")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
