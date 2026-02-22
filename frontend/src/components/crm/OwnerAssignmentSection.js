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
import { Progress } from "../ui/progress";
import { 
  Search, RefreshCw, User, UserCircle, Users, Building2, Mail,
  TrendingUp, Target, Award
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

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
      // Fetch leads (outreach + inbound), clients, and team members
      const [outreachRes, inboundRes, clientsRes, teamRes] = await Promise.all([
        axios.get(`${API}/api/crm/outreach`, { withCredentials: true }),
        axios.get(`${API}/api/crm/inbound`, { withCredentials: true }),
        axios.get(`${API}/api/crm/clients`, { withCredentials: true }),
        axios.get(`${API}/api/crm/team-members`, { withCredentials: true })
      ]);
      
      const allLeads = [
        ...(outreachRes.data || []).map(l => ({ ...l, _source: "Outreach" })),
        ...(inboundRes.data || []).map(l => ({ ...l, _source: "Inbound" }))
      ];
      setLeads(allLeads);
      setClients(clientsRes.data || []);
      
      // Build team members with stats
      const teamMembers = teamRes.data || [];
      const ownerStats = {};
      
      // Initialize stats for all team members
      teamMembers.forEach(u => {
        ownerStats[u.user_id] = {
          user_id: u.user_id,
          name: u.name || u.email || u.user_id,
          email: u.email,
          leads: 0,
          converted: 0,
          clients: 0
        };
      });
      
      // Count leads and conversions per owner
      allLeads.forEach(l => {
        if (l.owner_id && ownerStats[l.owner_id]) {
          ownerStats[l.owner_id].leads++;
          if (l.status?.toLowerCase() === "converted") {
            ownerStats[l.owner_id].converted++;
          }
        }
      });
      
      // Count clients per owner
      (clientsRes.data || []).forEach(c => {
        if (c.owner_id && ownerStats[c.owner_id]) {
          ownerStats[c.owner_id].clients++;
        }
      });
      
      // Calculate conversion rates and convert to array
      const usersWithStats = Object.values(ownerStats).map(stats => ({
        ...stats,
        conversionRate: stats.leads > 0 ? Math.round((stats.converted / stats.leads) * 100) : 0
      }));
      
      setUsers(usersWithStats);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error cargando datos" : "Error loading data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAssignOwner = async (entityType, entityId, ownerId) => {
    try {
      if (entityType === "lead") {
        // Use the new PATCH endpoint for leads
        await axios.patch(
          `${API}/api/crm/leads/${entityId}/owner`, 
          { owner_id: ownerId || null }, 
          { withCredentials: true }
        );
      } else {
        // Keep existing endpoint for clients
        await axios.put(
          `${API}/api/crm/assign/${entityType}/${entityId}?owner_id=${ownerId}`, 
          {}, 
          { withCredentials: true }
        );
      }
      toast.success(isEs ? "Responsable asignado" : "Owner assigned");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Combine and filter data
  const allItems = [
    ...leads.map(l => ({ ...l, entity_type: "lead", entity_id: l.lead_id, name: l.lead_name || "" })),
    ...clients.map(c => ({ ...c, entity_type: "client", entity_id: c.client_id, name: c.display_name || "" }))
  ].filter(item => {
    const itemName = (item.name || "").toLowerCase();
    const itemEmail = (item.email || "").toLowerCase();
    const search = (searchTerm || "").toLowerCase();
    const matchesSearch = !search || itemName.includes(search) || itemEmail.includes(search);
    const matchesOwner = ownerFilter === "all" || 
                        (ownerFilter === "unassigned" ? !item.owner_id : item.owner_id === ownerFilter);
    return matchesSearch && matchesOwner;
  });

  // Global stats
  const totalLeads = leads.length;
  const convertedLeads = leads.filter(l => l.status?.toLowerCase() === "converted").length;
  const globalConversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
  const unassignedCount = [...leads, ...clients].filter(item => !item.owner_id).length;

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="owner-assignment-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Asignación de Responsables" : "Owner Assignment"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Asigna responsables y mide la conversión" : "Assign owners and measure conversion"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Global Stats */}
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
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">{isEs ? "Total Leads" : "Total Leads"}</span>
            </div>
            <div className="text-3xl font-bold">{totalLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-5 h-5 text-green-600" />
              <span className="text-sm">{isEs ? "Convertidos" : "Converted"}</span>
            </div>
            <div className="text-3xl font-bold text-green-600">{convertedLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span className="text-sm">{isEs ? "Tasa Global" : "Global Rate"}</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">{globalConversionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Owner Performance Cards */}
      {users.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Award className="w-4 h-4" />
            {isEs ? "Rendimiento por Owner" : "Performance by Owner"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(user => (
              <Card 
                key={user.user_id} 
                className={`cursor-pointer transition-all ${ownerFilter === user.user_id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setOwnerFilter(ownerFilter === user.user_id ? "all" : user.user_id)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-5 h-5 text-primary" />
                      <span className="font-medium">{user.name}</span>
                    </div>
                    <Badge variant={user.conversionRate >= globalConversionRate ? "default" : "secondary"}>
                      {user.conversionRate}%
                    </Badge>
                  </div>
                  <Progress value={user.conversionRate} className="mb-2" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{user.leads} leads</span>
                    <span>{user.converted} {isEs ? "convertidos" : "converted"}</span>
                    <span>{user.clients} {isEs ? "clientes" : "clients"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

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
              <SelectItem key={user.user_id} value={user.user_id}>
                {user.name} ({user.conversionRate}%)
              </SelectItem>
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
                        {item.status?.toLowerCase() === "converted" && (
                          <Badge className="bg-green-100 text-green-700 text-xs ml-2">
                            {isEs ? "Convertido" : "Converted"}
                          </Badge>
                        )}
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
                          <span className="text-sm">{item.owner_id.replace("user_", "").slice(0, 12)}</span>
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
                            <SelectItem key={user.user_id} value={user.user_id}>
                              {user.name}
                            </SelectItem>
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
