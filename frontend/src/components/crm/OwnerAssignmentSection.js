import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { 
  Search, RefreshCw, User, UserCircle, Users, Building2, Mail
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function OwnerAssignmentSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [leadsRes, clientsRes] = await Promise.all([
        axios.get(`${API}/api/leads`, { withCredentials: true }),
        axios.get(`${API}/api/crm/clients`, { withCredentials: true })
      ]);
      setLeads(leadsRes.data);
      setClients(clientsRes.data);
      
      // Extract unique owners from data
      const ownerIds = new Set();
      leadsRes.data.forEach(l => l.owner_id && ownerIds.add(l.owner_id));
      clientsRes.data.forEach(c => c.owner_id && ownerIds.add(c.owner_id));
      
      // For now, create placeholder users - in production this would come from a users endpoint
      const uniqueOwners = Array.from(ownerIds).map(id => ({
        user_id: id,
        name: id.replace("user_", "User ")
      }));
      setUsers(uniqueOwners);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAssignOwner = async (entityType, entityId, ownerId) => {
    try {
      await axios.put(`${API}/api/crm/assign/${entityType}/${entityId}?owner_id=${ownerId}`, {}, { withCredentials: true });
      toast.success(isEs ? "Responsable asignado" : "Owner assigned");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Combine and filter data
  const allItems = [
    ...leads.map(l => ({ ...l, entity_type: "lead", entity_id: l.lead_id, name: l.lead_name })),
    ...clients.map(c => ({ ...c, entity_type: "client", entity_id: c.client_id, name: c.display_name }))
  ].filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOwner = ownerFilter === "all" || 
                        ownerFilter === "unassigned" ? !item.owner_id : 
                        item.owner_id === ownerFilter;
    return matchesSearch && matchesOwner;
  });

  // Stats by owner
  const unassignedCount = [...leads, ...clients].filter(item => !item.owner_id).length;
  const assignedByOwner = {};
  [...leads, ...clients].forEach(item => {
    if (item.owner_id) {
      assignedByOwner[item.owner_id] = (assignedByOwner[item.owner_id] || 0) + 1;
    }
  });

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="owner-assignment-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Asignación de Responsables" : "Owner Assignment"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Asigna responsables a leads y clientes" : "Assign owners to leads and clients"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={unassignedCount > 0 ? "border-yellow-300 bg-yellow-50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCircle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm">{isEs ? "Sin Asignar" : "Unassigned"}</span>
            </div>
            <div className="text-3xl font-bold">{unassignedCount}</div>
          </CardContent>
        </Card>
        {Object.entries(assignedByOwner).slice(0, 3).map(([ownerId, count]) => (
          <Card key={ownerId}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm truncate">{ownerId.replace("user_", "")}</span>
              </div>
              <div className="text-3xl font-bold">{count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={isEs ? "Buscar..." : "Search..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={isEs ? "Filtrar por responsable" : "Filter by owner"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
            <SelectItem value="unassigned">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
            {users.map(user => (
              <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead>{isEs ? "Responsable" : "Owner"}</TableHead>
                <TableHead>{isEs ? "Acción" : "Action"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay resultados" : "No results"}
                  </TableCell>
                </TableRow>
              ) : (
                allItems.map((item) => (
                  <TableRow key={`${item.entity_type}-${item.entity_id}`}>
                    <TableCell>
                      <Badge variant={item.entity_type === "lead" ? "default" : "secondary"}>
                        {item.entity_type === "lead" ? "Lead" : (isEs ? "Cliente" : "Client")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {item.entity_type === "client" && item.client_type === "Company" ? (
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                        {item.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.email && (
                        <span className="flex items-center gap-1 text-sm">
                          <Mail className="w-3 h-3" />
                          {item.email}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.entity_type === "lead" ? item.status : item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.owner_id ? (
                        <div className="flex items-center gap-1">
                          <UserCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm">{item.owner_id.replace("user_", "")}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">{isEs ? "Sin asignar" : "Unassigned"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.owner_id || ""}
                        onValueChange={(v) => handleAssignOwner(item.entity_type, item.entity_id, v)}
                      >
                        <SelectTrigger className="w-[150px] h-8">
                          <SelectValue placeholder={isEs ? "Asignar..." : "Assign..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map(user => (
                            <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
