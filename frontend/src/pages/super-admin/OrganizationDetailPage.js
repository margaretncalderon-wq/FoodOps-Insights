import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Progress } from "../../components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "../../components/ui/dialog";
import { useViewAs } from "./SuperAdminLayout";
import { 
  Building2, ChevronLeft, Eye, Ban, Check, Users, Calendar, 
  CreditCard, Activity, AlertTriangle, Loader2, Save, RefreshCw,
  Clock, Globe, DollarSign, Shield, Trash2, MoreVertical, Package, Briefcase, Key
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const ROLES = ["owner", "admin", "ops", "finance", "viewer"];

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setViewAsStatus } = useViewAs();
  
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  
  // Module management
  const [modules, setModules] = useState({ active_modules: [], available_modules: [], active_module_keys: [] });
  const [loadingModules, setLoadingModules] = useState(false);
  
  // Dialogs
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [resetUsageDialogOpen, setResetUsageDialogOpen] = useState(false);
  
  // Password change state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Account type state
  const [accountType, setAccountType] = useState("");
  const [savingAccountType, setSavingAccountType] = useState(false);
  
  // Add member state
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [newMemberData, setNewMemberData] = useState({ email: "", name: "", password: "", role: "viewer" });
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    fetchOrganization();
  }, [id]);
  
  useEffect(() => {
    if (org?.organization?.account_type) {
      setAccountType(org.organization.account_type);
    }
  }, [org]);

  useEffect(() => {
    if (activeTab === "members") fetchMembers();
    if (activeTab === "audit") fetchAudit();
    if (activeTab === "modules") fetchModules();
  }, [activeTab, id]);

  const fetchOrganization = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/organizations/${id}`, { withCredentials: true });
      setOrg(res.data);
      setNotes(res.data.internal_notes || "");
    } catch (err) {
      toast.error("Failed to load organization");
      navigate("/super-admin/organizations");
    }
    setLoading(false);
  };

  const fetchMembers = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/organizations/${id}/members`, { withCredentials: true });
      setMembers(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAudit = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/organizations/${id}/audit`, { withCredentials: true });
      setAudit(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchModules = async () => {
    setLoadingModules(true);
    try {
      const res = await axios.get(`${API}/api/super-admin/organizations/${id}/modules`, { withCredentials: true });
      setModules(res.data || { active_modules: [], available_modules: [], active_module_keys: [] });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load modules");
    }
    setLoadingModules(false);
  };

  const activateModule = async (moduleKey) => {
    try {
      await axios.post(`${API}/api/super-admin/organizations/${id}/modules/${moduleKey}/activate`, {}, { withCredentials: true });
      toast.success("Module activated");
      fetchModules();
      fetchOrganization();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to activate module");
    }
  };

  const deactivateModule = async (moduleKey) => {
    try {
      await axios.delete(`${API}/api/super-admin/organizations/${id}/modules/${moduleKey}/deactivate`, { withCredentials: true });
      toast.success("Module deactivated");
      fetchModules();
      fetchOrganization();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to deactivate module");
    }
  };

  const updateIndustry = async (industryTemplate) => {
    try {
      await axios.put(`${API}/api/super-admin/organizations/${id}/industry`, { industry_template: industryTemplate }, { withCredentials: true });
      toast.success("Industry updated");
      fetchOrganization();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update industry");
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/super-admin/organizations/${id}/notes`, { notes }, { withCredentials: true });
      toast.success("Notes saved");
    } catch (err) {
      toast.error("Failed to save notes");
    }
    setSaving(false);
  };

  const handleSuspend = async () => {
    try {
      await axios.put(`${API}/api/super-admin/organizations/${id}/suspend`, { reason: suspendReason }, { withCredentials: true });
      toast.success("Organization suspended");
      setSuspendDialogOpen(false);
      fetchOrganization();
    } catch (err) {
      toast.error("Failed to suspend organization");
    }
  };

  const handleReactivate = async () => {
    try {
      await axios.put(`${API}/api/super-admin/organizations/${id}/reactivate`, {}, { withCredentials: true });
      toast.success("Organization reactivated");
      fetchOrganization();
    } catch (err) {
      toast.error("Failed to reactivate organization");
    }
  };

  const handleOverrideStatus = async () => {
    try {
      await axios.put(`${API}/api/super-admin/organizations/${id}/subscription/override`, { status: newStatus }, { withCredentials: true });
      toast.success("Subscription status overridden");
      setOverrideDialogOpen(false);
      fetchOrganization();
    } catch (err) {
      toast.error("Failed to override status");
    }
  };

  const handleResetUsage = async () => {
    try {
      await axios.post(`${API}/api/super-admin/organizations/${id}/reset-usage`, {}, { withCredentials: true });
      toast.success("Usage meter reset");
      setResetUsageDialogOpen(false);
      fetchOrganization();
    } catch (err) {
      toast.error("Failed to reset usage");
    }
  };

  // Change account type (normal, demo, influencer, partner)
  const handleChangeAccountType = async (newType) => {
    setSavingAccountType(true);
    try {
      await axios.put(
        `${API}/api/super-admin/organizations/${id}/account-type`,
        { account_type: newType },
        { withCredentials: true }
      );
      setAccountType(newType);
      toast.success(`Tipo de cuenta cambiado a "${newType || 'normal'}"`);
      fetchOrganization();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al cambiar tipo de cuenta");
    }
    setSavingAccountType(false);
  };

  const handleViewAs = async () => {
    try {
      const res = await axios.post(`${API}/api/super-admin/view-as/${id}`, {}, { withCredentials: true });
      setViewAsStatus({ active: true, org_id: id, org_name: res.data.org_name });
      toast.success(`Viewing as ${res.data.org_name}`);
      navigate("/dashboard");
    } catch (err) {
      toast.error("Failed to start view-as mode");
    }
  };

  const handleChangeRole = async (membershipId, role) => {
    try {
      await axios.put(`${API}/api/super-admin/organizations/${id}/members/${membershipId}/role?role=${role}`, {}, { withCredentials: true });
      toast.success("Role updated");
      fetchMembers();
    } catch (err) {
      toast.error("Failed to update role");
    }
  };

  const handleRemoveMember = async (membershipId) => {
    if (!window.confirm("¿Eliminar este miembro?")) return;
    try {
      await axios.delete(`${API}/api/super-admin/organizations/${id}/members/${membershipId}`, { withCredentials: true });
      toast.success("Miembro eliminado");
      fetchMembers();
    } catch (err) {
      toast.error("Error al eliminar miembro");
    }
  };

  // Password change functions
  const openPasswordDialog = (member) => {
    setSelectedMember(member);
    setNewPassword("");
    setPasswordDialogOpen(true);
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setChangingPassword(true);
    try {
      await axios.post(
        `${API}/api/super-admin/users/${selectedMember.user_id}/reset-password`,
        { new_password: newPassword },
        { withCredentials: true }
      );
      toast.success("Contraseña cambiada exitosamente");
      setPasswordDialogOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al cambiar contraseña");
    }
    setChangingPassword(false);
  };

  const handleChangeAllPasswords = async () => {
    const password = prompt("Ingresa la nueva contraseña para TODOS los usuarios de esta organización:");
    if (!password || password.length < 6) {
      if (password) toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    let successCount = 0;
    for (const member of members) {
      try {
        await axios.post(
          `${API}/api/super-admin/users/${member.user_id}/reset-password`,
          { new_password: password },
          { withCredentials: true }
        );
        successCount++;
      } catch (err) {
        console.error(`Error cambiando contraseña para ${member.email}:`, err);
      }
    }
    toast.success(`Contraseña cambiada para ${successCount} usuario(s)`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch(status) {
      case "active": return <Badge className="bg-green-600">Active</Badge>;
      case "trialing": return <Badge className="bg-blue-600">Trialing</Badge>;
      case "past_due": return <Badge className="bg-amber-600">Past Due</Badge>;
      case "canceled": return <Badge variant="secondary">Canceled</Badge>;
      case "suspended": return <Badge className="bg-red-600">Suspended</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const usage = org?.current_usage?.metrics || {};
  const limits = org?.plan?.limits || {};

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/super-admin/organizations")} className="border-gray-300 text-gray-900">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{org?.organization?.name}</h1>
              <p className="text-sm text-gray-600">{org?.organization?.company_id}</p>
            </div>
          </div>
          {getStatusBadge(org?.organization?.status)}
          {org?.subscription && getStatusBadge(org?.subscription?.status)}
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleViewAs} className="border-gray-300 text-gray-900 hover:bg-gray-100">
            <Eye className="w-4 h-4 mr-2" />
            View As
          </Button>
          {org?.organization?.status === "suspended" ? (
            <Button onClick={handleReactivate} className="bg-green-600 hover:bg-green-700">
              <Check className="w-4 h-4 mr-2" />
              Reactivate
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setSuspendDialogOpen(true)}>
              <Ban className="w-4 h-4 mr-2" />
              Suspend
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border-gray-200 mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Org Profile */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900">Organization Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Currency</p>
                    <p className="text-gray-900">{org?.organization?.currency || "USD"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Timezone</p>
                    <p className="text-gray-900">{org?.organization?.timezone || "America/Santo_Domingo"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Created</p>
                    <p className="text-gray-900">{new Date(org?.organization?.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Total Events</p>
                    <p className="font-bold text-gray-900">{org?.events_count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Type Card */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Tipo de Cuenta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={!accountType || accountType === "" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleChangeAccountType("")}
                    disabled={savingAccountType}
                    className={!accountType || accountType === "" 
                      ? "bg-gray-800 hover:bg-gray-900" 
                      : "border-gray-300 text-gray-700 hover:bg-gray-100"}
                  >
                    Normal
                  </Button>
                  <Button
                    variant={accountType === "demo" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleChangeAccountType("demo")}
                    disabled={savingAccountType}
                    className={accountType === "demo" 
                      ? "bg-blue-600 hover:bg-blue-700" 
                      : "border-gray-300 text-gray-700 hover:bg-gray-100"}
                  >
                    Demo
                  </Button>
                  <Button
                    variant={accountType === "influencer" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleChangeAccountType("influencer")}
                    disabled={savingAccountType}
                    className={accountType === "influencer" 
                      ? "bg-purple-600 hover:bg-purple-700" 
                      : "border-gray-300 text-gray-700 hover:bg-gray-100"}
                  >
                    Influencer
                  </Button>
                  <Button
                    variant={accountType === "partner" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleChangeAccountType("partner")}
                    disabled={savingAccountType}
                    className={accountType === "partner" 
                      ? "bg-green-600 hover:bg-green-700" 
                      : "border-gray-300 text-gray-700 hover:bg-gray-100"}
                  >
                    Partner
                  </Button>
                </div>
                {savingAccountType && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Las cuentas demo/influencer/partner aparecen en la sección "Demo Accounts" del panel.
                </p>
              </CardContent>
            </Card>

            {/* Usage - Solo estadísticas sin límites */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900">Estadísticas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Eventos creados</span>
                  <span className="text-gray-900 font-bold text-lg">{usage.events_created || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Usuarios activos</span>
                  <span className="text-gray-900 font-bold text-lg">{usage.active_users || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Propuestas</span>
                  <span className="text-gray-900 font-bold text-lg">{usage.proposals_created || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Facturas</span>
                  <span className="text-gray-900 font-bold text-lg">{usage.supplier_invoices || 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Internal Notes */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900">Internal Notes</CardTitle>
                <CardDescription className="text-gray-500">Support team notes (not visible to org)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add internal notes..."
                  className="bg-gray-100 border-gray-300 min-h-32 text-gray-900 placeholder:text-gray-500"
                />
                <Button onClick={saveNotes} disabled={saving} className="w-full">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <Save className="w-4 h-4 mr-2" />
                  Save Notes
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Modules Tab */}
        <TabsContent value="modules">
          <div className="space-y-6">
            {/* Industry Section */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  Industry Template
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 flex-wrap">
                  {["events_hospitality", "professional_services", "generic"].map((ind) => (
                    <Button
                      key={ind}
                      variant={org.industry_template === ind ? "default" : "outline"}
                      className={org.industry_template === ind 
                        ? "bg-blue-600 hover:bg-blue-700" 
                        : "border-gray-300 hover:bg-gray-100"}
                      onClick={() => updateIndustry(ind)}
                      data-testid={`industry-btn-${ind}`}
                    >
                      {ind === "events_hospitality" && "Events & Hospitality"}
                      {ind === "professional_services" && "Professional Services"}
                      {ind === "generic" && "General Services"}
                    </Button>
                  ))}
                </div>
                <p className="text-slate-500 text-sm mt-2">
                  Current: <span className="text-gray-600">{org.industry_template || "Not set"}</span>
                </p>
              </CardContent>
            </Card>

            {/* Active Modules Section */}
            <Card className="bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Active Modules ({modules.active_modules?.length || 0})
                </CardTitle>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-gray-300"
                  onClick={fetchModules}
                  disabled={loadingModules}
                >
                  {loadingModules ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                {loadingModules ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                  </div>
                ) : modules.active_modules?.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No active modules</p>
                ) : (
                  <div className="space-y-3">
                    {modules.active_modules?.map((mod) => (
                      <div 
                        key={mod.org_addon_id} 
                        className="flex items-center justify-between p-3 bg-slate-900 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-slate-200">{mod.addon_name}</p>
                          <p className="text-sm text-slate-500">
                            ${mod.price_paid}/mes • {mod.admin_granted ? "Admin granted" : "Purchased"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deactivateModule(mod.addon_id?.replace("addon_", ""))}
                          data-testid={`deactivate-${mod.addon_id}`}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          Deactivate
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {modules.active_modules?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
                    <span className="text-gray-500">Monthly Module Cost</span>
                    <span className="font-bold text-green-400">${modules.monthly_module_cost?.toFixed(2) || "0.00"}/mes</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Available Modules Section */}
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-500" />
                  Available Modules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { key: "module_event_orchestration", name: "Event Orchestration", price: 29 },
                    { key: "module_culinary_intelligence", name: "Culinary Intelligence", price: 25 },
                    { key: "module_operations_supplies", name: "Operations Supplies", price: 19 },
                    { key: "module_venues", name: "Venues & Locations", price: 15 },
                    { key: "module_demand_studio", name: "Demand Studio", price: 35 },
                  ].filter(m => !modules.active_module_keys?.includes(m.key)).map((mod) => (
                    <div 
                      key={mod.key}
                      className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-gray-200"
                    >
                      <div>
                        <p className="font-medium text-gray-600">{mod.name}</p>
                        <p className="text-sm text-slate-500">${mod.price}/mes</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-600 text-green-400 hover:bg-green-900/30"
                        onClick={() => activateModule(mod.key)}
                        data-testid={`activate-${mod.key}`}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Activate
                      </Button>
                    </div>
                  ))}
                  {[
                    { key: "module_event_orchestration", name: "Event Orchestration", price: 29 },
                    { key: "module_culinary_intelligence", name: "Culinary Intelligence", price: 25 },
                    { key: "module_operations_supplies", name: "Operations Supplies", price: 19 },
                    { key: "module_venues", name: "Venues & Locations", price: 15 },
                    { key: "module_demand_studio", name: "Demand Studio", price: 35 },
                  ].filter(m => !modules.active_module_keys?.includes(m.key)).length === 0 && (
                    <p className="text-slate-500 text-center py-4 col-span-2">All modules are active</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card className="bg-white border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900">
                <Users className="w-5 h-5" />
                Miembros ({members.length})
              </CardTitle>
              {members.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleChangeAllPasswords}
                  className="border-amber-600 text-amber-400 hover:bg-amber-900/30"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Cambiar Contraseña (Todos)
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200">
                    <TableHead className="text-gray-500">Usuario</TableHead>
                    <TableHead className="text-gray-500">Rol</TableHead>
                    <TableHead className="text-gray-500">Estado</TableHead>
                    <TableHead className="text-gray-500">Ingreso</TableHead>
                    <TableHead className="text-gray-500">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(member => (
                    <TableRow key={member.membership_id} className="border-gray-200">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={member.picture} />
                            <AvatarFallback className="bg-gray-200 text-gray-900">{member.name?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-gray-900">{member.name}</p>
                            <p className="text-sm text-gray-500">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={member.role} 
                          onValueChange={(v) => handleChangeRole(member.membership_id, v)}
                        >
                          <SelectTrigger className="w-32 bg-gray-100 border-gray-300 text-gray-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map(role => (
                              <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "default" : "secondary"} className={member.status === "active" ? "bg-green-600" : ""}>
                          {member.status === "active" ? "Activo" : member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {new Date(member.joined_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openPasswordDialog(member)}
                            className="text-amber-400 hover:text-amber-300 hover:bg-gray-100"
                            data-testid={`change-pw-${member.user_id}`}
                          >
                            <Key className="w-4 h-4" />
                          </Button>
                          {member.role !== "owner" && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleRemoveMember(member.membership_id)}
                              className="text-red-400 hover:text-red-300 hover:bg-gray-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Subscription
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Plan</p>
                    <p className="font-medium capitalize">{org?.plan?.name || "No Plan"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    {getStatusBadge(org?.subscription?.status)}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Billing Cycle</p>
                    <p className="capitalize">{org?.subscription?.billing_cycle || "Monthly"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Next Renewal</p>
                    <p>{org?.subscription?.current_period_end ? new Date(org?.subscription?.current_period_end).toLocaleDateString() : "N/A"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="bg-white border-red-900/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-red-300/60">
                  Administrative overrides (for testing only)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full border-red-700 text-red-400 hover:bg-red-900/20"
                  onClick={() => setOverrideDialogOpen(true)}
                >
                  Override Subscription Status
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full border-red-700 text-red-400 hover:bg-red-900/20"
                  onClick={() => setResetUsageDialogOpen(true)}
                >
                  Reset Usage Meter
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit">
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {audit.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-gray-100/50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      entry.type === "admin_action" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {entry.type === "admin_action" ? <Shield className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{entry.action}</p>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <p className="text-sm text-gray-500">
                          {JSON.stringify(entry.details)}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}

                {audit.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No activity recorded</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Suspend Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle>Suspend Organization</DialogTitle>
            <DialogDescription className="text-gray-500">
              This will prevent all users from accessing the organization.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Reason for suspension</label>
            <Textarea 
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Enter reason..."
              className="mt-2 bg-gray-100 border-gray-300"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)} className="border-gray-300">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSuspend}>
              Suspend Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Status Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-red-400">⚠️ Override Subscription Status</DialogTitle>
            <DialogDescription className="text-gray-500">
              This is for testing purposes only. Changes will be logged.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">New Status</label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="mt-2 bg-gray-100 border-gray-300">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)} className="border-gray-300">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleOverrideStatus} disabled={!newStatus}>
              Override Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Usage Dialog */}
      <Dialog open={resetUsageDialogOpen} onOpenChange={setResetUsageDialogOpen}>
        <DialogContent className="bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-red-400">⚠️ Reset Usage Meter</DialogTitle>
            <DialogDescription className="text-gray-500">
              This will reset all usage metrics for the current period to zero.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUsageDialogOpen(false)} className="border-gray-300">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetUsage}>
              Reset Usage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="bg-white border-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <Key className="w-5 h-5 text-amber-400" />
              Cambiar Contraseña
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {selectedMember?.name} ({selectedMember?.email})
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-gray-600">Nueva Contraseña</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ingresa la nueva contraseña"
                  className="flex-1 bg-gray-100 border-gray-300 text-gray-900 placeholder:text-slate-500"
                  data-testid="new-password-input"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={generatePassword}
                  className="border-gray-300 text-gray-600 hover:bg-gray-100"
                >
                  Generar
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setPasswordDialogOpen(false)}
              className="border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handlePasswordChange} 
              disabled={changingPassword || !newPassword}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {changingPassword ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Key className="w-4 h-4 mr-2" />
              )}
              Cambiar Contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
