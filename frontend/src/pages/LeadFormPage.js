import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { CheckCircle, Loader2, Calendar, Users, Mail, Phone, Building2, User, Globe } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Translations
const translations = {
  en: {
    loading: "Loading...",
    formNotFound: "Form not found or inactive",
    thankYou: "Thank You!",
    fullName: "Full Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    eventType: "Event Type",
    eventDate: "Event Date",
    estimatedGuests: "Estimated Guests",
    budgetRange: "Budget Range",
    message: "Message",
    selectEventType: "Select event type",
    selectBudgetRange: "Select budget range",
    placeholderName: "Your full name",
    placeholderEmail: "your@email.com",
    placeholderPhone: "+1 (555) 000-0000",
    placeholderCompany: "Company name (optional)",
    placeholderGuests: "Number of guests",
    placeholderMessage: "Tell us more about your event...",
    submitting: "Submitting...",
    submitInquiry: "Submit Inquiry",
    budgetLess5k: "Less than $5,000",
    budget5k10k: "$5,000 - $10,000",
    budget10k25k: "$10,000 - $25,000",
    budget25k50k: "$25,000 - $50,000",
    budgetMore50k: "More than $50,000",
    // Event types
    wedding: "Wedding",
    corporate: "Corporate",
    birthday: "Birthday",
    social: "Social",
    other: "Other",
  },
  es: {
    loading: "Cargando...",
    formNotFound: "Formulario no encontrado o inactivo",
    thankYou: "¡Gracias!",
    fullName: "Nombre Completo",
    email: "Correo Electrónico",
    phone: "Teléfono",
    company: "Empresa",
    eventType: "Tipo de Evento",
    eventDate: "Fecha del Evento",
    estimatedGuests: "Invitados Estimados",
    budgetRange: "Rango de Presupuesto",
    message: "Mensaje",
    selectEventType: "Seleccionar tipo de evento",
    selectBudgetRange: "Seleccionar rango de presupuesto",
    placeholderName: "Tu nombre completo",
    placeholderEmail: "tu@correo.com",
    placeholderPhone: "+1 (809) 000-0000",
    placeholderCompany: "Nombre de la empresa (opcional)",
    placeholderGuests: "Número de invitados",
    placeholderMessage: "Cuéntanos más sobre tu evento...",
    submitting: "Enviando...",
    submitInquiry: "Enviar Consulta",
    budgetLess5k: "Menos de $5,000",
    budget5k10k: "$5,000 - $10,000",
    budget10k25k: "$10,000 - $25,000",
    budget25k50k: "$25,000 - $50,000",
    budgetMore50k: "Más de $50,000",
    // Event types
    wedding: "Boda",
    corporate: "Corporativo",
    birthday: "Cumpleaños",
    social: "Social",
    other: "Otro",
  }
};

const EVENT_TYPES = ["wedding", "corporate", "birthday", "social", "other"];

export default function LeadFormPage() {
  const { formId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    lead_name: "",
    email: "",
    phone: "",
    company_name: "",
    event_type: "",
    event_date: "",
    estimated_guest_count: "",
    budget_range: "",
    message: ""
  });

  // Language detection: URL param > browser language > default 'en'
  const getInitialLanguage = () => {
    const urlLang = searchParams.get("lang");
    if (urlLang === "es" || urlLang === "en") return urlLang;
    
    const browserLang = navigator.language?.toLowerCase();
    if (browserLang?.startsWith("es")) return "es";
    return "en";
  };

  const [language, setLanguage] = useState(getInitialLanguage);
  const t = translations[language];

  const changeLanguage = (newLang) => {
    setLanguage(newLang);
    setSearchParams({ lang: newLang });
  };

  useEffect(() => {
    fetchForm();
  }, [formId]);

  const fetchForm = async () => {
    try {
      const response = await axios.get(`${API}/lead-forms/${formId}/public`);
      setForm(response.data);
      if (response.data.default_event_type) {
        setFormData(prev => ({ ...prev, event_type: response.data.default_event_type }));
      }
    } catch (error) {
      console.error("Failed to fetch form:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/lead-forms/${formId}/submit`, formData);
      setSubmitted(true);
      toast.success(response.data.message || t.thankYou);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const isFieldEnabled = (fieldName) => {
    if (!form?.fields || form.fields.length === 0) return true;
    const field = form.fields.find(f => f.field_name === fieldName);
    return field ? field.enabled : true;
  };

  const isFieldRequired = (fieldName) => {
    if (!form?.fields || form.fields.length === 0) {
      return ["lead_name", "email"].includes(fieldName);
    }
    const field = form.fields.find(f => f.field_name === fieldName);
    return field ? field.required : false;
  };

  // Language Selector Component
  const LanguageSelector = () => (
    <div className="absolute top-4 right-4">
      <Select value={language} onValueChange={changeLanguage}>
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <Globe className="w-3 h-3 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="es">Español</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4 relative">
        <LanguageSelector />
        <div className="animate-pulse text-muted-foreground">{t.loading}</div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4 relative">
        <LanguageSelector />
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t.formNotFound}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    const thankYouMsg = language === "es" 
      ? (form.thank_you_message_es || "¡Gracias por tu consulta!")
      : (form.thank_you_message_en || "Thank you for your inquiry!");
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4 relative">
        <LanguageSelector />
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">{t.thankYou}</h2>
            <p className="text-muted-foreground">{thankYouMsg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4 relative">
      <LanguageSelector />
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl">{form.form_name}</CardTitle>
          {form.description && (
            <CardDescription className="mt-2">{form.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            {isFieldEnabled("lead_name") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t.fullName} {isFieldRequired("lead_name") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  value={formData.lead_name}
                  onChange={(e) => setFormData({ ...formData, lead_name: e.target.value })}
                  required={isFieldRequired("lead_name")}
                  placeholder={t.placeholderName}
                />
              </div>
            )}

            {/* Email */}
            {isFieldEnabled("email") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {t.email} {isFieldRequired("email") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required={isFieldRequired("email")}
                  placeholder={t.placeholderEmail}
                />
              </div>
            )}

            {/* Phone */}
            {isFieldEnabled("phone") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {t.phone} {isFieldRequired("phone") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required={isFieldRequired("phone")}
                  placeholder={t.placeholderPhone}
                />
              </div>
            )}

            {/* Company */}
            {isFieldEnabled("company_name") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {t.company} {isFieldRequired("company_name") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required={isFieldRequired("company_name")}
                  placeholder={t.placeholderCompany}
                />
              </div>
            )}

            {/* Event Type */}
            {isFieldEnabled("event_type") && (
              <div className="space-y-2">
                <Label>
                  {t.eventType} {isFieldRequired("event_type") && <span className="text-red-500">*</span>}
                </Label>
                <Select 
                  value={formData.event_type} 
                  onValueChange={(v) => setFormData({ ...formData, event_type: v })}
                  required={isFieldRequired("event_type")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.selectEventType} />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {t[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Event Date */}
            {isFieldEnabled("event_date") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {t.eventDate} {isFieldRequired("event_date") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                  required={isFieldRequired("event_date")}
                />
              </div>
            )}

            {/* Guest Count */}
            {isFieldEnabled("estimated_guest_count") && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t.estimatedGuests} {isFieldRequired("estimated_guest_count") && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  type="number"
                  value={formData.estimated_guest_count}
                  onChange={(e) => setFormData({ ...formData, estimated_guest_count: e.target.value })}
                  required={isFieldRequired("estimated_guest_count")}
                  placeholder={t.placeholderGuests}
                />
              </div>
            )}

            {/* Budget Range */}
            {isFieldEnabled("budget_range") && (
              <div className="space-y-2">
                <Label>
                  {t.budgetRange} {isFieldRequired("budget_range") && <span className="text-red-500">*</span>}
                </Label>
                <Select 
                  value={formData.budget_range} 
                  onValueChange={(v) => setFormData({ ...formData, budget_range: v })}
                  required={isFieldRequired("budget_range")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.selectBudgetRange} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="< $5,000">{t.budgetLess5k}</SelectItem>
                    <SelectItem value="$5,000 - $10,000">{t.budget5k10k}</SelectItem>
                    <SelectItem value="$10,000 - $25,000">{t.budget10k25k}</SelectItem>
                    <SelectItem value="$25,000 - $50,000">{t.budget25k50k}</SelectItem>
                    <SelectItem value="> $50,000">{t.budgetMore50k}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Message */}
            {isFieldEnabled("message") && (
              <div className="space-y-2">
                <Label>
                  {t.message} {isFieldRequired("message") && <span className="text-red-500">*</span>}
                </Label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required={isFieldRequired("message")}
                  placeholder={t.placeholderMessage}
                  rows={4}
                />
              </div>
            )}

            <Button type="submit" className="w-full h-12" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.submitting}
                </>
              ) : (
                t.submitInquiry
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
