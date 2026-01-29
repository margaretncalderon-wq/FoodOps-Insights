import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Search, FileText, CheckCircle, Clock, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DocumentsPage() {
  const { t, language } = useLanguage();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${API}/documents`, { withCredentials: true });
      setDocuments(response.data);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.document_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const docTypeLabels = {
    quote: t("quote"),
    beo: t("beo"),
    kitchen_sheet: t("kitchenSheet"),
    packing_list: t("packingList"),
    mise_en_place: t("miseEnPlace"),
  };

  const statusColors = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-info/10 text-info",
    signed: "bg-success/10 text-success",
  };

  const getPortalUrl = (documentId) => {
    return `${window.location.origin}/portal/${documentId}`;
  };

  const copyPortalLink = (documentId) => {
    navigator.clipboard.writeText(getPortalUrl(documentId));
    toast.success(language === "es" ? "Enlace copiado" : "Link copied");
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="documents-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">{t("documents")}</h1>
            <p className="text-muted-foreground mt-1">
              {language === "es" ? "Gestiona tus documentos de eventos" : "Manage your event documents"}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Documents List */}
        <div className="space-y-4">
          {filteredDocuments.map((doc) => (
            <Card
              key={doc.document_id}
              className="hover:shadow-card transition-all duration-300"
              data-testid={`document-card-${doc.document_id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                      <FileText className="w-6 h-6 text-secondary-foreground" />
                    </div>
                    <div>
                      <Link
                        to={`/documents/${doc.document_id}`}
                        className="font-heading font-semibold hover:text-primary transition-colors"
                      >
                        {doc.title}
                      </Link>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="outline">{docTypeLabels[doc.document_type] || doc.document_type}</Badge>
                        <Badge className={statusColors[doc.status]}>
                          {doc.status === "signed" ? (
                            <><CheckCircle className="w-3 h-3 mr-1" /> {t("signed")}</>
                          ) : doc.status === "sent" ? (
                            <><Clock className="w-3 h-3 mr-1" /> {t("sent")}</>
                          ) : (
                            t("draft")
                          )}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyPortalLink(doc.document_id)}
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {language === "es" ? "Copiar Enlace" : "Copy Link"}
                    </Button>
                    <Link to={`/documents/${doc.document_id}`}>
                      <Button size="sm">
                        {language === "es" ? "Ver" : "View"}
                      </Button>
                    </Link>
                  </div>
                </div>
                {doc.signed_at && (
                  <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                    {language === "es" ? "Firmado por" : "Signed by"} {doc.signed_by} -{" "}
                    {new Date(doc.signed_at).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {filteredDocuments.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">{t("noResults")}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {language === "es"
                  ? "Los documentos se generan desde los eventos"
                  : "Documents are generated from events"}
              </p>
              <Link to="/events" className="mt-4 inline-block">
                <Button variant="outline">{t("events")}</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
