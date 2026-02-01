import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  RefreshCw, Phone, Mail, Calendar, User, Building2,
  Clock, CheckCircle, AlertTriangle, CalendarDays
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const FOLLOW_UP_TYPES = [
  { value: "Call", labelEn: "Call", labelEs: "Llamada", icon: Phone },
  { value: "Email", labelEn: "Email", labelEs: "Email", icon: Mail },
  { value: "Meeting", labelEn: "Meeting", labelEs: "Reunión", icon: User },
  { value: "CheckIn", labelEn: "Check-in", labelEs: "Seguimiento", icon: Clock }
];

export default function FollowUpsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm] = useState({
    next_follow_up_date: "",
    follow_up_type: "Call"
  });

  const fetchFollowUps = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/follow-ups`, { withCredentials: true });
      setFollowUps(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFollowUps(); }, [fetchFollowUps]);

  const handleComplete = async (item) => {
    try {
      await axios.post(`${API}/api/crm/follow-ups/${item.entity_type}/${item.entity_id}/complete`, {}, { withCredentials: true });
      toast.success(isEs ? "Seguimiento completado" : "Follow-up completed");
      fetchFollowUps();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleReschedule = async () => {
    if (!selectedItem) return;
    try {
      const params = new URLSearchParams();
      if (editForm.next_follow_up_date) params.append("next_follow_up_date", editForm.next_follow_up_date);
      if (editForm.follow_up_type) params.append("follow_up_type", editForm.follow_up_type);
      
      await axios.put(
        `${API}/api/crm/follow-ups/${selectedItem.entity_type}/${selectedItem.entity_id}?${params.toString()}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs ? "Seguimiento actualizado" : "Follow-up updated");
      setEditDialogOpen(false);
      fetchFollowUps();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const openEdit = (item) => {
    setSelectedItem(item);
    setEditForm({
      next_follow_up_date: item.follow_up_date || "",
      follow_up_type: item.follow_up_type || "Call"
    });
    setEditDialogOpen(true);
  };

  const today = new Date().toISOString().split("T")[0];
  const overdue = followUps.filter(f => f.follow_up_date < today);
  const todayItems = followUps.filter(f => f.follow_up_date === today);
  const upcoming = followUps.filter(f => f.follow_up_date > today);

  const getTypeIcon = (type) => {
    const t = FOLLOW_UP_TYPES.find(ft => ft.value === type) || FOLLOW_UP_TYPES[0];
    return <t.icon className="w-4 h-4" />;
  };

  const renderFollowUpCard = (item) => (
    <Card key={`${item.entity_type}-${item.entity_id}`} className={item.status === "overdue" ? "border-red-200 bg-red-50/30" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={item.entity_type === "lead" ? "default" : "secondary"}>
                {item.entity_type === "lead" ? "Lead" : (isEs ? "Cliente" : "Client")}
              </Badge>
              <span className="font-medium">{item.name}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {item.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {item.email}
                </span>
              )}
              {item.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {item.phone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm">
              {getTypeIcon(item.follow_up_type)}
              <span>{FOLLOW_UP_TYPES.find(t => t.value === item.follow_up_type)?.[isEs ? "labelEs" : "labelEn"] || item.follow_up_type}</span>
              <span className="text-muted-foreground">•</span>
              <Calendar className="w-3 h-3" />
              <span className={item.status === "overdue" ? "text-red-600 font-medium" : ""}>
                {new Date(item.follow_up_date).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
              <CalendarDays className="w-4 h-4 mr-1" />
              {isEs ? "Reagendar" : "Reschedule"}
            </Button>
            <Button size="sm" onClick={() => handleComplete(item)}>
              <CheckCircle className="w-4 h-4 mr-1" />
              {isEs ? "Completar" : "Complete"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="follow-ups-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Seguimientos" : "Follow-ups"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Vista unificada de seguimientos de leads y clientes" : "Unified view of lead and client follow-ups"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchFollowUps}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className={overdue.length > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${overdue.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              <span className="text-sm">{isEs ? "Atrasados" : "Overdue"}</span>
            </div>
            <div className="text-3xl font-bold mt-1">{overdue.length}</div>
          </CardContent>
        </Card>
        <Card className={todayItems.length > 0 ? "border-yellow-300 bg-yellow-50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className={`w-5 h-5 ${todayItems.length > 0 ? "text-yellow-600" : "text-muted-foreground"}`} />
              <span className="text-sm">{isEs ? "Hoy" : "Today"}</span>
            </div>
            <div className="text-3xl font-bold mt-1">{todayItems.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">{isEs ? "Próximos" : "Upcoming"}</span>
            </div>
            <div className="text-3xl font-bold mt-1">{upcoming.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div>
          <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {isEs ? "Atrasados" : "Overdue"} ({overdue.length})
          </h3>
          <div className="space-y-3">
            {overdue.map(renderFollowUpCard)}
          </div>
        </div>
      )}

      {/* Today */}
      {todayItems.length > 0 && (
        <div>
          <h3 className="font-semibold text-yellow-600 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {isEs ? "Hoy" : "Today"} ({todayItems.length})
          </h3>
          <div className="space-y-3">
            {todayItems.map(renderFollowUpCard)}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {isEs ? "Próximos" : "Upcoming"} ({upcoming.length})
          </h3>
          <div className="space-y-3">
            {upcoming.map(renderFollowUpCard)}
          </div>
        </div>
      )}

      {followUps.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{isEs ? "No hay seguimientos programados" : "No scheduled follow-ups"}</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Reagendar Seguimiento" : "Reschedule Follow-up"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Fecha" : "Date"}</Label>
              <Input
                type="date"
                value={editForm.next_follow_up_date}
                onChange={(e) => setEditForm({ ...editForm, next_follow_up_date: e.target.value })}
              />
            </div>
            <div>
              <Label>{isEs ? "Tipo" : "Type"}</Label>
              <Select value={editForm.follow_up_type} onValueChange={(v) => setEditForm({ ...editForm, follow_up_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {isEs ? type.labelEs : type.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleReschedule}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
