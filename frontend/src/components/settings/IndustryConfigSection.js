import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useOrgConfig } from "../../contexts/OrgConfigContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { Building2, Briefcase, Wrench, Check, Sparkles } from "lucide-react";

import { KoraLoader } from "../KoraLoader";
const API_URL = process.env.REACT_APP_BACKEND_URL;

const TEMPLATE_INFO = {
  events_hospitality: {
    icon: Building2,
    color: "bg-purple-100 text-purple-700 border-purple-200",
    features: ["Full event planning", "Venue management", "Catering & menus", "Room setup"],
    featuresEs: ["Planificación completa de eventos", "Gestión de venues", "Catering y menús", "Montaje de salones"],
  },
  professional_services: {
    icon: Briefcase,
    color: "bg-blue-100 text-blue-700 border-blue-200",
    features: ["Project tracking", "Deliverables management", "Team allocation", "Scope management"],
    featuresEs: ["Seguimiento de proyectos", "Gestión de entregables", "Asignación de equipo", "Gestión de alcance"],
  },
  generic: {
    icon: Wrench,
    color: "bg-gray-100 text-gray-700 border-gray-200",
    features: ["Simple CRM", "Proposals & invoices", "Basic pipeline", "Client management"],
    featuresEs: ["CRM simple", "Propuestas y facturas", "Pipeline básico", "Gestión de clientes"],
  },
};

export default function IndustryConfigSection() {
  const { token } = useAuth();
  const { config, refreshConfig, industryTemplate } = useOrgConfig();
  const { language } = useLanguage();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);

  useEffect(() => {
    fetchTemplates();
  }, [token]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch(`${API_URL}/api/org-config/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTemplate = async (templateKey) => {
    setApplying(templateKey);
    try {
      const response = await fetch(
        `${API_URL}/api/org-config/apply-template/${templateKey}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        toast.success(
          language === "es"
            ? "Plantilla aplicada correctamente"
            : "Template applied successfully"
        );
        refreshConfig();
      } else {
        toast.error(
          language === "es"
            ? "Error al aplicar plantilla"
            : "Error applying template"
        );
      }
    } catch (error) {
      console.error("Error applying template:", error);
      toast.error(
        language === "es"
          ? "Error al aplicar plantilla"
          : "Error applying template"
      );
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <KoraLoader size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Template */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {language === "es" ? "Tipo de Negocio" : "Business Type"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {language === "es"
              ? "Selecciona la plantilla que mejor se adapte a tu negocio"
              : "Select the template that best fits your business"}
          </p>
        </div>
        {industryTemplate && (
          <Badge variant="outline" className="text-sm">
            {language === "es" ? "Actual: " : "Current: "}
            {templates.find((t) => t.key === industryTemplate)?.[
              language === "es" ? "name_es" : "name_en"
            ] || industryTemplate}
          </Badge>
        )}
      </div>

      {/* Template Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((template) => {
          const info = TEMPLATE_INFO[template.key] || TEMPLATE_INFO.generic;
          const Icon = info.icon;
          const isSelected = industryTemplate === template.key;
          const features = language === "es" ? info.featuresEs : info.features;

          return (
            <Card
              key={template.key}
              className={`relative cursor-pointer transition-all hover:shadow-md ${
                isSelected ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => !isSelected && handleApplyTemplate(template.key)}
            >
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-primary text-white">
                    <Check className="w-3 h-3 mr-1" />
                    {language === "es" ? "Activo" : "Active"}
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-2">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center ${info.color} mb-2`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg">
                  {language === "es" ? template.name_es : template.name_en}
                </CardTitle>
                <CardDescription className="text-xs">
                  {language === "es"
                    ? template.description_es
                    : template.description_en}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="space-y-1">
                  {features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-muted-foreground flex items-center gap-2"
                    >
                      <Sparkles className="w-3 h-3 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {!isSelected && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    disabled={applying === template.key}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplyTemplate(template.key);
                    }}
                  >
                    {applying === template.key ? (
                      <KoraLoader size={16} className="mr-2" />
                    ) : null}
                    {language === "es" ? "Usar esta plantilla" : "Use this template"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Note */}
      <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
        <p>
          {language === "es"
            ? "💡 Cambiar la plantilla actualizará la terminología y los campos predeterminados. Tus datos existentes no se verán afectados."
            : "💡 Changing the template will update terminology and default fields. Your existing data will not be affected."}
        </p>
      </div>
    </div>
  );
}
