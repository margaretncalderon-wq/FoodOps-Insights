import { useState, useEffect, useCallback } from "react";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Users, Plus, ExternalLink, Copy, Play, Pause, QrCode, Clock, CheckCircle, Hash, Link2, Monitor } from "lucide-react";

import { KoraLoader } from "../KoraLoader";
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
  const { term } = useTerminology();
  const [activations, setActivations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialog, setCreateDialog] = useState(false);
  const [qrDialog, setQrDialog] = useState(null);
  const [linkedMarketing, setLinkedMarketing] = useState(null);
  const [newAct, setNewAct] = useState({ activation_name: "", activation_type: "photo_booth", average_service_time: 3, logo_url: "" });
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

  const fetchLinkedMarketing = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/guest-flow/event/${eventId}/linked-marketing-activation`);
      setLinkedMarketing(res.data);
    } catch {
      setLinkedMarketing(null);
    }
  }, [eventId]);

  useEffect(() => {
    fetchActivations();
    fetchLinkedMarketing();
  }, [fetchActivations, fetchLinkedMarketing]);

  const createActivation = async () => {
    if (!newAct.activation_name.trim()) return;
    setSaving(true);
    try {
      await axios.post(`${API}/api/guest-flow/activations`, {
        ...newAct,
        event_id: eventId,
        marketing_activation_id: linkedMarketing?.activation_id || null,
      });
      await fetchActivations();
      setCreateDialog(false);
      setNewAct({ activation_name: "", activation_type: "photo_booth", average_service_time: 3, logo_url: "" });
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

  const getJoinUrl = (activationId) => `${window.location.origin}/guest/join/${activationId}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <KoraLoader size={24} />
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

      {/* Linked Marketing Activation Info */}
      {linkedMarketing && (
        <Card className="border-blue-200 bg-blue-50/50" data-testid="linked-marketing-card">
          <CardContent className="p-3 flex items-center gap-3">
            <Link2 className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-800 truncate">
                Demand Studio: {linkedMarketing.name}
              </p>
              <p className="text-xs text-blue-600">
                {linkedMarketing.activation_type} &middot; {linkedMarketing.status}
                {linkedMarketing.location && ` &middot; ${linkedMarketing.location}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
                      <div className="flex items-center gap-2 flex-wrap">
                        {act.logo_url && <img src={act.logo_url} alt="" className="h-6 object-contain" />}
                        <h4 className="font-medium truncate">{act.activation_name}</h4>
                        <Badge variant="outline" className="text-[10px] shrink-0">{typeLabel}</Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${isActive ? "border-emerald-500/40 text-emerald-600" : isPaused ? "border-amber-500/40 text-amber-600" : isClosed ? "border-red-500/40 text-red-600" : "border-zinc-300 text-zinc-500"}`}
                        >
                          {act.queue_status}
                        </Badge>
                      </div>
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
                      <Button size="sm" variant="ghost" onClick={() => setQrDialog(act)} data-testid={`qr-${act.activation_id}`}>
                        <QrCode className="w-3.5 h-3.5" />
                      </Button>
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

      {/* QR Code Dialog */}
      <Dialog open={!!qrDialog} onOpenChange={() => setQrDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{qrDialog?.activation_name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4" data-testid="qr-code-display">
            {qrDialog?.logo_url && <img src={qrDialog.logo_url} alt="Logo" className="h-12 object-contain" />}
            <div className="bg-white p-4 rounded-2xl">
              <QRCode value={qrDialog ? getJoinUrl(qrDialog.activation_id) : ""} size={220} level="H" />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all px-4">
              {qrDialog ? getJoinUrl(qrDialog.activation_id) : ""}
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button onClick={() => window.open(`/guest/kiosk/${qrDialog?.activation_id}`, "_blank")} className="w-full" data-testid="qr-open-kiosk-btn">
              <Monitor className="w-4 h-4 mr-1" /> Abrir Modo Kiosko
            </Button>
            <Button variant="outline" onClick={() => { if(qrDialog) copyLink(qrDialog.activation_id); }} className="w-full" data-testid="qr-copy-link-btn">
              <Copy className="w-4 h-4 mr-1" /> Copiar Enlace
            </Button>
            <Button variant="outline" onClick={() => window.open(`/guest/now-serving/${qrDialog?.activation_id}`, "_blank")} className="w-full" data-testid="qr-open-display-btn">
              <ExternalLink className="w-4 h-4 mr-1" /> Abrir Display
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  type="number" min={1} max={60}
                  value={newAct.average_service_time}
                  onChange={e => setNewAct({ ...newAct, average_service_time: parseInt(e.target.value) || 3 })}
                  data-testid="activation-time-input"
                />
              </div>
            </div>
            <div>
              <Label>{isEs ? `Logo del ${term("events", "entity_singular").toLowerCase()} (URL)` : `${term("events", "entity_singular")} Logo (URL)`}</Label>
              <Input
                value={newAct.logo_url}
                onChange={e => setNewAct({ ...newAct, logo_url: e.target.value })}
                placeholder="https://ejemplo.com/logo.png"
                data-testid="activation-logo-input"
              />
              {newAct.logo_url && (
                <div className="mt-2 p-2 bg-zinc-100 rounded-lg flex items-center justify-center">
                  <img src={newAct.logo_url} alt="Preview" className="h-10 object-contain" onError={e => e.target.style.display = 'none'} />
                </div>
              )}
            </div>
            {linkedMarketing && (
              <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 p-2 rounded-lg">
                <Link2 className="w-3 h-3" />
                Vinculada a: {linkedMarketing.name} (Demand Studio)
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={createActivation} disabled={saving || !newAct.activation_name.trim()} data-testid="create-activation-submit">
              {saving ? <KoraLoader size={16} className="mr-1" /> : null}
              {isEs ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
