// pages/demand-studio/NotesPage.js - Notes section for Demand Studio
import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  FileText, Plus, Search, Folder, Tag, MoreVertical, Edit2, Trash2,
  Paperclip, Image, Sparkles, Loader2, Calendar, Link2, X, Upload,
  FolderPlus, ChevronRight
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const NOTE_COLORS = [
  { value: "default", label: "Default", bg: "bg-white dark:bg-gray-900", border: "border-gray-200" },
  { value: "yellow", label: "Yellow", bg: "bg-yellow-50", border: "border-yellow-200" },
  { value: "green", label: "Green", bg: "bg-green-50", border: "border-green-200" },
  { value: "blue", label: "Blue", bg: "bg-blue-50", border: "border-blue-200" },
  { value: "purple", label: "Purple", bg: "bg-purple-50", border: "border-purple-200" },
  { value: "pink", label: "Pink", bg: "bg-pink-50", border: "border-pink-200" },
];

export default function NotesPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  // Get org context from parent (DemandStudioPage)
  const outletContext = useOutletContext() || {};
  const { selectedOrgId, selectedOrg, isOwnOrg } = outletContext;
  
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    folder_id: "",
    color: "default",
    tags: [],
    linked_campaign_id: "",
    attachments: []
  });
  
  const [newFolderName, setNewFolderName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [campaigns, setCampaigns] = useState([]);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/api/demand-studio/notes`;
      const params = [];
      if (selectedFolder !== "all") {
        params.push(`folder_id=${selectedFolder}`);
      }
      if (selectedOrgId && !isOwnOrg) {
        params.push(`org_id=${selectedOrgId}`);
      }
      if (params.length) url += `?${params.join("&")}`;
      const res = await axios.get(url, { withCredentials: true });
      setNotes(res.data || []);
    } catch (err) {
      console.error("Error fetching notes:", err);
      toast.error(isEs ? "Error al cargar notas" : "Error loading notes");
    }
    setLoading(false);
  }, [selectedFolder, isEs, selectedOrgId, isOwnOrg]);

  const fetchFolders = useCallback(async () => {
    try {
      const orgParam = selectedOrgId && !isOwnOrg ? `?org_id=${selectedOrgId}` : "";
      const res = await axios.get(`${API}/api/demand-studio/notes/folders${orgParam}`, { withCredentials: true });
      setFolders(res.data || []);
    } catch (err) {
      console.error("Error fetching folders:", err);
    }
  }, [selectedOrgId, isOwnOrg]);

  const fetchCampaigns = useCallback(async () => {
    try {
      const orgParam = selectedOrgId && !isOwnOrg ? `?org_id=${selectedOrgId}` : "";
      const res = await axios.get(`${API}/api/demand-studio/campaigns${orgParam}`, { withCredentials: true });
      setCampaigns(res.data || []);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
    }
  }, [selectedOrgId, isOwnOrg]);

  useEffect(() => {
    fetchNotes();
    fetchFolders();
    fetchCampaigns();
  }, [fetchNotes, fetchFolders, fetchCampaigns, selectedOrgId]);

  const handleSaveNote = async () => {
    if (!formData.title.trim()) {
      toast.error(isEs ? "El título es requerido" : "Title is required");
      return;
    }

    try {
      if (editingNote) {
        await axios.put(`${API}/api/demand-studio/notes/${editingNote.note_id}`, formData, { withCredentials: true });
        toast.success(isEs ? "Nota actualizada" : "Note updated");
      } else {
        await axios.post(`${API}/api/demand-studio/notes`, formData, { withCredentials: true });
        toast.success(isEs ? "Nota creada" : "Note created");
      }
      setDialogOpen(false);
      resetForm();
      fetchNotes();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm(isEs ? "¿Eliminar esta nota?" : "Delete this note?")) return;
    
    try {
      await axios.delete(`${API}/api/demand-studio/notes/${noteId}`, { withCredentials: true });
      toast.success(isEs ? "Nota eliminada" : "Note deleted");
      fetchNotes();
    } catch (err) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await axios.post(`${API}/api/demand-studio/notes/folders`, {
        name: newFolderName
      }, { withCredentials: true });
      toast.success(isEs ? "Carpeta creada" : "Folder created");
      setFolderDialogOpen(false);
      setNewFolderName("");
      fetchFolders();
    } catch (err) {
      toast.error(isEs ? "Error al crear carpeta" : "Error creating folder");
    }
  };

  const handleAISummarize = async () => {
    if (!formData.content.trim()) {
      toast.error(isEs ? "Agrega contenido primero" : "Add content first");
      return;
    }
    
    setAiLoading(true);
    try {
      const res = await axios.post(`${API}/api/demand-studio/notes/ai/summarize`, {
        content: formData.content
      }, { withCredentials: true });
      
      setFormData(prev => ({
        ...prev,
        content: prev.content + "\n\n---\n**" + (isEs ? "Resumen AI" : "AI Summary") + ":**\n" + res.data.summary
      }));
      toast.success(isEs ? "Resumen generado" : "Summary generated");
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error con AI" : "AI error"));
    }
    setAiLoading(false);
  };

  const handleAIExtractActions = async () => {
    if (!formData.content.trim()) {
      toast.error(isEs ? "Agrega contenido primero" : "Add content first");
      return;
    }
    
    setAiLoading(true);
    try {
      const res = await axios.post(`${API}/api/demand-studio/notes/ai/extract-actions`, {
        content: formData.content
      }, { withCredentials: true });
      
      const actionItems = res.data.actions.map(a => `- [ ] ${a}`).join("\n");
      setFormData(prev => ({
        ...prev,
        content: prev.content + "\n\n---\n**" + (isEs ? "Action Items" : "Action Items") + ":**\n" + actionItems
      }));
      toast.success(isEs ? "Action items extraídos" : "Action items extracted");
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error con AI" : "AI error"));
    }
    setAiLoading(false);
  };

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      folder_id: "",
      color: "default",
      tags: [],
      linked_campaign_id: "",
      attachments: []
    });
    setEditingNote(null);
  };

  const openEditDialog = (note) => {
    setEditingNote(note);
    setFormData({
      title: note.title || "",
      content: note.content || "",
      folder_id: note.folder_id || "",
      color: note.color || "default",
      tags: note.tags || [],
      linked_campaign_id: note.linked_campaign_id || "",
      attachments: note.attachments || []
    });
    setDialogOpen(true);
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag("");
    }
  };

  const removeTag = (tag) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    const formDataUpload = new FormData();
    formDataUpload.append("file", files[0]);
    
    try {
      const res = await axios.post(`${API}/api/upload`, formDataUpload, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, {
          name: files[0].name,
          url: res.data.url,
          type: files[0].type
        }]
      }));
      toast.success(isEs ? "Archivo adjuntado" : "File attached");
    } catch (err) {
      toast.error(isEs ? "Error al subir archivo" : "Error uploading file");
    }
  };

  const filteredNotes = notes.filter(note =>
    note.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getNoteColor = (color) => {
    return NOTE_COLORS.find(c => c.value === color) || NOTE_COLORS[0];
  };

  return (
    <div className="space-y-6" data-testid="notes-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" />
            {isEs ? "Notas" : "Notes"}
          </h1>
          <p className="text-muted-foreground">
            {isEs ? "Ideas, briefs y referencias para tus campañas" : "Ideas, briefs and references for your campaigns"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Carpeta" : "New Folder"}
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Nota" : "New Note"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={isEs ? "Buscar notas..." : "Search notes..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedFolder} onValueChange={setSelectedFolder}>
          <SelectTrigger className="w-48">
            <Folder className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todas las carpetas" : "All folders"}</SelectItem>
            {folders.map(folder => (
              <SelectItem key={folder.folder_id} value={folder.folder_id}>
                {folder.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {isEs ? "No hay notas" : "No notes yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {isEs ? "Crea tu primera nota para empezar" : "Create your first note to get started"}
            </p>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nueva Nota" : "New Note"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map(note => {
            const colorStyle = getNoteColor(note.color);
            return (
              <Card 
                key={note.note_id} 
                className={`cursor-pointer hover:shadow-md transition-all ${colorStyle.bg} ${colorStyle.border}`}
                onClick={() => openEditDialog(note)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base line-clamp-1">{note.title}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(note); }}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          {isEs ? "Editar" : "Edit"}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.note_id); }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {isEs ? "Eliminar" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {note.content || (isEs ? "Sin contenido" : "No content")}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {note.tags?.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {note.tags?.length > 3 && (
                      <Badge variant="outline" className="text-xs">+{note.tags.length - 3}</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    {note.attachments?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        {note.attachments.length}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Note Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? (isEs ? "Editar Nota" : "Edit Note") : (isEs ? "Nueva Nota" : "New Note")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Título" : "Title"}</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder={isEs ? "Título de la nota..." : "Note title..."}
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{isEs ? "Contenido" : "Content"}</Label>
                <div className="flex gap-1">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAISummarize}
                    disabled={aiLoading}
                  >
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    {isEs ? "Resumir" : "Summarize"}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAIExtractActions}
                    disabled={aiLoading}
                  >
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    {isEs ? "Extraer Actions" : "Extract Actions"}
                  </Button>
                </div>
              </div>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder={isEs ? "Escribe tu nota aquí..." : "Write your note here..."}
                className="min-h-[200px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Carpeta" : "Folder"}</Label>
                <Select 
                  value={formData.folder_id || "none"} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, folder_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar carpeta" : "Select folder"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin carpeta" : "No folder"}</SelectItem>
                    {folders.map(folder => (
                      <SelectItem key={folder.folder_id} value={folder.folder_id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{isEs ? "Color" : "Color"}</Label>
                <Select 
                  value={formData.color} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, color: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_COLORS.map(color => (
                      <SelectItem key={color.value} value={color.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${color.bg} ${color.border} border`} />
                          {color.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{isEs ? "Vincular a Campaña" : "Link to Campaign"}</Label>
              <Select 
                value={formData.linked_campaign_id || "none"} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, linked_campaign_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar campaña" : "Select campaign"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin vincular" : "Not linked"}</SelectItem>
                  {campaigns.map(campaign => (
                    <SelectItem key={campaign.campaign_id} value={campaign.campaign_id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isEs ? "Etiquetas" : "Tags"}</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder={isEs ? "Nueva etiqueta..." : "New tag..."}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {formData.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => removeTag(tag)} />
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label>{isEs ? "Adjuntos" : "Attachments"}</Label>
              <div className="border-2 border-dashed rounded-lg p-4">
                <input
                  type="file"
                  id="note-file-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <label 
                  htmlFor="note-file-upload" 
                  className="cursor-pointer flex flex-col items-center gap-2 text-muted-foreground"
                >
                  <Upload className="w-8 h-8" />
                  <span className="text-sm">{isEs ? "Click para subir archivo" : "Click to upload file"}</span>
                </label>
              </div>
              {formData.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {formData.attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                      <Paperclip className="w-4 h-4" />
                      <span className="flex-1 truncate">{att.name}</span>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          attachments: prev.attachments.filter((_, i) => i !== idx)
                        }))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveNote}>
              {editingNote ? (isEs ? "Guardar" : "Save") : (isEs ? "Crear" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Carpeta" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{isEs ? "Nombre" : "Name"}</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={isEs ? "Nombre de la carpeta..." : "Folder name..."}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateFolder}>
              {isEs ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
