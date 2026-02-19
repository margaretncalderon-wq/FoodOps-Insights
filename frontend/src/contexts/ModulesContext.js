import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getApiBaseUrl } from "../utils/api";

const API_URL = getApiBaseUrl();

const ModulesContext = createContext(null);

export const ModulesProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState(null);
  const [coreModules, setCoreModules] = useState([]);
  const [addonModules, setAddonModules] = useState([]);
  const [industry, setIndustry] = useState("events_hospitality");
  const [industryConfig, setIndustryConfig] = useState(null);
  const [terminology, setTerminology] = useState({});

  const fetchModules = useCallback(async () => {
    // If no token and no user, skip fetching
    if (!token && !user) {
      setLoading(false);
      return;
    }

    try {
      const fetchOptions = {
        credentials: 'include', // Always include cookies
      };
      
      // Add Authorization header if we have a token
      if (token) {
        fetchOptions.headers = {
          Authorization: `Bearer ${token}`,
        };
      }
      
      const response = await fetch(`${API_URL}/api/addons/enabled-modules`, fetchOptions);

      if (response.ok) {
        const data = await response.json();
        setModules(data.modules || []);
        setPlanId(data.plan_id);
        setCoreModules(data.core_modules || []);
        setAddonModules(data.addon_modules || []);
        setIndustry(data.industry_type || data.industry || "events");
        setIndustryConfig(data.industry_config || null);
        setTerminology(data.terminology || {});
      }
    } catch (error) {
      console.error("Error fetching modules:", error);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules, user?.company_id]);

  // Check if a specific module is enabled
  const isModuleEnabled = useCallback(
    (moduleKey) => {
      return modules.some((m) => m.key === moduleKey || m.path === moduleKey);
    },
    [modules]
  );

  // Check if a path is accessible
  const isPathEnabled = useCallback(
    (path) => {
      return modules.some((m) => path.startsWith(m.path));
    },
    [modules]
  );

  // Get module info by key or path
  const getModule = useCallback(
    (keyOrPath) => {
      return modules.find((m) => m.key === keyOrPath || m.path === keyOrPath);
    },
    [modules]
  );

  // Refresh modules (e.g., after purchasing an addon)
  const refreshModules = useCallback(() => {
    setLoading(true);
    fetchModules();
  }, [fetchModules]);

  // Helper to get term based on industry
  const getTerm = useCallback(
    (key, lang = "en") => {
      if (terminology[key]) {
        return terminology[key][lang] || terminology[key]["en"] || key;
      }
      return null;
    },
    [terminology]
  );

  // Check if industry is events/hospitality
  const isEventsIndustry = industry === "events" || industry === "events_hospitality";
  const isProfessionalServices = industry === "agency" || industry === "professional_services";
  const isConsulting = industry === "consulting";
  const isGeneric = industry === "generic";

  // Get Program Orchestration config (dynamic module name, labels, etc.)
  const getProgramOrchestrationConfig = useCallback(() => {
    return industryConfig?.program_orchestration || {
      name_en: "Event Orchestration",
      name_es: "Event Orchestration",
      entity_singular_en: "Event",
      entity_singular_es: "Evento",
      entity_plural_en: "Events",
      entity_plural_es: "Eventos",
      fields: {}
    };
  }, [industryConfig]);

  // Get field label for Program Orchestration module
  const getFieldLabel = useCallback((fieldKey, lang = "en") => {
    const poConfig = getProgramOrchestrationConfig();
    const fields = poConfig.fields || {};
    const field = fields[fieldKey];
    if (field) {
      return field[lang] || field.en || fieldKey;
    }
    // Default labels
    const defaults = {
      name: { en: "Name", es: "Nombre" },
      date: { en: "Date", es: "Fecha" },
      end_date: { en: "End Date", es: "Fecha de Fin" },
      guest_count: { en: "Guest Count", es: "Invitados" },
      venue: { en: "Venue", es: "Ubicación" },
      budget: { en: "Budget", es: "Presupuesto" },
      type: { en: "Type", es: "Tipo" },
    };
    return defaults[fieldKey]?.[lang] || defaults[fieldKey]?.en || fieldKey;
  }, [getProgramOrchestrationConfig]);

  // Get entity types for this industry
  const getEntityTypes = useCallback(() => {
    const poConfig = getProgramOrchestrationConfig();
    return poConfig.types || [];
  }, [getProgramOrchestrationConfig]);

  return (
    <ModulesContext.Provider
      value={{
        modules,
        loading,
        planId,
        coreModules,
        addonModules,
        isModuleEnabled,
        isPathEnabled,
        getModule,
        refreshModules,
        industry,
        industryConfig,
        terminology,
        getTerm,
        isEventsIndustry,
        isProfessionalServices,
        isConsulting,
        isGeneric,
        getProgramOrchestrationConfig,
        getFieldLabel,
        getEntityTypes,
      }}
    >
      {children}
    </ModulesContext.Provider>
  );
};

export const useModules = () => {
  const context = useContext(ModulesContext);
  if (!context) {
    throw new Error("useModules must be used within a ModulesProvider");
  }
  return context;
};

export default ModulesContext;
