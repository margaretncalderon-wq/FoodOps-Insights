// contexts/OrganizationContext.js - Global organization context for Demand Studio
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;

const OrganizationContext = createContext(null);

export function OrganizationProvider({ children }) {
  const [organizations, setOrganizations] = useState([]); // All orgs user has access to
  const [selectedOrgId, setSelectedOrgId] = useState(null); // Currently selected org
  const [selectedOrg, setSelectedOrg] = useState(null); // Full org object
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null); // Role in selected org

  // Fetch all organizations the user has access to
  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/user/organizations`, { withCredentials: true });
      const orgs = res.data || [];
      setOrganizations(orgs);
      
      // If no org selected, default to first owned org or first available
      if (!selectedOrgId && orgs.length > 0) {
        const ownedOrg = orgs.find(o => o.is_own);
        const defaultOrg = ownedOrg || orgs[0];
        setSelectedOrgId(defaultOrg.org_id);
        setSelectedOrg(defaultOrg);
        setUserRole(defaultOrg.role || "owner");
      }
    } catch (error) {
      console.error("Error fetching organizations:", error);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  // Change selected organization
  const selectOrganization = useCallback((orgId) => {
    const org = organizations.find(o => o.org_id === orgId);
    if (org) {
      setSelectedOrgId(orgId);
      setSelectedOrg(org);
      setUserRole(org.role || (org.is_own ? "owner" : "viewer"));
      // Store in localStorage for persistence
      localStorage.setItem("selectedOrgId", orgId);
    }
  }, [organizations]);

  // Restore from localStorage on mount
  useEffect(() => {
    const savedOrgId = localStorage.getItem("selectedOrgId");
    if (savedOrgId && organizations.length > 0) {
      const org = organizations.find(o => o.org_id === savedOrgId);
      if (org) {
        setSelectedOrgId(savedOrgId);
        setSelectedOrg(org);
        setUserRole(org.role || (org.is_own ? "owner" : "viewer"));
      }
    }
  }, [organizations]);

  // Check if user is owner/admin of current org
  const isOwner = userRole === "owner" || userRole === "admin";
  const isEditor = isOwner || userRole === "editor" || userRole === "contributor";
  const isViewer = true; // Everyone can at least view

  // Get org_id param for API calls
  const getOrgParam = useCallback(() => {
    if (!selectedOrgId) return "";
    const org = organizations.find(o => o.org_id === selectedOrgId);
    // If it's the user's own org, don't need to pass org_id
    if (org?.is_own) return "";
    return `org_id=${selectedOrgId}`;
  }, [selectedOrgId, organizations]);

  const value = {
    organizations,
    selectedOrgId,
    selectedOrg,
    userRole,
    isOwner,
    isEditor,
    isViewer,
    loading,
    selectOrganization,
    getOrgParam,
    refreshOrganizations: fetchOrganizations,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
}

export default OrganizationContext;
