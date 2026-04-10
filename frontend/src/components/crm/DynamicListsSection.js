import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Plus, Users, Trash2, Eye, Filter, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";

const STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const TYPE_OPTIONS = [
  { value: "outreach", label: "Outreach" },
  { value: "inbound", label: "Inbound" },
];

export default function DynamicListsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [sources, setSources] = useState([]);
  const [tags, setTags] = useState([]);
  const [cities, setCities] = useState([]);

  const [form, setForm] = useState({
    name: "", description: "",
    statuses: [], cities: [], sources: [], tags: [], lead_types: [],
    has_email: true,
  });

  const fetchLists = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/dynamic-lists`, { withCredentials: true });
      setLists(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchFilters = useCallback(async () => {
    try {
      const [srcRes, tagRes, geoRes] = await Promise.all([
        axios.get(`${API}/api/crm/lead-sources`, { withCredentials: true }),
        axios.get(`${API}/api/crm/tags`, { withCredentials: true }),
        axios.get(`${API}/api/crm/geo-stats`, { withCredentials: true }),
      ]);
      setSources((srcRes.data || []).map(s => s.name));
      setTags((tagRes.data || []).map(t => t.name));
      setCities((geoRes.data?.cities || []).map(c => c.city));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchLists(); fetchFilters(); }, [fetchLists, fetchFilters]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error(isEs ? "Nombre requerido" : "Name required");
      return;
    }
    try {
      await axios.post(`${API}/api/crm/dynamic-lists`, form, { withCredentials: true });
      toast.success(isEs ? "Lista creada" : "List created");
      setCreateOpen(false);
      setForm({ name: "", description: "", statuses: [], cities: [], sources: [], tags: [], lead_types: [], has_email: true });
      fetchLists();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handlePreview = async (filters) => {
    try {
      const res = await axios.post(`${API}/api/crm/dynamic-lists/preview`, filters || form, { withCredentials: true });
      setPreviewData(res.data);
      setPreviewOpen(true);
    } catch { toast.error("Error previewing"); }
  };

  const handleDelete = async (listId) => {
    if (!window.confirm(isEs ? "¿Eliminar lista?" : "Delete list?")) return;
    try {
      await axios.delete(`${API}/api/crm/dynamic-lists/${listId}`, { withCredentials: true });
      toast.success(isEs ? "Lista eliminada" : "List deleted");
      fetchLists();
    } catch { toast.error("Error"); }
  };

  const toggleArrayItem = (arr, item) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  if (loading) return null;

  return (
    <div className="space-y-4" data-testid="dynamic-lists-section">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {isEs ? "Listas Dinámicas" : "Dynamic Lists"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isEs ? "Segmenta leads del CRM por ciudad, tags, status y fuente" : "Segment CRM leads by city, tags, status and source"}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="create-dynamic-list-btn">
          <Plus className="w-4 h-4 mr-1" /> {isEs ? "Nueva Lista" : "New List"}
        </Button>
      </div>

      {/* Existing Lists */}
      {lists.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          {isEs ? "No hay listas dinámicas. Crea una para segmentar tus leads." : "No dynamic lists. Create one to segment your leads."}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {lists.map(list => {
            const f = list.filters || {};
            const filterCount = [f.statuses, f.cities, f.sources, f.tags, f.lead_types].filter(a => a?.length > 0).length + (f.has_email ? 1 : 0);
            return (
              <Card key={list.list_id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{list.name}</p>
                      {list.description && <p className="text-xs text-muted-foreground">{list.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handlePreview(list.filters)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(list.list_id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]"><Filter className="w-2.5 h-2.5 mr-0.5" />{filterCount} {isEs ? "filtros" : "filters"}</Badge>
                    {f.has_email && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700"><Mail className="w-2.5 h-2.5 mr-0.5" />{isEs ? "Con email" : "Has email"}</Badge>}
                    {f.statuses?.map(s => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
                    {f.cities?.slice(0, 2).map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Lista Dinámica" : "New Dynamic List"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={isEs ? "Ej: Hot leads Santo Domingo" : "E.g.: Hot leads Santo Domingo"} data-testid="dynamic-list-name" />
            </div>
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>

            {/* Status filter */}
            <div>
              <Label className="text-xs">{isEs ? "Status" : "Status"}</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => setForm({ ...form, statuses: toggleArrayItem(form.statuses, s) })}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${form.statuses.includes(s) ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* City filter */}
            {cities.length > 0 && (
              <div>
                <Label className="text-xs">{isEs ? "Ciudades" : "Cities"}</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {cities.map(c => (
                    <button key={c} onClick={() => setForm({ ...form, cities: toggleArrayItem(form.cities, c) })}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-all ${form.cities.includes(c) ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Source filter */}
            <div>
              <Label className="text-xs">{isEs ? "Fuentes" : "Sources"}</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {sources.slice(0, 10).map(s => (
                  <button key={s} onClick={() => setForm({ ...form, sources: toggleArrayItem(form.sources, s) })}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${form.sources.includes(s) ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Tag filter */}
            {tags.length > 0 && (
              <div>
                <Label className="text-xs">Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {tags.map(t => (
                    <button key={t} onClick={() => setForm({ ...form, tags: toggleArrayItem(form.tags, t) })}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-all ${form.tags.includes(t) ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Type filter */}
            <div>
              <Label className="text-xs">{isEs ? "Tipo de Lead" : "Lead Type"}</Label>
              <div className="flex gap-1 mt-1">
                {TYPE_OPTIONS.map(t => (
                  <button key={t.value} onClick={() => setForm({ ...form, lead_types: toggleArrayItem(form.lead_types, t.value) })}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${form.lead_types.includes(t.value) ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Has email */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.has_email} onChange={e => setForm({ ...form, has_email: e.target.checked })} className="rounded" />
              {isEs ? "Solo leads con email" : "Only leads with email"}
            </label>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => handlePreview()} data-testid="preview-list-btn">
              <Eye className="w-4 h-4 mr-1" /> {isEs ? "Vista previa" : "Preview"}
            </Button>
            <Button onClick={handleCreate} data-testid="save-dynamic-list-btn">
              <Plus className="w-4 h-4 mr-1" /> {isEs ? "Crear Lista" : "Create List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {isEs ? "Vista Previa" : "Preview"} — {previewData?.count || 0} leads
            </DialogTitle>
          </DialogHeader>
          {previewData && previewData.leads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>{isEs ? "Ciudad" : "City"}</TableHead>
                  <TableHead>{isEs ? "Fuente" : "Source"}</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.leads.slice(0, 50).map(lead => (
                  <TableRow key={lead.lead_id}>
                    <TableCell className="text-sm font-medium">{lead.lead_name}</TableCell>
                    <TableCell className="text-xs">{lead.email || "-"}</TableCell>
                    <TableCell className="text-xs">{lead.city || "-"}</TableCell>
                    <TableCell className="text-xs">{lead.source || "-"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{lead.outreach_status || lead.status || "-"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">{isEs ? "No hay leads que coincidan" : "No matching leads"}</p>
          )}
          {previewData && previewData.count > 50 && (
            <p className="text-xs text-muted-foreground text-center">{isEs ? `Mostrando 50 de ${previewData.count}` : `Showing 50 of ${previewData.count}`}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
