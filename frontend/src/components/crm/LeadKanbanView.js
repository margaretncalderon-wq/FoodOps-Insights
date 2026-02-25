// components/crm/LeadKanbanView.js - Kanban view for leads pipeline
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { API_BASE as API } from "../../utils/api";

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { ScrollArea } from "../ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { toast } from "sonner";

// Icons
import {
  GripVertical, MoreVertical, User, Phone, Mail, Building2,
  Plus, Settings, Trash2, ChevronRight, RefreshCw, DollarSign,
  Eye, Edit2, X
} from "lucide-react";

export default function LeadKanbanView({ onLeadClick }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();

  // State
  const [stages, setStages] = useState([]);
  const [leadsByStage, setLeadsByStage] = useState({});
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [showStageSettings, setShowStageSettings] = useState(false);
  const [editingStages, setEditingStages] = useState([]);

  // Fetch data
  const fetchKanbanData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/leads/by-stage`, { withCredentials: true });
      setStages(res.data.stages || []);
      setLeadsByStage(res.data.leads_by_stage || {});
    } catch (error) {
      console.error("Error fetching kanban data:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKanbanData();
  }, [fetchKanbanData]);

  // Drag handlers
  const handleDragStart = (e, lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", lead.lead_id);
    // Add dragging class
    e.target.classList.add("opacity-50");
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove("opacity-50");
    setDraggedLead(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageId);
  };

  const handleDragLeave = (e) => {
    setDragOverStage(null);
  };

  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    setDragOverStage(null);

    if (!draggedLead) return;

    // Optimistic update
    const oldStageId = draggedLead.pipeline_stage || getStageIdFromStatus(draggedLead);
    if (oldStageId === stageId) return;

    // Update UI immediately
    setLeadsByStage(prev => {
      const newState = { ...prev };
      // Remove from old stage
      if (newState[oldStageId]) {
        newState[oldStageId] = newState[oldStageId].filter(l => l.lead_id !== draggedLead.lead_id);
      }
      // Add to new stage
      if (!newState[stageId]) newState[stageId] = [];
      const updatedLead = { ...draggedLead, pipeline_stage: stageId };
      newState[stageId] = [updatedLead, ...newState[stageId]];
      return newState;
    });

    // Update backend
    try {
      await axios.patch(
        `${API}/api/crm/leads/${draggedLead.lead_id}/stage`,
        { stage_id: stageId },
        { withCredentials: true }
      );
      toast.success(isEs ? "Lead movido" : "Lead moved");
    } catch (error) {
      console.error("Error moving lead:", error);
      toast.error(isEs ? "Error al mover lead" : "Error moving lead");
      // Revert on error
      fetchKanbanData();
    }
  };

  // Helper to get stage from status (backward compat)
  const getStageIdFromStatus = (lead) => {
    const status = (lead.outreach_status || lead.status || "new").toLowerCase();
    const mapping = {
      "new": "new",
      "contacted": "contacted",
      "noresponse": "new",
      "engaged": "qualified",
    };
    return mapping[status] || "new";
  };

  // Stage settings handlers
  const openStageSettings = () => {
    setEditingStages([...stages]);
    setShowStageSettings(true);
  };

  const addNewStage = () => {
    const newStage = {
      id: `stage_${Date.now()}`,
      name: "New Stage",
      name_es: "Nueva Etapa",
      color: "#6B7280",
      order: editingStages.length + 1
    };
    setEditingStages([...editingStages, newStage]);
  };

  const updateStage = (index, field, value) => {
    const updated = [...editingStages];
    updated[index] = { ...updated[index], [field]: value };
    setEditingStages(updated);
  };

  const removeStage = (index) => {
    if (editingStages.length <= 2) {
      toast.error(isEs ? "Mínimo 2 etapas requeridas" : "Minimum 2 stages required");
      return;
    }
    const updated = editingStages.filter((_, i) => i !== index);
    setEditingStages(updated);
  };

  const saveStages = async () => {
    try {
      await axios.put(
        `${API}/api/crm/pipeline-stages`,
        { stages: editingStages },
        { withCredentials: true }
      );
      setStages(editingStages);
      setShowStageSettings(false);
      toast.success(isEs ? "Etapas guardadas" : "Stages saved");
      fetchKanbanData();
    } catch (error) {
      console.error("Error saving stages:", error);
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
  };

  const resetToDefaults = async () => {
    if (!window.confirm(isEs ? "¿Restaurar etapas por defecto?" : "Reset to default stages?")) return;
    try {
      const res = await axios.post(`${API}/api/crm/pipeline-stages/reset`, {}, { withCredentials: true });
      setStages(res.data.stages);
      setShowStageSettings(false);
      toast.success(isEs ? "Etapas restauradas" : "Stages reset");
      fetchKanbanData();
    } catch (error) {
      console.error("Error resetting stages:", error);
    }
  };

  // Format currency
  const formatCurrency = (value) => {
    if (!value) return null;
    return new Intl.NumberFormat(isEs ? 'es-DO' : 'en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full" data-testid="lead-kanban-view">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{isEs ? "Pipeline de Ventas" : "Sales Pipeline"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Arrastra leads entre etapas" : "Drag leads between stages"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openStageSettings}>
          <Settings className="w-4 h-4 mr-2" />
          {isEs ? "Configurar Etapas" : "Configure Stages"}
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "500px" }}>
        {stages.map((stage) => {
          const stageLeads = leadsByStage[stage.id] || [];
          const totalValue = stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0), 0);
          
          return (
            <div
              key={stage.id}
              className={`flex-shrink-0 w-72 bg-muted/30 rounded-lg transition-all ${
                dragOverStage === stage.id ? "ring-2 ring-primary bg-primary/5" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              {/* Stage Header */}
              <div 
                className="p-3 border-b"
                style={{ borderLeftColor: stage.color, borderLeftWidth: "4px" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {isEs ? stage.name_es || stage.name : stage.name}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {stageLeads.length}
                    </Badge>
                  </div>
                </div>
                {totalValue > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {formatCurrency(totalValue)}
                  </p>
                )}
              </div>

              {/* Leads */}
              <ScrollArea className="h-[450px] p-2">
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <Card
                      key={lead.lead_id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {lead.lead_name || lead.company_name || "Sin nombre"}
                              </p>
                              {lead.company_name && lead.lead_name && (
                                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {lead.company_name}
                                </p>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                <MoreVertical className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onLeadClick?.(lead)}>
                                <Eye className="w-4 h-4 mr-2" />
                                {isEs ? "Ver Detalles" : "View Details"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Contact info */}
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {lead.email && (
                            <p className="flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 shrink-0" />
                              {lead.email}
                            </p>
                          )}
                          {(lead.phone || lead.whatsapp) && (
                            <p className="flex items-center gap-1">
                              <Phone className="w-3 h-3 shrink-0" />
                              {lead.phone || lead.whatsapp}
                            </p>
                          )}
                        </div>

                        {/* Value & Owner */}
                        <div className="mt-2 flex items-center justify-between">
                          {lead.estimated_value ? (
                            <Badge variant="outline" className="text-xs">
                              {formatCurrency(lead.estimated_value)}
                            </Badge>
                          ) : <span />}
                          {lead.owner_name && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Avatar className="h-4 w-4">
                                <AvatarFallback className="text-[8px]">
                                  {lead.owner_name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate max-w-[60px]">{lead.owner_name}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {stageLeads.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      <p>{isEs ? "Sin leads" : "No leads"}</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      {/* Stage Settings Dialog */}
      <Dialog open={showStageSettings} onOpenChange={setShowStageSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Configurar Etapas del Pipeline" : "Configure Pipeline Stages"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {editingStages.map((stage, index) => (
              <div key={stage.id} className="flex items-center gap-2 p-2 border rounded">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => updateStage(index, "color", e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer"
                />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    value={stage.name}
                    onChange={(e) => updateStage(index, "name", e.target.value)}
                    placeholder="English"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={stage.name_es || ""}
                    onChange={(e) => updateStage(index, "name_es", e.target.value)}
                    placeholder="Español"
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeStage(index)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addNewStage}>
              <Plus className="w-4 h-4 mr-1" />
              {isEs ? "Agregar Etapa" : "Add Stage"}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetToDefaults} className="text-muted-foreground">
              {isEs ? "Restaurar Defecto" : "Reset to Default"}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStageSettings(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={saveStages}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
