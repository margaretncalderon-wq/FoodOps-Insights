import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Progress } from "../../components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../components/ui/dialog";
import { 
  Building2, Search, Filter, ChevronLeft, ChevronRight, 
  Eye, Ban, Check, Users, Calendar, Loader2, RefreshCw, Key, Trash2, Plus
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export default function OrganizationsListPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChangeType, setPasswordChangeType] = useState("all"); // "all" or "individual"
  const [orgMembers, setOrgMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  
  // Create org modal state
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgIndustry, setNewOrgIndustry] = useState("general");
  const [creatingOrg, setCreatingOrg] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, [page, statusFilter, planFilter, industryFilter]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page);
      params.append("limit", 20);
      if (search) params.append("search", search);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (planFilter !== "all") params.append("plan", planFilter);
      if (industryFilter !== "all") params.append("industry", industryFilter);

      const res = await axios.get(`${API}/api/super-admin/organizations?${params}`, { withCredentials: true });
      setOrganizations(res.data.organizations || []);
      setTotalPages(res.data.total_pages || 1);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load organizations");
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchOrganizations();
  };

  // Fetch members for an organization
  const fetchOrgMembers = async (companyId) => {
    try {
      const res = await axios.get(`${API}/api/super-admin/organizations/${companyId}/members`, { withCredentials: true });
      setOrgMembers(res.data || []);
    } catch (err) {
      console.error(err);
      setOrgMembers([]);
    }
  };

  // Open password change modal
  const openPasswordModal = async (org) => {
    setSelectedOrg(org);
    setNewPassword("");
    setPasswordChangeType("all");
    setSelectedMemberId("");
    await fetchOrgMembers(org.organization.company_id);
    setShowPasswordModal(true);
  };

  // Generate random password
  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(password);
  };

  // Handle password change
  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setChangingPassword(true);
    try {
      if (passwordChangeType === "all") {
        // Change password for all members
        let successCount = 0;
        for (const member of orgMembers) {
          try {
            await axios.post(
              `${API}/api/super-admin/users/${member.user_id}/reset-password`,
              { new_password: newPassword },
              { withCredentials: true }
            );
            successCount++;
          } catch (err) {
            console.error(`Failed to change password for ${member.email}:`, err);
          }
        }
        toast.success(`Contraseña cambiada para ${successCount} usuario(s)`);
      } else {
        // Change password for individual member
        if (!selectedMemberId) {
          toast.error("Selecciona un usuario");
          setChangingPassword(false);
          return;
        }
        await axios.post(
          `${API}/api/super-admin/users/${selectedMemberId}/reset-password`,
          { new_password: newPassword },
          { withCredentials: true }
        );
        toast.success("Contraseña cambiada exitosamente");
      }
      setShowPasswordModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al cambiar contraseña");
    }
    setChangingPassword(false);
  };

  // Delete organization
  const openDeleteModal = (org) => {
    setOrgToDelete(org);
    setDeleteConfirmText("");
    setShowDeleteModal(true);
  };

  const handleDeleteOrganization = async () => {
    if (!orgToDelete) return;
    
    const orgName = orgToDelete.organization?.name;
    if (deleteConfirmText !== orgName) {
      toast.error("El nombre no coincide. Escribe el nombre exacto para confirmar.");
      return;
    }

    setDeleting(true);
    try {
      const res = await axios.delete(
        `${API}/api/super-admin/organizations/${orgToDelete.organization.company_id}`,
        { withCredentials: true }
      );
      toast.success(`Organización "${orgName}" eliminada correctamente`);
      setShowDeleteModal(false);
      setOrgToDelete(null);
      fetchOrganizations(); // Refresh list
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al eliminar organización");
    }
    setDeleting(false);
  };

  const handleCreateOrg = async () => {
    if (!newOrgName) {
      toast.error("El nombre es requerido");
      return;
    }
    setCreatingOrg(true);
    try {
      await axios.post(`${API}/api/super-admin/organizations`, {
        name: newOrgName,
        industry_template: newOrgIndustry
      }, { withCredentials: true });
      toast.success("Organización creada exitosamente");
      setShowCreateOrgModal(false);
      setNewOrgName("");
      setNewOrgIndustry("general");
      fetchOrganizations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al crear organización");
    }
    setCreatingOrg(false);
  };

  const getStatusBadge = (org, subscription) => {
    const status = org?.organization?.status || "active";
    const subStatus = subscription?.status;

    if (status === "suspended") {
      return <Badge className="bg-red-600">Suspended</Badge>;
    }
    
    switch(subStatus) {
      case "active": return <Badge className="bg-green-600">Active</Badge>;
      case "trialing": return <Badge className="bg-blue-600">Trialing</Badge>;
      case "past_due": return <Badge className="bg-amber-600">Past Due</Badge>;
      case "canceled": return <Badge variant="secondary">Canceled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getUsageBar = (current, label) => {
    return (
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-700 font-medium">{current}</span>
      </div>
    );
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="orgs-page-title">Organizaciones</h1>
          <p className="text-gray-500">Administra todas las organizaciones de la plataforma</p>
        </div>
        <Button onClick={() => setShowCreateOrgModal(true)} data-testid="create-org-btn">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Organización
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-white border-gray-200 mb-6 shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar organizaciones..."
                  className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                  data-testid="search-input"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="suspended">Suspendido</SelectItem>
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40 bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="plan_starter">Starter</SelectItem>
                <SelectItem value="plan_professional">Professional</SelectItem>
                <SelectItem value="plan_enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-48 bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Industria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="events_hospitality">Eventos & Hospitalidad</SelectItem>
                <SelectItem value="professional_services">Servicios Profesionales</SelectItem>
                <SelectItem value="generic">Servicios Generales</SelectItem>
              </SelectContent>
            </Select>

            <Button type="submit" variant="default">
              <Filter className="w-4 h-4 mr-2" />
              Aplicar
            </Button>

            <Button type="button" variant="outline" onClick={fetchOrganizations} className="border-gray-300 text-gray-700 hover:bg-gray-100">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Mostrando {organizations.length} de {total} organizaciones
        </p>
      </div>

      {/* Organizations Table */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-gray-50">
                  <TableHead className="text-gray-700 font-semibold">Organización</TableHead>
                  <TableHead className="text-gray-700 font-semibold">Estado</TableHead>
                  <TableHead className="text-gray-700 font-semibold">Plan</TableHead>
                  <TableHead className="text-gray-700 font-semibold">Uso</TableHead>
                  <TableHead className="text-gray-700 font-semibold">Miembros</TableHead>
                  <TableHead className="text-gray-700 font-semibold">Creado</TableHead>
                  <TableHead className="text-gray-700 font-semibold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map(org => (
                  <TableRow 
                    key={org.organization.company_id} 
                    className="border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/super-admin/organizations/${org.organization.company_id}`)}
                    data-testid={`org-row-${org.organization.company_id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{org.organization.name}</p>
                          <p className="text-xs text-gray-500">{org.organization.company_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(org, org.subscription)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize border-gray-300 text-gray-700">
                        {org.plan?.name || "Sin Plan"}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-32">
                      <div className="space-y-1">
                        {getUsageBar(org.usage?.events_created || 0, "Eventos")}
                        {getUsageBar(org.usage?.active_users || 0, "Usuarios")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span>{org.members_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 text-sm">
                      {new Date(org.organization.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/super-admin/organizations/${org.organization.company_id}`);
                          }}
                          data-testid={`view-org-${org.organization.company_id}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPasswordModal(org);
                          }}
                          data-testid={`change-password-${org.organization.company_id}`}
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(org);
                          }}
                          data-testid={`delete-org-${org.organization.company_id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {organizations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                      No se encontraron organizaciones
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Password Change Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="bg-white border-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <Key className="w-5 h-5 text-amber-600" />
              Cambiar Contraseña
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {selectedOrg?.organization?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Password Change Type */}
            <div className="space-y-2">
              <Label className="text-gray-700">Aplicar a:</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={passwordChangeType === "all" ? "default" : "outline"}
                  className={passwordChangeType === "all" 
                    ? "bg-amber-600 hover:bg-amber-700" 
                    : "border-gray-300 text-gray-700 hover:bg-gray-100"}
                  onClick={() => setPasswordChangeType("all")}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Toda la Org
                </Button>
                <Button
                  type="button"
                  variant={passwordChangeType === "individual" ? "default" : "outline"}
                  className={passwordChangeType === "individual" 
                    ? "bg-amber-600 hover:bg-amber-700" 
                    : "border-gray-300 text-gray-700 hover:bg-gray-100"}
                  onClick={() => setPasswordChangeType("individual")}
                >
                  Usuario Individual
                </Button>
              </div>
            </div>

            {/* Individual User Select */}
            {passwordChangeType === "individual" && (
              <div className="space-y-2">
                <Label className="text-gray-700">Seleccionar Usuario</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecciona un usuario..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orgMembers.map(member => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.name} ({member.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* New Password */}
            <div className="space-y-2">
              <Label className="text-gray-700">Nueva Contraseña</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ingresa la nueva contraseña"
                  className="flex-1 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                  data-testid="new-password-input"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={generatePassword}
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  Generar
                </Button>
              </div>
            </div>

            {passwordChangeType === "all" && orgMembers.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-700 border border-amber-200">
                Se cambiará la contraseña para {orgMembers.length} usuario(s) de esta organización.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowPasswordModal(false)}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
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

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="bg-white border-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Eliminar Organización
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán todos los datos asociados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-700 font-medium mb-2">
                Se eliminarán permanentemente:
              </p>
              <ul className="text-sm text-red-600 space-y-1 ml-4 list-disc">
                <li>Todos los usuarios de la organización</li>
                <li>Todos los eventos y datos</li>
                <li>Todas las propuestas y facturas</li>
                <li>Configuraciones y módulos</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700">
                Escribe <strong className="text-red-600">"{orgToDelete?.organization?.name}"</strong> para confirmar:
              </Label>
              <Input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Nombre de la organización"
                className="bg-white border-gray-300 text-gray-900"
                data-testid="delete-confirm-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteModal(false)}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleDeleteOrganization} 
              disabled={deleting || deleteConfirmText !== orgToDelete?.organization?.name}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Eliminar Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Organization Modal */}
      <Dialog open={showCreateOrgModal} onOpenChange={setShowCreateOrgModal}>
        <DialogContent className="bg-white border-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900">
              <Building2 className="w-5 h-5 text-blue-600" />
              Nueva Organización
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-gray-700">Nombre</Label>
              <Input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Nombre de la empresa"
                className="bg-white border-gray-300 text-gray-900"
                data-testid="create-org-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700">Industria</Label>
              <Select value={newOrgIndustry} onValueChange={setNewOrgIndustry}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="events_hospitality">Eventos & Hospitalidad</SelectItem>
                  <SelectItem value="professional_services">Servicios Profesionales</SelectItem>
                  <SelectItem value="marketing_agency">Agencia de Marketing</SelectItem>
                  <SelectItem value="ecommerce">E-Commerce</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrgModal(false)} className="border-gray-300 text-gray-700 hover:bg-gray-100">
              Cancelar
            </Button>
            <Button onClick={handleCreateOrg} disabled={creatingOrg || !newOrgName}>
              {creatingOrg ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
