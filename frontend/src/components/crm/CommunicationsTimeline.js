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
      <div className="text-center py-2 text-muted-foreground text-xs">
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="communications-timeline">
      {/* Header - Compact */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="w-3.5 h-3.5" />
          Comunicaciones ({logs.length})
        </h4>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setShowNew(true)}>
          <Plus className="w-3 h-3 mr-1" /> Nueva
        </Button>
      </div>

      {/* Timeline - Compact with max height */}
      {logs.length === 0 ? (
        <div className="text-center py-3 text-muted-foreground text-xs border rounded bg-muted/20">
          Sin comunicaciones
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
          {visibleLogs.map(log => (
            <div 
              key={log.log_id} 
              className={`flex items-start gap-1.5 p-1.5 rounded border text-xs ${
                log.from_source_lead ? "bg-amber-50/50 border-amber-200" : "bg-muted/30"
              }`}
            >
              <div className={`p-1 rounded shrink-0 ${
                log.comm_type === "call" ? "bg-blue-100 text-blue-600" :
                log.comm_type === "email" ? "bg-amber-100 text-amber-600" :
                log.comm_type === "meeting" ? "bg-purple-100 text-purple-600" :
                "bg-gray-100 text-gray-600"
              }`}>
                {getIcon(log.comm_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-medium text-[11px] truncate">{log.subject || "Sin asunto"}</span>
                  <span className={`text-[9px] px-1 rounded ${
                    log.direction === "inbound" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {log.direction === "inbound" ? "Ent" : "Sal"}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {log.owner_name && `${log.owner_name} · `}
                  {new Date(log.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {hasMore && !showAll && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-[10px] h-6" 
          onClick={() => setShowAll(true)}
        >
          <ChevronDown className="w-3 h-3 mr-1" /> Ver {logs.length - maxVisible} más
        </Button>
      )}

      {/* New Communication Dialog - Compact */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Nueva Interacción</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium mb-0.5 block">Tipo</label>
                <Select value={form.comm_type} onValueChange={v => setForm(f => ({...f, comm_type: v}))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMM_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-medium mb-0.5 block">Dirección</label>
                <Select value={form.direction} onValueChange={v => setForm(f => ({...f, direction: v}))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIRECTIONS.map(d => (
                      <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium mb-0.5 block">Asunto</label>
              <Input
                className="h-8 text-xs"
                value={form.subject}
                onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                placeholder="Ej: Llamada de seguimiento"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium mb-0.5 block">Notas</label>
              <Textarea
                className="text-xs min-h-[60px]"
                value={form.content}
                onChange={e => setForm(f => ({...f, content: e.target.value}))}
                placeholder="Detalles..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
