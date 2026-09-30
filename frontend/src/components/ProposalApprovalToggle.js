import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../utils/api";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";

/**
 * ProposalApprovalToggle
 * -----------------------------------------------------------------------------
 * Small self-contained component so SettingsPage.js stays readable. Reads the
 * `require_approval` flag from GET /api/proposals/settings/approval and pushes
 * changes back with PUT. Default is off for every tenant.
 */
export default function ProposalApprovalToggle({ language }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/proposals/settings/approval`, { withCredentials: true });
        setEnabled(!!r.data?.require_approval);
      } catch { /* default off */ } finally { setLoading(false); }
    })();
  }, []);

  const toggle = async (val) => {
    setSaving(true);
    const prev = enabled;
    setEnabled(val);
    try {
      await axios.put(`${API}/proposals/settings/approval`, { require_approval: val }, { withCredentials: true });
      toast.success(language === "es" ? "Guardado" : "Saved");
    } catch (e) {
      setEnabled(prev);
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">{language === "es" ? "Cargando..." : "Loading..."}</div>;
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-50">
      <div>
        <Label className="text-sm font-medium">
          {language === "es" ? "Requerir aprobación interna" : "Require internal approval"}
        </Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {language === "es"
            ? "Por defecto está apagado. Al activarlo, aparecen los botones Enviar a aprobación / Aprobar / Enviar al cliente en el editor."
            : "Off by default. When on, the Submit / Approve / Send-to-client buttons appear in the proposal editor."}
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={toggle}
        disabled={saving}
        data-testid="require-approval-toggle"
      />
    </div>
  );
}
