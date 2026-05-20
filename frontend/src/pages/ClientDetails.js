import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Mail, Phone, MapPin, Building2, Calendar, Edit, Trash2 } from "lucide-react";
import { formatDateOnly } from "../utils/dates";


export default function ClientDetails() {
  const { clientId } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClient();
    fetchClientEvents();
  }, [clientId]);

  const fetchClient = async () => {
    try {
      const response = await axios.get(`${API}/crm/clients/${clientId}`, { withCredentials: true });
      setClient(response.data);
    } catch (error) {
      console.error("Failed to fetch client:", error);
      toast.error("Client not found");
      navigate("/crm");
    } finally {
      setLoading(false);
    }
  };

  const fetchClientEvents = async () => {
    try {
      const response = await axios.get(`${API}/events`, { withCredentials: true });
      const clientEvents = response.data.filter((e) => e.client_id === clientId);
      setEvents(clientEvents);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    }
  };

  const handleDelete = async () => {
    if (!confirm(language === "es" ? "¿Eliminar cliente?" : "Delete client?")) return;
    try {
      await axios.delete(`${API}/crm/clients/${clientId}`, { withCredentials: true });
      toast.success(language === "es" ? "Cliente eliminado" : "Client deleted");
      navigate("/crm");
    } catch (error) {
      toast.error("Failed to delete client");
    }
  };

  const stageColors = {
    lead: "bg-muted text-muted-foreground",
    contacted: "bg-info/10 text-info",
    proposal: "bg-warning/10 text-warning",
    negotiation: "bg-primary/10 text-primary",
    won: "bg-success/10 text-success",
    lost: "bg-destructive/10 text-destructive",
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

  return (
    <Layout>
      <div className="space-y-6" data-testid="client-details-page">
        {/* Back Button */}
        <Link to="/crm" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          {language === "es" ? "Volver a CRM" : "Back to CRM"}
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center">
              <span className="font-heading text-2xl font-bold text-secondary-foreground">
                {client?.name?.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="font-heading text-3xl font-bold text-foreground">{client?.name}</h1>
              {client?.company_name && (
                <p className="text-muted-foreground flex items-center gap-2 mt-1">
                  <Building2 className="w-4 h-4" />
                  {client.company_name}
                </p>
              )}
              <Badge className={`mt-2 ${stageColors[client?.pipeline_stage]}`}>
                {t(client?.pipeline_stage)}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDelete} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              {t("delete")}
            </Button>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {language === "es" ? "Información de Contacto" : "Contact Information"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {client?.email && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("email")}</p>
                    <a href={`mailto:${client.email}`} className="text-primary hover:underline">
                      {client.email}
                    </a>
                  </div>
                </div>
              )}
              {client?.phone && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Phone className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("phone")}</p>
                    <a href={`tel:${client.phone}`} className="hover:text-primary">
                      {client.phone}
                    </a>
                  </div>
                </div>
              )}
              {client?.address && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("address")}</p>
                    <p>{client.address}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {language === "es" ? "Estadísticas" : "Statistics"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("eventsCount")}</span>
                <span className="font-heading text-2xl font-bold">{client?.events_count || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("totalRevenue")}</span>
                <span className="font-heading text-2xl font-bold">
                  ${(client?.total_revenue || 0).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">{t("notes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {client?.notes || (language === "es" ? "Sin notas" : "No notes")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-lg">{t("events")}</CardTitle>
            <Link to="/events">
              <Button size="sm">{t("addEvent")}</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <Link
                    key={event.event_id}
                    to={`/events/${event.event_id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-secondary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateOnly(event.event_date, language)}
                      </p>
                    </div>
                    <Badge>{t(event.status)}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t("noResults")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
