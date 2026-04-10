import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { MapPin, X, Users, TrendingUp } from "lucide-react";
import { API_BASE as API } from "../../utils/api";

export default function LeadMapSection({ onCityFilter }) {
  const { isEs } = useLanguage();
  const [geoStats, setGeoStats] = useState({ cities: [], no_city_count: 0 });
  const [hoveredCity, setHoveredCity] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);

  const fetchGeoStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/geo-stats`, { withCredentials: true });
      setGeoStats(res.data || { cities: [], no_city_count: 0 });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchGeoStats(); }, [fetchGeoStats]);

  const maxLeads = Math.max(...geoStats.cities.map(c => c.total), 1);
  const totalWithCity = geoStats.cities.reduce((s, c) => s + c.total, 0);
  const total = totalWithCity + geoStats.no_city_count;

  const handleCityClick = (city) => {
    if (selectedCity === city.city) {
      setSelectedCity(null);
      onCityFilter && onCityFilter(null);
    } else {
      setSelectedCity(city.city);
      onCityFilter && onCityFilter(city.city);
    }
  };

  const clearFilter = () => {
    setSelectedCity(null);
    onCityFilter && onCityFilter(null);
  };

  if (geoStats.cities.length === 0 && geoStats.no_city_count === 0) return null;

  return (
    <Card className="mb-4" data-testid="lead-map-section">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-4 h-4 text-rose-500" />
            {isEs ? "Mapa de Leads" : "Lead Map"}
            <Badge variant="secondary" className="text-xs">{total} leads</Badge>
          </CardTitle>
          {selectedCity && (
            <Button variant="outline" size="sm" onClick={clearFilter} className="h-7 text-xs gap-1">
              <X className="w-3 h-3" />
              {isEs ? "Limpiar filtro" : "Clear filter"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {geoStats.cities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {isEs ? "No hay leads con ciudad asignada. Agrega ciudades a tus leads para ver el mapa." : "No leads with city assigned. Add cities to your leads to see the map."}
          </p>
        ) : (
          <div className="space-y-3">
            {/* Bubble map visualization */}
            <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-lg min-h-[120px] justify-center">
              {geoStats.cities.map(city => {
                const size = Math.max(40, Math.min(100, (city.total / maxLeads) * 100));
                const isSelected = selectedCity === city.city;
                const isHovered = hoveredCity === city.city;
                return (
                  <div key={city.city} className="flex flex-col items-center gap-1 cursor-pointer transition-transform hover:scale-105"
                    onClick={() => handleCityClick(city)}
                    onMouseEnter={() => setHoveredCity(city.city)}
                    onMouseLeave={() => setHoveredCity(null)}
                    data-testid={`map-bubble-${city.city.toLowerCase().replace(/\s/g, '-')}`}>
                    <div className={`rounded-full flex items-center justify-center transition-all ${isSelected ? "ring-2 ring-primary ring-offset-2" : ""}`}
                      style={{
                        width: `${size}px`, height: `${size}px`,
                        backgroundColor: isSelected ? "hsl(var(--primary))" : isHovered ? "hsl(var(--primary) / 0.7)" : "hsl(var(--primary) / 0.15)",
                        color: isSelected || isHovered ? "white" : "hsl(var(--primary))"
                      }}>
                      <span className="font-bold text-sm">{city.total}</span>
                    </div>
                    <span className={`text-xs font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}>{city.city}</span>
                    {/* Hover tooltip */}
                    {isHovered && (
                      <div className="absolute mt-[-80px] bg-popover border rounded-lg shadow-lg p-2.5 z-50 text-xs min-w-[140px]">
                        <p className="font-semibold mb-1">{city.city}</p>
                        <div className="space-y-0.5 text-muted-foreground">
                          <div className="flex justify-between"><span>Total:</span><span className="font-medium text-foreground">{city.total}</span></div>
                          {city.new > 0 && <div className="flex justify-between"><span>New:</span><span className="text-green-600">{city.new}</span></div>}
                          {city.contacted > 0 && <div className="flex justify-between"><span>Contacted:</span><span className="text-blue-600">{city.contacted}</span></div>}
                          {city.engaged > 0 && <div className="flex justify-between"><span>Engaged:</span><span className="text-violet-600">{city.engaged}</span></div>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {geoStats.no_city_count > 0 && (
                <div className="flex flex-col items-center gap-1 opacity-50">
                  <div className="rounded-full flex items-center justify-center bg-muted border border-dashed"
                    style={{ width: `${Math.max(40, (geoStats.no_city_count / maxLeads) * 100)}px`, height: `${Math.max(40, (geoStats.no_city_count / maxLeads) * 100)}px` }}>
                    <span className="font-bold text-sm text-muted-foreground">{geoStats.no_city_count}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{isEs ? "Sin ciudad" : "No city"}</span>
                </div>
              )}
            </div>

            {/* City breakdown bar */}
            <div className="space-y-1.5">
              {geoStats.cities.map(city => {
                const pct = total > 0 ? ((city.total / total) * 100).toFixed(0) : 0;
                const isSelected = selectedCity === city.city;
                return (
                  <button key={city.city}
                    className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors text-left ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}
                    onClick={() => handleCityClick(city)}>
                    <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-primary" : "text-rose-400"}`} />
                    <span className="text-sm font-medium flex-1">{city.city}</span>
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{city.total}</span>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
