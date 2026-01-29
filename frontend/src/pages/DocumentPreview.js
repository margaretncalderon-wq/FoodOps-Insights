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
      navigate("/documents");
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
        signed_by: "User",
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
    quote: t("quote"),
    beo: t("beo"),
    kitchen_sheet: t("kitchenSheet"),
    packing_list: t("packingList"),
    mise_en_place: t("miseEnPlace"),
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
  const recipes = content.recipes || [];

  return (
    <Layout>
      <div className="space-y-6 no-print" data-testid="document-preview-page">
        {/* Back Button */}
        <Link to="/documents" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          {language === "es" ? "Volver a Documentos" : "Back to Documents"}
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">{document?.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline">{docTypeLabels[document?.document_type]}</Badge>
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
            {document?.status !== "signed" && (
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
            <h2 className="font-heading text-2xl font-bold" style={{ color: company.primary_color || "#3A4D3F" }}>
              {company.name || "Company Name"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {docTypeLabels[document?.document_type]}
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

        {/* Document Type Specific Content */}
        {document?.document_type === "quote" && (
          <div className="mb-8">
            <h3 className="font-heading font-semibold mb-4">{t("menu")}</h3>
            {recipes.length > 0 ? (
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
                      <td className="text-right py-2">${recipe.cost_per_serving?.toFixed(2)}</td>
                      <td className="text-right py-2">${(recipe.cost_per_serving * event.guest_count).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={3} className="py-4 text-right">{t("total")}:</td>
                    <td className="py-4 text-right">
                      ${recipes.reduce((sum, r) => sum + (r.cost_per_serving * event.guest_count), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="text-muted-foreground">{t("noResults")}</p>
            )}
          </div>
        )}

        {(document?.document_type === "beo" || document?.document_type === "kitchen_sheet") && (
          <div className="mb-8">
            <h3 className="font-heading font-semibold mb-4">{t("menu")}</h3>
            {recipes.map((recipe, index) => (
              <div key={index} className="mb-6 p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <ChefHat className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold">{recipe.name}</h4>
                  <Badge variant="outline">{recipe.category}</Badge>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">{t("ingredients")}:</p>
                    <ul className="text-sm space-y-1">
                      {recipe.ingredients?.map((ing, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{ing.name}</span>
                          <span className="text-muted-foreground">
                            {(ing.quantity * event.guest_count / recipe.servings).toFixed(2)} {ing.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">{t("instructions")}:</p>
                    <ol className="text-sm space-y-1 list-decimal list-inside">
                      {recipe.instructions?.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {document?.document_type === "packing_list" && (
          <div className="mb-8">
            <h3 className="font-heading font-semibold mb-4">{t("packingList")}</h3>
            <div className="space-y-2">
              {recipes.flatMap((recipe) => recipe.ingredients || []).map((ing, index) => (
                <div key={index} className="flex items-center gap-3 p-2 border-b">
                  <div className="w-5 h-5 border-2 rounded" />
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span>{ing.name}</span>
                  <span className="ml-auto text-muted-foreground">{ing.quantity} {ing.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {document?.document_type === "mise_en_place" && (
          <div className="mb-8">
            <h3 className="font-heading font-semibold mb-4">{t("miseEnPlace")}</h3>
            {recipes.map((recipe, index) => (
              <div key={index} className="mb-4">
                <h4 className="font-medium mb-2">{recipe.name}</h4>
                <div className="space-y-1">
                  {recipe.ingredients?.map((ing, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                      <div className="w-5 h-5 border-2 rounded" />
                      <span>{ing.name}</span>
                      <span className="ml-auto text-sm text-muted-foreground">
                        {(ing.quantity * event.guest_count / recipe.servings).toFixed(2)} {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
