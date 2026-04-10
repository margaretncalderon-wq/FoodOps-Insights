import { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Badge } from "../ui/badge";
import { MapPin } from "lucide-react";
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

const STATUS_COLORS = {
  New: "#3b82f6",
  Contacted: "#f59e0b",
  Qualified: "#8b5cf6",
  Proposal: "#ec4899",
  Negotiation: "#f97316",
  Won: "#22c55e",
  Lost: "#ef4444",
};

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = positions.map(p => [p[0], p[1]]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
    }
  }, [positions, map]);
  return null;
}

export default function LeadMapInteractive({ onCityFilter }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [geoStats, setGeoStats] = useState({ cities: [], no_city_count: 0 });
  const [selectedCity, setSelectedCity] = useState(null);

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
  const maxLeads = Math.max(...citiesWithCoords.map(c => c.total), 1);
  const total = geoStats.cities.reduce((s, c) => s + c.total, 0) + geoStats.no_city_count;

  const handleCityClick = (cityName) => {
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
          <span className="text-sm font-semibold">{isEs ? "Mapa de Leads" : "Lead Map"}</span>
          <Badge variant="secondary" className="text-[10px]">{total} leads</Badge>
        </div>
        {selectedCity && (
          <button onClick={() => handleCityClick(selectedCity)} className="text-xs text-muted-foreground hover:text-foreground underline">
            {isEs ? "Limpiar filtro" : "Clear"}
          </button>
        )}
      </div>
      <div className="rounded-lg overflow-hidden border" style={{ height: "280px" }}>
        <MapContainer
          center={defaultCenter}
          zoom={7}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {positions.length > 1 && <FitBounds positions={positions} />}
          {citiesWithCoords.map(city => {
            const radius = Math.max(8, Math.min(30, (city.total / maxLeads) * 30));
            const isSelected = selectedCity === city.city;
            const dominantStatus = city.new >= city.contacted && city.new >= (city.engaged || 0) ? "New"
              : city.contacted >= (city.engaged || 0) ? "Contacted" : "Qualified";
            const color = STATUS_COLORS[dominantStatus] || "#3b82f6";
            return (
              <CircleMarker
                key={city.city}
                center={[city.lat, city.lng]}
                radius={radius}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: isSelected ? 0.9 : 0.6,
                  color: isSelected ? "#000" : color,
                  weight: isSelected ? 3 : 1.5,
                }}
                eventHandlers={{ click: () => handleCityClick(city.city) }}
              >
                <Popup>
                  <div className="text-xs min-w-[120px]">
                    <p className="font-bold text-sm mb-1">{city.city}</p>
                    <p>{isEs ? "Total" : "Total"}: <strong>{city.total}</strong></p>
                    {city.new > 0 && <p className="text-blue-600">{isEs ? "Nuevos" : "New"}: {city.new}</p>}
                    {city.contacted > 0 && <p className="text-yellow-600">{isEs ? "Contactados" : "Contacted"}: {city.contacted}</p>}
                    {(city.engaged || 0) > 0 && <p className="text-purple-600">{isEs ? "Interesados" : "Engaged"}: {city.engaged}</p>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      {/* City legend bar */}
      <div className="flex flex-wrap gap-1.5">
        {citiesWithCoords.slice(0, 8).map(city => {
          const pct = total > 0 ? ((city.total / total) * 100).toFixed(0) : 0;
          const isSelected = selectedCity === city.city;
          return (
            <button
              key={city.city}
              onClick={() => handleCityClick(city.city)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted border-transparent"
              }`}
              data-testid={`map-city-${city.city.toLowerCase().replace(/\s/g, '-')}`}
            >
              {city.city} ({city.total}) {pct}%
            </button>
          );
        })}
      </div>
    </div>
  );
}
