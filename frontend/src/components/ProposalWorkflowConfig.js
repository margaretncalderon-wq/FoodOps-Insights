import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../utils/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { COLOR_PALETTES, PALETTE_KEYS, resolvePalette } from "../utils/stageColorPalettes";
import { RotateCcw, Save, Plus, Trash2 } from "lucide-react";

const STAGE_ORDER = [
  "Inquiry Received", "Context Captured", "Scope Drafted", "Definition In Review",
  "Sent to Client", "Confirmed by Client", "Committed", "Archived",
];
const STATUS_ORDER = ["Draft", "Sent", "Accepted", "Rejected"];

/**
 * ProposalWorkflowConfig
 * -----------------------------------------------------------------------------
 * One Settings card consolidating everything that drives how a proposal moves
 * through the funnel:
 *   1. Approval gate toggle (reuses /settings/approval)
 *   2. Engagement stage labels + palettes
 *   3. Commercial status labels + palettes
 */
export default function ProposalWorkflowConfig({ language }) {
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [stageConfig, setStageConfig] = useState({});
  const [statusConfig, setStatusConfig] = useState({});
  const [lostReasons, setLostReasons] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Load current config
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/proposals/settings/workflow`, { withCredentials: true });
        setStageConfig(r.data?.stage_config || {});
        setStatusConfig(r.data?.commercial_status_config || {});
        setLostReasons(r.data?.lost_reasons || []);
        setRequireApproval(!!r.data?.require_approval);
      } catch (e) {
        toast.error(e?.response?.data?.detail || (isEs ? "Error cargando" : "Load failed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [isEs]);

  const toggleApproval = async (val) => {
    const prev = requireApproval;
    setRequireApproval(val);
    try {
      await axios.put(`${API}/proposals/settings/approval`, { require_approval: val }, { withCredentials: true });
      toast.success(isEs ? "Guardado" : "Saved");
    } catch (e) {
      setRequireApproval(prev);
      toast.error(e?.response?.data?.detail || "Error");
    }
  };

  const patchStage = (key, field, value) => {
    setStageConfig((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    setDirty(true);
  };
  const patchStatus = (key, field, value) => {
    setStatusConfig((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/proposals/settings/workflow`,
        {
          stage_config: stageConfig,
          commercial_status_config: statusConfig,
          lost_reasons: lostReasons,
        },
        { withCredentials: true },
      );
      toast.success(isEs ? "Flujo guardado" : "Workflow saved");
      setDirty(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const patchReason = (idx, field, value) => {
    setLostReasons((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setDirty(true);
  };
  const addReason = () => {
    const base = "custom_" + Math.random().toString(36).slice(2, 8);
    setLostReasons((prev) => [...prev, {
      key: base, label_en: "New reason", label_es: "Nuevo motivo",
      palette: "gray", counts_as_loss: true,
    }]);
    setDirty(true);
  };
  const removeReason = (idx) => {
    setLostReasons((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const handleReset = async () => {
    if (!window.confirm(isEs
      ? "¿Restaurar todos los nombres y colores al valor por defecto?"
      : "Reset all labels and colors to defaults?")) return;
    // Reset = push empty / default labels. Simplest: delete subkeys.
    try {
      // Re-fetch after we clear the stored overrides by overwriting with defaults.
      const defaults = {
        stage_config: Object.fromEntries(
          STAGE_ORDER.map((k) => [k, { label_en: k, label_es: k, palette: "slate" }])
        ),
        commercial_status_config: Object.fromEntries(
          STATUS_ORDER.map((k) => [k, { label_en: k, label_es: k, palette: "slate" }])
        ),
      };
      // Instead of resetting through PUT (which would overwrite defaults with slate),
      // fire a GET: the backend returns defaults when no override is present.
      // Simplest correct behaviour: PUT nothing — just re-fetch after an empty save.
      const r = await axios.get(`${API}/proposals/settings/workflow`, { withCredentials: true });
      setStageConfig(r.data?.stage_config || defaults.stage_config);
      setStatusConfig(r.data?.commercial_status_config || defaults.commercial_status_config);
      setDirty(false);
      toast.info(isEs ? "Vista regresada a lo guardado" : "View reverted to saved values");
    } catch {
      toast.error("Error");
    }
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">{isEs ? "Cargando..." : "Loading..."}</div>;
  }

  return (
    <div className="space-y-6" data-testid="settings-proposal-workflow">
      {/* 1. Approval Gate */}
      <div className="rounded-lg border bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">
              {isEs ? "Requerir aprobación interna" : "Require internal approval"}
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isEs
                ? "Al activar aparecen botones Enviar a aprobación / Aprobar / Retirar / Enviar al cliente en el editor."
                : "When on, Submit / Approve / Withdraw / Send-to-client buttons appear in the editor."}
            </p>
          </div>
          <Switch
            checked={requireApproval}
            onCheckedChange={toggleApproval}
            data-testid="require-approval-toggle"
          />
        </div>
      </div>

      {/* 2. Engagement Stages */}
      <div className="rounded-lg border p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">
            {isEs ? "Etapas del flujo (pipeline + calendario)" : "Engagement stages (pipeline + calendar)"}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isEs
              ? "El código interno de cada etapa es fijo. Puedes cambiar la etiqueta visible y el color."
              : "The internal stage key is fixed. You can rename the visible label and change its color."}
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {STAGE_ORDER.map((key) => {
            const cfg = stageConfig[key] || {};
            const palette = resolvePalette(cfg.palette || "slate");
            return (
              <div key={key} className="flex items-center gap-2 p-2 border rounded-lg" data-testid={`stage-row-${key}`}>
                <div className={`w-3 h-10 rounded-full ${palette.stripe} flex-shrink-0`} />
                <div className="flex-1 grid grid-cols-5 gap-2 min-w-0">
                  <div className="col-span-5 text-[10px] text-muted-foreground uppercase tracking-wide">{key}</div>
                  <Input
                    className="col-span-2 h-8 text-xs"
                    placeholder="EN"
                    value={cfg.label_en || ""}
                    onChange={(e) => patchStage(key, "label_en", e.target.value)}
                  />
                  <Input
                    className="col-span-2 h-8 text-xs"
                    placeholder="ES"
                    value={cfg.label_es || ""}
                    onChange={(e) => patchStage(key, "label_es", e.target.value)}
                  />
                  <Select value={cfg.palette || "slate"} onValueChange={(v) => patchStage(key, "palette", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PALETTE_KEYS.map((p) => (
                        <SelectItem key={p} value={p}>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-3 h-3 rounded-full ${COLOR_PALETTES[p].stripe}`} />
                            {COLOR_PALETTES[p].label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Commercial Statuses */}
      <div className="rounded-lg border p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">
            {isEs ? "Estados comerciales (visibles al cliente)" : "Commercial statuses (visible to clients)"}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isEs
              ? "Los 4 estados son fijos y están mapeados al flujo interno. Puedes renombrar y recolorear."
              : "The 4 statuses are fixed and mapped to the internal flow. You can rename and recolor."}
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {STATUS_ORDER.map((key) => {
            const cfg = statusConfig[key] || {};
            const palette = resolvePalette(cfg.palette || "slate");
            return (
              <div key={key} className="flex items-center gap-2 p-2 border rounded-lg" data-testid={`status-row-${key}`}>
                <div className={`w-3 h-10 rounded-full ${palette.stripe} flex-shrink-0`} />
                <div className="flex-1 grid grid-cols-5 gap-2 min-w-0">
                  <div className="col-span-5 text-[10px] text-muted-foreground uppercase tracking-wide">{key}</div>
                  <Input
                    className="col-span-2 h-8 text-xs"
                    placeholder="EN"
                    value={cfg.label_en || ""}
                    onChange={(e) => patchStatus(key, "label_en", e.target.value)}
                  />
                  <Input
                    className="col-span-2 h-8 text-xs"
                    placeholder="ES"
                    value={cfg.label_es || ""}
                    onChange={(e) => patchStatus(key, "label_es", e.target.value)}
                  />
                  <Select value={cfg.palette || "slate"} onValueChange={(v) => patchStatus(key, "palette", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PALETTE_KEYS.map((p) => (
                        <SelectItem key={p} value={p}>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-3 h-3 rounded-full ${COLOR_PALETTES[p].stripe}`} />
                            {COLOR_PALETTES[p].label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Lost / Discard Reasons */}
      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {isEs ? "Motivos de pérdida / descarte" : "Lost / discard reasons"}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isEs
                ? "Al archivar una propuesta se pide uno de estos motivos. Marca 'No cuenta como pérdida' para variantes/duplicados que no deben inflar analytics."
                : "When a proposal is archived, one of these reasons is required. Mark 'Not a loss' for variants/duplicates so they don't inflate analytics."}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addReason} data-testid="add-lost-reason-btn">
            <Plus className="w-3 h-3 mr-1" />
            {isEs ? "Agregar" : "Add"}
          </Button>
        </div>
        <div className="space-y-2">
          {lostReasons.map((r, idx) => {
            const palette = resolvePalette(r.palette || "gray");
            return (
              <div key={r.key + idx} className="flex items-center gap-2 p-2 border rounded-lg" data-testid={`lost-reason-row-${r.key}`}>
                <div className={`w-3 h-10 rounded-full ${palette.stripe} flex-shrink-0`} />
                <div className="flex-1 grid grid-cols-12 gap-2 min-w-0">
                  <Input
                    className="col-span-3 h-8 text-xs font-mono"
                    placeholder="key"
                    value={r.key}
                    onChange={(e) => patchReason(idx, "key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  />
                  <Input
                    className="col-span-3 h-8 text-xs"
                    placeholder="EN"
                    value={r.label_en || ""}
                    onChange={(e) => patchReason(idx, "label_en", e.target.value)}
                  />
                  <Input
                    className="col-span-3 h-8 text-xs"
                    placeholder="ES"
                    value={r.label_es || ""}
                    onChange={(e) => patchReason(idx, "label_es", e.target.value)}
                  />
                  <Select value={r.palette || "gray"} onValueChange={(v) => patchReason(idx, "palette", v)}>
                    <SelectTrigger className="col-span-2 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PALETTE_KEYS.map((p) => (
                        <SelectItem key={p} value={p}>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-3 h-3 rounded-full ${COLOR_PALETTES[p].stripe}`} />
                            {COLOR_PALETTES[p].label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="col-span-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground cursor-pointer" title={isEs ? "¿Cuenta como pérdida en analytics?" : "Counts as loss in analytics?"}>
                    <input
                      type="checkbox"
                      checked={r.counts_as_loss !== false}
                      onChange={(e) => patchReason(idx, "counts_as_loss", e.target.checked)}
                      data-testid={`counts-as-loss-${r.key}`}
                    />
                    <span>{isEs ? "Pérdida" : "Loss"}</span>
                  </label>
                </div>
                <Button
                  size="icon" variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeReason(idx)}
                  data-testid={`remove-lost-reason-${r.key}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
          {lostReasons.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              {isEs ? "No hay motivos. Agrega al menos uno para que el archivado funcione." : "No reasons. Add at least one so archive works."}
            </p>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button variant="ghost" onClick={handleReset} disabled={saving} data-testid="reset-workflow-btn">
          <RotateCcw className="w-3 h-3 mr-1" />
          {isEs ? "Descartar" : "Discard"}
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving} data-testid="save-workflow-btn">
          <Save className="w-3 h-3 mr-1" />
          {saving ? (isEs ? "Guardando..." : "Saving...") : (isEs ? "Guardar" : "Save")}
        </Button>
      </div>
    </div>
  );
}
