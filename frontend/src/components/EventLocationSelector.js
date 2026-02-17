import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
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
  Building2,
  MapPin,
  User,
  Plus,
  Trash2,
  GripVertical,
  Home,
  DoorOpen,
  Clock,
} from "lucide-react";

const LOCATION_TYPES = {
  onsite: { labelKey: "onsite", icon: Building2, color: "bg-green-500/20 text-green-600" },
  offsite: { labelKey: "offsite", icon: MapPin, color: "bg-blue-500/20 text-blue-600" },
  client: { labelKey: "clientAddress", icon: User, color: "bg-purple-500/20 text-purple-600" },
};

export default function EventLocationSelector({
  value = [],
  onChange,
  clientId = null,
  clientAddress = null,
  multiLocation = false,
}) {
  const { t } = useLanguage();
  const token = localStorage.getItem("token");
  
  const [venues, setVenues] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  
  const [locationForm, setLocationForm] = useState({
    location_type: "onsite",
    label: "",
    venue_id: "",
    room_id: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "",
    contact_name: "",
    contact_phone: "",
    arrival_time: "",
    departure_time: "",
    setup_notes: "",
    parking_instructions: "",
    use_client_address: false,
  });

  const fetchVenues = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/locations/venues`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVenues(response.data);
    } catch (error) {
      console.error("Error fetching venues:", error);
    }
  }, [token]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const resetForm = () => {
    setLocationForm({
      location_type: "onsite",
      label: "",
      venue_id: "",
      room_id: "",
      address: "",
      city: "",
      state: "",
      zip_code: "",
      country: "",
      contact_name: "",
      contact_phone: "",
      arrival_time: "",
      departure_time: "",
      setup_notes: "",
      parking_instructions: "",
      use_client_address: false,
    });
  };

  const handleOpenDialog = (index = null) => {
    if (index !== null && value[index]) {
      const loc = value[index];
      setLocationForm({
        location_type: loc.location_type || "onsite",
        label: loc.label || "",
        venue_id: loc.venue_id || "",
        room_id: loc.room_id || "",
        address: loc.address || "",
        city: loc.city || "",
        state: loc.state || "",
        zip_code: loc.zip_code || "",
        country: loc.country || "",
        contact_name: loc.contact_name || "",
        contact_phone: loc.contact_phone || "",
        arrival_time: loc.arrival_time || "",
        departure_time: loc.departure_time || "",
        setup_notes: loc.setup_notes || "",
        parking_instructions: loc.parking_instructions || "",
        use_client_address: loc.use_client_address || false,
      });
      setEditingIndex(index);
    } else {
      resetForm();
      setEditingIndex(null);
    }
    setDialogOpen(true);
  };

  const handleSaveLocation = () => {
    const selectedVenue = venues.find((v) => v.venue_id === locationForm.venue_id);
    const selectedRoom = selectedVenue?.rooms?.find((r) => r.room_id === locationForm.room_id);

    const newLocation = {
      ...locationForm,
      venue_name: selectedVenue?.name,
      room_name: selectedRoom?.name,
      full_address: getFullAddress(),
      order: editingIndex !== null ? editingIndex : value.length,
    };

    let newValue = [...value];
    if (editingIndex !== null) {
      newValue[editingIndex] = newLocation;
    } else {
      newValue.push(newLocation);
    }
    
    onChange(newValue);
    setDialogOpen(false);
    resetForm();
  };

  const handleRemoveLocation = (index) => {
    const newValue = value.filter((_, i) => i !== index);
    onChange(newValue);
  };

  const getFullAddress = () => {
    if (locationForm.location_type === "onsite") {
      const venue = venues.find((v) => v.venue_id === locationForm.venue_id);
      return venue?.full_address || venue?.address || "";
    }
    if (locationForm.location_type === "client" && clientAddress) {
      return clientAddress;
    }
    const parts = [locationForm.address];
    if (locationForm.city) parts.push(locationForm.city);
    if (locationForm.state && locationForm.zip_code) {
      parts.push(`${locationForm.state} ${locationForm.zip_code}`);
    } else if (locationForm.state) {
      parts.push(locationForm.state);
    }
    return parts.filter(Boolean).join(", ");
  };

  const getLocationDisplay = (loc) => {
    if (loc.location_type === "onsite") {
      return loc.venue_name + (loc.room_name ? ` - ${loc.room_name}` : "");
    }
    return loc.full_address || loc.address || t("offsite");
  };

  const selectedVenue = venues.find((v) => v.venue_id === locationForm.venue_id);

  return (
    <div className="space-y-3" data-testid="event-location-selector">
      {/* Current Locations */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((loc, index) => {
            const config = LOCATION_TYPES[loc.location_type] || LOCATION_TYPES.offsite;
            const Icon = config.icon;
            
            return (
              <div
                key={index}
                className="flex items-center gap-2 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800"
                data-testid={`location-item-${index}`}
              >
                {multiLocation && (
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                )}
                <div className={`p-1.5 rounded ${config.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {loc.label && (
                      <span className="font-medium text-sm">{loc.label}:</span>
                    )}
                    <span className="text-sm truncate">{getLocationDisplay(loc)}</span>
                  </div>
                  {(loc.arrival_time || loc.departure_time) && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {loc.arrival_time && `${t("arrivalTime")}: ${loc.arrival_time}`}
                      {loc.arrival_time && loc.departure_time && " - "}
                      {loc.departure_time && `${t("departureTime")}: ${loc.departure_time}`}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleOpenDialog(index)}
                >
                  <MapPin className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500"
                  onClick={() => handleRemoveLocation(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Location Button */}
      {(multiLocation || value.length === 0) && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleOpenDialog()}
          data-testid="add-location-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t("addLocation")}
        </Button>
      )}

      {/* Location Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? t("edit") : t("add")} {t("locations")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Location Type */}
            <div className="grid gap-2">
              <Label>{t("locationType")}</Label>
              <div className="flex gap-2">
                {Object.entries(LOCATION_TYPES).map(([type, config]) => {
                  const Icon = config.icon;
                  const isSelected = locationForm.location_type === type;
                  
                  return (
                    <Button
                      key={type}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className={isSelected ? "bg-[#3A4D3F] hover:bg-[#2d3d31]" : ""}
                      onClick={() => setLocationForm({ ...locationForm, location_type: type })}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {t(config.labelKey)}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Label (for multi-location) */}
            {multiLocation && (
              <div className="grid gap-2">
                <Label>{t("locationLabel")}</Label>
                <Input
                  value={locationForm.label}
                  onChange={(e) => setLocationForm({ ...locationForm, label: e.target.value })}
                  placeholder="e.g., Ceremony, Cocktail Hour, Reception"
                />
              </div>
            )}

            {/* Onsite Fields */}
            {locationForm.location_type === "onsite" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("selectVenue")} *</Label>
                  <Select
                    value={locationForm.venue_id}
                    onValueChange={(val) => setLocationForm({ ...locationForm, venue_id: val, room_id: "" })}
                  >
                    <SelectTrigger data-testid="venue-select">
                      <SelectValue placeholder={t("selectVenue")} />
                    </SelectTrigger>
                    <SelectContent>
                      {venues.map((venue) => (
                        <SelectItem key={venue.venue_id} value={venue.venue_id}>
                          <div className="flex items-center gap-2">
                            <Home className="w-4 h-4" />
                            {venue.name}
                            {venue.is_primary && (
                              <Badge variant="secondary" className="text-xs">Primary</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedVenue && selectedVenue.rooms && selectedVenue.rooms.length > 0 && (
                  <div className="grid gap-2">
                    <Label>{t("selectRoom")}</Label>
                    <Select
                      value={locationForm.room_id}
                      onValueChange={(val) => setLocationForm({ ...locationForm, room_id: val })}
                    >
                      <SelectTrigger data-testid="room-select">
                        <SelectValue placeholder={t("selectRoom")} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedVenue.rooms.filter(r => r.is_active).map((room) => (
                          <SelectItem key={room.room_id} value={room.room_id}>
                            <div className="flex items-center gap-2">
                              <DoorOpen className="w-4 h-4" />
                              {room.name} ({room.capacity} {t("capacity")})
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedVenue && (
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {selectedVenue.full_address || selectedVenue.address}
                  </div>
                )}
              </>
            )}

            {/* Offsite Fields */}
            {locationForm.location_type === "offsite" && (
              <>
                <div className="grid gap-2">
                  <Label>{t("address")} *</Label>
                  <Input
                    value={locationForm.address}
                    onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                    placeholder={t("address")}
                    data-testid="location-address-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>{t("city")}</Label>
                    <Input
                      value={locationForm.city}
                      onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })}
                      placeholder={t("city")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("state")}</Label>
                    <Input
                      value={locationForm.state}
                      onChange={(e) => setLocationForm({ ...locationForm, state: e.target.value })}
                      placeholder={t("state")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>{t("zipCode")}</Label>
                    <Input
                      value={locationForm.zip_code}
                      onChange={(e) => setLocationForm({ ...locationForm, zip_code: e.target.value })}
                      placeholder={t("zipCode")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("country")}</Label>
                    <Input
                      value={locationForm.country}
                      onChange={(e) => setLocationForm({ ...locationForm, country: e.target.value })}
                      placeholder={t("country")}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Client Address */}
            {locationForm.location_type === "client" && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <p className="text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {clientAddress || t("noResults")}
                </p>
              </div>
            )}

            {/* Additional Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("arrivalTime")}</Label>
                <Input
                  type="time"
                  value={locationForm.arrival_time}
                  onChange={(e) => setLocationForm({ ...locationForm, arrival_time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("departureTime")}</Label>
                <Input
                  type="time"
                  value={locationForm.departure_time}
                  onChange={(e) => setLocationForm({ ...locationForm, departure_time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("contactName")}</Label>
              <Input
                value={locationForm.contact_name}
                onChange={(e) => setLocationForm({ ...locationForm, contact_name: e.target.value })}
                placeholder={t("contactName")}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("contactPhone")}</Label>
              <Input
                value={locationForm.contact_phone}
                onChange={(e) => setLocationForm({ ...locationForm, contact_phone: e.target.value })}
                placeholder={t("contactPhone")}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("setupNotes")}</Label>
              <Textarea
                value={locationForm.setup_notes}
                onChange={(e) => setLocationForm({ ...locationForm, setup_notes: e.target.value })}
                placeholder={t("setupNotes")}
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("parkingInstructions")}</Label>
              <Textarea
                value={locationForm.parking_instructions}
                onChange={(e) => setLocationForm({ ...locationForm, parking_instructions: e.target.value })}
                placeholder={t("parkingInstructions")}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSaveLocation}
              className="bg-[#3A4D3F] hover:bg-[#2d3d31] text-white"
              disabled={
                (locationForm.location_type === "onsite" && !locationForm.venue_id) ||
                (locationForm.location_type === "offsite" && !locationForm.address)
              }
              data-testid="save-location-btn"
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
