import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Building2, ChevronDown, Check, Plus, Loader2 } from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export function OrgSwitcher({ onOrgChange }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const res = await axios.get(`${API}/api/org/my-organizations`, { withCredentials: true });
      setOrganizations(res.data || []);
    } catch (err) {
      console.error("Failed to fetch organizations:", err);
    }
    setLoading(false);
  };

  const handleSwitch = async (companyId) => {
    if (organizations.find(o => o.organization.company_id === companyId && o.is_active)) {
      return; // Already active
    }
    
    setSwitching(true);
    try {
      await axios.post(`${API}/api/org/switch/${companyId}`, {}, { withCredentials: true });
      toast.success(isEs ? "Organización cambiada" : "Organization switched");
      
      // Update local state
      setOrganizations(orgs => orgs.map(o => ({
        ...o,
        is_active: o.organization.company_id === companyId
      })));
      
      // Notify parent to reload data
      if (onOrgChange) {
        onOrgChange(companyId);
      }
      
      // Reload page to refresh all data
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error switching organization");
    }
    setSwitching(false);
  };

  const activeOrg = organizations.find(o => o.is_active);

  // Don't show switcher if user only has one org
  if (organizations.length <= 1 && !loading) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="org-switcher">
          <Building2 className="w-4 h-4" />
          <span className="max-w-32 truncate">
            {loading ? "..." : activeOrg?.organization?.name || "Select Org"}
          </span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>
          {isEs ? "Organizaciones" : "Organizations"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {organizations.map(org => (
          <DropdownMenuItem
            key={org.organization.company_id}
            onClick={() => handleSwitch(org.organization.company_id)}
            className="flex items-center justify-between cursor-pointer"
            disabled={switching}
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="font-medium">{org.organization.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{org.role}</p>
              </div>
            </div>
            {org.is_active && <Check className="w-4 h-4 text-green-500" />}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => window.location.href = "/onboarding"}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          {isEs ? "Crear Organización" : "Create Organization"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
