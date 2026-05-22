import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Bell, AlertTriangle, X } from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const POLL_INTERVAL_MS = 60_000;

const sourceLabel = (src) => (src === "override" ? "Override" : "Plan");
const barColor = (pct) => (pct >= 100 ? "bg-red-500" : pct >= 95 ? "bg-orange-500" : "bg-amber-500");

export default function UsageAlertsBell({ threshold = 80, isEs = true }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ alerts: [], total: 0, companies_count: 0 });
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/super-admin/usage-alerts?threshold=${threshold}`, { withCredentials: true });
      setData(res.data || { alerts: [], total: 0, companies_count: 0 });
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const count = data.total || 0;
  // Group alerts by company so each company appears once with its hottest metric
  const grouped = (() => {
    const byCo = new Map();
    for (const a of data.alerts || []) {
      const existing = byCo.get(a.company_id);
      if (!existing || a.percentage > existing.top.percentage) {
        byCo.set(a.company_id, { top: a, all: [...(existing?.all || []), a] });
      } else {
        existing.all.push(a);
      }
    }
    return Array.from(byCo.values()).sort((x, y) => y.top.percentage - x.top.percentage);
  })();

  const goTo = (companyId) => {
    setOpen(false);
    navigate(`/super-admin/organizations/${companyId}?focus=limits`);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border bg-background hover:bg-muted transition-colors"
        title={isEs ? "Alertas de uso" : "Usage alerts"}
        data-testid="usage-alerts-bell"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
            data-testid="usage-alerts-bell-count"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[420px] max-h-[480px] overflow-hidden bg-white border border-gray-200 rounded-lg shadow-xl z-50 flex flex-col"
          data-testid="usage-alerts-popover"
        >
          <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-sm">
                {isEs ? "Empresas cerca del límite" : "Companies near limit"}
              </span>
              <span className="text-xs text-muted-foreground">≥ {threshold}%</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-sm text-center text-muted-foreground">Cargando…</div>
            )}
            {!loading && grouped.length === 0 && (
              <div className="px-4 py-8 text-sm text-center text-muted-foreground">
                {isEs ? "Nadie está cerca de su límite. 🎉" : "Nobody close to their limit. 🎉"}
              </div>
            )}
            {!loading && grouped.map(({ top, all }) => (
              <button
                key={top.company_id}
                onClick={() => goTo(top.company_id)}
                className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                data-testid={`usage-alert-row-${top.company_id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{top.name || top.company_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {top.label} · {top.current} / {top.limit} ({sourceLabel(top.source)})
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${barColor(top.percentage)}`}
                  >
                    {top.percentage}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor(top.percentage)}`}
                    style={{ width: `${Math.min(100, top.percentage)}%` }}
                  />
                </div>
                {all.length > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    +{all.length - 1} {isEs ? "métrica(s) más en alerta" : "more metric(s) in alert"}
                  </p>
                )}
              </button>
            ))}
          </div>

          {grouped.length > 0 && (
            <div className="px-4 py-2 border-t bg-gray-50 text-[11px] text-muted-foreground text-center">
              {isEs
                ? "Click en una empresa para ajustar su override"
                : "Click a company to adjust its override"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
