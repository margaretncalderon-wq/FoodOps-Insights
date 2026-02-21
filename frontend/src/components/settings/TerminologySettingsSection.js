// components/settings/TerminologySettingsSection.js - Inclusive Language Settings
import { useState, useMemo } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useOrgConfig } from "../../contexts/OrgConfigContext";
import { useTerminology } from "../../hooks/useTerminology";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { toast } from "sonner";
import { 
  Building2, 
  Briefcase, 
  Heart, 
  Home, 
  GraduationCap, 
  Dumbbell, 
  Lightbulb, 
  Check, 
  Loader2, 
  Languages,
  ArrowRight,
  Sparkles
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Icon mapping for industries
const INDUSTRY_ICONS = {
  events_hospitality: Building2,
  agency: Briefcase,
  healthcare: Heart,
  real_estate: Home,
  education: GraduationCap,
  fitness: Dumbbell,
  consulting: Lightbulb,
  generic: Briefcase,
};

// Color classes for industries
const INDUSTRY_COLORS = {
  events_hospitality: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400",
  agency: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  healthcare: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  real_estate: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  education: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  fitness: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  consulting: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400",
  generic: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
};

// Key terms to show in the preview table
const KEY_TERMS = [
  { category: "events", key: "client", label: { en: "Client", es: "Cliente" } },
  { category: "events", key: "lead", label: { en: "Lead/Prospect", es: "Lead/Prospecto" } },
  { category: "events", key: "entity_singular", label: { en: "Main Entity", es: "Entidad Principal" } },
  { category: "events", key: "booking", label: { en: "Booking", es: "Reserva" } },
  { category: "events", key: "venue", label: { en: "Venue/Location", es: "Lugar/Ubicación" } },
  { category: "crm", key: "pipeline", label: { en: "Pipeline", es: "Pipeline" } },
  { category: "crm", key: "deal", label: { en: "Deal", es: "Negociación" } },
  { category: "finance", key: "quote", label: { en: "Quote/Proposal", es: "Cotización/Propuesta" } },
  { category: "team", key: "owner", label: { en: "Owner/Manager", es: "Propietario/Gerente" } },
  { category: "team", key: "member", label: { en: "Team Member", es: "Miembro del Equipo" } },
];

export default function TerminologySettingsSection() {
  const { language } = useLanguage();
  const { industryTemplate, refreshConfig } = useOrgConfig();
  const { 
    industryKey, 
    term, 
    availableIndustries, 
    previewIndustryTerms,
    industryInfo 
  } = useTerminology();
  
  const [applying, setApplying] = useState(null);
  const [selectedPreview, setSelectedPreview] = useState(null);
  
  // Handle applying a new industry template
  const handleApplyTemplate = async (templateKey) => {
    setApplying(templateKey);
    try {
      const response = await fetch(
        `${API_URL}/api/org-config/apply-template/${templateKey}`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (response.ok) {
        toast.success(
          language === "es"
            ? "Terminología actualizada correctamente"
            : "Terminology updated successfully"
        );
        refreshConfig();
        setSelectedPreview(null);
      } else {
        const error = await response.json();
        toast.error(error.detail || (language === "es" ? "Error al actualizar" : "Update failed"));
      }
    } catch (error) {
      console.error("Error applying template:", error);
      toast.error(
        language === "es"
          ? "Error al actualizar terminología"
          : "Error updating terminology"
      );
    } finally {
      setApplying(null);
    }
  };
  
  // Current terminology preview
  const currentTermsPreview = useMemo(() => {
    return KEY_TERMS.map(({ category, key, label }) => ({
      label: label[language] || label.en,
      value: term(category, key)
    }));
  }, [term, language]);
  
  // Preview terminology for selected industry
  const previewTerms = useMemo(() => {
    if (!selectedPreview) return null;
    return KEY_TERMS.map(({ category, key, label }) => {
      const terms = previewIndustryTerms(selectedPreview, category);
      return {
        label: label[language] || label.en,
        currentValue: term(category, key),
        newValue: terms[key] || key
      };
    });
  }, [selectedPreview, previewIndustryTerms, term, language]);

  return (
    <div className="space-y-6" data-testid="terminology-settings-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Languages className="w-5 h-5" />
            {language === "es" ? "Lenguaje Inclusivo por Industria" : "Inclusive Language by Industry"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "es"
              ? "Adapta la terminología de la aplicación según tu tipo de negocio"
              : "Adapt application terminology based on your business type"}
          </p>
        </div>
        <Badge variant="outline" className="text-sm gap-2" data-testid="current-industry-badge">
          {(() => {
            const Icon = INDUSTRY_ICONS[industryKey] || Briefcase;
            return <Icon className="w-4 h-4" />;
          })()}
          {industryInfo.name}
        </Badge>
      </div>

      {/* Current Terminology Preview */}
      <Card data-testid="current-terminology-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            {language === "es" ? "Terminología Actual" : "Current Terminology"}
          </CardTitle>
          <CardDescription>
            {language === "es"
              ? "Así se muestran los términos en tu aplicación actualmente"
              : "This is how terms are displayed in your application"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {currentTermsPreview.map(({ label, value }) => (
              <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="font-medium text-sm">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Industry Selection */}
      <Card data-testid="industry-selection-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {language === "es" ? "Selecciona tu Industria" : "Select Your Industry"}
          </CardTitle>
          <CardDescription>
            {language === "es"
              ? "Elige la industria que mejor represente tu negocio para adaptar la terminología"
              : "Choose the industry that best represents your business to adapt terminology"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {availableIndustries.map((industry) => {
              const Icon = INDUSTRY_ICONS[industry.id] || Briefcase;
              const isSelected = industryKey === industry.id;
              const colorClass = INDUSTRY_COLORS[industry.id] || INDUSTRY_COLORS.generic;
              
              return (
                <button
                  key={industry.id}
                  onClick={() => {
                    if (!isSelected) {
                      setSelectedPreview(industry.id);
                    }
                  }}
                  disabled={applying === industry.id}
                  data-testid={`industry-option-${industry.id}`}
                  className={`
                    relative p-4 rounded-lg border-2 text-left transition-all
                    ${isSelected 
                      ? "border-primary bg-primary/5 ring-1 ring-primary" 
                      : selectedPreview === industry.id
                        ? "border-primary/50 bg-muted/50"
                        : "border-transparent bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/20"
                    }
                  `}
                >
                  {isSelected && (
                    <Badge className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5">
                      <Check className="w-3 h-3 mr-0.5" />
                      {language === "es" ? "Activo" : "Active"}
                    </Badge>
                  )}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass} mb-2`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="font-medium text-sm">{industry.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {industry.description}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Preview Changes Modal/Card */}
      {selectedPreview && selectedPreview !== industryKey && previewTerms && (
        <Card className="border-primary/50 bg-primary/5" data-testid="preview-changes-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {language === "es" ? "Vista Previa de Cambios" : "Preview Changes"}
            </CardTitle>
            <CardDescription>
              {language === "es"
                ? `Así cambiarán los términos al seleccionar "${availableIndustries.find(i => i.id === selectedPreview)?.name}"`
                : `Terms will change like this when selecting "${availableIndustries.find(i => i.id === selectedPreview)?.name}"`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">
                      {language === "es" ? "Término" : "Term"}
                    </TableHead>
                    <TableHead>
                      {language === "es" ? "Actual" : "Current"}
                    </TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>
                      {language === "es" ? "Nuevo" : "New"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewTerms.map(({ label, currentValue, newValue }) => (
                    <TableRow key={label}>
                      <TableCell className="font-medium text-muted-foreground">
                        {label}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {currentValue}
                      </TableCell>
                      <TableCell>
                        <ArrowRight className="w-4 h-4 text-primary" />
                      </TableCell>
                      <TableCell className={currentValue !== newValue ? "font-medium text-primary" : ""}>
                        {newValue}
                        {currentValue !== newValue && (
                          <span className="ml-2 text-xs text-primary">
                            {language === "es" ? "(cambia)" : "(changes)"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setSelectedPreview(null)}
                data-testid="cancel-preview-btn"
              >
                {language === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button 
                onClick={() => handleApplyTemplate(selectedPreview)}
                disabled={applying === selectedPreview}
                data-testid="apply-terminology-btn"
              >
                {applying === selectedPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {language === "es" ? "Aplicando..." : "Applying..."}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {language === "es" ? "Aplicar Terminología" : "Apply Terminology"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Note */}
      <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
        <p>
          {language === "es"
            ? "💡 Cambiar la terminología actualizará las etiquetas en toda la aplicación (CRM, Eventos, Facturas, etc.). Tus datos existentes no se verán afectados."
            : "💡 Changing terminology will update labels throughout the application (CRM, Events, Invoices, etc.). Your existing data will not be affected."}
        </p>
      </div>
    </div>
  );
}
