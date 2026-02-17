// components/RoomSetupTab.js - Room Setup & Timeline for Event Orchestration
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Copy,
  FileDown,
  Image,
  Sparkles,
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
import VisualLayoutEditor, { LayoutPreview } from "./VisualLayoutEditor";
import TimelineExport from "./TimelineExport";

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

  // Extract event info for export
  const eventName = event?.name || "";
  const eventDate = event?.event_date || event?.date;
  const guestCount = event?.guest_count || event?.guests || 0;

  const [loading, setLoading] = useState(true);
  const [roomSetups, setRoomSetups] = useState([]);
  const [venues, setVenues] = useState([]);
  const [masterTimeline, setMasterTimeline] = useState([]);
  const [activeView, setActiveView] = useState("rooms"); // rooms | timeline | templates
  
  // Dialog states
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [needDialogOpen, setNeedDialogOpen] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [editingNeed, setEditingNeed] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  
  // Copy from event state
  const [eventsWithSetups, setEventsWithSetups] = useState([]);
  const [selectedSourceEvent, setSelectedSourceEvent] = useState("");
  const [copyNeeds, setCopyNeeds] = useState(true);
  const [copyTimeline, setCopyTimeline] = useState(true);
  const [copying, setCopying] = useState(false);

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

  // Open copy dialog and fetch events with setups
  const handleOpenCopyDialog = async () => {
    try {
      const res = await axios.get(`${API}/orchestration/room-setup/events-with-setups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Filter out current event
      const filteredEvents = (res.data || []).filter(e => e.event_id !== eventId);
      setEventsWithSetups(filteredEvents);
      setSelectedSourceEvent("");
      setCopyNeeds(true);
      setCopyTimeline(true);
      setCopyDialogOpen(true);
    } catch (error) {
      toast.error(isEs ? "Error al cargar eventos" : "Error loading events");
    }
  };

  // Copy room setup from another event
  const handleCopyFromEvent = async () => {
    if (!selectedSourceEvent) return;
    
    const confirmMessage = isEs 
      ? "¿Estás seguro? Esto reemplazará la configuración actual de salones."
      : "Are you sure? This will replace the current room setup configuration.";
    
    if (!window.confirm(confirmMessage)) return;
    
    try {
      setCopying(true);
      const res = await axios.post(
        `${API}/orchestration/room-setup/events/${eventId}/copy-from/${selectedSourceEvent}?copy_needs=${copyNeeds}&copy_timeline=${copyTimeline}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(
        isEs 
          ? `Copiado: ${res.data.copied_rooms} salón(es) desde "${res.data.source_event}"`
          : `Copied: ${res.data.copied_rooms} room(s) from "${res.data.source_event}"`
      );
      setCopyDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al copiar" : "Error copying"));
    } finally {
      setCopying(false);
    }
  };

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

  // Handle activity time update from Gantt drag
  const handleUpdateActivityTime = async (updatedActivity) => {
    try {
      await axios.put(
        `${API}/orchestration/room-setup/events/${eventId}/rooms/${updatedActivity.room_id}/timeline/${updatedActivity.activity_id}`,
        {
          title: updatedActivity.title,
          activity_type: updatedActivity.activity_type,
          start_time: updatedActivity.start_time,
          end_time: updatedActivity.end_time,
          responsible: updatedActivity.responsible,
          notes: updatedActivity.notes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (error) {
      throw error;
    }
  };

  // Handle reorder activity from drag & drop
  const handleReorderActivity = async (movedActivity, newIndex, prevActivity, nextActivity) => {
    // Calculate new time based on surrounding activities
    let newStartTime = movedActivity.start_time;
    let newEndTime = movedActivity.end_time;
    
    // Get activity duration in minutes
    const getDuration = (start, end) => {
      if (!start || !end) return 60; // Default 1 hour
      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);
      return (endH * 60 + endM) - (startH * 60 + startM);
    };
    
    const duration = getDuration(movedActivity.start_time, movedActivity.end_time);
    
    // Calculate new start time based on position
    if (prevActivity && prevActivity.end_time) {
      // Start after previous activity ends
      newStartTime = prevActivity.end_time;
    } else if (nextActivity && nextActivity.start_time) {
      // End before next activity starts
      const [nextH, nextM] = nextActivity.start_time.split(":").map(Number);
      const totalMinutes = nextH * 60 + nextM - duration;
      newStartTime = `${Math.floor(totalMinutes / 60).toString().padStart(2, "0")}:${(totalMinutes % 60).toString().padStart(2, "0")}`;
    }
    
    // Calculate new end time
    const [newStartH, newStartM] = newStartTime.split(":").map(Number);
    const newEndMinutes = newStartH * 60 + newStartM + duration;
    newEndTime = `${Math.floor(newEndMinutes / 60).toString().padStart(2, "0")}:${(newEndMinutes % 60).toString().padStart(2, "0")}`;
    
    // Update on server
    await axios.put(
      `${API}/orchestration/room-setup/events/${eventId}/rooms/${movedActivity.room_id}/timeline/${movedActivity.activity_id}`,
      {
        title: movedActivity.title,
        description: movedActivity.description,
        start_time: newStartTime,
        end_time: newEndTime,
        activity_type: movedActivity.activity_type,
        responsible: movedActivity.responsible,
        notes: movedActivity.notes,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    // Refresh data
    fetchData();
  };

  // Handle reorder needs in room card
  const handleReorderNeeds = async (roomId, newNeeds) => {
    try {
      // Update all needs with new order
      await axios.put(
        `${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}`,
        { needs: newNeeds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(isEs ? "Orden actualizado" : "Order updated");
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al reordenar" : "Error reordering");
    }
  };

  // Handle reorder timeline in room card
  const handleReorderRoomTimeline = async (roomId, movedActivity, newIndex, prevActivity, nextActivity) => {
    try {
      // Calculate new times
      let newStartTime = movedActivity.start_time;
      let newEndTime = movedActivity.end_time;
      
      const getDuration = (start, end) => {
        if (!start || !end) return 60;
        const [startH, startM] = start.split(":").map(Number);
        const [endH, endM] = end.split(":").map(Number);
        return (endH * 60 + endM) - (startH * 60 + startM);
      };
      
      const duration = getDuration(movedActivity.start_time, movedActivity.end_time);
      
      if (prevActivity && prevActivity.end_time) {
        newStartTime = prevActivity.end_time;
      } else if (nextActivity && nextActivity.start_time) {
        const [nextH, nextM] = nextActivity.start_time.split(":").map(Number);
        const totalMinutes = nextH * 60 + nextM - duration;
        newStartTime = `${Math.floor(totalMinutes / 60).toString().padStart(2, "0")}:${(totalMinutes % 60).toString().padStart(2, "0")}`;
      }
      
      const [newStartH, newStartM] = newStartTime.split(":").map(Number);
      const newEndMinutes = newStartH * 60 + newStartM + duration;
      newEndTime = `${Math.floor(newEndMinutes / 60).toString().padStart(2, "0")}:${(newEndMinutes % 60).toString().padStart(2, "0")}`;
      
      await axios.put(
        `${API}/orchestration/room-setup/events/${eventId}/rooms/${roomId}/timeline/${movedActivity.activity_id}`,
        {
          title: movedActivity.title,
          description: movedActivity.description,
          start_time: newStartTime,
          end_time: newEndTime,
          activity_type: movedActivity.activity_type,
          responsible: movedActivity.responsible,
          notes: movedActivity.notes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(isEs ? "Orden actualizado" : "Order updated");
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al reordenar" : "Error reordering");
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
              <TabsTrigger value="templates" className="text-xs">
                <Sparkles className="w-4 h-4 mr-1" />
                Templates
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex items-center gap-2">
            {/* Export Button - Always visible when there's data */}
            {(roomSetups.length > 0 || masterTimeline.length > 0) && (
              <TimelineExport
                eventName={eventName}
                eventDate={eventDate}
                guestCount={guestCount}
                roomSetups={roomSetups}
                masterTimeline={masterTimeline}
                venueName={roomSetups[0]?.venue_name}
              />
            )}
            
            {!isLocked && activeView !== "templates" && (
              <>
                <Button 
                  onClick={handleOpenCopyDialog} 
                  variant="outline"
                  className="text-sm"
                  data-testid="copy-setup-btn"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  {isEs ? "Copiar de otro evento" : "Copy from event"}
                </Button>
                <Button onClick={handleAddRoom} className="bg-[#3A4D3F] hover:bg-[#2d3d31]">
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar Salón" : "Add Room"}
                </Button>
              </>
            )}
          </div>
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
                  {isEs ? "Agrega salones, usa un template o copia de otro evento" : "Add rooms, use a template, or copy from another event"}
                </p>
                {!isLocked && (
                  <div className="flex gap-2">
                    <Button onClick={() => setActiveView("templates")} variant="outline">
                      <Sparkles className="w-4 h-4 mr-1" />
                      Templates
                    </Button>
                    <Button onClick={handleOpenCopyDialog} variant="outline">
                      <Copy className="w-4 h-4 mr-1" />
                      {isEs ? "Copiar" : "Copy"}
                    </Button>
                    <Button onClick={handleAddRoom} variant="outline">
                      <Plus className="w-4 h-4 mr-1" />
                      {isEs ? "Agregar Salón" : "Add Room"}
                    </Button>
                  </div>
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
                eventId={eventId}
                token={token}
                onEdit={() => handleEditRoom(setup)}
                onDelete={() => handleDeleteRoom(setup.room_id)}
                onAddNeed={() => handleAddNeed(setup)}
                onDeleteNeed={(itemId) => handleDeleteNeed(setup.room_id, itemId)}
                onAddActivity={() => handleAddActivity(setup)}
                onEditActivity={(activity) => handleEditActivity(setup, activity)}
                onDeleteActivity={(activityId) => handleDeleteActivity(setup.room_id, activityId)}
                onReorderNeeds={handleReorderNeeds}
                onReorderTimeline={handleReorderRoomTimeline}
                onLayoutUpdate={fetchData}
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
          eventId={eventId}
          isLocked={isLocked}
          onReorderActivity={handleReorderActivity}
        />
      )}

      {/* Templates View */}
      {activeView === "templates" && (
        <TemplatesView
          token={token}
          eventId={eventId}
          venues={venues}
          isEs={isEs}
          isLocked={isLocked}
          onApplyTemplate={fetchData}
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

      {/* Copy from Event Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-5 h-5 text-[#3A4D3F]" />
              {isEs ? "Copiar Configuración de Salones" : "Copy Room Setup"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isEs 
                ? "Selecciona un evento anterior para copiar su configuración de salones. Esto incluirá los layouts, necesidades y timeline."
                : "Select a previous event to copy its room setup configuration. This will include layouts, needs, and timeline."
              }
            </p>

            {eventsWithSetups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Copy className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{isEs ? "No hay otros eventos con configuraciones de salón" : "No other events with room setups"}</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{isEs ? "Seleccionar Evento" : "Select Event"}</Label>
                  <Select value={selectedSourceEvent} onValueChange={setSelectedSourceEvent}>
                    <SelectTrigger>
                      <SelectValue placeholder={isEs ? "Elige un evento..." : "Choose an event..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {eventsWithSetups.map((evt) => (
                        <SelectItem key={evt.event_id} value={evt.event_id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{evt.event_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {evt.room_count} {isEs ? "salón(es)" : "room(s)"} • {evt.total_needs} {isEs ? "necesidades" : "needs"} • {evt.total_activities} {isEs ? "actividades" : "activities"}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedSourceEvent && (
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <h4 className="font-medium text-sm">{isEs ? "¿Qué copiar?" : "What to copy?"}</h4>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{isEs ? "Necesidades / Requirements" : "Room Needs"}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={copyNeeds}
                        onChange={(e) => setCopyNeeds(e.target.checked)}
                        className="w-4 h-4 accent-[#3A4D3F]"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{isEs ? "Timeline / Actividades" : "Timeline / Activities"}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={copyTimeline}
                        onChange={(e) => setCopyTimeline(e.target.checked)}
                        className="w-4 h-4 accent-[#3A4D3F]"
                      />
                    </div>
                    
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      ⚠️ {isEs 
                        ? "Esto reemplazará la configuración actual de este evento."
                        : "This will replace the current setup for this event."
                      }
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleCopyFromEvent} 
              className="bg-[#3A4D3F] hover:bg-[#2d3d31]" 
              disabled={!selectedSourceEvent || copying}
            >
              {copying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {isEs ? "Copiando..." : "Copying..."}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  {isEs ? "Copiar Configuración" : "Copy Setup"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Room Setup Card Component with Drag & Drop
function RoomSetupCard({ setup, isEs, isLocked, eventId, token, onEdit, onDelete, onAddNeed, onDeleteNeed, onAddActivity, onEditActivity, onDeleteActivity, onReorderNeeds, onReorderTimeline, onLayoutUpdate }) {
  const [expanded, setExpanded] = useState(true);
  const [needsActiveId, setNeedsActiveId] = useState(null);
  const [timelineActiveId, setTimelineActiveId] = useState(null);
  const [localNeeds, setLocalNeeds] = useState(setup.needs || []);
  const [localTimeline, setLocalTimeline] = useState(setup.timeline || []);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", category: "custom" });
  
  const layoutInfo = LAYOUT_TYPES.find(l => l.value === setup.layout_type) || LAYOUT_TYPES[0];

  const TEMPLATE_CATEGORIES_CARD = [
    { value: "wedding", labelEs: "Boda", labelEn: "Wedding", icon: "💒" },
    { value: "corporate", labelEs: "Corporativo", labelEn: "Corporate", icon: "🏢" },
    { value: "social", labelEs: "Social", labelEn: "Social", icon: "🎉" },
    { value: "gala", labelEs: "Gala", labelEn: "Gala", icon: "🌟" },
    { value: "custom", labelEs: "Personalizado", labelEn: "Custom", icon: "✨" },
  ];

  // Save room as template
  const handleSaveAsTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    try {
      setSavingTemplate(true);
      await axios.post(
        `${API}/orchestration/room-setup/templates/create-from-room/${eventId}/${setup.room_id}?template_name=${encodeURIComponent(templateForm.name)}&template_description=${encodeURIComponent(templateForm.description)}&category=${templateForm.category}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(isEs ? "Template creado exitosamente" : "Template created successfully");
      setSaveTemplateDialogOpen(false);
      setTemplateForm({ name: "", description: "", category: "custom" });
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al crear template" : "Error creating template"));
    } finally {
      setSavingTemplate(false);
    }
  };

  // Sync local state with props
  useEffect(() => {
    setLocalNeeds(setup.needs || []);
    setLocalTimeline((setup.timeline || []).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")));
  }, [setup.needs, setup.timeline]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Handle needs drag end
  const handleNeedsDragEnd = async (event) => {
    const { active, over } = event;
    setNeedsActiveId(null);
    if (!over || active.id === over.id || isLocked) return;

    const oldIndex = localNeeds.findIndex(item => item.item_id === active.id);
    const newIndex = localNeeds.findIndex(item => item.item_id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newNeeds = arrayMove(localNeeds, oldIndex, newIndex);
      setLocalNeeds(newNeeds);
      if (onReorderNeeds) {
        await onReorderNeeds(setup.room_id, newNeeds);
      }
    }
  };

  // Handle timeline drag end
  const handleTimelineDragEnd = async (event) => {
    const { active, over } = event;
    setTimelineActiveId(null);
    if (!over || active.id === over.id || isLocked) return;

    const oldIndex = localTimeline.findIndex(item => item.activity_id === active.id);
    const newIndex = localTimeline.findIndex(item => item.activity_id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newTimeline = arrayMove(localTimeline, oldIndex, newIndex);
      setLocalTimeline(newTimeline);
      if (onReorderTimeline) {
        await onReorderTimeline(setup.room_id, newTimeline[newIndex], newIndex, newTimeline[newIndex - 1], newTimeline[newIndex + 1]);
      }
    }
  };

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
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSaveTemplateDialogOpen(true)}
                  title={isEs ? "Guardar como Template" : "Save as Template"}
                  data-testid="save-as-template-btn"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
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
          {/* Visual Layout Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Image className="w-4 h-4 text-muted-foreground" />
                {isEs ? "Diagrama de Layout" : "Layout Diagram"}
              </h4>
              {!isLocked && (
                <Button variant="outline" size="sm" onClick={() => setShowLayoutEditor(!showLayoutEditor)}>
                  {showLayoutEditor ? (isEs ? "Ocultar" : "Hide") : (isEs ? "Editar" : "Edit")}
                </Button>
              )}
            </div>
            
            {showLayoutEditor ? (
              <VisualLayoutEditor
                eventId={eventId}
                roomId={setup.room_id}
                currentDiagramUrl={setup.layout_diagram_url}
                layoutType={setup.layout_type}
                token={token}
                onUpdate={onLayoutUpdate}
                readOnly={isLocked}
              />
            ) : (
              <div className="aspect-[16/9] max-h-48 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden">
                <LayoutPreview 
                  layoutType={setup.layout_type} 
                  diagramUrl={setup.layout_diagram_url}
                  className="w-full h-full"
                />
              </div>
            )}
          </div>

          {/* Needs Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                {isEs ? "Necesidades / Requirements" : "Room Needs"}
                {!isLocked && localNeeds.length > 1 && (
                  <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                    <Move className="w-3 h-3" />
                    {isEs ? "arrastra" : "drag"}
                  </span>
                )}
              </h4>
              {!isLocked && (
                <Button variant="outline" size="sm" onClick={onAddNeed}>
                  <Plus className="w-3 h-3 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              )}
            </div>
            
            {localNeeds.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e) => setNeedsActiveId(e.active.id)}
                onDragEnd={handleNeedsDragEnd}
              >
                <SortableContext items={localNeeds.map(n => n.item_id)} strategy={verticalListSortingStrategy}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {localNeeds.map((need) => (
                      <SortableNeedItem
                        key={need.item_id}
                        need={need}
                        isLocked={isLocked}
                        onDelete={() => onDeleteNeed(need.item_id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="text-sm text-gray-400 italic">{isEs ? "Sin necesidades registradas" : "No needs registered"}</p>
            )}
          </div>

          {/* Timeline Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                {isEs ? "Timeline del Salón" : "Room Timeline"}
                {!isLocked && localTimeline.length > 1 && (
                  <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                    <Move className="w-3 h-3" />
                    {isEs ? "arrastra" : "drag"}
                  </span>
                )}
              </h4>
              {!isLocked && (
                <Button variant="outline" size="sm" onClick={onAddActivity}>
                  <Plus className="w-3 h-3 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              )}
            </div>
            
            {localTimeline.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e) => setTimelineActiveId(e.active.id)}
                onDragEnd={handleTimelineDragEnd}
              >
                <SortableContext items={localTimeline.map(a => a.activity_id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {localTimeline.map((activity) => (
                      <SortableTimelineItem
                        key={activity.activity_id}
                        activity={activity}
                        isLocked={isLocked}
                        onEdit={() => onEditActivity(activity)}
                        onDelete={() => onDeleteActivity(activity.activity_id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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

      {/* Save as Template Dialog */}
      <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#3A4D3F]" />
              {isEs ? "Guardar como Template" : "Save as Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? `Se creará un template basado en la configuración de "${setup.room_name}" incluyendo el layout, ${localNeeds.length} necesidades y ${localTimeline.length} actividades.`
                  : `A template will be created based on "${setup.room_name}" setup including the layout, ${localNeeds.length} needs and ${localTimeline.length} activities.`
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Nombre del Template" : "Template Name"} *</Label>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder={isEs ? "Ej: Mi Setup Personalizado" : "E.g., My Custom Setup"}
                data-testid="template-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder={isEs ? "Describe el template para referencia futura..." : "Describe the template for future reference..."}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <Select value={templateForm.category} onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES_CARD.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.icon} {isEs ? cat.labelEs : cat.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleSaveAsTemplate} 
              className="bg-[#3A4D3F] hover:bg-[#2d3d31]" 
              disabled={savingTemplate || !templateForm.name.trim()}
              data-testid="save-template-confirm-btn"
            >
              {savingTemplate ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {isEs ? "Guardando..." : "Saving..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1" />
                  {isEs ? "Guardar Template" : "Save Template"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Master Timeline View Component - Visual Gantt-style Timeline with Drag & Drop
function MasterTimelineView({ roomSetups, masterTimeline, isEs, onReorderActivity, eventId, isLocked, onUpdateActivityTime }) {
  const [hoveredActivity, setHoveredActivity] = useState(null);
  const [viewMode, setViewMode] = useState("gantt"); // gantt | list
  const [activeId, setActiveId] = useState(null);
  const [localTimeline, setLocalTimeline] = useState([]);
  
  // Gantt drag state
  const [draggingActivity, setDraggingActivity] = useState(null);
  const [dragMode, setDragMode] = useState(null); // 'move' | 'resize-start' | 'resize-end'
  const [dragStartX, setDragStartX] = useState(0);
  const [originalTimes, setOriginalTimes] = useState({ start: "", end: "" });
  const timelineRef = useRef(null);

  // Sync local timeline with prop
  useEffect(() => {
    setLocalTimeline([...masterTimeline].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")));
  }, [masterTimeline]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for list view
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id || isLocked) return;

    const oldIndex = localTimeline.findIndex(item => item.activity_id === active.id);
    const newIndex = localTimeline.findIndex(item => item.activity_id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newTimeline = arrayMove(localTimeline, oldIndex, newIndex);
      setLocalTimeline(newTimeline);

      // Calculate new times based on position
      const movedActivity = newTimeline[newIndex];
      const prevActivity = newIndex > 0 ? newTimeline[newIndex - 1] : null;
      const nextActivity = newIndex < newTimeline.length - 1 ? newTimeline[newIndex + 1] : null;

      // Update activity order on server if callback provided
      if (onReorderActivity) {
        try {
          await onReorderActivity(movedActivity, newIndex, prevActivity, nextActivity);
          toast.success(isEs ? "Orden actualizado" : "Order updated");
        } catch (error) {
          // Revert on error
          setLocalTimeline([...masterTimeline].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")));
          toast.error(isEs ? "Error al reordenar" : "Error reordering");
        }
      }
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

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

  // Convert pixel position to time string
  const pixelToTime = (pixelX, containerWidth) => {
    const percentage = pixelX / containerWidth;
    const totalMinutes = totalHours * 60;
    const minutes = Math.round((percentage * totalMinutes) / 5) * 5; // Round to nearest 5 minutes
    const adjustedMinutes = Math.max(0, Math.min(totalMinutes, minutes));
    const hour = minHour + Math.floor(adjustedMinutes / 60);
    const min = adjustedMinutes % 60;
    return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
  };

  // Handle Gantt bar drag start
  const handleGanttDragStart = (e, activity, mode) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    
    setDraggingActivity(activity);
    setDragMode(mode);
    setDragStartX(e.clientX);
    setOriginalTimes({ start: activity.start_time, end: activity.end_time });
    
    // Add global mouse handlers
    document.addEventListener("mousemove", handleGanttDragMove);
    document.addEventListener("mouseup", handleGanttDragEnd);
  };

  // Handle Gantt bar drag move
  const handleGanttDragMove = useCallback((e) => {
    if (!draggingActivity || !timelineRef.current) return;
    
    const containerRect = timelineRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const deltaX = e.clientX - dragStartX;
    const deltaPercentage = deltaX / containerWidth;
    const deltaMinutes = Math.round((deltaPercentage * totalHours * 60) / 5) * 5;
    
    // Parse original times
    const [startH, startM] = originalTimes.start.split(":").map(Number);
    const [endH, endM] = originalTimes.end.split(":").map(Number);
    const originalStartMinutes = startH * 60 + startM;
    const originalEndMinutes = endH * 60 + endM;
    const duration = originalEndMinutes - originalStartMinutes;
    
    let newStartMinutes, newEndMinutes;
    
    if (dragMode === "move") {
      // Move entire bar
      newStartMinutes = originalStartMinutes + deltaMinutes;
      newEndMinutes = originalEndMinutes + deltaMinutes;
      
      // Clamp to time range
      if (newStartMinutes < minHour * 60) {
        newStartMinutes = minHour * 60;
        newEndMinutes = newStartMinutes + duration;
      }
      if (newEndMinutes > maxHour * 60) {
        newEndMinutes = maxHour * 60;
        newStartMinutes = newEndMinutes - duration;
      }
    } else if (dragMode === "resize-start") {
      // Resize from start
      newStartMinutes = Math.max(minHour * 60, Math.min(originalEndMinutes - 15, originalStartMinutes + deltaMinutes));
      newEndMinutes = originalEndMinutes;
    } else if (dragMode === "resize-end") {
      // Resize from end
      newStartMinutes = originalStartMinutes;
      newEndMinutes = Math.min(maxHour * 60, Math.max(originalStartMinutes + 15, originalEndMinutes + deltaMinutes));
    }
    
    // Convert back to time strings
    const newStartTime = `${Math.floor(newStartMinutes / 60).toString().padStart(2, "0")}:${(newStartMinutes % 60).toString().padStart(2, "0")}`;
    const newEndTime = `${Math.floor(newEndMinutes / 60).toString().padStart(2, "0")}:${(newEndMinutes % 60).toString().padStart(2, "0")}`;
    
    // Update local timeline for immediate feedback
    setLocalTimeline(prev => prev.map(a => 
      a.activity_id === draggingActivity.activity_id 
        ? { ...a, start_time: newStartTime, end_time: newEndTime }
        : a
    ));
  }, [draggingActivity, dragStartX, dragMode, originalTimes, minHour, maxHour, totalHours]);

  // Handle Gantt bar drag end
  const handleGanttDragEnd = useCallback(async () => {
    document.removeEventListener("mousemove", handleGanttDragMove);
    document.removeEventListener("mouseup", handleGanttDragEnd);
    
    if (!draggingActivity) return;
    
    // Find the updated activity from local timeline
    const updatedActivity = localTimeline.find(a => a.activity_id === draggingActivity.activity_id);
    
    if (updatedActivity && (updatedActivity.start_time !== originalTimes.start || updatedActivity.end_time !== originalTimes.end)) {
      // Call the update callback
      if (onUpdateActivityTime) {
        try {
          await onUpdateActivityTime(updatedActivity);
          toast.success(isEs ? "Tiempo actualizado" : "Time updated");
        } catch (error) {
          // Revert on error
          setLocalTimeline(prev => prev.map(a => 
            a.activity_id === draggingActivity.activity_id 
              ? { ...a, start_time: originalTimes.start, end_time: originalTimes.end }
              : a
          ));
          toast.error(isEs ? "Error al actualizar" : "Error updating");
        }
      }
    }
    
    setDraggingActivity(null);
    setDragMode(null);
  }, [draggingActivity, localTimeline, originalTimes, onUpdateActivityTime, isEs, handleGanttDragMove]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleGanttDragMove);
      document.removeEventListener("mouseup", handleGanttDragEnd);
    };
  }, [handleGanttDragMove, handleGanttDragEnd]);

  // Room colors for visual distinction
  const roomColors = [
    { bg: "bg-blue-500", border: "border-blue-600", light: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-emerald-500", border: "border-emerald-600", light: "bg-emerald-100", text: "text-emerald-700" },
    { bg: "bg-purple-500", border: "border-purple-600", light: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-amber-500", border: "border-amber-600", light: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-rose-500", border: "border-rose-600", light: "bg-rose-100", text: "text-rose-700" },
  ];

  // Get active item for drag overlay
  const activeActivity = activeId ? localTimeline.find(a => a.activity_id === activeId) : null;

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
        <div className="flex items-center gap-2">
          {!isLocked && viewMode === "gantt" && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
              <Move className="w-3 h-3" />
              <span>{isEs ? "Arrastra barras para ajustar" : "Drag bars to adjust"}</span>
            </div>
          )}
          {!isLocked && viewMode === "list" && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
              <Move className="w-3 h-3" />
              <span>{isEs ? "Arrastra para reordenar" : "Drag to reorder"}</span>
            </div>
          )}
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
                    <div 
                      className="flex-1 relative" 
                      style={{ height: "80px" }}
                      ref={roomIdx === 0 ? timelineRef : null}
                    >
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
                          // Use local timeline for real-time updates during drag
                          const localActivity = localTimeline.find(a => a.activity_id === activity.activity_id) || activity;
                          const style = getActivityStyle(localActivity);
                          const typeInfo = ACTIVITY_TYPES.find(t => t.value === localActivity.activity_type);
                          const isHovered = hoveredActivity === localActivity.activity_id;
                          const isDragging = draggingActivity?.activity_id === localActivity.activity_id;

                          return (
                            <div
                              key={localActivity.activity_id}
                              className={`absolute h-10 rounded-md transition-all shadow-sm group
                                ${typeInfo?.color || colors.bg} 
                                ${isHovered && !isDragging ? "ring-2 ring-offset-1 ring-black/20 shadow-md scale-[1.02] z-10" : ""}
                                ${isDragging ? "ring-2 ring-offset-2 ring-white shadow-lg z-20 opacity-90" : ""}
                                ${!isLocked ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                              `}
                              style={{
                                left: style.left,
                                width: style.width,
                                top: `${actIdx * 44 + 4}px`,
                              }}
                              onMouseEnter={() => !isDragging && setHoveredActivity(localActivity.activity_id)}
                              onMouseLeave={() => !isDragging && setHoveredActivity(null)}
                              onMouseDown={(e) => !isLocked && handleGanttDragStart(e, localActivity, "move")}
                              data-testid={`timeline-activity-${localActivity.activity_id}`}
                            >
                              {/* Left resize handle */}
                              {!isLocked && (
                                <div
                                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-l-md transition-opacity"
                                  onMouseDown={(e) => handleGanttDragStart(e, localActivity, "resize-start")}
                                />
                              )}
                              
                              <div className="px-2 py-1 h-full flex flex-col justify-center overflow-hidden">
                                <div className="text-xs font-medium text-white truncate">
                                  {localActivity.title}
                                </div>
                                <div className="text-[10px] text-white/80 truncate">
                                  {localActivity.start_time} - {localActivity.end_time}
                                </div>
                              </div>

                              {/* Right resize handle */}
                              {!isLocked && (
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-r-md transition-opacity"
                                  onMouseDown={(e) => handleGanttDragStart(e, localActivity, "resize-end")}
                                />
                              )}

                              {/* Hover tooltip */}
                              {isHovered && !isDragging && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none">
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                                    <div className="font-semibold">{localActivity.title}</div>
                                    <div className="text-gray-300 mt-1">
                                      {localActivity.start_time} - {localActivity.end_time}
                                    </div>
                                    {localActivity.responsible && (
                                      <div className="text-gray-400 mt-0.5">
                                        Responsible: {localActivity.responsible}
                                      </div>
                                    )}
                                    {!isLocked && (
                                      <div className="text-blue-300 mt-1 text-[10px]">
                                        Drag to move • Edges to resize
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
                            No activities
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

      {/* List View with Drag & Drop */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localTimeline.map(a => a.activity_id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {localTimeline.length > 0 ? (
                    localTimeline.map((activity, idx) => (
                      <SortableActivityItem
                        key={activity.activity_id || idx}
                        activity={activity}
                        roomSetups={roomSetups}
                        roomColors={roomColors}
                        isEs={isEs}
                        isLocked={isLocked}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      {isEs ? "No hay actividades en el timeline" : "No activities in timeline"}
                    </div>
                  )}
                </div>
              </SortableContext>

              {/* Drag Overlay */}
              <DragOverlay>
                {activeActivity ? (
                  <ActivityItemContent
                    activity={activeActivity}
                    roomSetups={roomSetups}
                    roomColors={roomColors}
                    isEs={isEs}
                    isDragging={true}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
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

// Sortable Activity Item Component
function SortableActivityItem({ activity, roomSetups, roomColors, isEs, isLocked }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.activity_id, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ActivityItemContent
        activity={activity}
        roomSetups={roomSetups}
        roomColors={roomColors}
        isEs={isEs}
        dragHandleProps={{ ...attributes, ...listeners }}
        isLocked={isLocked}
      />
    </div>
  );
}

// Activity Item Content (shared between sortable and overlay)
function ActivityItemContent({ activity, roomSetups, roomColors, isEs, dragHandleProps, isLocked, isDragging }) {
  const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activity_type);
  const roomSetup = roomSetups.find(r => r.room_id === activity.room_id);
  const roomIdx = roomSetups.findIndex(r => r.room_id === activity.room_id);
  const colors = roomColors[roomIdx % roomColors.length] || roomColors[0];

  return (
    <div
      className={`flex items-stretch gap-3 p-3 rounded-lg border bg-background transition-colors
        ${isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:bg-muted/30"}
      `}
      data-testid={`list-activity-${activity.activity_id}`}
    >
      {/* Drag Handle */}
      {!isLocked && (
        <div
          {...dragHandleProps}
          className="flex items-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-5 h-5 text-muted-foreground hover:text-foreground" />
        </div>
      )}

      {/* Time */}
      <div className="w-20 flex-shrink-0 text-center">
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
      <div className="flex-shrink-0 self-center">
        <Badge className={`${typeInfo?.color || "bg-gray-500"} text-white text-xs`}>
          {isEs ? typeInfo?.labelEs : typeInfo?.labelEn}
        </Badge>
      </div>
    </div>
  );
}


// Sortable Need Item Component
function SortableNeedItem({ need, isLocked, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: need.item_id, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const category = NEED_CATEGORIES.find(c => c.value === need.category);
  const Icon = category?.icon || Package;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded ${isDragging ? "ring-2 ring-primary/30 shadow-md" : ""}`}
    >
      <div className="flex items-center gap-2">
        {!isLocked && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
            <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600" />
          </div>
        )}
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-sm">{need.name}</span>
        {need.quantity > 1 && (
          <Badge variant="secondary" className="text-xs">x{need.quantity}</Badge>
        )}
      </div>
      {!isLocked && (
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={onDelete}>
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

// Sortable Timeline Item Component (for Room Card)
function SortableTimelineItem({ activity, isLocked, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.activity_id, disabled: isLocked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activity_type) || ACTIVITY_TYPES[6];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-2 border rounded ${isDragging ? "ring-2 ring-primary/30 shadow-md bg-background" : ""}`}
    >
      {!isLocked && (
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600" />
        </div>
      )}
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
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
            <Edit2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}


// Templates View Component
function TemplatesView({ token, eventId, venues, isEs, isLocked, onApplyTemplate }) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [applyForm, setApplyForm] = useState({ venue_id: "", room_id: "" });
  const [applying, setApplying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateForm, setDuplicateForm] = useState({ name: "", description: "" });
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    category: "custom",
    layout_type: "banquet",
    layout_notes: "",
    min_capacity: 0,
    max_capacity: 0,
  });

  const TEMPLATE_CATEGORIES = [
    { value: "wedding", labelEs: "Boda", labelEn: "Wedding", icon: "💒" },
    { value: "corporate", labelEs: "Corporativo", labelEn: "Corporate", icon: "🏢" },
    { value: "social", labelEs: "Social", labelEn: "Social", icon: "🎉" },
    { value: "conference", labelEs: "Conferencia", labelEn: "Conference", icon: "🎤" },
    { value: "gala", labelEs: "Gala", labelEn: "Gala", icon: "🌟" },
    { value: "custom", labelEs: "Personalizado", labelEn: "Custom", icon: "✨" },
  ];

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      // Seed system templates first (idempotent operation)
      await axios.post(`${API}/orchestration/room-setup/templates/seed-system`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      
      const params = selectedCategory !== "all" ? `?category=${selectedCategory}` : "";
      const res = await axios.get(`${API}/orchestration/room-setup/templates${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Deduplicate templates by template_id to avoid React key conflicts
      const templatesData = res.data || [];
      const seen = new Set();
      const uniqueTemplates = templatesData.filter(t => {
        if (seen.has(t.template_id)) return false;
        seen.add(t.template_id);
        return true;
      });
      
      setTemplates(uniqueTemplates);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [token, selectedCategory]);

  const handleApplyTemplate = (template) => {
    setSelectedTemplate(template);
    setApplyForm({ venue_id: "", room_id: "" });
    setApplyDialogOpen(true);
  };

  const handleOpenCreateDialog = () => {
    setCreateForm({
      name: "",
      description: "",
      category: "custom",
      layout_type: "banquet",
      layout_notes: "",
      min_capacity: 0,
      max_capacity: 0,
    });
    setCreateDialogOpen(true);
  };

  const handleCreateTemplate = async () => {
    if (!createForm.name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }

    try {
      setCreating(true);
      await axios.post(`${API}/orchestration/room-setup/templates`, createForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(isEs ? "Template creado exitosamente" : "Template created successfully");
      setCreateDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al crear template" : "Error creating template"));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTemplate = async (template, e) => {
    e.stopPropagation();
    if (template.is_system_template) {
      toast.error(isEs ? "No se puede eliminar template del sistema" : "Cannot delete system template");
      return;
    }
    if (!window.confirm(isEs ? `¿Eliminar template "${template.name}"?` : `Delete template "${template.name}"?`)) return;

    try {
      await axios.delete(`${API}/orchestration/room-setup/templates/${template.template_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(isEs ? "Template eliminado" : "Template deleted");
      fetchTemplates();
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  const handleOpenDuplicateDialog = (template, e) => {
    e.stopPropagation();
    setSelectedTemplate(template);
    setDuplicateForm({
      name: `${template.name} (${isEs ? "Copia" : "Copy"})`,
      description: template.description || "",
    });
    setDuplicateDialogOpen(true);
  };

  const handleDuplicateTemplate = async () => {
    if (!duplicateForm.name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }

    try {
      setDuplicating(true);
      await axios.post(
        `${API}/orchestration/room-setup/templates/${selectedTemplate.template_id}/duplicate?new_name=${encodeURIComponent(duplicateForm.name)}&new_description=${encodeURIComponent(duplicateForm.description)}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(isEs ? "Template duplicado exitosamente" : "Template duplicated successfully");
      setDuplicateDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al duplicar" : "Error duplicating"));
    } finally {
      setDuplicating(false);
    }
  };

  const handleConfirmApply = async () => {
    if (!applyForm.venue_id || !applyForm.room_id) {
      toast.error(isEs ? "Selecciona sede y salón" : "Select venue and room");
      return;
    }

    try {
      setApplying(true);
      await axios.post(
        `${API}/orchestration/room-setup/templates/${selectedTemplate.template_id}/apply/${eventId}?room_id=${applyForm.room_id}&venue_id=${applyForm.venue_id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(isEs ? "Template aplicado exitosamente" : "Template applied successfully");
      setApplyDialogOpen(false);
      if (onApplyTemplate) onApplyTemplate();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al aplicar" : "Error applying"));
    } finally {
      setApplying(false);
    }
  };

  const getCategoryInfo = (cat) => TEMPLATE_CATEGORIES.find(c => c.value === cat) || TEMPLATE_CATEGORIES[5];
  const getLayoutInfo = (layout) => LAYOUT_TYPES.find(l => l.value === layout) || LAYOUT_TYPES[0];
  const selectedVenue = venues.find(v => v.venue_id === applyForm.venue_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#3A4D3F]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Filter and Create Button */}
      <div className="flex items-center justify-between">
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={isEs ? "Filtrar por categoría" : "Filter by category"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todas las categorías" : "All categories"}</SelectItem>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.icon} {isEs ? cat.labelEs : cat.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleOpenCreateDialog} className="bg-[#3A4D3F] hover:bg-[#2d3d31]">
          <Plus className="w-4 h-4 mr-1" />
          {isEs ? "Crear Template" : "Create Template"}
        </Button>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">{isEs ? "No hay templates disponibles" : "No templates available"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const catInfo = getCategoryInfo(template.category);
            const layoutInfo = getLayoutInfo(template.layout_type);

            return (
              <Card 
                key={template.template_id}
                className={`hover:shadow-md transition-shadow ${template.is_system_template ? "border-amber-200/50" : ""}`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => !isLocked && handleApplyTemplate(template)}>
                      <span className="text-3xl">{catInfo.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold truncate">{template.name}</h4>
                        {template.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Duplicate button - available for all templates */}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                        onClick={(e) => handleOpenDuplicateDialog(template, e)}
                        title={isEs ? "Duplicar template" : "Duplicate template"}
                        data-testid={`duplicate-template-${template.template_id}`}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      {/* Delete button - only for custom templates */}
                      {!template.is_system_template && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={(e) => handleDeleteTemplate(template, e)}
                          title={isEs ? "Eliminar template" : "Delete template"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Visual Layout Preview */}
                  <div className="aspect-video bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden">
                    <LayoutPreview layoutType={template.layout_type} diagramUrl={template.layout_diagram_url} className="w-full h-full" />
                  </div>

                  {/* Info Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <Layout className="w-3 h-3 mr-1" />
                      {isEs ? layoutInfo.labelEs : layoutInfo.labelEn}
                    </Badge>
                    {template.default_needs?.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Package className="w-3 h-3 mr-1" />
                        {template.default_needs.length}
                      </Badge>
                    )}
                    {template.default_timeline?.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {template.default_timeline.length}
                      </Badge>
                    )}
                    {template.is_system_template && (
                      <Badge className="text-xs bg-amber-100 text-amber-700">Sistema</Badge>
                    )}
                  </div>

                  {!isLocked && (
                    <Button variant="outline" className="w-full" size="sm">
                      <FileDown className="w-4 h-4 mr-1" />
                      {isEs ? "Usar Template" : "Use Template"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Apply Template Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#3A4D3F]" />
              {isEs ? "Aplicar Template" : "Apply Template"}
            </DialogTitle>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{getCategoryInfo(selectedTemplate.category).icon}</span>
                  <span className="font-medium">{selectedTemplate.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{isEs ? "Sede" : "Venue"} *</Label>
                  <Select value={applyForm.venue_id} onValueChange={(v) => setApplyForm({ ...applyForm, venue_id: v, room_id: "" })}>
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
                    <Label>{isEs ? "Salón" : "Room"} *</Label>
                    <Select value={applyForm.room_id} onValueChange={(v) => setApplyForm({ ...applyForm, room_id: v })}>
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
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleConfirmApply} className="bg-[#3A4D3F] hover:bg-[#2d3d31]" disabled={applying}>
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {isEs ? "Aplicando..." : "Applying..."}
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 mr-1" />
                  {isEs ? "Aplicar" : "Apply"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#3A4D3F]" />
              {isEs ? "Crear Nuevo Template" : "Create New Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder={isEs ? "Ej: Boda Elegante" : "E.g., Elegant Wedding"}
              />
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder={isEs ? "Describe el template..." : "Describe the template..."}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Categoría" : "Category"}</Label>
                <Select value={createForm.category} onValueChange={(v) => setCreateForm({ ...createForm, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.icon} {isEs ? cat.labelEs : cat.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{isEs ? "Tipo de Layout" : "Layout Type"}</Label>
                <Select value={createForm.layout_type} onValueChange={(v) => setCreateForm({ ...createForm, layout_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LAYOUT_TYPES.map((layout) => (
                      <SelectItem key={layout.value} value={layout.value}>
                        {isEs ? layout.labelEs : layout.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Capacidad Mín." : "Min Capacity"}</Label>
                <Input
                  type="number"
                  value={createForm.min_capacity}
                  onChange={(e) => setCreateForm({ ...createForm, min_capacity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Capacidad Máx." : "Max Capacity"}</Label>
                <Input
                  type="number"
                  value={createForm.max_capacity}
                  onChange={(e) => setCreateForm({ ...createForm, max_capacity: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Notas del Layout" : "Layout Notes"}</Label>
              <Textarea
                value={createForm.layout_notes}
                onChange={(e) => setCreateForm({ ...createForm, layout_notes: e.target.value })}
                placeholder={isEs ? "Detalles de la disposición..." : "Layout details..."}
                rows={2}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {isEs 
                ? "Tip: También puedes crear templates desde un salón existente usando 'Guardar como Template' en la tarjeta del salón."
                : "Tip: You can also create templates from an existing room using 'Save as Template' on the room card."
              }
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateTemplate} className="bg-[#3A4D3F] hover:bg-[#2d3d31]" disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {isEs ? "Creando..." : "Creating..."}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Crear Template" : "Create Template"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Template Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-blue-500" />
              {isEs ? "Duplicar Template" : "Duplicate Template"}
            </DialogTitle>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {isEs 
                    ? `Se creará una copia de "${selectedTemplate.name}" con toda su configuración (layout, ${selectedTemplate.default_needs?.length || 0} necesidades, ${selectedTemplate.default_timeline?.length || 0} actividades).`
                    : `A copy of "${selectedTemplate.name}" will be created with all its configuration (layout, ${selectedTemplate.default_needs?.length || 0} needs, ${selectedTemplate.default_timeline?.length || 0} activities).`
                  }
                </p>
              </div>

              <div className="space-y-2">
                <Label>{isEs ? "Nombre del nuevo template" : "New template name"} *</Label>
                <Input
                  value={duplicateForm.name}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, name: e.target.value })}
                  placeholder={isEs ? "Ej: Mi Boda Elegante" : "E.g., My Elegant Wedding"}
                  data-testid="duplicate-template-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label>{isEs ? "Descripción" : "Description"}</Label>
                <Textarea
                  value={duplicateForm.description}
                  onChange={(e) => setDuplicateForm({ ...duplicateForm, description: e.target.value })}
                  placeholder={isEs ? "Describe las modificaciones..." : "Describe the modifications..."}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleDuplicateTemplate} 
              className="bg-blue-500 hover:bg-blue-600" 
              disabled={duplicating || !duplicateForm.name.trim()}
              data-testid="duplicate-template-confirm-btn"
            >
              {duplicating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {isEs ? "Duplicando..." : "Duplicating..."}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  {isEs ? "Duplicar" : "Duplicate"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

