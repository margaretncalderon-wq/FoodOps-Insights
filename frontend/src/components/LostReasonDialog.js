import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useLanguage } from "../contexts/LanguageContext";
import { Archive } from "lucide-react";

// Catalog of loss reasons. Keep `value` stable (used in reports) — only
// localize the displayed label.
export const LOST_REASONS = [
  { value: "price", labelEs: "Precio", labelEn: "Price" },
  { value: "timing", labelEs: "Tiempo / Fechas", labelEn: "Timing / Dates" },
  { value: "competitor", labelEs: "Competencia", labelEn: "Competitor" },
  { value: "no_response", labelEs: "No responde", labelEn: "No response" },
  { value: "not_a_fit", labelEs: "No aplica / No es el cliente", labelEn: "Not a fit" },
  { value: "scope", labelEs: "Alcance / Servicios", labelEn: "Scope / Services" },
  { value: "other", labelEs: "Otro", labelEn: "Other" },
];

export function lostReasonLabel(value, language) {
  const r = LOST_REASONS.find((x) => x.value === value);
  if (!r) return value || "";
  return language === "es" ? r.labelEs : r.labelEn;
}

/**
 * Dialog to capture a loss reason when an event/proposal is marked as Lost.
 *
 * Props:
 *  - open: boolean
 *  - onOpenChange: (boolean) => void
 *  - defaultReason / defaultNotes: prefill when editing an existing reason
 *  - onConfirm: ({ reason, notes }) => Promise<void> | void
 *  - eventName?: string — shown in the description
 */
export default function LostReasonDialog({
  open,
  onOpenChange,
  defaultReason = "",
  defaultNotes = "",
  onConfirm,
  eventName = "",
}) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [reason, setReason] = useState(defaultReason);
  const [notes, setNotes] = useState(defaultNotes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(defaultReason || "");
      setNotes(defaultNotes || "");
    }
  }, [open, defaultReason, defaultNotes]);

  const handleSave = async () => {
    if (!reason) return;
    setSaving(true);
    try {
      await onConfirm({ reason, notes: notes.trim() || null });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="lost-reason-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-gray-500" />
            {isEs ? "Marcar como Perdida" : "Mark as Lost"}
          </DialogTitle>
          <DialogDescription>
            {eventName
              ? (isEs
                  ? `¿Por qué se perdió "${eventName}"? Esto nos ayuda a mejorar.`
                  : `Why did "${eventName}" fall through? This helps us improve.`)
              : (isEs
                  ? "Cuéntanos por qué se perdió. Esto nos ayuda a mejorar."
                  : "Tell us why it was lost. This helps us improve.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="lost-reason-select">
              {isEs ? "Motivo" : "Reason"} <span className="text-red-500">*</span>
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="lost-reason-select" data-testid="lost-reason-select">
                <SelectValue placeholder={isEs ? "Selecciona un motivo" : "Select a reason"} />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value} data-testid={`lost-reason-option-${r.value}`}>
                    {isEs ? r.labelEs : r.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lost-reason-notes">
              {isEs ? "Notas (opcional)" : "Notes (optional)"}
            </Label>
            <Textarea
              id="lost-reason-notes"
              data-testid="lost-reason-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={
                isEs
                  ? "Ej.: Competía con un proveedor más económico, decisión final del cliente..."
                  : "E.g., Competing vendor was cheaper, client made the final call..."
              }
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {isEs ? "Cancelar" : "Cancel"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!reason || saving}
            data-testid="lost-reason-confirm"
            className="bg-gray-700 hover:bg-gray-800 text-white"
          >
            {saving
              ? (isEs ? "Guardando..." : "Saving...")
              : (isEs ? "Marcar como Perdida" : "Mark as Lost")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
