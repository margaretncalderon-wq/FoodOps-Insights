import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Save, RefreshCw, Target, FileText, AlertTriangle, Lock, CheckCircle } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { KoraLoader } from "../KoraLoader";

export default function EventBlueprintTab({ eventId, event, onUpdate }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blueprint, setBlueprint] = useState({
    objectives: "",
    scope_definition: "",
    critical_assumptions: "",
    constraints: "",
    success_criteria: ""
  });

  const fetchBlueprint = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/blueprint/${eventId}`, { withCredentials: true });
      if (res.data.blueprint) {
        setBlueprint({
          objectives: res.data.blueprint.objectives || "",
          scope_definition: res.data.blueprint.scope_definition || "",
          critical_assumptions: res.data.blueprint.critical_assumptions || "",
          constraints: res.data.blueprint.constraints || "",
          success_criteria: res.data.blueprint.success_criteria || ""
        });
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchBlueprint(); }, [fetchBlueprint]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/blueprint/${eventId}`, blueprint, { withCredentials: true });
      toast.success(isEs ? "Blueprint guardado" : "Blueprint saved");
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  return (
    <div className="space-y-6" data-testid="blueprint-tab">
      {/* Event Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isEs ? "Resumen del Evento" : "Event Summary"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{isEs ? "Tipo de Evento" : "Event Type"}</p>
              <p className="font-medium capitalize">{event?.event_type || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isEs ? "Invitados" : "Guests"}</p>
              <p className="font-medium">{event?.guest_count || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isEs ? "Fecha" : "Date"}</p>
              <p className="font-medium">
                {event?.event_date ? formatDateOnly(event.event_date, language) : "TBD"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isEs ? "Estado" : "Status"}</p>
              <Badge variant="outline">{event?.stage || "Lead"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blueprint Fields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              {isEs ? "Objetivos" : "Objectives"}
            </CardTitle>
            <CardDescription>
              {isEs ? "¿Qué debe lograr este evento?" : "What should this event achieve?"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={blueprint.objectives}
              onChange={(e) => setBlueprint({ ...blueprint, objectives: e.target.value })}
              placeholder={isEs ? "Ej: Celebrar la unión de X e Y con 150 invitados..." : "E.g.: Celebrate the union of X and Y with 150 guests..."}
              rows={4}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              {isEs ? "Definición de Alcance" : "Scope Definition"}
            </CardTitle>
            <CardDescription>
              {isEs ? "¿Qué incluye y qué NO incluye?" : "What's included and what's NOT?"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={blueprint.scope_definition}
              onChange={(e) => setBlueprint({ ...blueprint, scope_definition: e.target.value })}
              placeholder={isEs 
                ? "Incluye: Catering, decoración, DJ\nNo incluye: Transporte, fotografía" 
                : "Includes: Catering, decor, DJ\nExcludes: Transportation, photography"}
              rows={4}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              {isEs ? "Supuestos Críticos" : "Critical Assumptions"}
            </CardTitle>
            <CardDescription>
              {isEs ? "¿Qué asumimos que será verdad?" : "What are we assuming to be true?"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={blueprint.critical_assumptions}
              onChange={(e) => setBlueprint({ ...blueprint, critical_assumptions: e.target.value })}
              placeholder={isEs 
                ? "• El venue estará disponible a las 10am\n• El catering llegará 2 horas antes" 
                : "• Venue will be available at 10am\n• Catering will arrive 2 hours early"}
              rows={4}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-orange-500" />
              {isEs ? "Restricciones" : "Constraints"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Limitaciones que debemos respetar" : "Limitations we must respect"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={blueprint.constraints}
              onChange={(e) => setBlueprint({ ...blueprint, constraints: e.target.value })}
              placeholder={isEs 
                ? "• Presupuesto máximo: $X\n• Restricciones de ruido después de 10pm" 
                : "• Max budget: $X\n• Noise restrictions after 10pm"}
              rows={4}
            />
          </CardContent>
        </Card>
      </div>

      {/* Success Criteria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            {isEs ? "Criterios de Éxito" : "Success Criteria"}
          </CardTitle>
          <CardDescription>
            {isEs ? "¿Cómo sabremos que el evento fue exitoso?" : "How will we know the event was successful?"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={blueprint.success_criteria}
            onChange={(e) => setBlueprint({ ...blueprint, success_criteria: e.target.value })}
            placeholder={isEs 
              ? "• Los invitados disfrutaron la experiencia\n• Se cumplió el timeline\n• Cliente satisfecho" 
              : "• Guests enjoyed the experience\n• Timeline was met\n• Client satisfied"}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEs ? "Guardar Blueprint" : "Save Blueprint"}
        </Button>
      </div>
    </div>
  );
}
