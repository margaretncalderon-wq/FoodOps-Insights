import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Save, RefreshCw, Clock, Plus, Trash2, GripVertical,
  FileText, AlertCircle, Play, Pause
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

import { API_BASE as API } from "../../utils/api";

export default function RunOfShowTab({ eventId, eventType }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ros, setRos] = useState({
    time_blocks: [],
    template_name: null,
    contingency_notes: ""
  });
  const [templates, setTemplates] = useState({});
  const [templateDialog, setTemplateDialog] = useState(false);
  const [blockDialog, setBlockDialog] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);
  const [newBlock, setNewBlock] = useState({
    start_time: "09:00",
    end_time: "10:00",
    title: "",
    description: "",
    responsible_role: "",
    location: "",
    is_buffer: false
  });

  const fetchData = useCallback(async () => {
    try {
      const [rosRes, templatesRes] = await Promise.all([
        axios.get(`${API}/api/orchestration/run-of-show/${eventId}`, { withCredentials: true }),
        axios.get(`${API}/api/orchestration/run-of-show/templates`, { withCredentials: true })
      ]);
      setRos(rosRes.data);
      setTemplates(templatesRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/run-of-show/${eventId}`, { event_id: eventId, ...ros }, { withCredentials: true });
      toast.success(isEs ? "Run of Show guardado" : "Run of Show saved");
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
    setSaving(false);
  };

  const applyTemplate = async (templateKey) => {
    try {
      const res = await axios.post(
        `${API}/api/orchestration/run-of-show/${eventId}/apply-template?template_key=${templateKey}`,
        {},
        { withCredentials: true }
      );
      setRos(res.data);
      toast.success(isEs ? "Plantilla aplicada" : "Template applied");
      setTemplateDialog(false);
    } catch (err) {
      toast.error(isEs ? "Error al aplicar plantilla" : "Failed to apply template");
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(ros.time_blocks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update order numbers
    const updatedItems = items.map((item, index) => ({ ...item, order: index }));
    setRos({ ...ros, time_blocks: updatedItems });
  };

  const addBlock = () => {
    const block = {
      ...newBlock,
      block_id: `block_${Date.now()}`,
      order: ros.time_blocks.length
    };
    setRos({ ...ros, time_blocks: [...ros.time_blocks, block] });
    setNewBlock({
      start_time: "09:00",
      end_time: "10:00",
      title: "",
      description: "",
      responsible_role: "",
      location: "",
      is_buffer: false
    });
    setBlockDialog(false);
  };

  const updateBlock = () => {
    if (!editingBlock) return;
    setRos({
      ...ros,
      time_blocks: ros.time_blocks.map(b => b.block_id === editingBlock.block_id ? editingBlock : b)
    });
    setEditingBlock(null);
    setBlockDialog(false);
  };

  const removeBlock = (blockId) => {
    setRos({ ...ros, time_blocks: ros.time_blocks.filter(b => b.block_id !== blockId) });
  };

  const openEditBlock = (block) => {
    setEditingBlock({ ...block });
    setBlockDialog(true);
  };

  const openNewBlock = () => {
    setEditingBlock(null);
    setBlockDialog(true);
  };

  const formatTime = (time) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const calculateDuration = (start, end) => {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const diff = endMins - startMins;
    if (diff <= 0) return "";
    if (diff < 60) return `${diff}min`;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="run-of-show-tab">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Run of Show
          </h2>
          {ros.template_name && (
            <p className="text-sm text-muted-foreground">
              {isEs ? "Basado en" : "Based on"}: {ros.template_name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateDialog(true)}>
            <FileText className="w-4 h-4 mr-2" />
            {isEs ? "Usar Plantilla" : "Use Template"}
          </Button>
          <Button variant="outline" onClick={openNewBlock}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Agregar Bloque" : "Add Block"}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {ros.time_blocks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {isEs ? "No hay bloques de tiempo. Agrega bloques o usa una plantilla." : "No time blocks. Add blocks or use a template."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="timeline">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {ros.time_blocks
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((block, index) => (
                    <Draggable key={block.block_id} draggableId={block.block_id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`${snapshot.isDragging ? "shadow-lg" : ""}`}
                        >
                          <Card className={`${block.is_buffer ? "border-dashed border-yellow-400 bg-yellow-50/30" : ""}`}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <div {...provided.dragHandleProps} className="mt-1 cursor-grab">
                                  <GripVertical className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm font-medium text-primary">
                                          {formatTime(block.start_time)} - {formatTime(block.end_time)}
                                        </span>
                                        <Badge variant="outline" className="text-xs">
                                          {calculateDuration(block.start_time, block.end_time)}
                                        </Badge>
                                        {block.is_buffer && (
                                          <Badge className="bg-yellow-100 text-yellow-700">
                                            <Pause className="w-3 h-3 mr-1" />
                                            Buffer
                                          </Badge>
                                        )}
                                      </div>
                                      <h4 className="font-semibold mt-1">{block.title}</h4>
                                      {block.description && (
                                        <p className="text-sm text-muted-foreground mt-1">{block.description}</p>
                                      )}
                                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                        {block.responsible_role && (
                                          <span>{isEs ? "Responsable" : "Responsible"}: {block.responsible_role}</span>
                                        )}
                                        {block.location && (
                                          <span>{isEs ? "Lugar" : "Location"}: {block.location}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" onClick={() => openEditBlock(block)}>
                                        {isEs ? "Editar" : "Edit"}
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => removeBlock(block.block_id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </Draggable>
                  ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Contingency Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-500" />
            {isEs ? "Notas de Contingencia" : "Contingency Notes"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={ros.contingency_notes || ""}
            onChange={(e) => setRos({ ...ros, contingency_notes: e.target.value })}
            placeholder={isEs ? "Qué hacer si algo sale mal..." : "What to do if something goes wrong..."}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEs ? "Guardar Run of Show" : "Save Run of Show"}
        </Button>
      </div>

      {/* Template Dialog */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Seleccionar Plantilla" : "Select Template"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Esto reemplazará los bloques actuales" : "This will replace current blocks"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {Object.entries(templates).map(([key, template]) => (
              <Button
                key={key}
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => applyTemplate(key)}
              >
                <div className="text-left">
                  <p className="font-medium">{isEs ? template.name_es : template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {template.blocks?.length || 0} {isEs ? "bloques" : "blocks"}
                  </p>
                </div>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={blockDialog} onOpenChange={setBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBlock 
                ? (isEs ? "Editar Bloque" : "Edit Block")
                : (isEs ? "Nuevo Bloque" : "New Block")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Hora Inicio" : "Start Time"}</Label>
                <Input
                  type="time"
                  value={editingBlock?.start_time || newBlock.start_time}
                  onChange={(e) => editingBlock 
                    ? setEditingBlock({ ...editingBlock, start_time: e.target.value })
                    : setNewBlock({ ...newBlock, start_time: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Hora Fin" : "End Time"}</Label>
                <Input
                  type="time"
                  value={editingBlock?.end_time || newBlock.end_time}
                  onChange={(e) => editingBlock 
                    ? setEditingBlock({ ...editingBlock, end_time: e.target.value })
                    : setNewBlock({ ...newBlock, end_time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>{isEs ? "Título" : "Title"} *</Label>
              <Input
                value={editingBlock?.title || newBlock.title}
                onChange={(e) => editingBlock 
                  ? setEditingBlock({ ...editingBlock, title: e.target.value })
                  : setNewBlock({ ...newBlock, title: e.target.value })}
                placeholder={isEs ? "Ej: Ceremonia" : "E.g.: Ceremony"}
              />
            </div>
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={editingBlock?.description || newBlock.description}
                onChange={(e) => editingBlock 
                  ? setEditingBlock({ ...editingBlock, description: e.target.value })
                  : setNewBlock({ ...newBlock, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Responsable" : "Responsible"}</Label>
                <Input
                  value={editingBlock?.responsible_role || newBlock.responsible_role}
                  onChange={(e) => editingBlock 
                    ? setEditingBlock({ ...editingBlock, responsible_role: e.target.value })
                    : setNewBlock({ ...newBlock, responsible_role: e.target.value })}
                  placeholder={isEs ? "Ej: Coordinador" : "E.g.: Coordinator"}
                />
              </div>
              <div>
                <Label>{isEs ? "Ubicación" : "Location"}</Label>
                <Input
                  value={editingBlock?.location || newBlock.location}
                  onChange={(e) => editingBlock 
                    ? setEditingBlock({ ...editingBlock, location: e.target.value })
                    : setNewBlock({ ...newBlock, location: e.target.value })}
                  placeholder={isEs ? "Ej: Jardín" : "E.g.: Garden"}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_buffer"
                checked={editingBlock?.is_buffer || newBlock.is_buffer}
                onChange={(e) => editingBlock 
                  ? setEditingBlock({ ...editingBlock, is_buffer: e.target.checked })
                  : setNewBlock({ ...newBlock, is_buffer: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is_buffer" className="font-normal">
                {isEs ? "Es tiempo de buffer/contingencia" : "Is buffer/contingency time"}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBlockDialog(false); setEditingBlock(null); }}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={editingBlock ? updateBlock : addBlock}>
              {editingBlock 
                ? (isEs ? "Actualizar" : "Update")
                : (isEs ? "Agregar" : "Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
