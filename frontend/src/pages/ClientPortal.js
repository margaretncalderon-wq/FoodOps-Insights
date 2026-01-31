import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import SignatureCanvas from "react-signature-canvas";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { FileText, CheckCircle, Calendar, Users, MapPin, ChefHat, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  const recipes = content.recipes || [];

  const docTypeLabels = {
    quote: "Quote",
    beo: "Banquet Event Order",
    kitchen_sheet: "Kitchen Sheet",
    packing_list: "Packing List",
    mise_en_place: "Mise en Place",
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
              <p className="text-xs text-muted-foreground">Client Portal</p>
            </div>
          </div>
          {document.status === "signed" && (
            <Badge className="bg-success/10 text-success">
              <CheckCircle className="w-3 h-3 mr-1" /> Signed
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
                  {docTypeLabels[document.document_type]}
                </Badge>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Date: {new Date(content.generated_at || document.created_at).toLocaleDateString()}</p>
                <p>#{document.document_id?.slice(-8)}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Event & Client Info */}
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-heading font-semibold mb-4">Event Details</h3>
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
                    {event.guest_count} guests
                  </p>
                </div>
              </div>
              <div>
                <h3 className="font-heading font-semibold mb-4">Client</h3>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-lg">{client.name}</p>
                  {client.email && <p className="text-muted-foreground">{client.email}</p>}
                  {client.phone && <p className="text-muted-foreground">{client.phone}</p>}
                </div>
              </div>
            </div>

            {/* Menu/Content */}
            {recipes.length > 0 && (
              <div>
                <h3 className="font-heading font-semibold mb-4">Menu</h3>
                {document.document_type === "quote" ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Item</th>
                        <th className="text-center py-2">Servings</th>
                        <th className="text-right py-2">Price/Serving</th>
                        <th className="text-right py-2">Total</th>
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
                        <td colSpan={3} className="py-4 text-right">Total:</td>
                        <td className="py-4 text-right">
                          ${recipes.reduce((sum, r) => sum + (r.cost_per_serving * event.guest_count), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <div className="space-y-4">
                    {recipes.map((recipe, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <ChefHat className="w-5 h-5 text-primary" />
                          <h4 className="font-semibold">{recipe.name}</h4>
                        </div>
                        {recipe.description && (
                          <p className="text-sm text-muted-foreground">{recipe.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Existing Signature */}
            {document.signature && (
              <div className="pt-8 border-t">
                <p className="text-sm text-muted-foreground mb-4">
                  Signed by: {document.signed_by}
                </p>
                <img src={document.signature} alt="Signature" className="max-h-24" />
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(document.signed_at).toLocaleString()}
                </p>
              </div>
            )}

            {/* Sign Button */}
            {document.status !== "signed" && !signing && (
              <div className="pt-8 border-t">
                <Button onClick={() => setSigning(true)} className="w-full sm:w-auto" data-testid="start-sign-btn">
                  Sign Document
                </Button>
              </div>
            )}

            {/* Signature Form */}
            {signing && (
              <div className="pt-8 border-t space-y-4">
                <h3 className="font-heading font-semibold">Sign Document</h3>
                <div className="space-y-2">
                  <Label>Your Name</Label>
                  <Input
                    value={signedBy}
                    onChange={(e) => setSignedBy(e.target.value)}
                    placeholder="Enter your full name"
                    data-testid="signature-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Signature</Label>
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
                    Clear
                  </Button>
                  <Button variant="outline" onClick={() => setSigning(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSign} disabled={saving} data-testid="confirm-portal-sign-btn">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Sign & Submit
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
              <h3 className="font-heading text-xl font-semibold mb-2">Thank You!</h3>
              <p className="text-muted-foreground">
                This document has been signed and submitted successfully.
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
