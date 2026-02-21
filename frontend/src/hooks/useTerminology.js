// hooks/useTerminology.js - Hook for industry-specific terminology
import { useCallback, useMemo } from "react";
import { useOrgConfig } from "../contexts/OrgConfigContext";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  getIndustryTerminology, 
  getTerm, 
  getCategoryTerms,
  getIndustryInfo,
  AVAILABLE_INDUSTRIES,
  INDUSTRY_TERMINOLOGY
} from "../config/industryTerminology";

/**
 * Hook that provides industry-specific terminology based on the organization's configuration.
 * 
 * Usage:
 * const { term, terms, industryInfo, availableIndustries, isLoading } = useTerminology();
 * 
 * // Get a single term
 * const clientLabel = term("events", "client"); // Returns "Patient" for healthcare, "Client" for events
 * 
 * // Get all terms for a category
 * const crmTerms = terms("crm"); // Returns { pipeline: "Patient Journey", deal: "Case", ... }
 */
export function useTerminology() {
  const { industryTemplate, loading: configLoading } = useOrgConfig();
  const { language } = useLanguage();
  
  // Map backend industry_template to frontend terminology key
  const industryKey = useMemo(() => {
    const templateMap = {
      "events_hospitality": "events_hospitality",
      "professional_services": "agency",
      "generic": "generic",
      // Direct mappings for new industries
      "healthcare": "healthcare",
      "real_estate": "real_estate",
      "education": "education",
      "fitness": "fitness",
      "consulting": "consulting",
      "agency": "agency",
    };
    return templateMap[industryTemplate] || "generic";
  }, [industryTemplate]);
  
  // Get a single term
  const term = useCallback((category, key) => {
    return getTerm(industryKey, category, key, language);
  }, [industryKey, language]);
  
  // Get all terms for a category
  const terms = useCallback((category) => {
    return getCategoryTerms(industryKey, category, language);
  }, [industryKey, language]);
  
  // Get full terminology object for current industry
  const terminology = useMemo(() => {
    return getIndustryTerminology(industryKey);
  }, [industryKey]);
  
  // Get industry info (name, description, icon)
  const industryInfo = useMemo(() => {
    return getIndustryInfo(industryKey, language);
  }, [industryKey, language]);
  
  // Get list of available industries with their info
  const availableIndustries = useMemo(() => {
    return AVAILABLE_INDUSTRIES.map(id => getIndustryInfo(id, language));
  }, [language]);
  
  // Get preview of terms for a specific industry (useful for comparison)
  const previewIndustryTerms = useCallback((previewIndustryKey, category) => {
    return getCategoryTerms(previewIndustryKey, category, language);
  }, [language]);
  
  // Get all terminology for all industries (for comparison table)
  const getAllIndustryTerms = useCallback((category, termKey) => {
    return AVAILABLE_INDUSTRIES.map(id => ({
      industry: id,
      industryName: getIndustryInfo(id, language).name,
      term: getTerm(id, category, termKey, language)
    }));
  }, [language]);
  
  return {
    // Whether config is still loading
    isLoading: configLoading,
    // Current industry key
    industryKey,
    // Get single term: term("events", "client") -> "Patient"
    term,
    // Get category terms: terms("crm") -> { pipeline: "...", deal: "..." }
    terms,
    // Full terminology object
    terminology,
    // Industry info (name, description, icon)
    industryInfo,
    // List of all available industries
    availableIndustries,
    // Preview terms for another industry
    previewIndustryTerms,
    // Get a term across all industries for comparison
    getAllIndustryTerms,
    // Raw terminology data
    INDUSTRY_TERMINOLOGY
  };
}

export default useTerminology;
