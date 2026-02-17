// components/RoomSetupTab.js - Room Setup & Timeline for Event Orchestration
import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import {
  DoorOpen,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Users,
  Layout,
  Package,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Utensils,
  Monitor,
  Music,
  Mic,
  Lightbulb,
  Armchair,
  Move,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const LAYOUT_TYPES = [
  { value: "theater", labelEn: "Theater", labelEs: "Teatro", icon: "🎭" },
  { value: "banquet", labelEn: "Banquet", labelEs: "Banquete", icon: "🍽️" },
  { value: "cocktail", labelEn: "Cocktail", labelEs: "Cóctel", icon: "🥂" },
  { value: "classroom", labelEn: "Classroom", labelEs: "Aula", icon: "📚" },
  { value: "u_shape", labelEn: "U-Shape", labelEs: "Forma de U", icon: "⊔" },
  { value: "conference", labelEn: "Conference", labelEs: "Conferencia", icon: "👥" },
  { value: "hollow_square", labelEn: "Hollow Square", labelEs: "Cuadrado Hueco", icon: "◻️" },
  { value: "custom", labelEn: "Custom", labelEs: "Personalizado", icon: "✏️" },
];

const NEED_CATEGORIES = [
  { value: "av_equipment", labelEn: "A/V Equipment", labelEs: "Equipo A/V", icon: Monitor },
  { value: "furniture", labelEn: "Furniture", labelEs: "Mobiliario", icon: Armchair },
  { value: "decor", labelEn: "Decor", labelEs: "Decoración", icon: Lightbulb },
  { value: "catering", labelEn: "Catering", labelEs: "Catering", icon: Utensils },
  { value: "technical", labelEn: "Technical", labelEs: "Técnico", icon: Mic },
  { value: "other", labelEn: "Other", labelEs: "Otro", icon: Package },
];

const ACTIVITY_TYPES = [
  { value: "setup", labelEn: "Setup", labelEs: "Montaje", color: "bg-gray-500" },
  { value: "ceremony", labelEn: "Ceremony", labelEs: "Ceremonia", color: "bg-purple-500" },
  { value: "cocktail", labelEn: "Cocktail", labelEs: "Cóctel", color: "bg-blue-500" },
  { value: "dinner", labelEn: "Dinner", labelEs: "Cena", color: "bg-green-500" },
  { value: "entertainment", labelEn: "Entertainment", labelEs: "Entretenimiento", color: "bg-pink-500" },
  { value: "breakdown", labelEn: "Breakdown", labelEs: "Desmontaje", color: "bg-orange-500" },
  { value: "general", labelEn: "General", labelEs: "General", color: "bg-slate-500" },
];

export default function RoomSetupTab({ eventId, event, isLocked = false }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);
  const [roomSetups, setRoomSetups] = useState([]);
  const [venues, setVenues] = useState([]);
  const [masterTimeline, setMasterTimeline] = useState([]);
  const [activeView, setActiveView] = useState("rooms"); // rooms | timeline
  
  // Dialog states
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [needDialogOpen, setNeedDialogOpen] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [editingNeed, setEditingNeed] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);

  // Forms
  const [roomForm, setRoomForm] = useState({
    venue_id: "",
    room_id: "",
    layout_type: "banquet",
    planned_guests: 0,
    setup_start_time: "",
    event_start_time: "",
    event_end_time: "",
    breakdown_end_time: "",
    special_instructions: "",
    vendor_access_notes: "",
  });

  const [needForm, setNeedForm] = useState({
    category: "other",
    name: "",
    quantity: 1,
    notes: "",
  });

  const [activityForm, setActivityForm] = useState({
    title: "",
    description: "",
    start_time: "",
    end_time: "",
    activity_type: "general",
    responsible: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [setupsRes, venuesRes] = await Promise.all([
        axios.get(`${API}/orchestration/room-setup/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API}/locations/venues`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setRoomSetups(setupsRes.data.rooms || []);
      setMasterTimeline(setupsRes.data.master_timeline || []);
      setVenues(venuesRes.data || []);
    } catch (error) {
      console.error("Error fetching room setups:", error);
      toast.error(isEs ? "Error al cargar configuración" : "Error loading setup");
    } finally {
      setLoading(false);
    }
  }, [eventId, token, isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddRoom = () => {
    setSelectedRoom(null);
    setRoomForm({
      venue_id: "",
      room_id: "",
      layout_type: "banquet",
      planned_guests: event?.guest_count || 0,
      setup_start_time: "",
      event_start_time: event?.start_time || "",
      event_end_time: event?.end_time || "",
      breakdown_end_time: "",
      special_instructions: "",
      vendor_access_notes: "",
    });
    setRoomDialogOpen(true);
  };

  const handleEditRoom = (setup) => {
    setSelectedRoom(setup);
    setRoomForm({
      venue_id: setup.venue_id,
      room_id: setup.room_id,
      layout_type: setup.layout_type || "banquet",
      planned_guests: setup.planned_guests || 0,
      setup_start_time: setup.setup_start_time || "",
      event_start_time: setup.event_start_time || "",
      event_end_time: setup.event_end_time || "",
      breakdown_end_time: setup.breakdown_end_time || "",
      special_instructions: setup.special_instructions || "",
      vendor_access_notes: setup.vendor_access_notes || "",
    });
    setRoomDialogOpen(true);
  };

  const handleSaveRoom = async () => {
    try {
      if (selectedRoom) {
        await axios.put(
          `${API}/orchestration/room-setup/events/${eventId}/rooms/${roomForm.room_id}`,
          {
            layout_type: roomForm.layout_type,
            planned_guests: parseInt(roomForm.planned_guests) || 0,
            setup_start_time: roomForm.setup_start_time || null,
            event_start_time: roomForm.event_start_time || null,
            event_end_time: roomForm.event_end_time || null,
            breakdown_end_time: roomForm.breakdown_end_time || null,
            special_instructions: roomForm.special_instructions || null,
            vendor_access_notes: roomForm.vendor_access_notes || null,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(isEs ? "Configuración actualizada" : "Setup updated");
      } else {
        await axios.post(
          `${API}/orchestration/room-setup/events/${eventId}/rooms`,
          roomForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(isEs ? "Salón agregado" : "Room added");
      }
      setRoomDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving room:", error);
      toast.error(error.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta configuración?" : "Delete this setup?")) return;
    try {
      await axios.delete(`${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(isEs ? "Eliminado" : "Deleted");
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  // Needs management
  const handleAddNeed = (setup) => {
    setSelectedRoom(setup);
    setEditingNeed(null);
    setNeedForm({ category: "other", name: "", quantity: 1, notes: "" });
    setNeedDialogOpen(true);
  };

  const handleSaveNeed = async () => {
    try {
      await axios.post(
        `${API}/orchestration/room-setup/events/${eventId}/rooms/${selectedRoom.room_id}/needs`,
        needForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(isEs ? "Necesidad agregada" : "Need added");
      setNeedDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al agregar" : "Error adding");
    }
  };

  const handleDeleteNeed = async (roomId, itemId) => {
    try {
      await axios.delete(`${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}/needs/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  // Timeline management
  const handleAddActivity = (setup) => {
    setSelectedRoom(setup);
    setEditingActivity(null);
    setActivityForm({
      title: "",
      description: "",
      start_time: setup.event_start_time || "",
      end_time: "",
      activity_type: "general",
      responsible: "",
      notes: "",
    });
    setActivityDialogOpen(true);
  };

  const handleEditActivity = (setup, activity) => {
    setSelectedRoom(setup);
    setEditingActivity(activity);
    setActivityForm({
      title: activity.title,
      description: activity.description || "",
      start_time: activity.start_time,
      end_time: activity.end_time,
      activity_type: activity.activity_type || "general",
      responsible: activity.responsible || "",
      notes: activity.notes || "",
    });
    setActivityDialogOpen(true);
  };

  const handleSaveActivity = async () => {
    try {
      if (editingActivity) {
        await axios.put(
          `${API}/orchestration/room-setup/events/${eventId}/rooms/${selectedRoom.room_id}/timeline/${editingActivity.activity_id}`,
          activityForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API}/orchestration/room-setup/events/${eventId}/rooms/${selectedRoom.room_id}/timeline`,
          activityForm,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      toast.success(isEs ? "Actividad guardada" : "Activity saved");
      setActivityDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
  };

  const handleDeleteActivity = async (roomId, activityId) => {
    try {
      await axios.delete(`${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}/timeline/${activityId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  const selectedVenue = venues.find(v => v.venue_id === roomForm.venue_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#3A4D3F]" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="room-setup-tab">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Layout className="w-5 h-5 text-[#3A4D3F]" />
            {isEs ? "Configuración de Salones" : "Room Setup"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Configura layout, necesidades y timeline por salón" : "Configure layout, needs and timeline per room"}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Tabs value={activeView} onValueChange={setActiveView}>
            <TabsList>
              <TabsTrigger value="rooms" className="text-xs">
                <DoorOpen className="w-4 h-4 mr-1" />
                {isEs ? "Salones" : "Rooms"}
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">
                <Clock className="w-4 h-4 mr-1" />
                Timeline
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {!isLocked && (
            <Button onClick={handleAddRoom} className="bg-[#3A4D3F] hover:bg-[#2d3d31]">
              <Plus className="w-4 h-4 mr-1" />
              {isEs ? "Agregar Salón" : "Add Room"}
            </Button>
          )}
        </div>
      </div>

      {/* Rooms View */}
      {activeView === "rooms" && (
        <div className="space-y-4">
          {roomSetups.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DoorOpen className="w-12 h-12 text-gray-400 mb-4" />
                <p className="text-gray-500 mb-2">
                  {isEs ? "No hay salones configurados" : "No rooms configured"}
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  {isEs ? "Agrega salones del evento para configurar layout y necesidades" : "Add event rooms to configure layout and needs"}
                </p>
                {!isLocked && (
                  <Button onClick={handleAddRoom} variant="outline">
                    <Plus className="w-4 h-4 mr-1" />
                    {isEs ? "Agregar Salón" : "Add Room"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            roomSetups.map((setup) => (
              <RoomSetupCard
                key={setup.config_id}
                setup={setup}
                isEs={isEs}
                isLocked={isLocked}
                onEdit={() => handleEditRoom(setup)}
                onDelete={() => handleDeleteRoom(setup.room_id)}
                onAddNeed={() => handleAddNeed(setup)}
                onDeleteNeed={(itemId) => handleDeleteNeed(setup.room_id, itemId)}
                onAddActivity={() => handleAddActivity(setup)}
                onEditActivity={(activity) => handleEditActivity(setup, activity)}
                onDeleteActivity={(activityId) => handleDeleteActivity(setup.room_id, activityId)}
              />
            ))
          )}
        </div>
      )}

      {/* Timeline View */}
      {activeView === "timeline" && (
        <MasterTimelineView
          roomSetups={roomSetups}
          masterTimeline={masterTimeline}
          isEs={isEs}
        />
      )}

      {/* Room Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedRoom ? (isEs ? "Editar Configuración" : "Edit Setup") : (isEs ? "Agregar Salón" : "Add Room")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {!selectedRoom && (
              <>
                <div className="space-y-2">
                  <Label>{isEs ? "Sede" : "Venue"}</Label>
                  <Select value={roomForm.venue_id} onValueChange={(v) => setRoomForm({ ...roomForm, venue_id: v, room_id: "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder={isEs ? "Seleccionar sede" : "Select venue"} />
                    </SelectTrigger>
                    <SelectContent>
                      {venues.map((venue) => (
                        <SelectItem key={venue.venue_id} value={venue.venue_id}>
                          {venue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedVenue && selectedVenue.rooms?.length > 0 && (
                  <div className="space-y-2">
                    <Label>{isEs ? "Salón" : "Room"}</Label>
                    <Select value={roomForm.room_id} onValueChange={(v) => setRoomForm({ ...roomForm, room_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder={isEs ? "Seleccionar salón" : "Select room"} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedVenue.rooms.filter(r => r.is_active).map((room) => (
                          <SelectItem key={room.room_id} value={room.room_id}>
                            {room.name} ({room.capacity} cap.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label>{isEs ? "Layout" : "Layout"}</Label>
              <Select value={roomForm.layout_type} onValueChange={(v) => setRoomForm({ ...roomForm, layout_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUT_TYPES.map((layout) => (
                    <SelectItem key={layout.value} value={layout.value}>
                      {layout.icon} {isEs ? layout.labelEs : layout.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Invitados en este salón" : "Guests in this room"}</Label>
              <Input
                type="number"
                value={roomForm.planned_guests}
                onChange={(e) => setRoomForm({ ...roomForm, planned_guests: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Inicio montaje" : "Setup start"}</Label>
                <Input
                  type="time"
                  value={roomForm.setup_start_time}
                  onChange={(e) => setRoomForm({ ...roomForm, setup_start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Inicio evento" : "Event start"}</Label>
                <Input
                  type="time"
                  value={roomForm.event_start_time}
                  onChange={(e) => setRoomForm({ ...roomForm, event_start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Fin evento" : "Event end"}</Label>
                <Input
                  type="time"
                  value={roomForm.event_end_time}
                  onChange={(e) => setRoomForm({ ...roomForm, event_end_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Fin desmontaje" : "Breakdown end"}</Label>
                <Input
                  type="time"
                  value={roomForm.breakdown_end_time}
                  onChange={(e) => setRoomForm({ ...roomForm, breakdown_end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Instrucciones especiales" : "Special instructions"}</Label>
              <Textarea
                value={roomForm.special_instructions}
                onChange={(e) => setRoomForm({ ...roomForm, special_instructions: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveRoom} className="bg-[#3A4D3F] hover:bg-[#2d3d31]" disabled={!selectedRoom && !roomForm.room_id}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Need Dialog */}
      <Dialog open={needDialogOpen} onOpenChange={setNeedDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Necesidad" : "Add Need"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <Select value={needForm.category} onValueChange={(v) => setNeedForm({ ...needForm, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEED_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {isEs ? cat.labelEs : cat.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Input
                value={needForm.name}
                onChange={(e) => setNeedForm({ ...needForm, name: e.target.value })}
                placeholder={isEs ? "Ej: Proyector HD" : "E.g. HD Projector"}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Cantidad" : "Quantity"}</Label>
              <Input
                type="number"
                value={needForm.quantity}
                onChange={(e) => setNeedForm({ ...needForm, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Input
                value={needForm.notes}
                onChange={(e) => setNeedForm({ ...needForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNeedDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveNeed} className="bg-[#3A4D3F] hover:bg-[#2d3d31]" disabled={!needForm.name}>
              {isEs ? "Agregar" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Dialog */}
      <Dialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingActivity ? (isEs ? "Editar Actividad" : "Edit Activity") : (isEs ? "Agregar Actividad" : "Add Activity")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isEs ? "Título" : "Title"}</Label>
              <Input
                value={activityForm.title}
                onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                placeholder={isEs ? "Ej: Entrada de invitados" : "E.g. Guest arrival"}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Tipo" : "Type"}</Label>
              <Select value={activityForm.activity_type} onValueChange={(v) => setActivityForm({ ...activityForm, activity_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded ${type.color}`} />
                        {isEs ? type.labelEs : type.labelEn}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Hora inicio" : "Start time"}</Label>
                <Input
                  type="time"
                  value={activityForm.start_time}
                  onChange={(e) => setActivityForm({ ...activityForm, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Hora fin" : "End time"}</Label>
                <Input
                  type="time"
                  value={activityForm.end_time}
                  onChange={(e) => setActivityForm({ ...activityForm, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Responsable" : "Responsible"}</Label>
              <Input
                value={activityForm.responsible}
                onChange={(e) => setActivityForm({ ...activityForm, responsible: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                value={activityForm.notes}
                onChange={(e) => setActivityForm({ ...activityForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveActivity} className="bg-[#3A4D3F] hover:bg-[#2d3d31]" disabled={!activityForm.title || !activityForm.start_time}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Room Setup Card Component
function RoomSetupCard({ setup, isEs, isLocked, onEdit, onDelete, onAddNeed, onDeleteNeed, onAddActivity, onEditActivity, onDeleteActivity }) {
  const [expanded, setExpanded] = useState(true);
  const layoutInfo = LAYOUT_TYPES.find(l => l.value === setup.layout_type) || LAYOUT_TYPES[0];

  return (
    <Card data-testid={`room-setup-${setup.room_id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#3A4D3F]/10 rounded-lg text-2xl">
              {layoutInfo.icon}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {setup.room_name}
                <Badge variant="secondary" className="text-xs">
                  {isEs ? layoutInfo.labelEs : layoutInfo.labelEn}
                </Badge>
              </CardTitle>
              <CardDescription>{setup.venue_name}</CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isLocked && (
              <>
                <Button variant="ghost" size="sm" onClick={onEdit}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={onDelete}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {setup.planned_guests}/{setup.room_capacity} {isEs ? "invitados" : "guests"}
          </span>
          {setup.event_start_time && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {setup.event_start_time} - {setup.event_end_time || "?"}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Package className="w-4 h-4" />
            {setup.needs?.length || 0} {isEs ? "necesidades" : "needs"}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {setup.timeline?.length || 0} {isEs ? "actividades" : "activities"}
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Needs Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">{isEs ? "Necesidades / Requirements" : "Room Needs"}</h4>
              {!isLocked && (
                <Button variant="outline" size="sm" onClick={onAddNeed}>
                  <Plus className="w-3 h-3 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              )}
            </div>
            
            {setup.needs?.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {setup.needs.map((need) => {
                  const category = NEED_CATEGORIES.find(c => c.value === need.category);
                  const Icon = category?.icon || Package;
                  return (
                    <div key={need.item_id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{need.name}</span>
                        {need.quantity > 1 && (
                          <Badge variant="secondary" className="text-xs">x{need.quantity}</Badge>
                        )}
                      </div>
                      {!isLocked && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => onDeleteNeed(need.item_id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">{isEs ? "Sin necesidades registradas" : "No needs registered"}</p>
            )}
          </div>

          {/* Timeline Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">{isEs ? "Timeline del Salón" : "Room Timeline"}</h4>
              {!isLocked && (
                <Button variant="outline" size="sm" onClick={onAddActivity}>
                  <Plus className="w-3 h-3 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              )}
            </div>
            
            {setup.timeline?.length > 0 ? (
              <div className="space-y-2">
                {setup.timeline.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((activity) => {
                  const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activity_type) || ACTIVITY_TYPES[6];
                  return (
                    <div key={activity.activity_id} className="flex items-center gap-3 p-2 border rounded">
                      <div className={`w-1 h-8 rounded ${typeInfo.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{activity.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {activity.start_time} - {activity.end_time}
                          </span>
                        </div>
                        {activity.responsible && (
                          <p className="text-xs text-muted-foreground">{activity.responsible}</p>
                        )}
                      </div>
                      {!isLocked && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEditActivity(activity)}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => onDeleteActivity(activity.activity_id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">{isEs ? "Sin actividades registradas" : "No activities registered"}</p>
            )}
          </div>

          {/* Special Instructions */}
          {setup.special_instructions && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                {isEs ? "Instrucciones Especiales" : "Special Instructions"}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">{setup.special_instructions}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Master Timeline View Component - Visual Gantt-style Timeline
function MasterTimelineView({ roomSetups, masterTimeline, isEs }) {
  const [hoveredActivity, setHoveredActivity] = useState(null);
  const [viewMode, setViewMode] = useState("gantt"); // gantt | list

  if (roomSetups.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Clock className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-500">{isEs ? "Agrega salones para ver el timeline" : "Add rooms to see the timeline"}</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate time range from all activities and room schedules
  const getTimeRange = () => {
    let minHour = 24;
    let maxHour = 0;

    // From activities
    masterTimeline.forEach(t => {
      if (t.start_time) {
        const startH = parseInt(t.start_time.split(":")[0]);
        minHour = Math.min(minHour, startH);
      }
      if (t.end_time) {
        const endH = parseInt(t.end_time.split(":")[0]) + 1;
        maxHour = Math.max(maxHour, endH);
      }
    });

    // From room setup times
    roomSetups.forEach(setup => {
      if (setup.setup_start_time) {
        const h = parseInt(setup.setup_start_time.split(":")[0]);
        minHour = Math.min(minHour, h);
      }
      if (setup.breakdown_end_time) {
        const h = parseInt(setup.breakdown_end_time.split(":")[0]) + 1;
        maxHour = Math.max(maxHour, h);
      }
    });

    // Default range if no activities
    if (minHour > maxHour) {
      minHour = 8;
      maxHour = 22;
    }

    return { minHour: Math.max(0, minHour - 1), maxHour: Math.min(24, maxHour + 1) };
  };

  const { minHour, maxHour } = getTimeRange();
  const totalHours = maxHour - minHour;
  const hours = Array.from({ length: totalHours }, (_, i) => minHour + i);

  // Calculate position and width of activity bar
  const getActivityStyle = (activity) => {
    if (!activity.start_time || !activity.end_time) return { left: "0%", width: "0%" };
    
    const [startH, startM] = activity.start_time.split(":").map(Number);
    const [endH, endM] = activity.end_time.split(":").map(Number);
    
    const startMinutes = (startH - minHour) * 60 + startM;
    const endMinutes = (endH - minHour) * 60 + endM;
    const totalMinutes = totalHours * 60;
    
    const left = (startMinutes / totalMinutes) * 100;
    const width = ((endMinutes - startMinutes) / totalMinutes) * 100;
    
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - left, Math.max(2, width))}%`,
    };
  };

  // Room colors for visual distinction
  const roomColors = [
    { bg: "bg-blue-500", border: "border-blue-600", light: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-emerald-500", border: "border-emerald-600", light: "bg-emerald-100", text: "text-emerald-700" },
    { bg: "bg-purple-500", border: "border-purple-600", light: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-amber-500", border: "border-amber-600", light: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-rose-500", border: "border-rose-600", light: "bg-rose-100", text: "text-rose-700" },
  ];

  return (
    <div className="space-y-4" data-testid="master-timeline-view">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-3">
          {roomSetups.map((setup, idx) => {
            const colors = roomColors[idx % roomColors.length];
            return (
              <div key={setup.room_id} className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded ${colors.bg}`} />
                <span className="font-medium">{setup.room_name}</span>
                <span className="text-muted-foreground text-xs">
                  ({setup.timeline?.length || 0} {isEs ? "act." : "act."})
                </span>
              </div>
            );
          })}
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          <button
            onClick={() => setViewMode("gantt")}
            className={`px-3 py-1 text-xs rounded ${viewMode === "gantt" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            Gantt
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-1 text-xs rounded ${viewMode === "list" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {isEs ? "Lista" : "List"}
          </button>
        </div>
      </div>

      {/* Gantt View */}
      {viewMode === "gantt" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Time header */}
              <div className="flex border-b bg-muted/30">
                <div className="w-40 flex-shrink-0 p-3 font-medium text-sm border-r">
                  {isEs ? "Salón" : "Room"}
                </div>
                <div className="flex-1 flex">
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="flex-1 text-center text-xs py-2 border-r last:border-r-0 text-muted-foreground"
                      style={{ minWidth: "60px" }}
                    >
                      {hour.toString().padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
              </div>

              {/* Room rows */}
              {roomSetups.map((setup, roomIdx) => {
                const colors = roomColors[roomIdx % roomColors.length];
                const roomActivities = masterTimeline.filter(t => t.room_id === setup.room_id);

                return (
                  <div key={setup.room_id} className="flex border-b last:border-b-0 hover:bg-muted/20">
                    {/* Room name */}
                    <div className={`w-40 flex-shrink-0 p-3 border-r ${colors.light}`}>
                      <div className={`font-medium text-sm ${colors.text}`}>{setup.room_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {setup.venue_name}
                      </div>
                    </div>

                    {/* Timeline area */}
                    <div className="flex-1 relative" style={{ height: "80px" }}>
                      {/* Hour grid lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {hours.map((hour) => (
                          <div
                            key={hour}
                            className="flex-1 border-r border-dashed border-gray-200 dark:border-gray-700 last:border-r-0"
                            style={{ minWidth: "60px" }}
                          />
                        ))}
                      </div>

                      {/* Activity bars */}
                      <div className="absolute inset-0 p-2">
                        {roomActivities.map((activity, actIdx) => {
                          const style = getActivityStyle(activity);
                          const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activity_type);
                          const isHovered = hoveredActivity === activity.activity_id;

                          return (
                            <div
                              key={activity.activity_id}
                              className={`absolute h-10 rounded-md cursor-pointer transition-all duration-150 shadow-sm
                                ${typeInfo?.color || colors.bg} 
                                ${isHovered ? "ring-2 ring-offset-1 ring-black/20 shadow-md scale-[1.02] z-10" : ""}
                              `}
                              style={{
                                left: style.left,
                                width: style.width,
                                top: `${actIdx * 44 + 4}px`,
                              }}
                              onMouseEnter={() => setHoveredActivity(activity.activity_id)}
                              onMouseLeave={() => setHoveredActivity(null)}
                              data-testid={`timeline-activity-${activity.activity_id}`}
                            >
                              <div className="px-2 py-1 h-full flex flex-col justify-center overflow-hidden">
                                <div className="text-xs font-medium text-white truncate">
                                  {activity.title}
                                </div>
                                <div className="text-[10px] text-white/80 truncate">
                                  {activity.start_time} - {activity.end_time}
                                </div>
                              </div>

                              {/* Hover tooltip */}
                              {isHovered && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none">
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                                    <div className="font-semibold">{activity.title}</div>
                                    <div className="text-gray-300 mt-1">
                                      {activity.start_time} - {activity.end_time}
                                    </div>
                                    {activity.responsible && (
                                      <div className="text-gray-400 mt-0.5">
                                        {isEs ? "Responsable" : "Responsible"}: {activity.responsible}
                                      </div>
                                    )}
                                    {activity.notes && (
                                      <div className="text-gray-400 mt-0.5 max-w-[200px] truncate">
                                        {activity.notes}
                                      </div>
                                    )}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {roomActivities.length === 0 && (
                          <div className="flex items-center justify-center h-full text-xs text-muted-foreground italic">
                            {isEs ? "Sin actividades" : "No activities"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {masterTimeline.length > 0 ? (
                masterTimeline
                  .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))
                  .map((activity, idx) => {
                    const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activity_type);
                    const roomSetup = roomSetups.find(r => r.room_id === activity.room_id);
                    const roomIdx = roomSetups.findIndex(r => r.room_id === activity.room_id);
                    const colors = roomColors[roomIdx % roomColors.length] || roomColors[0];

                    return (
                      <div
                        key={activity.activity_id || idx}
                        className="flex items-stretch gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                      >
                        {/* Time */}
                        <div className="w-24 flex-shrink-0 text-center">
                          <div className="text-lg font-semibold">{activity.start_time || "--:--"}</div>
                          <div className="text-xs text-muted-foreground">
                            {activity.end_time ? `${isEs ? "hasta" : "to"} ${activity.end_time}` : ""}
                          </div>
                        </div>

                        {/* Color bar */}
                        <div className={`w-1 rounded-full ${typeInfo?.color || "bg-gray-400"}`} />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{activity.title}</span>
                            <Badge variant="secondary" className={`text-xs ${colors.light} ${colors.text}`}>
                              {activity.room_name || roomSetup?.room_name}
                            </Badge>
                          </div>
                          {activity.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{activity.description}</p>
                          )}
                          {activity.responsible && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <Users className="w-3 h-3 inline mr-1" />
                              {activity.responsible}
                            </p>
                          )}
                        </div>

                        {/* Type badge */}
                        <div className="flex-shrink-0">
                          <Badge className={`${typeInfo?.color || "bg-gray-500"} text-white text-xs`}>
                            {isEs ? typeInfo?.labelEs : typeInfo?.labelEn}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {isEs ? "No hay actividades en el timeline" : "No activities in timeline"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Type Legend */}
      <div className="flex flex-wrap gap-2 justify-center text-xs">
        {ACTIVITY_TYPES.map((type) => (
          <div key={type.value} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${type.color}`} />
            <span className="text-muted-foreground">{isEs ? type.labelEs : type.labelEn}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
