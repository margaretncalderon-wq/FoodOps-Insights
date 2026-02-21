import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../../utils/api";
import { Phone, Mail, Video, FileText, MessageSquare, Plus, Search, User } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import RichTextEditor from "../ui/RichTextEditor";

const COMM_TYPES = [
  { value: "call", label: "Llamada", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Reunión", icon: Video },
  { value: "note", label: "Nota", icon: FileText },
  { value: "message", label: "Mensaje", icon: MessageSquare },
];

const DIRECTIONS = [
  { value: "outbound", label: "Saliente" },
  { value: "inbound", label: "Entrante" },
];

export default function CommsLogSection({ entityType, entityId, entityName, standalone = false }) {
  const [logs, setLogs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");
  const [form, setForm] = useState({
    comm_type: "call",
    direction: "outbound",
    subject: "",
    content: "",
    entity_type: entityType || "lead",
    entity_id: entityId || "",
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url;
      if (standalone) {
        url = `${API}/crm/comms/all`;
      } else {
        if (!entityType || !entityId) { setLoading(false); return; }
        url = `${API}/crm/comms/${entityType}/${entityId}`;
      }
      const res = await axios.get(url);
      // Filter out entries without entity association
      const filtered = standalone ? res.data.filter(l => l.entity_id) : res.data;
      setLogs(filtered);
    } catch (err) {
      console.error("Error fetching comms:", err);
    }
    setLoading(false);
  }, [entityType, entityId, standalone]);

  const fetchEntities = useCallback(async () => {
    if (!standalone) return;
    try {
      const [outRes, inRes, clientsRes, teamRes] = await Promise.all([
        axios.get(`${API}/crm/outreach`),
        axios.get(`${API}/crm/inbound`),
        axios.get(`${API}/crm/clients`),
        axios.get(`${API}/crm/team-members`),
      ]);
      const outreach = (outRes.data || []).map(l => ({ ...l, _source: "Outreach", _type: "lead" }));
      const inbound = (inRes.data || []).map(l => ({ ...l, _source: "Inbound", _type: "lead" }));
      setLeads([...outreach, ...inbound]);
      setClients((clientsRes.data || []).map(c => ({ ...c, _type: "client" })));
      setTeamMembers(teamRes.data || []);
    } catch (err) {
      console.error("Error fetching entities:", err);
    }
  }, [standalone]);

  useEffect(() => { fetchLogs(); fetchEntities(); }, [fetchLogs, fetchEntities]);

  const handleSubmit = async () => {
    if (!form.subject.trim()) { toast.error("Agrega un asunto"); return; }
    if (!form.entity_id) { toast.error("Selecciona un lead o cliente"); return; }
    try {
      await axios.post(`${API}/crm/comms`, {
        ...form,
        entity_type: form.entity_type,
        entity_id: form.entity_id,
      });
      toast.success("Registro guardado");
      setShowNew(false);
      setForm({ comm_type: "call", direction: "outbound", subject: "", content: "", entity_type: entityType || "lead", entity_id: entityId || "" });
      fetchLogs();
    } catch (err) {
      toast.error("Error al guardar");
    }
  };

  const getIcon = (type) => {
    const found = COMM_TYPES.find(c => c.value === type);
    return found ? <found.icon className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />;
  };

  const getEntityName = (log) => {
    if (log.entity_name) return log.entity_name;
    if (log.entity_type === "client") {
      const client = clients.find(c => c.client_id === log.entity_id);
      return client ? client.display_name : null;
    }
    const lead = leads.find(l => l.lead_id === log.entity_id);
    return lead ? (lead.company_name || lead.name || lead.contact_name) : null;
  };

  const getEntitySource = (log) => {
    if (log.entity_type === "client") return "Cliente";
    if (log.entity_source) return log.entity_source;
    const lead = leads.find(l => l.lead_id === log.entity_id);
    return lead?._source || lead?.source || null;
  };

  const filtered = logs.filter(log => {
    const matchSearch = !search ||
      (log.subject || "").toLowerCase().includes(search.toLowerCase()) ||
      (log.content || "").toLowerCase().includes(search.toLowerCase()) ||
      (getEntityName(log) || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || log.comm_type === filterType;
    const matchSource = filterSource === "all" || 
      (filterSource === "client" && log.entity_type === "client") ||
      (filterSource !== "client" && getEntitySource(log)?.toLowerCase() === filterSource.toLowerCase());
    const matchOwner = filterOwner === "all" || log.owner_id === filterOwner;
    return matchSearch && matchType && matchSource && matchOwner;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const selectedEntity = form.entity_type === "client" 
    ? clients.find(c => c.client_id === form.entity_id)
    : leads.find(l => l.lead_id === form.entity_id);

  return (
    <div className="space-y-4" data-testid="comms-log-section">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="comms-search"
              placeholder="Buscar comunicaciones..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[130px]" data-testid="comms-filter-type">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              {COMM_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {standalone && (
            <>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-[120px]" data-testid="comms-filter-source">
                  <SelectValue placeholder="Fuente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="outreach">Outreach</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="client">Clientes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger className="w-[140px]" data-testid="comms-filter-owner">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {teamMembers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button data-testid="new-comm-btn">
              <Plus className="w-4 h-4 mr-2" /> Nueva Interacción
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Interacción</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Lead/Client selector - only in standalone mode */}
              {standalone && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Tipo de asociación</label>
                    <Select 
                      value={form.entity_type} 
                      onValueChange={v => setForm(f => ({...f, entity_type: v, entity_id: ""}))}
                    >
                      <SelectTrigger data-testid="comm-entity-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="client">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {form.entity_type === "lead" && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">Lead asociado</label>
                      <Select value={form.entity_id} onValueChange={v => setForm(f => ({...f, entity_id: v}))}>
                        <SelectTrigger data-testid="comm-lead-select">
                          <SelectValue placeholder="Selecciona un lead..." />
                        </SelectTrigger>
                        <SelectContent>
                          {leads.filter(l => l._source === "Outreach").length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Outreach</div>
                              {leads.filter(l => l._source === "Outreach").map(l => (
                                <SelectItem key={l.lead_id} value={l.lead_id}>
                                  {l.company_name || l.name || l.contact_name || l.lead_id}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {leads.filter(l => l._source === "Inbound").length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Inbound</div>
                              {leads.filter(l => l._source === "Inbound").map(l => (
                                <SelectItem key={l.lead_id} value={l.lead_id}>
                                  {l.company_name || l.name || l.contact_name || l.lead_id}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {leads.length === 0 && (
                            <div className="px-2 py-3 text-sm text-muted-foreground text-center">No hay leads disponibles</div>
                          )}
                        </SelectContent>
                      </Select>
                      {selectedEntity && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Fuente: {selectedEntity._source} {selectedEntity.contact_name ? `| Contacto: ${selectedEntity.contact_name}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {form.entity_type === "client" && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">Cliente asociado</label>
                      <Select value={form.entity_id} onValueChange={v => setForm(f => ({...f, entity_id: v}))}>
                        <SelectTrigger data-testid="comm-client-select">
                          <SelectValue placeholder="Selecciona un cliente..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.length > 0 ? clients.map(c => (
                            <SelectItem key={c.client_id} value={c.client_id}>
                              {c.display_name || c.email || c.client_id}
                            </SelectItem>
                          )) : (
                            <div className="px-2 py-3 text-sm text-muted-foreground text-center">No hay clientes disponibles</div>
                          )}
                        </SelectContent>
                      </Select>
                      {selectedEntity && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedEntity.email || "Sin email"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Entity name display when not standalone */}
              {!standalone && entityName && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{entityName}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Tipo</label>
                  <Select value={form.comm_type} onValueChange={v => setForm(f => ({...f, comm_type: v}))}>
                    <SelectTrigger data-testid="comm-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMM_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Dirección</label>
                  <Select value={form.direction} onValueChange={v => setForm(f => ({...f, direction: v}))}>
                    <SelectTrigger data-testid="comm-direction-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIRECTIONS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Asunto</label>
                <Input
                  data-testid="comm-subject"
                  value={form.subject}
                  onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                  placeholder="Ej: Llamada de seguimiento, Reunión de propuesta..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Notas / Apuntes</label>
                <Textarea
                  data-testid="comm-content"
                  value={form.content}
                  onChange={e => setForm(f => ({...f, content: e.target.value}))}
                  placeholder="Detalles de la interacción, acuerdos, próximos pasos..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button data-testid="save-comm-btn" onClick={handleSubmit}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="comms-empty">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin comunicaciones registradas</p>
          <p className="text-sm mt-1">Haz clic en "Nueva Interacción" para registrar una</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="comms-list">
          {filtered.map(log => {
            const entityName = getEntityName(log);
            const entitySource = getEntitySource(log);
            return (
              <div
                key={log.log_id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                data-testid={`comm-item-${log.log_id}`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${
                  log.comm_type === "call" ? "bg-blue-100 text-blue-600" :
                  log.comm_type === "email" ? "bg-amber-100 text-amber-600" :
                  log.comm_type === "meeting" ? "bg-purple-100 text-purple-600" :
                  log.comm_type === "note" ? "bg-green-100 text-green-600" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {getIcon(log.comm_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{log.subject || "Sin asunto"}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      log.direction === "inbound" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {log.direction === "inbound" ? "Entrante" : "Saliente"}
                    </span>
                  </div>
                  {log.content && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{log.content}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                    {entityName && (
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <User className="w-3 h-3" />
                        {entityName}
                      </span>
                    )}
                    {entitySource && (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        entitySource === "Outreach" ? "bg-violet-100 text-violet-700" : 
                        entitySource === "Cliente" ? "bg-emerald-100 text-emerald-700" :
                        "bg-teal-100 text-teal-700"
                      }`}>
                        {entitySource}
                      </span>
                    )}
                    {log.owner_name && <span>Por: {log.owner_name}</span>}
                    <span>{new Date(log.created_at).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
