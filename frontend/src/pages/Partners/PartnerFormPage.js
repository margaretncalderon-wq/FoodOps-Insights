import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Layout } from "../../components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import { ArrowLeft, Save, X, Plus } from "lucide-react";
import { Skeleton } from "../../components/ui/skeleton";

const API = process.env.REACT_APP_BACKEND_URL;

const EMPTY_FORM = {
  partner_name: "",
  legal_name: "",
  display_name: "",
  partner_type: "vendor",
  status: "potential",
  is_preferred: false,
  preferred_tier: "",
  industry_fit: "",
  primary_category: "",
  capabilities: [],
  product_or_service_types: [],
  tags: [],
  hq_country: "",
  hq_state_province: "",
  hq_city: "",
  hq_district_municipality: "",
  postal_code: "",
  full_address: "",
  service_area_type: "",
  coverage_notes: "",
  primary_contact_name: "",
  primary_contact_role: "",
  email: "",
  phone: "",
  whatsapp: "",
  website: "",
  instagram: "",
  linkedin: "",
  secondary_contact_name: "",
  secondary_contact_email: "",
  secondary_contact_phone: "",
  minimum_spend: "",
  pricing_level: "",
  lead_time: "",
  payment_terms: "",
  availability_notes: "",
  capacity_notes: "",
  response_time: "",
  contract_required: false,
  insurance_required: false,
  documents_on_file: false,
  reliability_score: "",
  quality_score: "",
  communication_score: "",
  issues_flag: false,
  issue_notes: "",
  internal_notes: "",
  default_cost_center_id: "",
  default_expense_category: "",
  tax_id: "",
  currency: "DOP",
  compliance_docs_on_file: false
};

export default function PartnerFormPage() {
  const { partnerId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  const isEdit = Boolean(partnerId);

  const [form, setForm] = useState(EMPTY_FORM);
  const [options, setOptions] = useState({});
  const [costCenters, setCostCenters] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [optionsRes, costCentersRes, suppliersRes] = await Promise.all([
          axios.get(`${API}/api/partners/options`, { withCredentials: true }),
          axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true }).catch(() => ({ data: [] })),
          axios.get(`${API}/api/suppliers`, { withCredentials: true }).catch(() => ({ data: [] }))
        ]);
        
        setOptions(optionsRes.data);
        setCostCenters(costCentersRes.data || []);
        setSuppliers(suppliersRes.data || []);

        if (isEdit) {
          const partnerRes = await axios.get(`${API}/api/partners/${partnerId}`, { withCredentials: true });
          const data = partnerRes.data;
          setForm({
            ...EMPTY_FORM,
            ...data,
            minimum_spend: data.minimum_spend || "",
            reliability_score: data.reliability_score || "",
            quality_score: data.quality_score || "",
            communication_score: data.communication_score || "",
            capabilities: data.capabilities || [],
            product_or_service_types: data.product_or_service_types || [],
            tags: data.tags || [],
          });
        }
      } catch (err) {
        console.error(err);
        toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [partnerId, isEdit, isEs]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !form.tags.includes(newTag.trim())) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const toggleCapability = (cap) => {
    setForm(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter(c => c !== cap)
        : [...prev.capabilities, cap]
    }));
  };

  const handleSubmit = async () => {
    if (!form.partner_name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        minimum_spend: form.minimum_spend ? parseFloat(form.minimum_spend) : null,
        reliability_score: form.reliability_score ? parseFloat(form.reliability_score) : null,
        quality_score: form.quality_score ? parseFloat(form.quality_score) : null,
        communication_score: form.communication_score ? parseFloat(form.communication_score) : null,
      };

      if (isEdit) {
        await axios.put(`${API}/api/partners/${partnerId}`, payload, { withCredentials: true });
        toast.success(isEs ? "Partner actualizado" : "Partner updated");
      } else {
        const res = await axios.post(`${API}/api/partners`, payload, { withCredentials: true });
        toast.success(isEs ? "Partner creado" : "Partner created");
        navigate(`/partners/${res.data.partner_id}`);
        return;
      }
      navigate(`/partners/${partnerId}`);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6" data-testid="partner-form-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/partners")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {isEdit 
                  ? (isEs ? "Editar Partner" : "Edit Partner")
                  : (isEs ? "Nuevo Partner" : "New Partner")}
              </h1>
              {isEdit && <p className="text-sm text-muted-foreground">{form.partner_name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/partners")}>
              <X className="w-4 h-4 mr-2" />
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? (isEs ? "Guardando..." : "Saving...") : (isEs ? "Guardar" : "Save")}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="basic">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">{isEs ? "Básico" : "Basic"}</TabsTrigger>
            <TabsTrigger value="location">{isEs ? "Ubicación" : "Location"}</TabsTrigger>
            <TabsTrigger value="contact">{isEs ? "Contacto" : "Contact"}</TabsTrigger>
            <TabsTrigger value="commercial">{isEs ? "Comercial" : "Commercial"}</TabsTrigger>
            <TabsTrigger value="system">{isEs ? "Sistema" : "System"}</TabsTrigger>
          </TabsList>

          {/* Basic Tab */}
          <TabsContent value="basic" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Información Básica" : "Basic Information"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>{isEs ? "Nombre del Partner *" : "Partner Name *"}</Label>
                    <Input
                      value={form.partner_name}
                      onChange={(e) => handleChange("partner_name", e.target.value)}
                      placeholder={isEs ? "Nombre comercial" : "Business name"}
                      data-testid="partner-name-input"
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Razón Social" : "Legal Name"}</Label>
                    <Input
                      value={form.legal_name}
                      onChange={(e) => handleChange("legal_name", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Nombre a Mostrar" : "Display Name"}</Label>
                    <Input
                      value={form.display_name}
                      onChange={(e) => handleChange("display_name", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label>{isEs ? "Tipo" : "Type"}</Label>
                    <Select value={form.partner_type} onValueChange={(v) => handleChange("partner_type", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.partner_type?.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {isEs ? opt.label_es : opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isEs ? "Estado" : "Status"}</Label>
                    <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.status?.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {isEs ? opt.label_es : opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isEs ? "Categoría Principal" : "Primary Category"}</Label>
                    <Select value={form.primary_category} onValueChange={(v) => handleChange("primary_category", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.primary_category?.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {isEs ? opt.label_es : opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isEs ? "Nivel de Precio" : "Pricing Level"}</Label>
                    <Select value={form.pricing_level} onValueChange={(v) => handleChange("pricing_level", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.pricing_level?.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {isEs ? opt.label_es : opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>{isEs ? "Es Preferido" : "Is Preferred"}</Label>
                    <Switch
                      checked={form.is_preferred}
                      onCheckedChange={(v) => handleChange("is_preferred", v)}
                    />
                  </div>
                  {form.is_preferred && (
                    <div>
                      <Label>{isEs ? "Tier Preferido" : "Preferred Tier"}</Label>
                      <Select value={form.preferred_tier} onValueChange={(v) => handleChange("preferred_tier", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.preferred_tier?.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {isEs ? opt.label_es : opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>{isEs ? "Fit de Industria" : "Industry Fit"}</Label>
                    <Input
                      value={form.industry_fit}
                      onChange={(e) => handleChange("industry_fit", e.target.value)}
                      placeholder={isEs ? "Ej: Bodas, Corporativo" : "E.g., Weddings, Corporate"}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Capabilities */}
            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Capacidades" : "Capabilities"}</CardTitle>
                <CardDescription>
                  {isEs ? "Selecciona las capacidades del partner" : "Select partner capabilities"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {options.capabilities?.map(cap => (
                    <Badge
                      key={cap.value}
                      variant={form.capabilities.includes(cap.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCapability(cap.value)}
                    >
                      {isEs ? cap.label_es : cap.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Etiquetas" : "Tags"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder={isEs ? "Nueva etiqueta" : "New tag"}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    className="max-w-xs"
                  />
                  <Button variant="outline" size="sm" onClick={handleAddTag}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => handleRemoveTag(tag)}>
                      {tag} <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Location Tab */}
          <TabsContent value="location" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Sede Principal" : "Headquarters"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{isEs ? "Dirección Completa" : "Full Address"}</Label>
                  <Textarea
                    value={form.full_address}
                    onChange={(e) => handleChange("full_address", e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>{isEs ? "País" : "Country"}</Label>
                    <Input value={form.hq_country} onChange={(e) => handleChange("hq_country", e.target.value)} />
                  </div>
                  <div>
                    <Label>{isEs ? "Estado/Provincia" : "State/Province"}</Label>
                    <Input value={form.hq_state_province} onChange={(e) => handleChange("hq_state_province", e.target.value)} />
                  </div>
                  <div>
                    <Label>{isEs ? "Ciudad" : "City"}</Label>
                    <Input value={form.hq_city} onChange={(e) => handleChange("hq_city", e.target.value)} />
                  </div>
                  <div>
                    <Label>{isEs ? "Código Postal" : "Postal Code"}</Label>
                    <Input value={form.postal_code} onChange={(e) => handleChange("postal_code", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>{isEs ? "Distrito/Municipio" : "District/Municipality"}</Label>
                  <Input value={form.hq_district_municipality} onChange={(e) => handleChange("hq_district_municipality", e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Cobertura de Servicio" : "Service Coverage"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{isEs ? "Tipo de Cobertura" : "Coverage Type"}</Label>
                  <Select value={form.service_area_type} onValueChange={(v) => handleChange("service_area_type", v)}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.service_area_type?.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {isEs ? opt.label_es : opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isEs ? "Notas de Cobertura" : "Coverage Notes"}</Label>
                  <Textarea
                    value={form.coverage_notes}
                    onChange={(e) => handleChange("coverage_notes", e.target.value)}
                    rows={3}
                    placeholder={isEs ? "Áreas específicas que cubre..." : "Specific areas covered..."}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contact Tab */}
          <TabsContent value="contact" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Contacto Principal" : "Primary Contact"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{isEs ? "Nombre" : "Name"}</Label>
                    <Input value={form.primary_contact_name} onChange={(e) => handleChange("primary_contact_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>{isEs ? "Cargo" : "Role"}</Label>
                    <Input value={form.primary_contact_role} onChange={(e) => handleChange("primary_contact_role", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} />
                  </div>
                  <div>
                    <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                    <Input value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input value={form.whatsapp} onChange={(e) => handleChange("whatsapp", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>{isEs ? "Sitio Web" : "Website"}</Label>
                    <Input value={form.website} onChange={(e) => handleChange("website", e.target.value)} placeholder="https://" />
                  </div>
                  <div>
                    <Label>Instagram</Label>
                    <Input value={form.instagram} onChange={(e) => handleChange("instagram", e.target.value)} placeholder="@usuario" />
                  </div>
                  <div>
                    <Label>LinkedIn</Label>
                    <Input value={form.linkedin} onChange={(e) => handleChange("linkedin", e.target.value)} placeholder="https://linkedin.com/..." />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Contacto Secundario" : "Secondary Contact"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>{isEs ? "Nombre" : "Name"}</Label>
                    <Input value={form.secondary_contact_name} onChange={(e) => handleChange("secondary_contact_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.secondary_contact_email} onChange={(e) => handleChange("secondary_contact_email", e.target.value)} />
                  </div>
                  <div>
                    <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                    <Input value={form.secondary_contact_phone} onChange={(e) => handleChange("secondary_contact_phone", e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commercial Tab */}
          <TabsContent value="commercial" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Términos Comerciales" : "Commercial Terms"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>{isEs ? "Mínimo de Compra" : "Minimum Spend"}</Label>
                    <Input
                      type="number"
                      value={form.minimum_spend}
                      onChange={(e) => handleChange("minimum_spend", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Tiempo de Entrega" : "Lead Time"}</Label>
                    <Input
                      value={form.lead_time}
                      onChange={(e) => handleChange("lead_time", e.target.value)}
                      placeholder={isEs ? "Ej: 2 semanas" : "E.g., 2 weeks"}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Tiempo de Respuesta" : "Response Time"}</Label>
                    <Input
                      value={form.response_time}
                      onChange={(e) => handleChange("response_time", e.target.value)}
                      placeholder={isEs ? "Ej: 24 horas" : "E.g., 24 hours"}
                    />
                  </div>
                </div>
                <div>
                  <Label>{isEs ? "Términos de Pago" : "Payment Terms"}</Label>
                  <Input
                    value={form.payment_terms}
                    onChange={(e) => handleChange("payment_terms", e.target.value)}
                    placeholder={isEs ? "Ej: 50% anticipo, 50% entrega" : "E.g., 50% upfront, 50% on delivery"}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{isEs ? "Notas de Disponibilidad" : "Availability Notes"}</Label>
                    <Textarea
                      value={form.availability_notes}
                      onChange={(e) => handleChange("availability_notes", e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Notas de Capacidad" : "Capacity Notes"}</Label>
                    <Textarea
                      value={form.capacity_notes}
                      onChange={(e) => handleChange("capacity_notes", e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label className="mb-0">{isEs ? "Contrato Requerido" : "Contract Required"}</Label>
                    <Switch checked={form.contract_required} onCheckedChange={(v) => handleChange("contract_required", v)} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label className="mb-0">{isEs ? "Seguro Requerido" : "Insurance Required"}</Label>
                    <Switch checked={form.insurance_required} onCheckedChange={(v) => handleChange("insurance_required", v)} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label className="mb-0">{isEs ? "Documentos en Archivo" : "Documents on File"}</Label>
                    <Switch checked={form.documents_on_file} onCheckedChange={(v) => handleChange("documents_on_file", v)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Calidad y Issues" : "Quality & Issues"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>{isEs ? "Score Confiabilidad (1-10)" : "Reliability Score (1-10)"}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.1"
                      value={form.reliability_score}
                      onChange={(e) => handleChange("reliability_score", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Score Calidad (1-10)" : "Quality Score (1-10)"}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.1"
                      value={form.quality_score}
                      onChange={(e) => handleChange("quality_score", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Score Comunicación (1-10)" : "Communication Score (1-10)"}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.1"
                      value={form.communication_score}
                      onChange={(e) => handleChange("communication_score", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50">
                  <Label className="mb-0 text-red-800">{isEs ? "Tiene Issues" : "Has Issues"}</Label>
                  <Switch checked={form.issues_flag} onCheckedChange={(v) => handleChange("issues_flag", v)} />
                </div>
                {form.issues_flag && (
                  <div>
                    <Label>{isEs ? "Notas de Issues" : "Issue Notes"}</Label>
                    <Textarea
                      value={form.issue_notes}
                      onChange={(e) => handleChange("issue_notes", e.target.value)}
                      rows={3}
                      className="border-red-200"
                    />
                  </div>
                )}
                <div>
                  <Label>{isEs ? "Notas Internas" : "Internal Notes"}</Label>
                  <Textarea
                    value={form.internal_notes}
                    onChange={(e) => handleChange("internal_notes", e.target.value)}
                    rows={4}
                    placeholder={isEs ? "Notas privadas sobre este partner..." : "Private notes about this partner..."}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Tab */}
          <TabsContent value="system" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Configuración del Sistema" : "System Configuration"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{isEs ? "Centro de Costo por Defecto" : "Default Cost Center"}</Label>
                    <Select value={form.default_cost_center_id} onValueChange={(v) => handleChange("default_cost_center_id", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={isEs ? "Seleccionar" : "Select"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{isEs ? "Ninguno" : "None"}</SelectItem>
                        {costCenters.map(cc => (
                          <SelectItem key={cc.cost_center_id} value={cc.cost_center_id}>
                            {cc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isEs ? "Categoría de Gasto" : "Expense Category"}</Label>
                    <Input
                      value={form.default_expense_category}
                      onChange={(e) => handleChange("default_expense_category", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{isEs ? "RNC / ID Fiscal" : "Tax ID"}</Label>
                    <Input value={form.tax_id} onChange={(e) => handleChange("tax_id", e.target.value)} />
                  </div>
                  <div>
                    <Label>{isEs ? "Moneda" : "Currency"}</Label>
                    <Select value={form.currency} onValueChange={(v) => handleChange("currency", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOP">DOP</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label className="mb-0">{isEs ? "Docs de Cumplimiento en Archivo" : "Compliance Docs on File"}</Label>
                  <Switch checked={form.compliance_docs_on_file} onCheckedChange={(v) => handleChange("compliance_docs_on_file", v)} />
                </div>
              </CardContent>
            </Card>

            {suppliers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{isEs ? "Vincular con Suplidor Culinario" : "Link to Culinary Supplier"}</CardTitle>
                  <CardDescription>
                    {isEs 
                      ? "Si este partner ya existe como suplidor en Culinary Intelligence"
                      : "If this partner already exists as a supplier in Culinary Intelligence"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select 
                    value={form.linked_culinary_supplier_id || ""} 
                    onValueChange={(v) => handleChange("linked_culinary_supplier_id", v)}
                  >
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder={isEs ? "Seleccionar suplidor" : "Select supplier"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{isEs ? "Ninguno" : "None"}</SelectItem>
                      {suppliers.map(s => (
                        <SelectItem key={s.supplier_id} value={s.supplier_id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
