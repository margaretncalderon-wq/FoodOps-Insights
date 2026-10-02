import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { SearchableSelect } from "./ui/searchable-select";
import { AlertTriangle, Users } from "lucide-react";

/**
 * ChangeClientDialog
 * -----------------------------------------------------------------------------
 * Reassigns an event's client. Hits the preflight endpoint first so the user
 * knows how many payments/invoices will travel with the switch and can decide
 * whether to transfer them or cancel.
 */
export default function ChangeClientDialog({
  open,
  onOpenChange,
  eventId,
  currentClientId,
  language,
  onReassigned,
}) {
  const isEs = language === "es";
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [preflight, setPreflight] = useState(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferConfirmed, setTransferConfirmed] = useState(false);

  // Load clients + preflight when the dialog opens
  useEffect(() => {
    if (!open || !eventId) return undefined;
    setSelectedClientId("");
    setTransferConfirmed(false);
    (async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          axios.get(`${API}/crm/clients`, { withCredentials: true }),
          axios.get(`${API}/events/${eventId}/change-client/preflight`, { withCredentials: true }),
        ]);
        const sorted = [...(cRes.data || [])]
          .filter((c) => c.client_id !== currentClientId)
          .sort((a, b) =>
            (a.display_name || a.name || "").localeCompare(b.display_name || b.name || "", undefined, { sensitivity: "base" })
          );
        setClients(sorted);
        setPreflight(pRes.data);
      } catch (e) {
        toast.error(e?.response?.data?.detail || (isEs ? "Error cargando datos" : "Failed to load"));
      }
    })();
    return undefined;
  }, [open, eventId, currentClientId, isEs]);

  const paymentsCount = preflight?.payments_count || 0;
  const invoicesCount = preflight?.invoices_count || 0;
  const needsTransferDecision = paymentsCount > 0;

  const handleSave = async () => {
    if (!selectedClientId) return;
    if (needsTransferDecision && !transferConfirmed) {
      toast.error(isEs
        ? "Debes decidir qué hacer con los pagos existentes"
        : "You must decide what to do with existing payments");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(
        `${API}/events/${eventId}/change-client`,
        {
          new_client_id: selectedClientId,
          transfer_payments: transferConfirmed,
        },
        { withCredentials: true },
      );
      toast.success(
        isEs
          ? `Cliente cambiado a ${res.data.new_client_name}`
          : `Client changed to ${res.data.new_client_name}`
      );
      onReassigned?.(res.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isEs ? "Error" : "Error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="change-client-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {isEs ? "Cambiar cliente del evento" : "Change event client"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {preflight?.current_client && (
            <div className="text-sm">
              <Label className="text-xs text-muted-foreground">
                {isEs ? "Cliente actual" : "Current client"}
              </Label>
              <p className="font-medium">
                {preflight.current_client.display_name || preflight.current_client.name}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{isEs ? "Nuevo cliente" : "New client"} *</Label>
            <SearchableSelect
              value={selectedClientId}
              onValueChange={setSelectedClientId}
              options={clients.map((c) => ({
                value: c.client_id,
                label: c.display_name || c.name || "—",
                keywords: [c.email, c.phone, c.company_name].filter(Boolean),
              }))}
              placeholder={isEs ? "Buscar cliente..." : "Search client..."}
              searchPlaceholder={isEs ? "Buscar..." : "Search..."}
              emptyText={isEs ? "Sin resultados" : "No results"}
              testId="change-client-select"
            />
          </div>

          {(paymentsCount > 0 || invoicesCount > 0) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <div className="flex items-start gap-2 text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="font-medium">
                    {isEs ? "Este evento tiene datos financieros:" : "This event has financial data:"}
                  </p>
                  <div className="flex gap-2">
                    {invoicesCount > 0 && (
                      <Badge variant="outline" className="text-amber-800 border-amber-400">
                        {invoicesCount} {isEs ? "facturas" : "invoices"}
                      </Badge>
                    )}
                    {paymentsCount > 0 && (
                      <Badge variant="outline" className="text-rose-700 border-rose-400">
                        {paymentsCount} {isEs ? "pagos" : "payments"}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {needsTransferDecision && (
                <label className="flex items-start gap-2 text-xs cursor-pointer text-amber-900">
                  <input
                    type="checkbox"
                    data-testid="transfer-payments-checkbox"
                    checked={transferConfirmed}
                    onChange={(e) => setTransferConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {isEs
                      ? "Transferir los pagos existentes al nuevo cliente seleccionado. (Si no, cancela y bórralos primero.)"
                      : "Transfer existing payments to the newly selected client. (Otherwise, cancel and delete them first.)"}
                  </span>
                </label>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {isEs ? "Cancelar" : "Cancel"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedClientId || saving}
            data-testid="change-client-save-btn"
          >
            {saving ? (isEs ? "Guardando..." : "Saving...") : (isEs ? "Reasignar" : "Reassign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
