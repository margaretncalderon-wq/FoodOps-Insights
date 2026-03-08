import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Layout } from "../../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Users, Plus, Search, Filter, Building2, MapPin, Star,
  Phone, Mail, Globe, ChevronRight, MoreVertical, RefreshCw,
  FileText, AlertTriangle, CheckCircle2, Clock, XCircle,
  Briefcase, TrendingUp, Truck
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Checkbox } from "../../components/ui/checkbox";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Skeleton } from "../../components/ui/skeleton";
import { SuppliersSection } from "../../components/shared/SuppliersSection";

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  preferred: { label: "Preferred", labelEs: "Preferido", color: "bg-green-100 text-green-800 border-green-300", icon: Star },
  approved: { label: "Approved", labelEs: "Aprobado", color: "bg-blue-100 text-blue-800 border-blue-300", icon: CheckCircle2 },
  under_review: { label: "Under Review", labelEs: "En Revisión", color: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: Clock },
  potential: { label: "Potential", labelEs: "Potencial", color: "bg-gray-100 text-gray-800 border-gray-300", icon: Users },
  do_not_use: { label: "Do Not Use", labelEs: "No Usar", color: "bg-red-100 text-red-800 border-red-300", icon: XCircle },
  inactive: { label: "Inactive", labelEs: "Inactivo", color: "bg-gray-200 text-gray-600 border-gray-400", icon: XCircle },
};

const TIER_COLORS = {
  A: "bg-emerald-500 text-white",
  B: "bg-blue-500 text-white",
  Trial: "bg-amber-500 text-white"
};

export default function PartnersPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();

  const [partners, setPartners] = useState([]);
  const [stats, setStats] = useState(null);
  const [options, setOptions] = useState({});
  const [locations, setLocations] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedPartners, setSelectedPartners] = useState([]);
  const [mainView, setMainView] = useState("partners"); // "partners" or "suppliers"
  
  // Filters
  const [filters, setFilters] = useState({
    status: "",
    partner_type: "",
    primary_category: "",
    pricing_level: "",
    country: "",
    state_province: "",
    city: ""
  });
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (filters.status) params.append("status", filters.status);
      if (filters.partner_type) params.append("partner_type", filters.partner_type);
      if (filters.primary_category) params.append("primary_category", filters.primary_category);
      if (filters.pricing_level) params.append("pricing_level", filters.pricing_level);
      if (filters.country) params.append("country", filters.country);
      if (filters.state_province) params.append("state_province", filters.state_province);
      if (filters.city) params.append("city", filters.city);
      
      // Apply tab filter
      if (activeTab !== "all") {
        if (activeTab === "preferred") {
          params.append("is_preferred", "true");
        } else {
          params.append("status", activeTab);
        }
      }

      const [partnersRes, statsRes, optionsRes, locationsRes] = await Promise.all([
        axios.get(`${API}/api/partners?${params}`, { withCredentials: true }),
        axios.get(`${API}/api/partners/stats`, { withCredentials: true }),
        axios.get(`${API}/api/partners/options`, { withCredentials: true }),
        axios.get(`${API}/api/partners/locations`, { withCredentials: true })
      ]);

      setPartners(partnersRes.data.partners);
      setStats(statsRes.data);
      setOptions(optionsRes.data);
      setLocations(locationsRes.data);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar partners" : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, [isEs, search, filters, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (partnerId) => {
    if (!window.confirm(isEs ? "¿Eliminar este partner?" : "Delete this partner?")) return;
    try {
      await axios.delete(`${API}/api/partners/${partnerId}`, { withCredentials: true });
      toast.success(isEs ? "Partner eliminado" : "Partner deleted");
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al eliminar" : "Failed to delete");
    }
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (selectedPartners.length === 0) return;
    try {
      await axios.post(`${API}/api/partners/bulk/update-status`, {
        partner_ids: selectedPartners,
        new_status: newStatus
      }, { withCredentials: true });
      toast.success(isEs ? "Estado actualizado" : "Status updated");
      setSelectedPartners([]);
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al actualizar" : "Failed to update");
    }
  };

  const togglePartnerSelection = (partnerId) => {
    setSelectedPartners(prev => 
      prev.includes(partnerId) 
        ? prev.filter(id => id !== partnerId)
        : [...prev, partnerId]
    );
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.potential;
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} border`}>
        <Icon className="w-3 h-3 mr-1" />
        {isEs ? config.labelEs : config.label}
      </Badge>
    );
  };

  const getCategoryLabel = (category) => {
    const opt = options.primary_category?.find(c => c.value === category);
    return opt ? (isEs ? opt.label_es : opt.label) : category;
  };

  const getTypeLabel = (type) => {
    const opt = options.partner_type?.find(t => t.value === type);
    return opt ? (isEs ? opt.label_es : opt.label) : type;
  };

  const clearFilters = () => {
    setFilters({
      status: "", partner_type: "", primary_category: "",
      pricing_level: "", country: "", state_province: "", city: ""
    });
    setSearch("");
  };

  return (
    <Layout>
      <div className="p-6 space-y-6" data-testid="partners-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="w-7 h-7" />
              {isEs ? "Partners" : "Partners"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isEs 
                ? "Gestiona proveedores, suplidores y socios externos"
                : "Manage vendors, suppliers and external partners"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {mainView === "partners" && (
              <Button onClick={() => navigate("/partners/new")} data-testid="new-partner-btn">
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Nuevo Partner" : "New Partner"}
              </Button>
            )}
          </div>
        </div>

        {/* Main View Toggle - Partners vs Suppliers */}
        <Tabs value={mainView} onValueChange={setMainView} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="partners" className="gap-2">
              <Briefcase className="w-4 h-4" />
              {isEs ? "Partners" : "Partners"}
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2">
              <Truck className="w-4 h-4" />
              {isEs ? "Suplidores" : "Suppliers"}
            </TabsTrigger>
          </TabsList>

          {/* Suppliers Tab Content */}
          <TabsContent value="suppliers" className="mt-6">
            <SuppliersSection showHeader={true} />
          </TabsContent>

          {/* Partners Tab Content */}
          <TabsContent value="partners" className="mt-6 space-y-6">

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Total" : "Total"}</p>
                  <p className="text-2xl font-bold">{stats?.totals?.total || 0}</p>
                </div>
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Preferidos" : "Preferred"}</p>
                  <p className="text-2xl font-bold text-green-600">{stats?.totals?.preferred || 0}</p>
                </div>
                <Star className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Con Contrato" : "With Contract"}</p>
                  <p className="text-2xl font-bold text-blue-600">{stats?.totals?.with_contract || 0}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Con Issues" : "With Issues"}</p>
                  <p className="text-2xl font-bold text-red-600">{stats?.totals?.with_issues || 0}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={isEs ? "Buscar partners..." : "Search partners..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="search-partners"
            />
          </div>
          <Button 
            variant={showFilters ? "default" : "outline"} 
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {isEs ? "Filtros" : "Filters"}
            {Object.values(filters).filter(Boolean).length > 0 && (
              <Badge className="ml-2" variant="secondary">
                {Object.values(filters).filter(Boolean).length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <Select value={filters.partner_type} onValueChange={(v) => setFilters({...filters, partner_type: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Tipo" : "Type"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{isEs ? "Todos" : "All"}</SelectItem>
                    {options.partner_type?.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {isEs ? opt.label_es : opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filters.primary_category} onValueChange={(v) => setFilters({...filters, primary_category: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Categoría" : "Category"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{isEs ? "Todas" : "All"}</SelectItem>
                    {options.primary_category?.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {isEs ? opt.label_es : opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filters.pricing_level} onValueChange={(v) => setFilters({...filters, pricing_level: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Precio" : "Price"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{isEs ? "Todos" : "All"}</SelectItem>
                    {options.pricing_level?.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {isEs ? opt.label_es : opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filters.country} onValueChange={(v) => setFilters({...filters, country: v, state_province: "", city: ""})}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "País" : "Country"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{isEs ? "Todos" : "All"}</SelectItem>
                    {Object.keys(locations).map(country => (
                      <SelectItem key={country} value={country}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {filters.country && locations[filters.country] && (
                  <Select value={filters.state_province} onValueChange={(v) => setFilters({...filters, state_province: v, city: ""})}>
                    <SelectTrigger>
                      <SelectValue placeholder={isEs ? "Estado" : "State"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{isEs ? "Todos" : "All"}</SelectItem>
                      {Object.keys(locations[filters.country]?.states || {}).map(state => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  {isEs ? "Limpiar" : "Clear"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">{isEs ? "Todos" : "All"}</TabsTrigger>
            <TabsTrigger value="preferred">{isEs ? "Preferidos" : "Preferred"}</TabsTrigger>
            <TabsTrigger value="approved">{isEs ? "Aprobados" : "Approved"}</TabsTrigger>
            <TabsTrigger value="under_review">{isEs ? "En Revisión" : "Under Review"}</TabsTrigger>
            <TabsTrigger value="potential">{isEs ? "Potenciales" : "Potential"}</TabsTrigger>
            <TabsTrigger value="do_not_use">{isEs ? "No Usar" : "Do Not Use"}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Bulk Actions */}
        {selectedPartners.length > 0 && (
          <Card className="bg-muted/50">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {selectedPartners.length} {isEs ? "seleccionados" : "selected"}
                </span>
                <div className="flex items-center gap-2">
                  <Select onValueChange={handleBulkStatusUpdate}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={isEs ? "Cambiar estado" : "Change status"} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.status?.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {isEs ? opt.label_es : opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPartners([])}>
                    {isEs ? "Cancelar" : "Cancel"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Partners List */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : partners.length === 0 ? (
              <div className="p-12 text-center">
                <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {isEs ? "No hay partners" : "No partners"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {isEs 
                    ? "Agrega tu primer partner para comenzar"
                    : "Add your first partner to get started"}
                </p>
                <Button onClick={() => navigate("/partners/new")}>
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Agregar Partner" : "Add Partner"}
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="divide-y">
                  {partners.map((partner) => (
                    <div 
                      key={partner.partner_id}
                      className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/partners/${partner.partner_id}`)}
                      data-testid={`partner-row-${partner.partner_id}`}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox 
                          checked={selectedPartners.includes(partner.partner_id)}
                          onCheckedChange={() => togglePartnerSelection(partner.partner_id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">{partner.partner_name}</h3>
                            {partner.is_preferred && (
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            )}
                            {partner.preferred_tier && (
                              <Badge className={`text-xs ${TIER_COLORS[partner.preferred_tier]}`}>
                                {partner.preferred_tier}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            {partner.primary_category && (
                              <span>{getCategoryLabel(partner.primary_category)}</span>
                            )}
                            {partner.partner_type && (
                              <span className="text-xs px-2 py-0.5 bg-muted rounded">
                                {getTypeLabel(partner.partner_type)}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {partner.hq_city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {partner.hq_city}{partner.hq_country ? `, ${partner.hq_country}` : ""}
                              </span>
                            )}
                            {partner.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {partner.email}
                              </span>
                            )}
                            {partner.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {partner.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {getStatusBadge(partner.status)}
                          
                          {partner.issues_flag && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/partners/${partner.partner_id}`);
                              }}>
                                {isEs ? "Ver Detalle" : "View Details"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/partners/${partner.partner_id}/edit`);
                              }}>
                                {isEs ? "Editar" : "Edit"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(partner.partner_id);
                                }}
                              >
                                {isEs ? "Eliminar" : "Delete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
