import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import {
  Building2,
  Plus,
  MapPin,
  Users,
  Edit2,
  Trash2,
  Loader2,
  Home,
  DoorOpen,
  Star,
  Phone,
  Mail,
  ParkingCircle,
  Accessibility,
  Wifi,
  Monitor,
  Music,
  Calendar,
  List,
} from "lucide-react";
import { toast } from "sonner";
import RoomAvailabilityCalendar from "../components/RoomAvailabilityCalendar";

const amenityIcons = {
  WiFi: Wifi,
  Proyector: Monitor,
  Audio: Music,
  default: Star,
};

export default function VenuesPage() {
  const { t, language } = useLanguage();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [venueDialogOpen, setVenueDialogOpen] = useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [activeTab, setActiveTab] = useState("list");
  const [calendarVenue, setCalendarVenue] = useState(null);
  
  const [venueForm, setVenueForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "USA",
    description: "",
    total_capacity: 0,
    contact_phone: "",
    contact_email: "",
    parking_info: "",
    accessibility_info: "",
    is_primary: false,
  });

  const [roomForm, setRoomForm] = useState({
    name: "",
    description: "",
    capacity: 0,
    floor: "",
    amenities: [],
    setup_options: [],
    hourly_rate: null,
    notes: "",
  });

  const fetchVenues = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/locations/venues`, {
        withCredentials: true
      });
      setVenues(response.data);
    } catch (error) {
      console.error("Error fetching venues:", error);
      toast.error(language === "es" ? "Error al cargar las sedes" : "Error loading venues");
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const resetVenueForm = () => {
    setVenueForm({
      name: "",
      address: "",
      city: "",
      state: "",
      zip_code: "",
      country: "USA",
      description: "",
      total_capacity: 0,
      contact_phone: "",
      contact_email: "",
      parking_info: "",
      accessibility_info: "",
      is_primary: false,
    });
  };

  const resetRoomForm = () => {
    setRoomForm({
      name: "",
      description: "",
      capacity: 0,
      floor: "",
      amenities: [],
      setup_options: [],
      hourly_rate: null,
      notes: "",
    });
  };

  const handleOpenVenueDialog = (venue = null) => {
    if (venue) {
      setEditingVenue(venue);
      setVenueForm({
        name: venue.name || "",
        address: venue.address || "",
        city: venue.city || "",
        state: venue.state || "",
        zip_code: venue.zip_code || "",
        country: venue.country || "USA",
        description: venue.description || "",
        total_capacity: venue.total_capacity || 0,
        contact_phone: venue.contact_phone || "",
        contact_email: venue.contact_email || "",
        parking_info: venue.parking_info || "",
        accessibility_info: venue.accessibility_info || "",
        is_primary: venue.is_primary || false,
      });
    } else {
      setEditingVenue(null);
      resetVenueForm();
    }
    setVenueDialogOpen(true);
  };

  const handleOpenRoomDialog = (venueId, room = null) => {
    setSelectedVenueId(venueId);
    if (room) {
      setEditingRoom(room);
      setRoomForm({
        name: room.name || "",
        description: room.description || "",
        capacity: room.capacity || 0,
        floor: room.floor || "",
        amenities: room.amenities || [],
        setup_options: room.setup_options || [],
        hourly_rate: room.hourly_rate,
        notes: room.notes || "",
      });
    } else {
      setEditingRoom(null);
      resetRoomForm();
    }
    setRoomDialogOpen(true);
  };

  const handleSaveVenue = async () => {
    try {
      if (editingVenue) {
        await axios.put(
          `${API}/locations/venues/${editingVenue.venue_id}`,
          venueForm,
          { withCredentials: true }
        );
        toast.success(t("venueUpdated"));
      } else {
        await axios.post(`${API}/locations/venues`, venueForm, {
          withCredentials: true
        });
        toast.success(t("venueCreated"));
      }
      setVenueDialogOpen(false);
      fetchVenues();
    } catch (error) {
      console.error("Error saving venue:", error);
      toast.error(t("errorUpdating"));
    }
  };

  const handleDeleteVenue = async (venueId) => {
    if (!window.confirm(t("confirmDeleteGoal"))) return;
    try {
      await axios.delete(`${API}/locations/venues/${venueId}`, {
        withCredentials: true
      });
      toast.success(t("venueDeleted"));
      fetchVenues();
    } catch (error) {
      console.error("Error deleting venue:", error);
      toast.error(t("errorDeleting"));
    }
  };

  const handleSaveRoom = async () => {
    try {
      const payload = {
        ...roomForm,
        hourly_rate: roomForm.hourly_rate || null,
      };
      
      if (editingRoom) {
        await axios.put(
          `${API}/locations/venues/${selectedVenueId}/rooms/${editingRoom.room_id}`,
          payload,
          { withCredentials: true }
        );
        toast.success(t("roomUpdated"));
      } else {
        await axios.post(
          `${API}/locations/venues/${selectedVenueId}/rooms`,
          payload,
          { withCredentials: true }
        );
        toast.success(t("roomCreated"));
      }
      setRoomDialogOpen(false);
      fetchVenues();
    } catch (error) {
      console.error("Error saving room:", error);
      toast.error(t("errorUpdating"));
    }
  };

  const handleDeleteRoom = async (venueId, roomId) => {
    if (!window.confirm(t("confirmDeleteGoal"))) return;
    try {
      await axios.delete(`${API}/locations/venues/${venueId}/rooms/${roomId}`, {
        withCredentials: true
      });
      toast.success(t("roomDeleted"));
      fetchVenues();
    } catch (error) {
      console.error("Error deleting room:", error);
      toast.error(t("errorDeleting"));
    }
  };

  const handleAmenityToggle = (amenity) => {
    setRoomForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const handleSetupOptionToggle = (option) => {
    setRoomForm((prev) => ({
      ...prev,
      setup_options: prev.setup_options.includes(option)
        ? prev.setup_options.filter((o) => o !== option)
        : [...prev.setup_options, option],
    }));
  };

  const commonAmenities = ["WiFi", "Proyector", "Audio", "Cocina", "Aire Acondicionado", "Iluminación"];
  const commonSetupOptions = ["Teatro", "Banquete", "Cóctel", "Aula", "U", "Conferencia"];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64" data-testid="venues-loading">
          <Loader2 className="w-8 h-8 animate-spin text-[#3A4D3F]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="venues-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-7 h-7 text-[#3A4D3F]" />
              {t("venues")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t("manageVenues")}
            </p>
          </div>
          <Button
            onClick={() => handleOpenVenueDialog()}
            className="bg-[#3A4D3F] hover:bg-[#2d3d31] text-white"
            data-testid="add-venue-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("addVenue")}
          </Button>
        </div>

        {/* Tabs: List / Calendar */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              {language === "es" ? "Lista" : "List"}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {t("calendar")}
            </TabsTrigger>
          </TabsList>

          {/* List View */}
          <TabsContent value="list" className="mt-4">
            {/* Venues List */}
            {venues.length === 0 ? (
              <Card className="bg-white dark:bg-gray-800 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Building2 className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-2">{t("noVenuesYet")}</p>
                  <p className="text-sm text-gray-400 mb-4">{t("createFirstVenue")}</p>
                  <Button
                    onClick={() => handleOpenVenueDialog()}
                    className="bg-[#3A4D3F] hover:bg-[#2d3d31] text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t("addVenue")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {venues.map((venue) => (
                  <Card key={venue.venue_id} className="bg-white dark:bg-gray-800" data-testid={`venue-card-${venue.venue_id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#3A4D3F]/10 rounded-lg">
                            <Home className="w-6 h-6 text-[#3A4D3F]" />
                          </div>
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              {venue.name}
                              {venue.is_primary && (
                                <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                                  <Star className="w-3 h-3 mr-1" />
                                  {t("isPrimary")}
                                </Badge>
                          )}
                        </CardTitle>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                          <MapPin className="w-4 h-4" />
                          {venue.full_address || venue.address}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCalendarVenue(venue);
                          setActiveTab("calendar");
                        }}
                        data-testid={`view-calendar-${venue.venue_id}`}
                        title={t("roomAvailability")}
                      >
                        <Calendar className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenVenueDialog(venue)}
                        data-testid={`edit-venue-${venue.venue_id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:border-red-300"
                        onClick={() => handleDeleteVenue(venue.venue_id)}
                        data-testid={`delete-venue-${venue.venue_id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {venue.total_capacity > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {venue.total_capacity} {t("capacity")}
                      </span>
                    )}
                    {venue.contact_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {venue.contact_phone}
                      </span>
                    )}
                    {venue.parking_info && (
                      <span className="flex items-center gap-1">
                        <ParkingCircle className="w-4 h-4" />
                        {t("parkingInfo")}
                      </span>
                    )}
                  </div>

                  {/* Rooms Section */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <DoorOpen className="w-4 h-4 text-[#3A4D3F]" />
                        {t("rooms")} ({venue.rooms?.length || 0})
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRoomDialog(venue.venue_id)}
                        data-testid={`add-room-${venue.venue_id}`}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        {t("addRoom")}
                      </Button>
                    </div>

                    {venue.rooms && venue.rooms.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {venue.rooms.filter(r => r.is_active).map((room) => (
                          <div
                            key={room.room_id}
                            className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-700/50"
                            data-testid={`room-card-${room.room_id}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h5 className="font-medium">{room.name}</h5>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleOpenRoomDialog(venue.venue_id, room)}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-500"
                                  onClick={() => handleDeleteRoom(venue.venue_id, room.room_id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {room.capacity} {t("capacity")}
                              </div>
                              {room.floor && (
                                <div>{t("floor")}: {room.floor}</div>
                              )}
                              {room.amenities && room.amenities.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {room.amenities.map((amenity) => (
                                    <Badge
                                      key={amenity}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {amenity}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">{t("noRoomsYet")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </TabsContent>

          {/* Calendar View */}
          <TabsContent value="calendar" className="mt-4">
            {venues.length === 0 ? (
              <Card className="bg-white dark:bg-gray-800 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-2">{t("noVenuesYet")}</p>
                  <p className="text-sm text-gray-400">{t("createFirstVenue")}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Venue Selector for Calendar */}
                {!calendarVenue && (
                  <Card className="bg-white dark:bg-gray-800">
                    <CardContent className="py-6">
                      <p className="text-center text-gray-500 mb-4">
                        {language === "es" ? "Selecciona una sede para ver su calendario" : "Select a venue to view its calendar"}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {venues.map((venue) => (
                          <Button
                            key={venue.venue_id}
                            variant="outline"
                            onClick={() => setCalendarVenue(venue)}
                            className="flex items-center gap-2"
                          >
                            <Building2 className="w-4 h-4" />
                            {venue.name}
                            {venue.rooms && (
                              <Badge variant="secondary" className="ml-1">
                                {venue.rooms.filter(r => r.is_active).length} {t("rooms")}
                              </Badge>
                            )}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Selected Venue Calendar */}
                {calendarVenue && (
                  <>
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        onClick={() => setCalendarVenue(null)}
                        className="text-sm"
                      >
                        ← {language === "es" ? "Ver todas las sedes" : "View all venues"}
                      </Button>
                      <div className="flex gap-2">
                        {venues.filter(v => v.venue_id !== calendarVenue.venue_id).slice(0, 3).map((venue) => (
                          <Button
                            key={venue.venue_id}
                            variant="outline"
                            size="sm"
                            onClick={() => setCalendarVenue(venue)}
                          >
                            {venue.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <RoomAvailabilityCalendar
                      venueId={calendarVenue.venue_id}
                      venueName={calendarVenue.name}
                      rooms={calendarVenue.rooms || []}
                    />
                  </>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Venue Dialog */}
        <Dialog open={venueDialogOpen} onOpenChange={setVenueDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingVenue ? t("editVenue") : t("addVenue")}
              </DialogTitle>
              <DialogDescription>
                {t("description")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="venue-name">{t("venueName")} *</Label>
                <Input
                  id="venue-name"
                  value={venueForm.name}
                  onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                  placeholder={t("venueName")}
                  data-testid="venue-name-input"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="venue-address">{t("address")} *</Label>
                <Input
                  id="venue-address"
                  value={venueForm.address}
                  onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })}
                  placeholder={t("address")}
                  data-testid="venue-address-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="venue-city">{t("city")}</Label>
                  <Input
                    id="venue-city"
                    value={venueForm.city}
                    onChange={(e) => setVenueForm({ ...venueForm, city: e.target.value })}
                    placeholder={t("city")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="venue-state">{t("state")}</Label>
                  <Input
                    id="venue-state"
                    value={venueForm.state}
                    onChange={(e) => setVenueForm({ ...venueForm, state: e.target.value })}
                    placeholder={t("state")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="venue-zip">{t("zipCode")}</Label>
                  <Input
                    id="venue-zip"
                    value={venueForm.zip_code}
                    onChange={(e) => setVenueForm({ ...venueForm, zip_code: e.target.value })}
                    placeholder={t("zipCode")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="venue-country">{t("country")}</Label>
                  <Input
                    id="venue-country"
                    value={venueForm.country}
                    onChange={(e) => setVenueForm({ ...venueForm, country: e.target.value })}
                    placeholder={t("country")}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="venue-description">{t("description")}</Label>
                <Textarea
                  id="venue-description"
                  value={venueForm.description}
                  onChange={(e) => setVenueForm({ ...venueForm, description: e.target.value })}
                  placeholder={t("description")}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="venue-capacity">{t("totalCapacity")}</Label>
                  <Input
                    id="venue-capacity"
                    type="number"
                    value={venueForm.total_capacity}
                    onChange={(e) => setVenueForm({ ...venueForm, total_capacity: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="venue-phone">{t("contactPhone")}</Label>
                  <Input
                    id="venue-phone"
                    value={venueForm.contact_phone}
                    onChange={(e) => setVenueForm({ ...venueForm, contact_phone: e.target.value })}
                    placeholder={t("contactPhone")}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="venue-email">{t("contactEmail")}</Label>
                <Input
                  id="venue-email"
                  type="email"
                  value={venueForm.contact_email}
                  onChange={(e) => setVenueForm({ ...venueForm, contact_email: e.target.value })}
                  placeholder={t("contactEmail")}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="venue-parking">{t("parkingInfo")}</Label>
                <Textarea
                  id="venue-parking"
                  value={venueForm.parking_info}
                  onChange={(e) => setVenueForm({ ...venueForm, parking_info: e.target.value })}
                  placeholder={t("parkingInfo")}
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="venue-accessibility">{t("accessibilityInfo")}</Label>
                <Textarea
                  id="venue-accessibility"
                  value={venueForm.accessibility_info}
                  onChange={(e) => setVenueForm({ ...venueForm, accessibility_info: e.target.value })}
                  placeholder={t("accessibilityInfo")}
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="venue-primary"
                  checked={venueForm.is_primary}
                  onCheckedChange={(checked) => setVenueForm({ ...venueForm, is_primary: checked })}
                />
                <Label htmlFor="venue-primary" className="cursor-pointer">
                  {t("isPrimary")}
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setVenueDialogOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSaveVenue}
                className="bg-[#3A4D3F] hover:bg-[#2d3d31] text-white"
                disabled={!venueForm.name || !venueForm.address}
                data-testid="save-venue-btn"
              >
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Room Dialog */}
        <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingRoom ? t("editRoom") : t("addRoom")}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="room-name">{t("roomName")} *</Label>
                <Input
                  id="room-name"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  placeholder={t("roomName")}
                  data-testid="room-name-input"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="room-description">{t("description")}</Label>
                <Textarea
                  id="room-description"
                  value={roomForm.description}
                  onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })}
                  placeholder={t("description")}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="room-capacity">{t("capacity")} *</Label>
                  <Input
                    id="room-capacity"
                    type="number"
                    value={roomForm.capacity}
                    onChange={(e) => setRoomForm({ ...roomForm, capacity: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    data-testid="room-capacity-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="room-floor">{t("floor")}</Label>
                  <Input
                    id="room-floor"
                    value={roomForm.floor}
                    onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>{t("amenities")}</Label>
                <div className="flex flex-wrap gap-2">
                  {commonAmenities.map((amenity) => (
                    <Badge
                      key={amenity}
                      variant={roomForm.amenities.includes(amenity) ? "default" : "outline"}
                      className={`cursor-pointer ${
                        roomForm.amenities.includes(amenity)
                          ? "bg-[#3A4D3F] hover:bg-[#2d3d31]"
                          : "hover:bg-gray-100"
                      }`}
                      onClick={() => handleAmenityToggle(amenity)}
                    >
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>{t("setupOptions")}</Label>
                <div className="flex flex-wrap gap-2">
                  {commonSetupOptions.map((option) => (
                    <Badge
                      key={option}
                      variant={roomForm.setup_options.includes(option) ? "default" : "outline"}
                      className={`cursor-pointer ${
                        roomForm.setup_options.includes(option)
                          ? "bg-[#3A4D3F] hover:bg-[#2d3d31]"
                          : "hover:bg-gray-100"
                      }`}
                      onClick={() => handleSetupOptionToggle(option)}
                    >
                      {option}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="room-rate">{t("hourlyRate")}</Label>
                <Input
                  id="room-rate"
                  type="number"
                  value={roomForm.hourly_rate || ""}
                  onChange={(e) => setRoomForm({ ...roomForm, hourly_rate: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="room-notes">{t("notes")}</Label>
                <Textarea
                  id="room-notes"
                  value={roomForm.notes}
                  onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
                  placeholder={t("notes")}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSaveRoom}
                className="bg-[#3A4D3F] hover:bg-[#2d3d31] text-white"
                disabled={!roomForm.name}
                data-testid="save-room-btn"
              >
                {t("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
