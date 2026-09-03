import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Progress } from "../ui/progress";
import { 
  Save, RefreshCw, GitBranch, Plus, Trash2, AlertTriangle,
  CheckCircle, Clock, Play, ChevronDown, ChevronRight
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import GuestFlowSection from "./GuestFlowSection";
import { KoraLoader } from "../KoraLoader";

const PHASE_STATUSES = [
  { value: "pending", label: "Pending", labelEs: "Pendiente", color: "bg-gray-100 text-gray-700" },
  { value: "in_progress", label: "In Progress", labelEs: "En Progreso", color: "bg-blue-100 text-blue-700" },
  { value: "completed", label: "Completed", labelEs: "Completado", color: "bg-green-100 text-green-700" },
];

const RISK_LEVELS = [
  { value: "low", label: "Low", labelEs: "Bajo", color: "bg-green-100 text-green-700" },
  { value: "medium", label: "Medium", labelEs: "Medio", color: "bg-yellow-100 text-yellow-700" },
  { value: "high", label: "High", labelEs: "Alto", color: "bg-red-100 text-red-700" },
];

export default function OperationalFlowTab({ eventId }) {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flow, setFlow] = useState({
    phases: [],
    dependencies: [],
    risks: [],
    overall_status: "planning"
  });
  const [expandedPhases, setExpandedPhases] = useState({});
  const [riskDialog, setRiskDialog] = useState(false);
  const [depDialog, setDepDialog] = useState(false);
  const [newRisk, setNewRisk] = useState({ name: "", probability: "medium", impact: "medium", mitigation: "" });
  const [newDep, setNewDep] = useState({ name: "", type: "", status: "pending" });

  const fetchFlow = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/operational-flow/${eventId}`, { withCredentials: true });
      setFlow(res.data);
      // Expand all phases by default
      const expanded = {};
      res.data.phases?.forEach(p => { expanded[p.phase_id] = true; });
      setExpandedPhases(expanded);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchFlow(); }, [fetchFlow]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/operational-flow/${eventId}`, { event_id: eventId, ...flow }, { withCredentials: true });
      toast.success(isEs ? "Flujo guardado" : "Flow saved");
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
    setSaving(false);
  };

  const updatePhaseStatus = (phaseId, status) => {
    setFlow({
      ...flow,
      phases: flow.phases.map(p => p.phase_id === phaseId ? { ...p, status } : p)
    });
  };

  const addChecklistItem = (phaseId) => {
    setFlow({
      ...flow,
      phases: flow.phases.map(p => {
        if (p.phase_id === phaseId) {
          return {
            ...p,
            checklist: [...(p.checklist || []), { item: "", completed: false, id: Date.now() }]
          };
        }
        return p;
      })
    });
  };

  const updateChecklistItem = (phaseId, itemId, updates) => {
    setFlow({
      ...flow,
      phases: flow.phases.map(p => {
        if (p.phase_id === phaseId) {
          return {
            ...p,
            checklist: p.checklist.map(item => item.id === itemId ? { ...item, ...updates } : item)
          };
        }
        return p;
      })
    });
  };

  const removeChecklistItem = (phaseId, itemId) => {
    setFlow({
      ...flow,
      phases: flow.phases.map(p => {
        if (p.phase_id === phaseId) {
          return {
            ...p,
            checklist: p.checklist.filter(item => item.id !== itemId)
          };
        }
        return p;
      })
    });
  };

  const addRisk = () => {
    if (!newRisk.name) return;
    setFlow({ ...flow, risks: [...flow.risks, { ...newRisk, id: Date.now() }] });
    setNewRisk({ name: "", probability: "medium", impact: "medium", mitigation: "" });
    setRiskDialog(false);
  };

  const removeRisk = (id) => {
    setFlow({ ...flow, risks: flow.risks.filter(r => r.id !== id) });
  };

  const addDependency = () => {
    if (!newDep.name) return;
    setFlow({ ...flow, dependencies: [...flow.dependencies, { ...newDep, id: Date.now() }] });
    setNewDep({ name: "", type: "", status: "pending" });
    setDepDialog(false);
  };

  const removeDependency = (id) => {
    setFlow({ ...flow, dependencies: flow.dependencies.filter(d => d.id !== id) });
  };

  const togglePhase = (phaseId) => {
    setExpandedPhases({ ...expandedPhases, [phaseId]: !expandedPhases[phaseId] });
  };

  const getPhaseProgress = (phase) => {
    if (!phase.checklist || phase.checklist.length === 0) return 0;
    const completed = phase.checklist.filter(item => item.completed).length;
    return Math.round((completed / phase.checklist.length) * 100);
  };

  const getOverallProgress = () => {
    const completed = flow.phases.filter(p => p.status === "completed").length;
    return Math.round((completed / flow.phases.length) * 100);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  return (
    <div className="space-y-6" data-testid="operational-flow-tab">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                {isEs ? "Estado General" : "Overall Status"}
              </CardTitle>
              <CardDescription>
                {isEs ? "Progreso de las fases operativas" : "Operational phases progress"}
              </CardDescription>
            </div>
            <Select value={flow.overall_status} onValueChange={(v) => setFlow({ ...flow, overall_status: v })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">{isEs ? "Planificación" : "Planning"}</SelectItem>
                <SelectItem value="ready">{isEs ? "Listo" : "Ready"}</SelectItem>
                <SelectItem value="executing">{isEs ? "En Ejecución" : "Executing"}</SelectItem>
                <SelectItem value="completed">{isEs ? "Completado" : "Completed"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{isEs ? "Progreso General" : "Overall Progress"}</span>
              <span className="font-medium">{getOverallProgress()}%</span>
            </div>
            <Progress value={getOverallProgress()} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Phases */}
      <div className="space-y-4">
        <h3 className="font-semibold">{isEs ? "Fases Operativas" : "Operational Phases"}</h3>
        {flow.phases.map((phase) => {
          const statusInfo = PHASE_STATUSES.find(s => s.value === phase.status) || PHASE_STATUSES[0];
          const progress = getPhaseProgress(phase);
          const isExpanded = expandedPhases[phase.phase_id];

          return (
            <Card key={phase.phase_id}>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => togglePhase(phase.phase_id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <div>
                      <CardTitle className="text-base">{phase.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={progress} className="w-24 h-1.5" />
                        <span className="text-xs text-muted-foreground">{progress}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Select value={phase.status} onValueChange={(v) => updatePhaseStatus(phase.phase_id, v)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PHASE_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>
                            {isEs ? s.labelEs : s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{isEs ? "Lista de Verificación" : "Checklist"}</Label>
                      <Button variant="ghost" size="sm" onClick={() => addChecklistItem(phase.phase_id)}>
                        <Plus className="w-4 h-4 mr-1" />
                        {isEs ? "Agregar" : "Add"}
                      </Button>
                    </div>
                    {(phase.checklist || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">{isEs ? "Sin items" : "No items"}</p>
                    ) : (
                      <div className="space-y-2">
                        {phase.checklist.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={item.completed}
                              onCheckedChange={(checked) => updateChecklistItem(phase.phase_id, item.id, { completed: checked })}
                            />
                            <Input
                              value={item.item || ""}
                              onChange={(e) => updateChecklistItem(phase.phase_id, item.id, { item: e.target.value })}
                              className="flex-1"
                              placeholder={isEs ? "Descripción del item..." : "Item description..."}
                            />
                            <Button variant="ghost" size="icon" onClick={() => removeChecklistItem(phase.phase_id, item.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Dependencies */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{isEs ? "Dependencias" : "Dependencies"}</CardTitle>
            <CardDescription>{isEs ? `Elementos de los que depende el ${term("events", "entity_singular").toLowerCase()}` : `Elements the ${term("events", "entity_singular").toLowerCase()} depends on`}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDepDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </CardHeader>
        <CardContent>
          {flow.dependencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isEs ? "Sin dependencias" : "No dependencies"}</p>
          ) : (
            <div className="space-y-2">
              {flow.dependencies.map((dep) => (
                <div key={dep.id} className="flex items-center justify-between p-2 border rounded-lg">
                  <div>
                    <p className="font-medium">{dep.name}</p>
                    {dep.type && <p className="text-xs text-muted-foreground">{dep.type}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{dep.status}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => removeDependency(dep.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risks */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              {isEs ? "Riesgos Operativos" : "Operational Risks"}
            </CardTitle>
            <CardDescription>{isEs ? "Riesgos identificados y mitigación" : "Identified risks and mitigation"}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRiskDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </CardHeader>
        <CardContent>
          {flow.risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isEs ? "Sin riesgos identificados" : "No risks identified"}</p>
          ) : (
            <div className="space-y-3">
              {flow.risks.map((risk) => {
                const probLevel = RISK_LEVELS.find(r => r.value === risk.probability);
                const impactLevel = RISK_LEVELS.find(r => r.value === risk.impact);
                return (
                  <div key={risk.id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{risk.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">{isEs ? "Probabilidad" : "Probability"}:</span>
                          <Badge className={probLevel?.color}>{isEs ? probLevel?.labelEs : probLevel?.label}</Badge>
                          <span className="text-xs text-muted-foreground">{isEs ? "Impacto" : "Impact"}:</span>
                          <Badge className={impactLevel?.color}>{isEs ? impactLevel?.labelEs : impactLevel?.label}</Badge>
                        </div>
                        {risk.mitigation && (
                          <p className="text-sm text-muted-foreground mt-2">
                            <strong>{isEs ? "Mitigación" : "Mitigation"}:</strong> {risk.mitigation}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeRisk(risk.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guest Flow Section */}
      <GuestFlowSection eventId={eventId} language={language} />

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEs ? "Guardar Flujo" : "Save Flow"}
        </Button>
      </div>

      {/* Risk Dialog */}
      <Dialog open={riskDialog} onOpenChange={setRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Riesgo" : "Add Risk"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Descripción del Riesgo" : "Risk Description"}</Label>
              <Input value={newRisk.name} onChange={(e) => setNewRisk({ ...newRisk, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Probabilidad" : "Probability"}</Label>
                <Select value={newRisk.probability} onValueChange={(v) => setNewRisk({ ...newRisk, probability: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{isEs ? r.labelEs : r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Impacto" : "Impact"}</Label>
                <Select value={newRisk.impact} onValueChange={(v) => setNewRisk({ ...newRisk, impact: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{isEs ? r.labelEs : r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{isEs ? "Plan de Mitigación" : "Mitigation Plan"}</Label>
              <Textarea value={newRisk.mitigation} onChange={(e) => setNewRisk({ ...newRisk, mitigation: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={addRisk}>{isEs ? "Agregar" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dependency Dialog */}
      <Dialog open={depDialog} onOpenChange={setDepDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Dependencia" : "Add Dependency"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input value={newDep.name} onChange={(e) => setNewDep({ ...newDep, name: e.target.value })} placeholder={isEs ? "Ej: Confirmación del venue" : "E.g.: Venue confirmation"} />
            </div>
            <div>
              <Label>{isEs ? "Tipo" : "Type"}</Label>
              <Input value={newDep.type} onChange={(e) => setNewDep({ ...newDep, type: e.target.value })} placeholder={isEs ? "Ej: Proveedor externo" : "E.g.: External vendor"} />
            </div>
            <div>
              <Label>{isEs ? "Estado" : "Status"}</Label>
              <Select value={newDep.status} onValueChange={(v) => setNewDep({ ...newDep, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{isEs ? "Pendiente" : "Pending"}</SelectItem>
                  <SelectItem value="confirmed">{isEs ? "Confirmado" : "Confirmed"}</SelectItem>
                  <SelectItem value="at_risk">{isEs ? "En Riesgo" : "At Risk"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={addDependency}>{isEs ? "Agregar" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
