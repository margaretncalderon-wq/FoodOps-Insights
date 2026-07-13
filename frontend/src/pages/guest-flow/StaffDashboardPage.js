import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Users, ArrowUp, ArrowDown, Phone, CheckCircle, XCircle, Play, Pause, RotateCcw, ChevronRight, MessageCircle, Hash, Clock, MoreVertical, Copy, ExternalLink, QrCode, Monitor } from "lucide-react";
import { KoraLoader } from "../../components/KoraLoader";
import QRCode from "react-qr-code";

import { API_BASE as API } from "../../utils/api";

const STATUS_LABELS = {
  waiting: "Esperando",
  almost_up: "Casi",
  now_serving: "Sirviendo",
  completed: "Completado",
  canceled: "Cancelado",
};

const STATUS_COLORS = {
  waiting: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  almost_up: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  now_serving: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  completed: "bg-zinc-700/40 text-zinc-400 border-zinc-600/20",
  canceled: "bg-red-500/15 text-red-400 border-red-500/20",
};

export default function StaffDashboardPage() {
  const { activationId } = useParams();
  const navigate = useNavigate();
  const [activation, setActivation] = useState(null);
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [filterStatus, setFilterStatus] = useState("active");
  const [whatsappDialog, setWhatsappDialog] = useState(null);
  const [noteDialog, setNoteDialog] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [qrDialog, setQrDialog] = useState(false);
  const intervalRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [actRes, qRes, sRes] = await Promise.all([
        axios.get(`${API}/api/guest-flow/activations/${activationId}`),
        axios.get(`${API}/api/guest-flow/activations/${activationId}/queue`),
        axios.get(`${API}/api/guest-flow/activations/${activationId}/stats`),
      ]);
      setActivation(actRes.data);
      setQueue(qRes.data);
      setStats(sRes.data);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
        return;
      }
      toast.error("Error cargando datos");
    }
    setLoading(false);
  }, [activationId, navigate]);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 10000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll]);

  const doQueueAction = async (action) => {
    setActionLoading(action);
    try {
      await axios.post(`${API}/api/guest-flow/activations/${activationId}/queue-action`, { action });
      await fetchAll();
      toast.success(`Cola: ${action}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setActionLoading(null);
  };

  const doCallNext = async () => {
    setActionLoading("call_next");
    try {
      const res = await axios.post(`${API}/api/guest-flow/activations/${activationId}/call-next`);
      await fetchAll();
      if (res.data.now_serving) {
        toast.success(`Llamando #${res.data.now_serving.queue_number}`);
      } else {
        toast.info("Cola vacia");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setActionLoading(null);
  };

  const doEntryAction = async (entryId, action, extra = {}) => {
    setActionLoading(`${entryId}_${action}`);
    try {
      await axios.post(`${API}/api/guest-flow/queue/${entryId}/action`, { action, ...extra });
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setActionLoading(null);
  };

  const openWhatsApp = async (entry, messageType = "next") => {
    try {
      const res = await axios.post(`${API}/api/guest-flow/queue/${entry.entry_id}/whatsapp-link`, { message_type: messageType });
      window.open(res.data.link, "_blank");
    } catch {
      toast.error("Error generando enlace");
    }
  };

  const saveNote = async () => {
    if (!noteDialog) return;
    await doEntryAction(noteDialog.entry_id, "update_notes", { notes: noteText });
    setNoteDialog(null);
    setNoteText("");
  };

  const copyQrLink = () => {
    const url = `${window.location.origin}/guest/join/${activationId}`;
    navigator.clipboard.writeText(url);
    toast.success("Enlace copiado!");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <KoraLoader size={32} />
      </div>
    );
  }

  const isActive = activation?.queue_status === "active";
  const isPaused = activation?.queue_status === "paused";

  const filteredQueue = queue.filter(e => {
    if (filterStatus === "active") return ["waiting", "almost_up", "now_serving"].includes(e.status);
    if (filterStatus === "all") return true;
    return e.status === filterStatus;
  });

  const nowServing = queue.find(e => e.status === "now_serving");

  return (
    <div className="min-h-screen bg-zinc-950 text-white" data-testid="staff-dashboard-page">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-lg font-semibold" data-testid="activation-name">{activation?.activation_name || "Dashboard"}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className={`text-xs ${isActive ? "border-emerald-500/40 text-emerald-400" : isPaused ? "border-amber-500/40 text-amber-400" : "border-zinc-600 text-zinc-400"}`} data-testid="queue-status-badge">
                {activation?.queue_status || "inactive"}
              </Badge>
              {stats && <span className="text-zinc-500 text-xs">{stats.total_guests} total</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.open(`/guest/kiosk/${activationId}`, "_blank")} className="text-zinc-400 hover:text-white" data-testid="kiosk-btn">
              <Monitor className="w-4 h-4 mr-1" /> Kiosko
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setQrDialog(true)} className="text-zinc-400 hover:text-white" data-testid="show-qr-btn">
              <QrCode className="w-4 h-4 mr-1" /> QR
            </Button>
            <Button variant="ghost" size="sm" onClick={copyQrLink} className="text-zinc-400 hover:text-white" data-testid="copy-qr-link-btn">
              <Copy className="w-4 h-4 mr-1" /> Link
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open(`/guest/now-serving/${activationId}`, "_blank")} className="text-zinc-400 hover:text-white" data-testid="open-display-btn">
              <ExternalLink className="w-4 h-4 mr-1" /> Display
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-4 gap-3" data-testid="stats-bar">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{stats.waiting}</p>
                <p className="text-zinc-500 text-xs">En espera</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{stats.now_serving}</p>
                <p className="text-zinc-500 text-xs">Sirviendo</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-zinc-300">{stats.completed}</p>
                <p className="text-zinc-500 text-xs">Completados</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-zinc-500">{stats.canceled}</p>
                <p className="text-zinc-500 text-xs">Cancelados</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Queue Controls */}
        <div className="flex flex-wrap gap-2" data-testid="queue-controls">
          {!isActive && !isPaused && (
            <Button onClick={() => doQueueAction("activate")} disabled={!!actionLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="activate-queue-btn">
              {actionLoading === "activate" ? <KoraLoader size={16} className="mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              Activar Cola
            </Button>
          )}
          {isActive && (
            <>
              <Button onClick={doCallNext} disabled={!!actionLoading} className="bg-white text-black hover:bg-zinc-200 flex-1 sm:flex-none h-12 text-base font-semibold" data-testid="call-next-btn">
                {actionLoading === "call_next" ? <KoraLoader size={20} className="mr-1" /> : <ChevronRight className="w-5 h-5 mr-1" />}
                Llamar Siguiente
              </Button>
              <Button onClick={() => doQueueAction("pause")} variant="outline" disabled={!!actionLoading} className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10" data-testid="pause-queue-btn">
                <Pause className="w-4 h-4 mr-1" /> Pausar
              </Button>
            </>
          )}
          {isPaused && (
            <Button onClick={() => doQueueAction("resume")} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="resume-queue-btn">
              <Play className="w-4 h-4 mr-1" /> Reanudar
            </Button>
          )}
          {(isActive || isPaused) && (
            <Button onClick={() => doQueueAction("close")} variant="outline" disabled={!!actionLoading} className="border-red-500/30 text-red-400 hover:bg-red-500/10" data-testid="close-queue-btn">
              <XCircle className="w-4 h-4 mr-1" /> Cerrar
            </Button>
          )}
          <Button onClick={() => doQueueAction("reset")} variant="ghost" disabled={!!actionLoading} className="text-zinc-500 hover:text-red-400" data-testid="reset-queue-btn">
            <RotateCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
        </div>

        {/* Now Serving Highlight */}
        {nowServing && (
          <Card className="bg-emerald-500/10 border-emerald-500/20" data-testid="now-serving-card">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-emerald-400 text-xs uppercase tracking-wide">Ahora Sirviendo</p>
                  <p className="text-white font-semibold text-lg">#{nowServing.queue_number} - {nowServing.guest_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => openWhatsApp(nowServing, "next")} className="text-emerald-400" data-testid="whatsapp-now-serving">
                  <MessageCircle className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={() => doEntryAction(nowServing.entry_id, "complete")} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="complete-current-btn">
                  <CheckCircle className="w-4 h-4 mr-1" /> Completar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800 text-white" data-testid="filter-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="waiting">Esperando</SelectItem>
              <SelectItem value="completed">Completados</SelectItem>
              <SelectItem value="canceled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-zinc-500 text-sm">{filteredQueue.length} entradas</span>
        </div>

        {/* Queue List */}
        <div className="space-y-2" data-testid="queue-list">
          {filteredQueue.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">Cola vacia</p>
            </div>
          )}
          {filteredQueue.map((entry) => (
            <Card key={entry.entry_id} className={`bg-zinc-900 border-zinc-800 ${entry.status === "now_serving" ? "ring-1 ring-emerald-500/30" : ""}`} data-testid={`queue-entry-${entry.queue_number}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-center w-10 shrink-0">
                      <p className="text-lg font-bold text-white">{entry.queue_number}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{entry.guest_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-zinc-500 text-xs">{entry.whatsapp_number}</span>
                        {entry.group_size > 1 && (
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                            <Users className="w-3 h-3 mr-0.5" />{entry.group_size}
                          </Badge>
                        )}
                        {entry.notes && <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">nota</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge className={`text-[10px] ${STATUS_COLORS[entry.status] || ""}`}>{STATUS_LABELS[entry.status]}</Badge>
                    {/* Actions */}
                    {["waiting", "almost_up"].includes(entry.status) && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-white" onClick={() => doEntryAction(entry.entry_id, "move_up")} data-testid={`move-up-${entry.queue_number}`}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-white" onClick={() => doEntryAction(entry.entry_id, "move_down")} data-testid={`move-down-${entry.queue_number}`}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-emerald-400" onClick={() => doEntryAction(entry.entry_id, "now_serving")} data-testid={`serve-${entry.queue_number}`}>
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-amber-400" onClick={() => openWhatsApp(entry, entry.status === "almost_up" ? "almost" : "next")} data-testid={`whatsapp-${entry.queue_number}`}>
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-red-400" onClick={() => doEntryAction(entry.entry_id, "cancel")} data-testid={`cancel-${entry.queue_number}`}>
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {entry.status === "canceled" && (
                      <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-blue-400 text-xs" onClick={() => doEntryAction(entry.entry_id, "readd")} data-testid={`readd-${entry.queue_number}`}>
                        Re-agregar
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:text-white" onClick={() => { setNoteDialog(entry); setNoteText(entry.notes || ""); }} data-testid={`note-${entry.queue_number}`}>
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Note Dialog */}
      <Dialog open={!!noteDialog} onOpenChange={() => setNoteDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Notas - #{noteDialog?.queue_number} {noteDialog?.guest_name}</DialogTitle>
          </DialogHeader>
          <Input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Agregar nota..." className="bg-zinc-800 border-zinc-700 text-white" data-testid="note-input" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(null)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button onClick={saveNote} className="bg-white text-black hover:bg-zinc-200" data-testid="save-note-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialog} onOpenChange={setQrDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{activation?.activation_name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4" data-testid="qr-code-display">
            {activation?.logo_url && <img src={activation.logo_url} alt="Logo" className="h-12 object-contain" />}
            <div className="bg-white p-4 rounded-2xl">
              <QRCode value={`${window.location.origin}/guest/join/${activationId}`} size={220} level="H" />
            </div>
            <p className="text-xs text-zinc-500 text-center break-all px-4">
              {`${window.location.origin}/guest/join/${activationId}`}
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button onClick={copyQrLink} className="w-full bg-white text-black hover:bg-zinc-200" data-testid="qr-copy-btn">
              <Copy className="w-4 h-4 mr-1" /> Copiar Enlace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
