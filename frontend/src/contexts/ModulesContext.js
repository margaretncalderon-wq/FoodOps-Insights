import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

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
  const isEventsIndustry = industry === "events_hospitality";
  const isProfessionalServices = industry === "professional_services";

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
        terminology,
        getTerm,
        isEventsIndustry,
        isProfessionalServices,
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
