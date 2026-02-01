import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { FileText, Utensils, Package, Eye, Download, Printer, RefreshCw, ChefHat } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const API = process.env.REACT_APP_BACKEND_URL;

export default function OperationalDocumentsTab({ eventId, isLocked, language }) {
  const isEs = language === "es";
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, [eventId]);

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API}/api/documents?event_id=${eventId}`, { withCredentials: true });
      // Filter to operational documents only
      const operationalDocs = (res.data || []).filter(doc => 
        ["kitchen_sheet", "packing_list", "menu"].includes(doc.document_type)
      );
      setDocuments(operationalDocs);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
    setLoading(false);
  };

  const handleGenerateDocument = async (docType) => {
    setGenerating(docType);
    try {
      const res = await axios.post(
        `${API}/api/documents/generate/${eventId}/${docType}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs ? "Documento generado" : "Document generated");
      fetchDocuments();
      setPreviewDoc(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al generar" : "Failed to generate"));
    }
    setGenerating(null);
  };

  const handleRegenerateDocument = async (docId) => {
    try {
      await axios.post(`${API}/api/documents/${docId}/regenerate`, {}, { withCredentials: true });
      toast.success(isEs ? "Documento actualizado" : "Document updated");
      fetchDocuments();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al regenerar" : "Failed to regenerate"));
    }
  };

  const handlePrint = (doc) => {
    // Open portal in new window for printing
    window.open(`/portal/${doc.document_id}`, '_blank');
  };

  const documentTypes = [
    { 
      type: "kitchen_sheet", 
      label: isEs ? "Hoja de Cocina" : "Kitchen Sheet", 
      description: isEs ? "Lista de preparación para cocina sin precios" : "Kitchen prep list without prices",
      icon: ChefHat,
      color: "text-orange-500"
    },
    { 
      type: "packing_list", 
      label: isEs ? "Lista de Montaje" : "Packing List", 
      description: isEs ? "Lista de equipos y materiales para transporte" : "Equipment and materials for transport",
      icon: Package,
      color: "text-purple-500"
    },
    { 
      type: "menu", 
      label: isEs ? "Menú" : "Menu", 
      description: isEs ? "Menú del evento para imprimir" : "Event menu for printing",
      icon: FileText,
      color: "text-teal-500"
    },
  ];

  // Get existing document for type
  const getExistingDoc = (docType) => documents.find(d => d.document_type === docType);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="operational-documents-tab">
      <div>
        <h3 className="text-lg font-semibold mb-1">
          {isEs ? "Documentos Operativos" : "Operational Documents"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isEs 
            ? "Genera y gestiona documentos para la ejecución del evento"
            : "Generate and manage documents for event execution"}
        </p>
      </div>

      {/* Document Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {documentTypes.map(({ type, label, description, icon: Icon, color }) => {
          const existingDoc = getExistingDoc(type);
          const isGenerating = generating === type;

          return (
            <Card key={type} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{label}</CardTitle>
                    <CardDescription className="text-xs">{description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {existingDoc ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <Badge variant="outline" className="text-xs">
                        {isEs ? "Generado" : "Generated"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(existingDoc.updated_at || existingDoc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setPreviewDoc(existingDoc)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {isEs ? "Ver" : "View"}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handlePrint(existingDoc)}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRegenerateDocument(existingDoc.document_id)}
                        title={isEs ? "Actualizar con cambios" : "Update with changes"}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    className="w-full"
                    variant="outline"
                    onClick={() => handleGenerateDocument(type)}
                    disabled={isGenerating || isLocked}
                  >
                    {isGenerating ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 mr-2" />
                    )}
                    {isEs ? "Generar" : "Generate"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* All Generated Documents List */}
      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isEs ? "Historial de Documentos" : "Document History"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {documents.map(doc => (
                <div key={doc.document_id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{doc.document_type}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(doc)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewDoc?.title}</DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="space-y-4">
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => handlePrint(previewDoc)}>
                  <Printer className="w-4 h-4 mr-2" />
                  {isEs ? "Imprimir" : "Print"}
                </Button>
                <Button variant="outline" onClick={() => window.open(`/portal/${previewDoc.document_id}`, '_blank')}>
                  <Eye className="w-4 h-4 mr-2" />
                  {isEs ? "Abrir Portal" : "Open Portal"}
                </Button>
              </div>
              
              {/* Document Content Preview */}
              <div className="border rounded-lg p-6 bg-white">
                {previewDoc.content?.order_items?.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold">{previewDoc.content.event?.name}</h3>
                    <p className="text-muted-foreground">
                      {previewDoc.content.event?.event_date && new Date(previewDoc.content.event.event_date).toLocaleDateString()} 
                      {" • "} 
                      {previewDoc.content.event?.guest_count} {isEs ? "invitados" : "guests"}
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">{isEs ? "Ítem" : "Item"}</th>
                          <th className="text-center py-2">{isEs ? "Cantidad" : "Qty"}</th>
                          {previewDoc.document_type !== "kitchen_sheet" && (
                            <th className="text-left py-2">{isEs ? "Notas" : "Notes"}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {previewDoc.content.order_items.map((item, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2">{item.description}</td>
                            <td className="text-center py-2">{item.quantity}</td>
                            {previewDoc.document_type !== "kitchen_sheet" && (
                              <td className="py-2 text-muted-foreground">{item.internal_notes || "-"}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {isEs ? "No hay ítems en este documento" : "No items in this document"}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
