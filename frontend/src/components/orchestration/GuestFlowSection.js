import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Users, Plus, ExternalLink, Copy, Play, Pause, XCircle, RotateCcw,
  QrCode, Clock, CheckCircle, Loader2, ChevronRight
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const ACTIVATION_TYPES = [
  { value: "photo_booth", label: "Photo Booth" },
  { value: "headshot", label: "Headshots" },
  { value: "activation", label: "Activacion" },
  { value: "experience", label: "Experiencia" },
  { value: "other", label: "Otro" },
];

export default function GuestFlowSection({ eventId, language }) {
  const isEs = language === "es";
  const [activations, setActivations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialog, setCreateDialog] = useState(false);
  const [newAct, setNewAct] = useState({ activation_name: "", activation_type: "photo_booth", average_service_time: 3 });
  const [saving, setSaving] = useState(false);

  const fetchActivations = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/guest-flow/activations`, { params: { event_id: eventId } });
      setActivations(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchActivations(); }, [fetchActivations]);

  const createActivation = async () => {
    if (!newAct.activation_name.trim()) return;
    setSaving(true);
    try {
      await axios.post(`${API}/api/guest-flow/activations`, {
        ...newAct,
        event_id: eventId,
      });
      await fetchActivations();
      setCreateDialog(false);
      setNewAct({ activation_name: "", activation_type: "photo_booth", average_service_time: 3 });
      toast.success(isEs ? "Activacion creada" : "Activation created");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setSaving(false);
  };

  const doQueueAction = async (activationId, action) => {
    try {
      await axios.post(`${API}/api/guest-flow/activations/${activationId}/queue-action`, { action });
      await fetchActivations();
      toast.success(`Cola: ${action}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const copyLink = (activationId) => {
    const url = `${window.location.origin}/guest/join/${activationId}`;
    navigator.clipboard.writeText(url);
    toast.success(isEs ? "Enlace copiado!" : "Link copied!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-flow-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" />
            {isEs ? "Guest Flow - Cola Virtual" : "Guest Flow - Virtual Queue"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Gestiona las colas de activaciones en vivo" : "Manage live activation queues"}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateDialog(true)} data-testid="create-activation-btn">
          <Plus className="w-4 h-4 mr-1" />
          {isEs ? "Nueva Activacion" : "New Activation"}
        </Button>
      </div>

      {/* Activations Grid */}
      {activations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {isEs ? "No hay activaciones. Crea una para empezar." : "No activations. Create one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {activations.map((act) => {
            const isActive = act.queue_status === "active";
            const isPaused = act.queue_status === "paused";
            const isClosed = act.queue_status === "closed";
            const typeLabel = ACTIVATION_TYPES.find(t => t.value === act.activation_type)?.label || act.activation_type;

            return (
              <Card key={act.activation_id} data-testid={`activation-card-${act.activation_id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{act.activation_name}</h4>
                        <Badge variant="outline" className="text-[10px] shrink-0">{typeLabel}</Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${isActive ? "border-emerald-500/40 text-emerald-600" : isPaused ? "border-amber-500/40 text-amber-600" : isClosed ? "border-red-500/40 text-red-600" : "border-zinc-300 text-zinc-500"}`}
                        >
                          {act.queue_status}
                        </Badge>
                      </div>

                      {/* Quick Stats */}
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Hash className="w-3 h-3" /> {act.current_queue_number || 0} total
                        </span>
                        {act.now_serving_number > 0 && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle className="w-3 h-3" /> Sirviendo #{act.now_serving_number}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> ~{act.average_service_time} min
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {!isActive && !isPaused && !isClosed && (
                        <Button size="sm" variant="outline" onClick={() => doQueueAction(act.activation_id, "activate")} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" data-testid={`activate-${act.activation_id}`}>
                          <Play className="w-3 h-3 mr-1" /> Activar
                        </Button>
                      )}
                      {isActive && (
                        <Button size="sm" variant="outline" onClick={() => doQueueAction(act.activation_id, "pause")} className="text-amber-600 border-amber-200 hover:bg-amber-50" data-testid={`pause-${act.activation_id}`}>
                          <Pause className="w-3 h-3" />
                        </Button>
                      )}
                      {isPaused && (
                        <Button size="sm" variant="outline" onClick={() => doQueueAction(act.activation_id, "resume")} className="text-blue-600 border-blue-200 hover:bg-blue-50" data-testid={`resume-${act.activation_id}`}>
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => copyLink(act.activation_id)} data-testid={`copy-link-${act.activation_id}`}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.open(`/guest/staff/${act.activation_id}`, "_blank")} data-testid={`open-dashboard-${act.activation_id}`}>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Activation Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Activacion" : "New Activation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input
                value={newAct.activation_name}
                onChange={e => setNewAct({ ...newAct, activation_name: e.target.value })}
                placeholder={isEs ? "Ej: Photo Booth VIP" : "E.g.: VIP Photo Booth"}
                data-testid="activation-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select value={newAct.activation_type} onValueChange={v => setNewAct({ ...newAct, activation_type: v })}>
                  <SelectTrigger data-testid="activation-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVATION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Tiempo promedio (min)" : "Avg. time (min)"}</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={newAct.average_service_time}
                  onChange={e => setNewAct({ ...newAct, average_service_time: parseInt(e.target.value) || 3 })}
                  data-testid="activation-time-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={createActivation} disabled={saving || !newAct.activation_name.trim()} data-testid="create-activation-submit">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {isEs ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
