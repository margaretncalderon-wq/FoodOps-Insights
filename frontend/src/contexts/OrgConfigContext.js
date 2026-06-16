import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const OrgConfigContext = createContext(null);

// Default terminology
const DEFAULT_TERMINOLOGY = {
  event: { en: "Event", es: "Evento" },
  project: { en: "Project", es: "Proyecto" },
  service: { en: "Service", es: "Servicio" },
  event_date: { en: "Event Date", es: "Fecha del Evento" },
  guest_count: { en: "Guest Count", es: "Cantidad de Invitados" },
  venue: { en: "Venue", es: "Venue" },
  event_type: { en: "Event Type", es: "Tipo de Evento" },
  client: { en: "Client", es: "Cliente" },
  proposal: { en: "Proposal", es: "Propuesta" },
  invoice: { en: "Invoice", es: "Factura" },
  participant_count: { en: "Participants", es: "Participantes" },
  deliverables: { en: "Deliverables", es: "Entregables" },
};

export const OrgConfigProvider = ({ children }) => {
  const { token, user } = useAuth();
  const { language } = useLanguage();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [terminology, setTerminology] = useState({});

  const fetchConfig = useCallback(async () => {
    // Always try to fetch, using credentials (cookies) instead of requiring token
    try {
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/api/org-config`, {
        headers,
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        
        // Build terminology map from config
        const termMap = {};
        if (data.terminology) {
          Object.entries(data.terminology).forEach(([key, value]) => {
            termMap[key] = value[language] || value.en || key;
          });
        }
        // Add defaults for missing terms
        Object.entries(DEFAULT_TERMINOLOGY).forEach(([key, value]) => {
          if (!termMap[key]) {
            termMap[key] = value[language] || value.en;
          }
        });
        setTerminology(termMap);
      }
    } catch (error) {
      console.error("Error fetching org config:", error);
    } finally {
      setLoading(false);
    }
  }, [token, language]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig, user?.company_id]);

  // Get a term with fallback to default
  const term = useCallback(
    (key, fallback = null) => {
      if (terminology[key]) return terminology[key];
      if (fallback) return fallback;
      return DEFAULT_TERMINOLOGY[key]?.[language] || DEFAULT_TERMINOLOGY[key]?.en || key;
    },
    [terminology, language]
  );

  // Check if an engagement type is enabled
  const isEngagementTypeEnabled = useCallback(
    (type) => {
      if (!config) return true; // Default to enabled
      return config.enabled_engagement_types?.includes(type) ?? true;
    },
    [config]
  );

  // Get enabled engagement types
  const getEnabledEngagementTypes = useCallback(() => {
    if (!config) return ["event", "project", "service"];
    return config.enabled_engagement_types || ["event", "project", "service"];
  }, [config]);

  // Get default engagement type
  const getDefaultEngagementType = useCallback(() => {
    if (!config) return "event";
    return config.default_engagement_type || "event";
  }, [config]);

  // Get event types (customized per org)
  const getEventTypes = useCallback(() => {
    if (!config?.event_types?.length) {
      return [
        { key: "wedding", label: language === "es" ? "Boda" : "Wedding" },
        { key: "corporate", label: language === "es" ? "Corporativo" : "Corporate" },
        { key: "social", label: language === "es" ? "Social" : "Social" },
        { key: "other", label: language === "es" ? "Otro" : "Other" },
      ];
    }
    return config.event_types.map((t) => ({
      key: t.key,
      label: t[language] || t.en,
    }));
  }, [config, language]);

  // Get pipeline stages (customized per org)
  const getPipelineStages = useCallback(() => {
    if (!config?.pipeline_stages?.length) {
      return [
        { key: "inquiry_received", label: language === "es" ? "Consulta Recibida" : "Inquiry Received" },
        { key: "context_captured", label: language === "es" ? "Contexto Capturado" : "Context Captured" },
        { key: "scope_drafted", label: language === "es" ? "Alcance Definido" : "Scope Drafted" },
        { key: "definition_review", label: language === "es" ? "Definición en Revisión" : "Definition In Review" },
        { key: "committed", label: language === "es" ? "Confirmado" : "Committed" },
        { key: "archived", label: language === "es" ? "Archivado" : "Archived" },
      ];
    }
    return config.pipeline_stages.map((s) => ({
      key: s.key,
      label: s[language] || s.en,
    }));
  }, [config, language]);

  // Get client types (customized per org)
  const getClientTypes = useCallback(() => {
    if (!config?.client_types?.length) {
      return [
        { key: "individual", label: language === "es" ? "Individual" : "Individual" },
        { key: "corporate", label: language === "es" ? "Corporativo" : "Corporate" },
      ];
    }
    return config.client_types.map((t) => ({
      key: t.key,
      label: t[language] || t.en,
    }));
  }, [config, language]);

  // Apply a template
  const applyTemplate = useCallback(
    async (templateKey) => {
      if (!token) return null;

      try {
        const response = await fetch(
          `${API_URL}/api/org-config/apply-template/${templateKey}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setConfig(data.config);
          await fetchConfig(); // Refresh to get updated terminology
          return data;
        }
      } catch (error) {
        console.error("Error applying template:", error);
      }
      return null;
    },
    [token, fetchConfig]
  );

  // Refresh config
  const refreshConfig = useCallback(() => {
    setLoading(true);
    fetchConfig();
  }, [fetchConfig]);

  return (
    <OrgConfigContext.Provider
      value={{
        config,
        loading,
        terminology,
        term,
        isEngagementTypeEnabled,
        getEnabledEngagementTypes,
        getDefaultEngagementType,
        getEventTypes,
        getPipelineStages,
        getClientTypes,
        applyTemplate,
        refreshConfig,
        industryTemplate: config?.industry_template || "events_hospitality",
        companyCurrency: config?.company_currency || "USD",
        companyTimezone: config?.company_timezone || "UTC",
      }}
    >
      {children}
    </OrgConfigContext.Provider>
  );
};

export const useOrgConfig = () => {
  const context = useContext(OrgConfigContext);
  if (!context) {
    throw new Error("useOrgConfig must be used within an OrgConfigProvider");
  }
  return context;
};

export default OrgConfigContext;
