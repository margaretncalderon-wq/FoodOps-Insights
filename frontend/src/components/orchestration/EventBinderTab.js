import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { 
  RefreshCw, FileText, Calendar, Users, DollarSign, 
  CheckCircle, XCircle, Star, Printer, Download,
  Building2, Clock, MapPin, Palette, Target, AlertTriangle
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { KoraLoader } from "../KoraLoader";

export default function EventBinderTab({ eventId }) {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [binder, setBinder] = useState(null);
  const [notes, setNotes] = useState("");
  const binderRef = useRef(null);

  const fetchBinder = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/binder/${eventId}`, { withCredentials: true });
      setBinder(res.data);
      setNotes(res.data.binder_notes || "");
    } catch (err) {
      console.error(err);
      toast.error(isEs ? `Error al cargar ${term("events", "entity_singular")} Binder` : `Failed to load ${term("events", "entity_singular")} Binder`);
    }
    setLoading(false);
  }, [eventId, isEs]);

  useEffect(() => { fetchBinder(); }, [fetchBinder]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/binder/${eventId}/notes`, notes, { 
        withCredentials: true,
        headers: { "Content-Type": "application/json" }
      });
      toast.success(isEs ? "Notas guardadas" : "Notes saved");
    } catch (err) {
      toast.error(isEs ? "Error al guardar notas" : "Failed to save notes");
    }
    setSaving(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return isEs ? "Sin fecha" : "No date";
    return formatDateOnly(dateStr, language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  if (!binder) return (
    <div className="text-center py-12 text-muted-foreground">
      <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>{isEs ? `No se pudo cargar el ${term("events", "entity_singular")} Binder` : `Could not load ${term("events", "entity_singular")} Binder`}</p>
    </div>
  );

  const es = binder.event_snapshot;
  const cs = binder.commercial_summary;
  const fs = binder.financial_summary;
  const ts = binder.team_summary;
  const pe = binder.post_event;

  return (
    <div className="space-y-6" data-testid="event-binder-tab" ref={binderRef}>
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" />
            {term("events", "entity_singular")} Binder
          </h2>
          <p className="text-muted-foreground">
            {isEs ? `Fuente única de verdad del ${term("events", "entity_singular").toLowerCase()}` : `Single source of truth for the ${term("events", "entity_singular").toLowerCase()}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchBinder}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            {isEs ? "Imprimir / PDF" : "Print / PDF"}
          </Button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-8">
        <h1 className="text-3xl font-bold">{es?.name}</h1>
        <p className="text-lg text-gray-600">{term("events", "entity_singular")} Binder - {isEs ? "Generado" : "Generated"}: {formatDate(binder.generated_at)}</p>
      </div>

      {/* Event Snapshot */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            {isEs ? `Resumen del ${term("events", "entity_singular")}` : `${term("events", "entity_singular")} Snapshot`}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">{isEs ? "Nombre" : "Name"}</p>
              <p className="text-lg font-semibold">{es?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isEs ? "Tipo" : "Type"}</p>
              <p className="text-lg">{es?.event_type || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {isEs ? "Fecha" : "Date"}
              </p>
              <p className="text-lg">{formatDate(es?.event_date)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {isEs ? "Lugar" : "Venue"}
              </p>
              <p className="text-lg">{es?.venue || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="w-4 h-4" />
                {isEs ? "Invitados" : "Guests"}
              </p>
              <p className="text-lg">{es?.guest_count || "?"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isEs ? "Estado" : "Status"}</p>
              <Badge className={es?.stage === "Won" ? "bg-green-500" : es?.stage === "Closed" ? "bg-gray-500" : "bg-blue-500"}>
                {es?.stage}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Info */}
      {binder.client && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {isEs ? "Cliente" : "Client"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Nombre" : "Name"}</p>
                <p className="font-medium">{binder.client.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{binder.client.email || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Teléfono" : "Phone"}</p>
                <p className="font-medium">{binder.client.phone || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commercial Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {isEs ? "Resumen Comercial" : "Commercial Summary"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-muted-foreground">{isEs ? "Valor Total" : "Total Value"}</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(cs?.total_value)}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-muted-foreground">{isEs ? "Items en Orden" : "Order Items"}</p>
              <p className="text-2xl font-bold">{cs?.order_items_count || 0}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-muted-foreground">{isEs ? "Estado Propuesta" : "Proposal Status"}</p>
              <Badge variant="outline">{cs?.proposal_status || "N/A"}</Badge>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-muted-foreground">{isEs ? "Items por Tipo" : "Items by Type"}</p>
              <div className="text-xs mt-1 space-y-1">
                <p>Food: {cs?.items_by_type?.Food || 0}</p>
                <p>Service: {cs?.items_by_type?.Service || 0}</p>
                <p>Rental: {cs?.items_by_type?.Rental || 0}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Reality */}
      <Card className="border-2 border-green-200">
        <CardHeader className="bg-green-50">
          <CardTitle className="flex items-center gap-2 text-green-700">
            <DollarSign className="w-5 h-5" />
            {isEs ? "Realidad Financiera" : "Financial Reality"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Facturado" : "Invoiced"}</p>
              <p className="text-xl font-bold">{formatCurrency(fs?.total_invoiced)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Cobrado" : "Collected"}</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(fs?.total_collected)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Por Cobrar" : "Balance Due"}</p>
              <p className={`text-xl font-bold ${fs?.balance_due > 0 ? "text-orange-500" : "text-green-600"}`}>
                {formatCurrency(fs?.balance_due)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Costo Total" : "Total Cost"}</p>
              <p className="text-xl font-bold text-red-500">{formatCurrency(fs?.total_cost)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Ganancia Est." : "Est. Profit"}</p>
              <p className={`text-xl font-bold ${fs?.estimated_profit > 0 ? "text-green-600" : "text-red-500"}`}>
                {formatCurrency(fs?.estimated_profit)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Margen" : "Margin"}</p>
              <p className={`text-xl font-bold ${fs?.profit_margin > 20 ? "text-green-600" : fs?.profit_margin > 0 ? "text-yellow-600" : "text-red-500"}`}>
                {fs?.profit_margin?.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Execution Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Blueprint */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              {isEs ? "Blueprint" : "Blueprint"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex items-center gap-2">
              {binder.blueprint?.objectives ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>{isEs ? "Objetivos definidos" : "Objectives defined"}</span>
            </div>
            <div className="flex items-center gap-2">
              {binder.blueprint?.scope_definition ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>{isEs ? "Alcance definido" : "Scope defined"}</span>
            </div>
            <div className="flex items-center gap-2">
              {binder.blueprint?.success_criteria ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>{isEs ? "Criterios de éxito" : "Success criteria"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Experience Design */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4" />
              {isEs ? "Diseño de Experiencia" : "Experience Design"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><span className="font-medium">{binder.experience_design?.color_palette?.length || 0}</span> {isEs ? "colores en paleta" : "colors in palette"}</p>
            <p><span className="font-medium">{binder.experience_design?.moodboard_count || 0}</span> {isEs ? "imágenes de moodboard" : "moodboard images"}</p>
            <p><span className="font-medium">{binder.experience_design?.zones_count || 0}</span> {isEs ? "zonas definidas" : "zones defined"}</p>
            {binder.experience_design?.catering_setup && (
              <Badge variant="outline">{binder.experience_design.catering_setup}</Badge>
            )}
          </CardContent>
        </Card>

        {/* Operational Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {isEs ? "Estado Operacional" : "Operational Status"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <Badge className={
              binder.operational_status?.overall_status === "ready" ? "bg-green-500" :
              binder.operational_status?.overall_status === "in_progress" ? "bg-yellow-500" :
              "bg-gray-500"
            }>
              {binder.operational_status?.overall_status || "planning"}
            </Badge>
            <p><span className="font-medium">{binder.operational_status?.phases_count || 0}</span> {isEs ? "fases" : "phases"}</p>
            <p><span className="font-medium">{binder.operational_status?.risks_count || 0}</span> {isEs ? "riesgos identificados" : "risks identified"}</p>
          </CardContent>
        </Card>

        {/* Run of Show */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Run of Show
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {binder.run_of_show_summary?.template_name && (
              <Badge variant="outline">{binder.run_of_show_summary.template_name}</Badge>
            )}
            <p><span className="font-medium">{binder.run_of_show_summary?.blocks_count || 0}</span> {isEs ? "bloques de tiempo" : "time blocks"}</p>
            <div className="flex items-center gap-2">
              {binder.run_of_show_summary?.has_contingency_notes ? 
                <CheckCircle className="w-4 h-4 text-green-500" /> : 
                <XCircle className="w-4 h-4 text-gray-300" />}
              <span>{isEs ? "Notas de contingencia" : "Contingency notes"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Team Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              {isEs ? "Equipo" : "Team"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><span className="font-medium">{ts?.total_roles || 0}</span> {isEs ? "roles totales" : "total roles"}</p>
            <p className="text-xs text-muted-foreground">
              {ts?.synced_roles || 0} {isEs ? "del contrato" : "from contract"} + {ts?.operational_roles || 0} {isEs ? "operacionales" : "operational"}
            </p>
            <p><span className="font-medium">{ts?.total_staff_required || 0}</span> {isEs ? "personal requerido" : "staff required"}</p>
          </CardContent>
        </Card>

        {/* Production Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {isEs ? "Producción" : "Production"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <Badge className={
              binder.production_status?.preparation_status === "ready" ? "bg-green-500" :
              binder.production_status?.preparation_status === "in_progress" ? "bg-yellow-500" :
              "bg-gray-500"
            }>
              {binder.production_status?.preparation_status || "not_started"}
            </Badge>
            <p><span className="font-medium">{binder.production_status?.assets_count || 0}</span> {isEs ? "assets" : "assets"}</p>
            <p><span className="font-medium">{binder.production_status?.checklist_count || 0}</span> {isEs ? "items en checklist" : "checklist items"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Post Event Summary */}
      {pe && (pe.rating || pe.what_worked_count > 0 || pe.what_failed_count > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5" />
              {isEs ? `Revisión Post-${term("events", "entity_singular")}` : `Post-${term("events", "entity_singular")} Review`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{isEs ? "Calificación" : "Rating"}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`w-5 h-5 ${i <= (pe?.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                  ))}
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{isEs ? "Qué Funcionó" : "What Worked"}</p>
                <p className="text-2xl font-bold text-green-600">{pe?.what_worked_count || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{isEs ? "Qué Falló" : "What Failed"}</p>
                <p className="text-2xl font-bold text-red-500">{pe?.what_failed_count || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{isEs ? "Aprendizajes" : "Learnings"}</p>
                <p className="text-2xl font-bold text-blue-600">{pe?.learnings_count || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Binder Notes (Manual Input) */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Notas del Binder" : "Binder Notes"}</CardTitle>
          <CardDescription>
            {isEs ? `Notas manuales para este ${term("events", "entity_singular").toLowerCase()}` : `Manual notes for this ${term("events", "entity_singular").toLowerCase()}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={isEs ? "Agregar notas adicionales..." : "Add additional notes..."}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end mt-4">
            <Button onClick={handleSaveNotes} disabled={saving} variant="outline">
              {saving ? (isEs ? "Guardando..." : "Saving...") : (isEs ? "Guardar Notas" : "Save Notes")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground pt-4 border-t">
        <p>{isEs ? "Generado" : "Generated"}: {new Date(binder.generated_at).toLocaleString()}</p>
        <p className="text-xs mt-1">{isEs ? "Este documento es una vista agregada de solo lectura" : "This document is a read-only aggregated view"}</p>
      </div>
    </div>
  );
}
