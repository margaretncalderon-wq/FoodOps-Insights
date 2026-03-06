import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Layout } from "../../components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Separator } from "../../components/ui/separator";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  ArrowLeft, Edit, Trash2, Star, MapPin, Phone, Mail, Globe,
  Building2, FileText, AlertTriangle, Clock, CheckCircle2,
  Link2, DollarSign, Calendar, TrendingUp, ExternalLink, Instagram, Linkedin,
  Receipt, ShoppingCart, CreditCard, BarChart3, Package, Loader2
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "../../components/ui/alert-dialog";
import { Skeleton } from "../../components/ui/skeleton";

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  preferred: { label: "Preferred", labelEs: "Preferido", color: "bg-green-100 text-green-800" },
  approved: { label: "Approved", labelEs: "Aprobado", color: "bg-blue-100 text-blue-800" },
  under_review: { label: "Under Review", labelEs: "En Revisión", color: "bg-yellow-100 text-yellow-800" },
  potential: { label: "Potential", labelEs: "Potencial", color: "bg-gray-100 text-gray-800" },
  do_not_use: { label: "Do Not Use", labelEs: "No Usar", color: "bg-red-100 text-red-800" },
  inactive: { label: "Inactive", labelEs: "Inactivo", color: "bg-gray-200 text-gray-600" },
};

const TIER_COLORS = { A: "bg-emerald-500", B: "bg-blue-500", Trial: "bg-amber-500" };

export default function PartnerDetailPage() {
  const { partnerId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";

  const [partner, setPartner] = useState(null);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Integration data states
  const [financialSummary, setFinancialSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingIntegration, setLoadingIntegration] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [partnerRes, optionsRes] = await Promise.all([
          axios.get(`${API}/api/partners/${partnerId}`, { withCredentials: true }),
          axios.get(`${API}/api/partners/options`, { withCredentials: true })
        ]);
        setPartner(partnerRes.data);
        setOptions(optionsRes.data);
        
        // Load integration data
        loadIntegrationData(partnerRes.data);
      } catch (err) {
        console.error(err);
        toast.error(isEs ? "Error al cargar partner" : "Failed to load partner");
        navigate("/partners");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [partnerId, navigate, isEs]);

  const loadIntegrationData = async (partnerData) => {
    if (!partnerData?.linked_culinary_supplier_id) return;
    
    setLoadingIntegration(true);
    try {
      const [summaryRes, transRes, posRes, invoicesRes, eventsRes] = await Promise.all([
        axios.get(`${API}/api/partners/${partnerId}/financial-summary`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API}/api/partners/${partnerId}/transactions?limit=10`, { withCredentials: true }).catch(() => ({ data: { transactions: [] } })),
        axios.get(`${API}/api/partners/${partnerId}/purchase-orders?limit=10`, { withCredentials: true }).catch(() => ({ data: { purchase_orders: [] } })),
        axios.get(`${API}/api/partners/${partnerId}/invoices?limit=10`, { withCredentials: true }).catch(() => ({ data: { invoices: [] } })),
        axios.get(`${API}/api/partners/${partnerId}/events?limit=10`, { withCredentials: true }).catch(() => ({ data: { events: [] } }))
      ]);
      
      setFinancialSummary(summaryRes.data);
      setTransactions(transRes.data.transactions || []);
      setPurchaseOrders(posRes.data.purchase_orders || []);
      setInvoices(invoicesRes.data.invoices || []);
      setEvents(eventsRes.data.events || []);
    } catch (err) {
      console.error("Error loading integration data:", err);
    } finally {
      setLoadingIntegration(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/api/partners/${partnerId}`, { withCredentials: true });
      toast.success(isEs ? "Partner eliminado" : "Partner deleted");
      navigate("/partners");
    } catch (err) {
      toast.error(isEs ? "Error al eliminar" : "Failed to delete");
    }
  };

  const getOptionLabel = (type, value) => {
    const opt = options[type]?.find(o => o.value === value);
    return opt ? (isEs ? opt.label_es : opt.label) : value;
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64" />
              <Skeleton className="h-48" />
            </div>
            <Skeleton className="h-96" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!partner) return null;

  const statusConfig = STATUS_CONFIG[partner.status] || STATUS_CONFIG.potential;

  return (
    <Layout>
      <div className="p-6 space-y-6" data-testid="partner-detail-page">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/partners")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{partner.partner_name}</h1>
                {partner.is_preferred && (
                  <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                )}
                {partner.preferred_tier && (
                  <Badge className={`${TIER_COLORS[partner.preferred_tier]} text-white`}>
                    Tier {partner.preferred_tier}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge className={statusConfig.color}>
                  {isEs ? statusConfig.labelEs : statusConfig.label}
                </Badge>
                {partner.partner_type && (
                  <span className="text-sm text-muted-foreground">
                    {getOptionLabel("partner_type", partner.partner_type)}
                  </span>
                )}
                {partner.primary_category && (
                  <span className="text-sm text-muted-foreground">
                    • {getOptionLabel("primary_category", partner.primary_category)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/partners/${partnerId}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              {isEs ? "Editar" : "Edit"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isEs ? "Eliminar" : "Delete"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{isEs ? "¿Eliminar partner?" : "Delete partner?"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isEs 
                      ? "Esta acción no se puede deshacer."
                      : "This action cannot be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{isEs ? "Cancelar" : "Cancel"}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    {isEs ? "Eliminar" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Issues Alert */}
        {partner.issues_flag && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">{isEs ? "Partner con issues" : "Partner has issues"}</p>
                  {partner.issue_notes && (
                    <p className="text-sm text-red-700 mt-1">{partner.issue_notes}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">{isEs ? "Detalles" : "Details"}</TabsTrigger>
                <TabsTrigger value="commercial">{isEs ? "Comercial" : "Commercial"}</TabsTrigger>
                <TabsTrigger value="finance">{isEs ? "Finanzas" : "Finance"}</TabsTrigger>
                <TabsTrigger value="performance">{isEs ? "Rendimiento" : "Performance"}</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-6 mt-4">
                {/* Basic Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{isEs ? "Información Básica" : "Basic Information"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {partner.legal_name && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Razón Social" : "Legal Name"}</p>
                          <p className="font-medium">{partner.legal_name}</p>
                        </div>
                      )}
                      {partner.display_name && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Nombre a Mostrar" : "Display Name"}</p>
                          <p className="font-medium">{partner.display_name}</p>
                        </div>
                      )}
                      {partner.tax_id && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "RNC/ID Fiscal" : "Tax ID"}</p>
                          <p className="font-medium">{partner.tax_id}</p>
                        </div>
                      )}
                      {partner.industry_fit && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Fit de Industria" : "Industry Fit"}</p>
                          <p className="font-medium">{partner.industry_fit}</p>
                        </div>
                      )}
                    </div>

                    {/* Capabilities */}
                    {partner.capabilities?.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">{isEs ? "Capacidades" : "Capabilities"}</p>
                        <div className="flex flex-wrap gap-2">
                          {partner.capabilities.map((cap, i) => (
                            <Badge key={i} variant="outline">{getOptionLabel("capabilities", cap)}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {partner.tags?.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">{isEs ? "Etiquetas" : "Tags"}</p>
                        <div className="flex flex-wrap gap-2">
                          {partner.tags.map((tag, i) => (
                            <Badge key={i} variant="secondary">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Location */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {isEs ? "Ubicación" : "Location"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {partner.full_address && (
                      <p>{partner.full_address}</p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {partner.hq_country && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "País" : "Country"}</p>
                          <p className="font-medium">{partner.hq_country}</p>
                        </div>
                      )}
                      {partner.hq_state_province && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Estado/Provincia" : "State/Province"}</p>
                          <p className="font-medium">{partner.hq_state_province}</p>
                        </div>
                      )}
                      {partner.hq_city && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Ciudad" : "City"}</p>
                          <p className="font-medium">{partner.hq_city}</p>
                        </div>
                      )}
                      {partner.postal_code && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Código Postal" : "Postal Code"}</p>
                          <p className="font-medium">{partner.postal_code}</p>
                        </div>
                      )}
                    </div>
                    {partner.service_area_type && (
                      <div>
                        <p className="text-sm text-muted-foreground">{isEs ? "Cobertura" : "Coverage"}</p>
                        <p className="font-medium">{getOptionLabel("service_area_type", partner.service_area_type)}</p>
                      </div>
                    )}
                    {partner.coverage_notes && (
                      <div>
                        <p className="text-sm text-muted-foreground">{isEs ? "Notas de Cobertura" : "Coverage Notes"}</p>
                        <p>{partner.coverage_notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="commercial" className="space-y-6 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      {isEs ? "Términos Comerciales" : "Commercial Terms"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      {partner.pricing_level && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Nivel de Precio" : "Pricing Level"}</p>
                          <p className="font-medium">{getOptionLabel("pricing_level", partner.pricing_level)}</p>
                        </div>
                      )}
                      {partner.minimum_spend && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Mínimo" : "Minimum"}</p>
                          <p className="font-medium">{partner.currency} {partner.minimum_spend.toLocaleString()}</p>
                        </div>
                      )}
                      {partner.lead_time && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Tiempo de Entrega" : "Lead Time"}</p>
                          <p className="font-medium">{partner.lead_time}</p>
                        </div>
                      )}
                      {partner.payment_terms && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Términos de Pago" : "Payment Terms"}</p>
                          <p className="font-medium">{partner.payment_terms}</p>
                        </div>
                      )}
                      {partner.response_time && (
                        <div>
                          <p className="text-sm text-muted-foreground">{isEs ? "Tiempo de Respuesta" : "Response Time"}</p>
                          <p className="font-medium">{partner.response_time}</p>
                        </div>
                      )}
                    </div>

                    <Separator className="my-4" />

                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        {partner.contract_required ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border-2 border-gray-300" />
                        )}
                        <span className="text-sm">{isEs ? "Contrato Requerido" : "Contract Required"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {partner.insurance_required ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border-2 border-gray-300" />
                        )}
                        <span className="text-sm">{isEs ? "Seguro Requerido" : "Insurance Required"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {partner.documents_on_file ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border-2 border-gray-300" />
                        )}
                        <span className="text-sm">{isEs ? "Docs en Archivo" : "Docs on File"}</span>
                      </div>
                    </div>

                    {(partner.availability_notes || partner.capacity_notes) && (
                      <>
                        <Separator className="my-4" />
                        <div className="grid grid-cols-2 gap-4">
                          {partner.availability_notes && (
                            <div>
                              <p className="text-sm text-muted-foreground">{isEs ? "Disponibilidad" : "Availability"}</p>
                              <p>{partner.availability_notes}</p>
                            </div>
                          )}
                          {partner.capacity_notes && (
                            <div>
                              <p className="text-sm text-muted-foreground">{isEs ? "Capacidad" : "Capacity"}</p>
                              <p>{partner.capacity_notes}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Finance Tab - Integration Data */}
              <TabsContent value="finance" className="space-y-6 mt-4">
                {!partner.linked_culinary_supplier_id ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Link2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">
                        {isEs ? "Sin Suplidor Vinculado" : "No Linked Supplier"}
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        {isEs 
                          ? "Vincula este partner a un suplidor culinario para ver datos financieros"
                          : "Link this partner to a culinary supplier to see financial data"}
                      </p>
                      <Button variant="outline" onClick={() => navigate(`/partners/${partnerId}/edit`)}>
                        <Link2 className="w-4 h-4 mr-2" />
                        {isEs ? "Vincular Suplidor" : "Link Supplier"}
                      </Button>
                    </CardContent>
                  </Card>
                ) : loadingIntegration ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-64" />
                  </div>
                ) : (
                  <>
                    {/* Financial Summary Cards */}
                    {financialSummary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground">{isEs ? "Total Gastado" : "Total Spent"}</p>
                                <p className="text-2xl font-bold">{partner.currency} {financialSummary.total_spent?.toLocaleString() || 0}</p>
                              </div>
                              <DollarSign className="w-8 h-8 text-green-500" />
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground">{isEs ? "Pendiente" : "Pending"}</p>
                                <p className="text-2xl font-bold text-amber-600">{partner.currency} {financialSummary.total_pending?.toLocaleString() || 0}</p>
                              </div>
                              <CreditCard className="w-8 h-8 text-amber-500" />
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground">{isEs ? "Órdenes" : "Orders"}</p>
                                <p className="text-2xl font-bold">{financialSummary.total_orders || 0}</p>
                              </div>
                              <ShoppingCart className="w-8 h-8 text-blue-500" />
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground">{isEs ? "Promedio" : "Average"}</p>
                                <p className="text-2xl font-bold">{partner.currency} {financialSummary.avg_order_value?.toLocaleString(undefined, {maximumFractionDigits: 0}) || 0}</p>
                              </div>
                              <BarChart3 className="w-8 h-8 text-purple-500" />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {/* Invoices Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Receipt className="w-4 h-4" />
                          {isEs ? "Facturas de Proveedor" : "Supplier Invoices"}
                          <Badge variant="secondary">{invoices.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {invoices.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {isEs ? "Sin facturas registradas" : "No invoices recorded"}
                          </p>
                        ) : (
                          <ScrollArea className="h-48">
                            <div className="space-y-2">
                              {invoices.map((inv, i) => (
                                <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                                  <div>
                                    <p className="font-medium">{inv.invoice_number || `INV-${i + 1}`}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : "-"}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-medium">{partner.currency} {inv.total?.toLocaleString()}</p>
                                    <Badge variant={inv.status === "Paid" ? "default" : "secondary"}>
                                      {inv.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </CardContent>
                    </Card>

                    {/* Purchase Orders Section */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4" />
                          {isEs ? "Órdenes de Compra" : "Purchase Orders"}
                          <Badge variant="secondary">{purchaseOrders.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {purchaseOrders.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {isEs ? "Sin órdenes de compra" : "No purchase orders"}
                          </p>
                        ) : (
                          <ScrollArea className="h-48">
                            <div className="space-y-2">
                              {purchaseOrders.map((po, i) => (
                                <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                                  <div>
                                    <p className="font-medium">{po.po_number || `PO-${i + 1}`}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {po.created_at ? new Date(po.created_at).toLocaleDateString() : "-"}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-medium">{partner.currency} {po.total?.toLocaleString()}</p>
                                    <Badge variant="outline">{po.status}</Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </CardContent>
                    </Card>

                    {/* Events Section */}
                    {events.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {isEs ? "Eventos Relacionados" : "Related Events"}
                            <Badge variant="secondary">{events.length}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {events.map((event, i) => (
                              <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                                <div>
                                  <p className="font-medium">{event.event_name}</p>
                                  <p className="text-sm text-muted-foreground">{event.client_name}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm">{event.event_date ? new Date(event.event_date).toLocaleDateString() : "-"}</p>
                                  <Badge variant="outline">{event.status}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="performance" className="space-y-6 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      {isEs ? "Rendimiento y Uso" : "Performance & Usage"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold">{partner.total_projects_used || 0}</p>
                        <p className="text-sm text-muted-foreground">{isEs ? "Proyectos" : "Projects"}</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold">{partner.reliability_score?.toFixed(1) || "-"}</p>
                        <p className="text-sm text-muted-foreground">{isEs ? "Confiabilidad" : "Reliability"}</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold">{partner.quality_score?.toFixed(1) || "-"}</p>
                        <p className="text-sm text-muted-foreground">{isEs ? "Calidad" : "Quality"}</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold">{partner.communication_score?.toFixed(1) || "-"}</p>
                        <p className="text-sm text-muted-foreground">{isEs ? "Comunicación" : "Communication"}</p>
                      </div>
                    </div>

                    {partner.last_used_date && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{isEs ? "Último uso:" : "Last used:"}</span>
                        <span>{partner.last_used_date}</span>
                        {partner.last_project_name && (
                          <span className="text-muted-foreground">({partner.last_project_name})</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {partner.internal_notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{isEs ? "Notas Internas" : "Internal Notes"}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap">{partner.internal_notes}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Contacto" : "Contact"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {partner.primary_contact_name && (
                  <div>
                    <p className="font-medium">{partner.primary_contact_name}</p>
                    {partner.primary_contact_role && (
                      <p className="text-sm text-muted-foreground">{partner.primary_contact_role}</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {partner.email && (
                    <a href={`mailto:${partner.email}`} className="flex items-center gap-2 text-sm hover:text-primary">
                      <Mail className="w-4 h-4" />
                      {partner.email}
                    </a>
                  )}
                  {partner.phone && (
                    <a href={`tel:${partner.phone}`} className="flex items-center gap-2 text-sm hover:text-primary">
                      <Phone className="w-4 h-4" />
                      {partner.phone}
                    </a>
                  )}
                  {partner.whatsapp && (
                    <a href={`https://wa.me/${partner.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                      <Phone className="w-4 h-4" />
                      WhatsApp
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {partner.website && (
                    <a href={partner.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                      <Globe className="w-4 h-4" />
                      {isEs ? "Sitio Web" : "Website"}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {partner.instagram && (
                    <a href={`https://instagram.com/${partner.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                      <Instagram className="w-4 h-4" />
                      {partner.instagram}
                    </a>
                  )}
                  {partner.linkedin && (
                    <a href={partner.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                      <Linkedin className="w-4 h-4" />
                      LinkedIn
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {partner.secondary_contact_name && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{isEs ? "Contacto Secundario" : "Secondary Contact"}</p>
                      <p className="font-medium">{partner.secondary_contact_name}</p>
                      {partner.secondary_contact_email && (
                        <a href={`mailto:${partner.secondary_contact_email}`} className="text-sm text-muted-foreground hover:text-primary">
                          {partner.secondary_contact_email}
                        </a>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Linked Records */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  {isEs ? "Vínculos" : "Links"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {partner.linked_supplier && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">{isEs ? "Suplidor Culinario" : "Culinary Supplier"}</p>
                    <p className="font-medium">{partner.linked_supplier.name}</p>
                  </div>
                )}
                {partner.linked_contract && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">{isEs ? "Contrato" : "Contract"}</p>
                    <p className="font-medium">{partner.linked_contract.title}</p>
                    <Badge variant="outline" className="mt-1">{partner.linked_contract.status}</Badge>
                  </div>
                )}
                {partner.cost_center && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">{isEs ? "Centro de Costo" : "Cost Center"}</p>
                    <p className="font-medium">{partner.cost_center.name}</p>
                  </div>
                )}
                {!partner.linked_supplier && !partner.linked_contract && !partner.cost_center && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {isEs ? "Sin vínculos" : "No links"}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Quick Info */}
            <Card>
              <CardContent className="pt-4 text-sm text-muted-foreground space-y-2">
                <div className="flex justify-between">
                  <span>{isEs ? "Creado" : "Created"}</span>
                  <span>{new Date(partner.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isEs ? "Actualizado" : "Updated"}</span>
                  <span>{new Date(partner.updated_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ID</span>
                  <span className="font-mono text-xs">{partner.partner_id}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
