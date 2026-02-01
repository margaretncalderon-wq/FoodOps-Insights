import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";
import { 
  RefreshCw, Phone, Mail, MessageSquare, User, Plus,
  Clock, ArrowUpRight, ArrowDownLeft, FileText
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const COMM_TYPES = [
  { value: "call", labelEn: "Call", labelEs: "Llamada", icon: Phone },
  { value: "email", labelEn: "Email", labelEs: "Email", icon: Mail },
  { value: "meeting", labelEn: "Meeting", labelEs: "Reunión", icon: User },
  { value: "note", labelEn: "Note", labelEs: "Nota", icon: FileText }
];

export default function CommsLogSection({ entityType, entityId, entityName }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    comm_type: "call",
    subject: "",
    content: "",
    direction: "outbound"
  });

  const fetchLogs = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await axios.get(`${API}/api/crm/comms/${entityType}/${entityId}`, { withCredentials: true });
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/api/crm/comms`, {
        entity_type: entityType,
        entity_id: entityId,
        ...form
      }, { withCredentials: true });
      toast.success(isEs ? "Registro agregado" : "Log added");
      fetchLogs();
      setDialogOpen(false);
      setForm({ comm_type: "call", subject: "", content: "", direction: "outbound" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const getTypeIcon = (type) => {
    const t = COMM_TYPES.find(ct => ct.value === type) || COMM_TYPES[0];
    return <t.icon className="w-4 h-4" />;
  };

  const getDirectionIcon = (direction) => {
    return direction === "inbound" 
      ? <ArrowDownLeft className="w-3 h-3 text-green-600" />
      : <ArrowUpRight className="w-3 h-3 text-blue-600" />;
  };

  if (loading) return <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4" data-testid="comms-log-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {isEs ? "Historial de Comunicación" : "Communication History"}
          {entityName && <span className="text-muted-foreground font-normal">- {entityName}</span>}
        </h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          {isEs ? "Agregar" : "Add"}
        </Button>
      </div>

      {/* Logs */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-3 pr-4">
          {logs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>{isEs ? "Sin comunicaciones registradas" : "No communications logged"}</p>
              </CardContent>
            </Card>
          ) : (
            logs.map((log) => (
              <Card key={log.log_id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-muted rounded-lg">
                      {getTypeIcon(log.comm_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {COMM_TYPES.find(t => t.value === log.comm_type)?.[isEs ? "labelEs" : "labelEn"] || log.comm_type}
                        </Badge>
                        {getDirectionIcon(log.direction)}
                        <span className="text-xs text-muted-foreground">
                          {log.direction === "inbound" ? (isEs ? "Entrante" : "Inbound") : (isEs ? "Saliente" : "Outbound")}
                        </span>
                      </div>
                      {log.subject && (
                        <p className="font-medium text-sm mb-1">{log.subject}</p>
                      )}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{log.content}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString()}
                        {log.owner_name && (
                          <>
                            <span>•</span>
                            <User className="w-3 h-3" />
                            {log.owner_name}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Comunicación" : "New Communication"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select value={form.comm_type} onValueChange={(v) => setForm({ ...form, comm_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMM_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {isEs ? type.labelEs : type.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Dirección" : "Direction"}</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">{isEs ? "Saliente" : "Outbound"}</SelectItem>
                    <SelectItem value="inbound">{isEs ? "Entrante" : "Inbound"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{isEs ? "Asunto" : "Subject"}</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder={isEs ? "Opcional" : "Optional"}
              />
            </div>
            <div>
              <Label>{isEs ? "Contenido" : "Content"} *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={4}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit">{isEs ? "Agregar" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
