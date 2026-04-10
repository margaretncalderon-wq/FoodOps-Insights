import React, { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { MapPin, Users, UserPlus, X } from "lucide-react";
import { API_BASE as API } from "../../utils/api";
import "leaflet/dist/leaflet.css";

const CITY_COORDS = {
  "Santo Domingo": [18.4861, -69.9312],
  "Santiago": [19.4517, -70.6970],
  "Punta Cana": [18.5601, -68.3725],
  "Bávaro": [18.6850, -68.4530],
  "San Pedro de Macorís": [18.4539, -69.3003],
  "La Romana": [18.4272, -68.9728],
  "Puerto Plata": [19.7808, -70.6944],
  "San Cristóbal": [18.4167, -70.1000],
  "Higüey": [18.6167, -68.7069],
  "La Vega": [19.2222, -70.5295],
  "Moca": [19.3889, -70.5236],
  "Bonao": [18.9333, -70.4000],
  "San Francisco de Macorís": [19.3008, -70.2528],
  "Nagua": [19.3833, -69.8500],
  "Samaná": [19.2058, -69.3363],
  "Barahona": [18.2000, -71.1000],
  "Azua": [18.4533, -70.7292],
  "Baní": [18.2833, -70.3333],
  "Cotuí": [19.0567, -70.1500],
  "Mao": [19.5500, -71.0833],
  "Boca Chica": [18.4500, -69.6000],
  "Juan Dolio": [18.4260, -69.4280],
  "Cabarete": [19.7500, -70.4167],
  "Sosúa": [19.7517, -70.5125],
  "Miami": [25.7617, -80.1918],
  "New York": [40.7128, -74.0060],
  "Los Angeles": [34.0522, -118.2437],
  "Houston": [29.7604, -95.3698],
  "Orlando": [28.5383, -81.3792],
  "San Juan": [18.4655, -66.1057],
  "Madrid": [40.4168, -3.7038],
  "Barcelona": [41.3874, 2.1686],
  "Ciudad de México": [19.4326, -99.1332],
  "Bogotá": [4.7110, -74.0721],
  "Ciudad de Panamá": [8.9824, -79.5199],
  "Caracas": [10.4806, -66.9036],
  "Medellín": [6.2442, -75.5812],
  "Guadalajara": [20.6597, -103.3496],
  "Monterrey": [25.6866, -100.3161],
  "Cancún": [21.1619, -86.8515],
};

const LEAD_COLOR = "#3b82f6";
const CLIENT_COLOR = "#22c55e";

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [30, 30], maxZoom: 10 });
    }
  }, [positions, map]);
  return null;
}

export default function LeadMapInteractive({ onCityFilter }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [geoStats, setGeoStats] = useState({ cities: [], no_city_count: 0 });
  const [selectedCity, setSelectedCity] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cityDetail, setCityDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchGeoStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/geo-stats`, { withCredentials: true });
      setGeoStats(res.data || { cities: [], no_city_count: 0 });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchGeoStats(); }, [fetchGeoStats]);

  const citiesWithCoords = useMemo(() => {
    return geoStats.cities
      .map(city => {
        const coords = CITY_COORDS[city.city];
        if (!coords) return null;
        return { ...city, lat: coords[0], lng: coords[1] };
      })
      .filter(Boolean);
  }, [geoStats.cities]);

  const positions = useMemo(() => citiesWithCoords.map(c => [c.lat, c.lng]), [citiesWithCoords]);
  const maxTotal = Math.max(...citiesWithCoords.map(c => c.total), 1);
  const totalAll = geoStats.cities.reduce((s, c) => s + c.total, 0) + geoStats.no_city_count;
  const totalLeads = geoStats.cities.reduce((s, c) => s + (c.leads || c.total || 0), 0);
  const totalClients = geoStats.cities.reduce((s, c) => s + (c.clients || 0), 0);

  const handleCityClick = async (cityName) => {
    setLoadingDetail(true);
    setDetailOpen(true);
    try {
      const res = await axios.get(`${API}/api/crm/geo-stats/city-detail?city=${encodeURIComponent(cityName)}`, { withCredentials: true });
      setCityDetail(res.data);
    } catch { setCityDetail({ city: cityName, leads: [], clients: [] }); }
    setLoadingDetail(false);
  };

  const handleFilterClick = (cityName) => {
    const next = selectedCity === cityName ? null : cityName;
    setSelectedCity(next);
    onCityFilter && onCityFilter(next);
  };

  if (geoStats.cities.length === 0) return null;

  const defaultCenter = positions.length > 0
    ? [positions.reduce((s, p) => s + p[0], 0) / positions.length, positions.reduce((s, p) => s + p[1], 0) / positions.length]
    : [18.7357, -70.1627];

  return (
    <div className="space-y-2" data-testid="lead-map-interactive">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-rose-500" />
          <span className="text-sm font-semibold">{isEs ? "Mapa de Leads y Clientes" : "Leads & Clients Map"}</span>
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700">{totalLeads} leads</Badge>
          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">{totalClients} {isEs ? "clientes" : "clients"}</Badge>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Leads</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> {isEs ? "Clientes" : "Clients"}</span>
        </div>
      </div>
      <div className="rounded-lg overflow-hidden border" style={{ height: "300px" }}>
        <MapContainer center={defaultCenter} zoom={7} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false} zoomControl={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {positions.length > 1 && <FitBounds positions={positions} />}
          {citiesWithCoords.map(city => {
            const leads = city.leads || city.total || 0;
            const clients = city.clients || 0;
            const baseRadius = Math.max(8, Math.min(28, (city.total / maxTotal) * 28));
            const isSelected = selectedCity === city.city;

            return (
              <React.Fragment key={`${city.city}-${city.lat}`}>
                {/* Leads circle (blue, outer) */}
                {leads > 0 && (
                  <CircleMarker
                    center={[city.lat, city.lng]}
                    radius={baseRadius}
                    pathOptions={{
                      fillColor: LEAD_COLOR, fillOpacity: isSelected ? 0.85 : 0.5,
                      color: isSelected ? "#000" : LEAD_COLOR, weight: isSelected ? 2.5 : 1.5,
                    }}
                    eventHandlers={{ click: () => handleCityClick(city.city) }}
                  >
                    <Popup>
                      <div className="text-xs min-w-[140px]">
                        <p className="font-bold text-sm mb-1">{city.city}</p>
                        <p className="text-blue-600">Leads: <strong>{leads}</strong></p>
                        {clients > 0 && <p className="text-green-600">{isEs ? "Clientes" : "Clients"}: <strong>{clients}</strong></p>}
                        <p className="text-muted-foreground mt-1 text-[10px]">{isEs ? "Click para ver listado" : "Click for details"}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                )}
                {/* Clients circle (green, smaller inner offset) */}
                {clients > 0 && (
                  <CircleMarker
                    center={[city.lat + 0.015, city.lng + 0.015]}
                    radius={Math.max(6, Math.min(20, (clients / maxTotal) * 20))}
                    pathOptions={{
                      fillColor: CLIENT_COLOR, fillOpacity: isSelected ? 0.85 : 0.6,
                      color: isSelected ? "#000" : CLIENT_COLOR, weight: isSelected ? 2.5 : 1.5,
                    }}
                    eventHandlers={{ click: () => handleCityClick(city.city) }}
                  >
                    <Popup>
                      <div className="text-xs min-w-[120px]">
                        <p className="font-bold text-sm mb-1">{city.city}</p>
                        <p className="text-green-600">{isEs ? "Clientes" : "Clients"}: <strong>{clients}</strong></p>
                        <p className="text-muted-foreground mt-1 text-[10px]">{isEs ? "Click para ver listado" : "Click for details"}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                )}
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

      {/* City legend bar */}
      <div className="flex flex-wrap gap-1.5">
        {citiesWithCoords.slice(0, 8).map(city => {
          const leads = city.leads || city.total || 0;
          const clients = city.clients || 0;
          const isSelected = selectedCity === city.city;
          return (
            <button
              key={`legend-${city.city}`}
              onClick={() => handleCityClick(city.city)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted border-transparent"
              }`}
              data-testid={`map-city-${city.city.toLowerCase().replace(/\s/g, '-')}`}
            >
              {city.city} <span className="text-blue-600">{leads}L</span>{clients > 0 && <span className="text-green-600"> {clients}C</span>}
            </button>
          );
        })}
      </div>

      {/* City Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-500" />
              {cityDetail?.city || "..."}
              {cityDetail && (
                <>
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">{cityDetail.leads?.length || 0} leads</Badge>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700">{cityDetail.clients?.length || 0} {isEs ? "clientes" : "clients"}</Badge>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <div className="text-center py-8 text-muted-foreground">{isEs ? "Cargando..." : "Loading..."}</div>
          ) : cityDetail ? (
            <div className="space-y-4">
              {/* Leads table */}
              {cityDetail.leads?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <UserPlus className="w-4 h-4 text-blue-600" /> Leads ({cityDetail.leads.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>{isEs ? "Fuente" : "Source"}</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cityDetail.leads.map(l => (
                        <TableRow key={l.lead_id}>
                          <TableCell className="font-medium text-sm">{l.lead_name}{l.company_name ? ` — ${l.company_name}` : ""}</TableCell>
                          <TableCell className="text-xs">{l.email || "-"}</TableCell>
                          <TableCell className="text-xs">{l.source || "-"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{l.outreach_status || l.status || "-"}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {/* Clients table */}
              {cityDetail.clients?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-green-600" /> {isEs ? "Clientes" : "Clients"} ({cityDetail.clients.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cityDetail.clients.map(c => (
                        <TableRow key={c.client_id}>
                          <TableCell className="font-medium text-sm">{c.display_name}</TableCell>
                          <TableCell className="text-xs">{c.email || "-"}</TableCell>
                          <TableCell className="text-xs">{c.client_type || "-"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">{c.status || "Active"}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {(!cityDetail.leads?.length && !cityDetail.clients?.length) && (
                <p className="text-center py-8 text-muted-foreground">{isEs ? "No hay datos para esta ciudad" : "No data for this city"}</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
