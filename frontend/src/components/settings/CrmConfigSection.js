import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { toast } from "sonner";
import { Tag, Plus, Trash2, MapPin, Globe, ChevronDown, ChevronRight, X } from "lucide-react";
import { API_BASE as API } from "../../utils/api";

const TAG_COLORS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6",
  "#ec4899", "#06b6d4", "#64748b", "#f97316", "#14b8a6",
];

export default function CrmConfigSection() {
  const { isEs } = useLanguage();
  const [tags, setTags] = useState([]);
  const [areas, setAreas] = useState([]);
  const [newTag, setNewTag] = useState({ name: "", color: "#3b82f6" });
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [newArea, setNewArea] = useState({ country: "", country_code: "", regions: [] });
  const [expandedArea, setExpandedArea] = useState(null);
  const [newRegion, setNewRegion] = useState("");
  const [newCity, setNewCity] = useState({ regionIdx: null, name: "" });

  const fetchTags = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/tags`, { withCredentials: true });
      setTags(res.data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchAreas = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/service-areas`, { withCredentials: true });
      setAreas(res.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchTags(); fetchAreas(); }, [fetchTags, fetchAreas]);

  const handleCreateTag = async () => {
    if (!newTag.name.trim()) return;
    try {
      await axios.post(`${API}/api/crm/tags`, newTag, { withCredentials: true });
      toast.success(isEs ? "Tag creado" : "Tag created");
      setNewTag({ name: "", color: "#3b82f6" });
      setTagDialogOpen(false);
      fetchTags();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteTag = async (tagId) => {
    try {
      await axios.delete(`${API}/api/crm/tags/${tagId}`, { withCredentials: true });
      toast.success(isEs ? "Tag eliminado" : "Tag deleted");
      fetchTags();
    } catch { toast.error("Error"); }
  };

  const handleCreateArea = async () => {
    if (!newArea.country.trim()) return;
    try {
      await axios.post(`${API}/api/crm/service-areas`, newArea, { withCredentials: true });
      toast.success(isEs ? "Área creada" : "Area created");
      setNewArea({ country: "", country_code: "", regions: [] });
      setAreaDialogOpen(false);
      fetchAreas();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteArea = async (areaId) => {
    try {
      await axios.delete(`${API}/api/crm/service-areas/${areaId}`, { withCredentials: true });
      toast.success(isEs ? "Área eliminada" : "Area deleted");
      fetchAreas();
    } catch { toast.error("Error"); }
  };

  const addRegionToArea = async (area) => {
    if (!newRegion.trim()) return;
    const updated = [...(area.regions || []), { name: newRegion.trim(), cities: [] }];
    try {
      await axios.put(`${API}/api/crm/service-areas/${area.area_id}`, { regions: updated }, { withCredentials: true });
      setNewRegion("");
      fetchAreas();
    } catch { toast.error("Error"); }
  };

  const addCityToRegion = async (area, regionIdx) => {
    if (!newCity.name.trim()) return;
    const updated = [...(area.regions || [])];
    updated[regionIdx] = { ...updated[regionIdx], cities: [...(updated[regionIdx].cities || []), newCity.name.trim()] };
    try {
      await axios.put(`${API}/api/crm/service-areas/${area.area_id}`, { regions: updated }, { withCredentials: true });
      setNewCity({ regionIdx: null, name: "" });
      fetchAreas();
    } catch { toast.error("Error"); }
  };

  const removeCity = async (area, regionIdx, cityIdx) => {
    const updated = [...(area.regions || [])];
    updated[regionIdx] = { ...updated[regionIdx], cities: updated[regionIdx].cities.filter((_, i) => i !== cityIdx) };
    try {
      await axios.put(`${API}/api/crm/service-areas/${area.area_id}`, { regions: updated }, { withCredentials: true });
      fetchAreas();
    } catch { toast.error("Error"); }
  };

  const removeRegion = async (area, regionIdx) => {
    const updated = (area.regions || []).filter((_, i) => i !== regionIdx);
    try {
      await axios.put(`${API}/api/crm/service-areas/${area.area_id}`, { regions: updated }, { withCredentials: true });
      fetchAreas();
    } catch { toast.error("Error"); }
  };

  return (
    <div className="space-y-6">
      {/* Tags Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tag className="w-5 h-5" />
            {isEs ? "Tags de CRM" : "CRM Tags"}
          </CardTitle>
          <Button size="sm" onClick={() => setTagDialogOpen(true)} data-testid="add-tag-btn">
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Nuevo Tag" : "New Tag"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {isEs ? "Tags predefinidos para clasificar leads y clientes." : "Predefined tags to classify leads and clients."}
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <div key={tag.tag_id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ borderColor: tag.color + "40", backgroundColor: tag.color + "10" }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="text-sm font-medium">{tag.name}</span>
                <button onClick={() => handleDeleteTag(tag.tag_id)} className="ml-1 text-muted-foreground hover:text-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {tags.length === 0 && (
              <span className="text-sm text-muted-foreground">{isEs ? "No hay tags. Se crearán defaults al recargar." : "No tags. Defaults will be created on reload."}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Service Areas Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5" />
            {isEs ? "Áreas de Servicio" : "Service Areas"}
          </CardTitle>
          <Button size="sm" onClick={() => setAreaDialogOpen(true)} data-testid="add-area-btn">
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Agregar País" : "Add Country"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {isEs ? "Países y ciudades donde operas. Se usan para el mapa de leads y filtros geográficos." : "Countries and cities where you operate. Used for lead map and geographic filters."}
          </p>
          <div className="space-y-3">
            {areas.map(area => (
              <Card key={area.area_id} className="border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                      onClick={() => setExpandedArea(expandedArea === area.area_id ? null : area.area_id)}>
                      {expandedArea === area.area_id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <Globe className="w-4 h-4" />
                      {area.country} {area.country_code && <Badge variant="outline" className="text-[10px] ml-1">{area.country_code}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">
                        {(area.regions || []).length} {isEs ? "regiones" : "regions"}
                      </Badge>
                    </button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteArea(area.area_id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {expandedArea === area.area_id && (
                    <div className="pl-6 space-y-3">
                      {(area.regions || []).map((region, rIdx) => (
                        <div key={rIdx} className="border-l-2 border-muted pl-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-rose-500" />
                              {region.name}
                            </span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => removeRegion(area, rIdx)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 ml-5 mb-2">
                            {(region.cities || []).map((city, cIdx) => (
                              <Badge key={cIdx} variant="outline" className="text-xs gap-1 pr-1">
                                {city}
                                <button onClick={() => removeCity(area, rIdx, cIdx)} className="hover:text-red-500">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </Badge>
                            ))}
                            {newCity.regionIdx === rIdx ? (
                              <div className="flex items-center gap-1">
                                <Input className="h-6 w-28 text-xs" value={newCity.name}
                                  onChange={e => setNewCity({ ...newCity, name: e.target.value })}
                                  onKeyDown={e => e.key === "Enter" && addCityToRegion(area, rIdx)}
                                  placeholder={isEs ? "Ciudad..." : "City..."} autoFocus />
                                <Button size="icon" className="h-6 w-6" onClick={() => addCityToRegion(area, rIdx)}>
                                  <Plus className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewCity({ regionIdx: null, name: "" })}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <button className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5"
                                onClick={() => setNewCity({ regionIdx: rIdx, name: "" })}>
                                <Plus className="w-3 h-3" />{isEs ? "Ciudad" : "City"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {/* Add region */}
                      <div className="flex items-center gap-2">
                        <Input className="h-7 w-40 text-xs" value={newRegion}
                          onChange={e => setNewRegion(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addRegionToArea(area)}
                          placeholder={isEs ? "Nueva región..." : "New region..."} />
                        <Button size="sm" className="h-7 text-xs" onClick={() => addRegionToArea(area)}>
                          <Plus className="w-3 h-3 mr-1" />{isEs ? "Región" : "Region"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* New Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Tag" : "New Tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input value={newTag.name} onChange={e => setNewTag({ ...newTag, name: e.target.value })}
                placeholder={isEs ? "Ej: VIP" : "E.g.: VIP"} data-testid="tag-name-input" />
            </div>
            <div>
              <Label>{isEs ? "Color" : "Color"}</Label>
              <div className="flex gap-2 mt-1">
                {TAG_COLORS.map(c => (
                  <button key={c} className={`w-7 h-7 rounded-full border-2 transition-transform ${newTag.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} onClick={() => setNewTag({ ...newTag, color: c })} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreateTag} data-testid="tag-save-btn">{isEs ? "Crear" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Area Dialog */}
      <Dialog open={areaDialogOpen} onOpenChange={setAreaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar País" : "Add Country"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "País" : "Country"}</Label>
              <Input value={newArea.country} onChange={e => setNewArea({ ...newArea, country: e.target.value })}
                placeholder={isEs ? "Ej: México" : "E.g.: Mexico"} data-testid="area-country-input" />
            </div>
            <div>
              <Label>{isEs ? "Código (ISO)" : "Code (ISO)"}</Label>
              <Input value={newArea.country_code} onChange={e => setNewArea({ ...newArea, country_code: e.target.value })}
                placeholder="MX" maxLength={2} className="w-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreateArea} data-testid="area-save-btn">{isEs ? "Crear" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
