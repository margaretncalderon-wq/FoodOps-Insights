import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Phone, Mail, Video, FileText, MessageSquare, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";

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

export default function CommunicationsTimeline({ entityType, entityId, entityName, maxVisible = 3 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    comm_type: "call",
    direction: "outbound",
    subject: "",
    content: "",
  });

  const fetchLogs = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/crm/${entityType}s/${entityId}/communications`, { withCredentials: true });
      // Handle both array and object response (client endpoint returns object)
      const data = Array.isArray(res.data) ? res.data : res.data.communications || [];
      setLogs(data);
    } catch (err) {
      console.error("Error fetching communications:", err);
      setLogs([]);
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSubmit = async () => {
    if (!form.subject.trim()) { toast.error("Agrega un asunto"); return; }
    try {
      await axios.post(`${API}/api/crm/comms`, {
        ...form,
        entity_type: entityType,
        entity_id: entityId,
      }, { withCredentials: true });
      toast.success("Interacción registrada");
      setShowNew(false);
      setForm({ comm_type: "call", direction: "outbound", subject: "", content: "" });
      fetchLogs();
    } catch (err) {
      toast.error("Error al guardar");
    }
  };

  const getIcon = (type) => {
    const found = COMM_TYPES.find(c => c.value === type);
    const Icon = found ? found.icon : MessageSquare;
    return <Icon className="w-3 h-3" />;
  };

  const visibleLogs = showAll ? logs : logs.slice(0, maxVisible);
  const hasMore = logs.length > maxVisible;

  if (loading) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        Cargando comunicaciones...
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="communications-timeline">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Comunicaciones ({logs.length})
        </h4>
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
          <Plus className="w-3 h-3 mr-1" /> Nueva
        </Button>
      </div>

      {/* Timeline */}
      {logs.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg bg-muted/30">
          Sin comunicaciones registradas
        </div>
      ) : (
        <div className="space-y-2">
          {visibleLogs.map(log => (
            <div 
              key={log.log_id} 
              className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${
                log.from_source_lead ? "bg-amber-50/50 border-amber-200" : "bg-card"
              }`}
            >
              <div className={`p-1.5 rounded shrink-0 ${
                log.comm_type === "call" ? "bg-blue-100 text-blue-600" :
                log.comm_type === "email" ? "bg-amber-100 text-amber-600" :
                log.comm_type === "meeting" ? "bg-purple-100 text-purple-600" :
                "bg-gray-100 text-gray-600"
              }`}>
                {getIcon(log.comm_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">{log.subject || "Sin asunto"}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded ${
                    log.direction === "inbound" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {log.direction === "inbound" ? "Ent" : "Sal"}
                  </span>
                  {log.from_source_lead && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700">
                      Lead
                    </span>
                  )}
                </div>
                {log.content && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{log.content}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {log.owner_name && `${log.owner_name} · `}
                  {new Date(log.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                </p>
              </div>
            </div>
          ))}
          
          {hasMore && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs" 
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? (
                <><ChevronUp className="w-3 h-3 mr-1" /> Mostrar menos</>
              ) : (
                <><ChevronDown className="w-3 h-3 mr-1" /> Ver {logs.length - maxVisible} más</>
              )}
            </Button>
          )}
        </div>
      )}

      {/* New Communication Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Interacción - {entityName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Tipo</label>
                <Select value={form.comm_type} onValueChange={v => setForm(f => ({...f, comm_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMM_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Dirección</label>
                <Select value={form.direction} onValueChange={v => setForm(f => ({...f, direction: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIRECTIONS.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Asunto</label>
              <Input
                value={form.subject}
                onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                placeholder="Ej: Llamada de seguimiento"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Notas</label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({...f, content: e.target.value}))}
                placeholder="Detalles de la interacción..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
