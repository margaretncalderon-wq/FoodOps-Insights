import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { TrendingUp, TrendingDown, Users, Target, DollarSign, ArrowRight, BarChart3 } from "lucide-react";
import { API_BASE as API } from "../../utils/api";

const STAGE_COLORS = {
  "New": "#3b82f6",
  "Contacted": "#f59e0b",
  "Qualified": "#8b5cf6",
  "Proposal": "#ec4899",
  "Negotiation": "#f97316",
  "Won": "#22c55e",
  "Lost": "#ef4444",
};

const STAGE_LABELS_ES = {
  "New": "Nuevo", "Contacted": "Contactado", "Qualified": "Calificado",
  "Proposal": "Propuesta", "Negotiation": "Negociación", "Won": "Ganado", "Lost": "Perdido",
};

export default function CrmDashboard() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [outreach, setOutreach] = useState([]);
  const [inbound, setInbound] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [outRes, inRes] = await Promise.all([
        axios.get(`${API}/api/crm/outreach`, { withCredentials: true }),
        axios.get(`${API}/api/crm/inbound`, { withCredentials: true }),
      ]);
      setOutreach(outRes.data || []);
      setInbound(inRes.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allLeads = useMemo(() => [...outreach, ...inbound], [outreach, inbound]);

  // Filter by period
  const filteredLeads = useMemo(() => {
    if (period === "all") return allLeads;
    const now = new Date();
    const cutoff = new Date();
    if (period === "7d") cutoff.setDate(now.getDate() - 7);
    else if (period === "30d") cutoff.setDate(now.getDate() - 30);
    else if (period === "90d") cutoff.setDate(now.getDate() - 90);
    return allLeads.filter(l => new Date(l.created_at) >= cutoff);
  }, [allLeads, period]);

  // Funnel stages
  const funnelData = useMemo(() => {
    const stages = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
    const counts = {};
    stages.forEach(s => { counts[s] = 0; });

    filteredLeads.forEach(l => {
      const st = l.outreach_status || l.pipeline_stage || l.status || "New";
      if (counts[st] !== undefined) counts[st]++;
      else if (st === "NoResponse" || st === "Engaged") counts["Contacted"]++;
      else if (st === "Converted") counts["Won"]++;
      else counts["New"]++;
    });

    // For funnel conversion rates, use the active pipeline (excluding Won/Lost)
    const funnelStages = ["New", "Contacted", "Qualified", "Proposal", "Negotiation"];
    const funnelEntries = funnelStages.map((stage, idx) => {
      const count = counts[stage];
      const prevCount = idx > 0 ? counts[funnelStages[idx - 1]] : filteredLeads.length;
      const convRate = prevCount > 0 ? ((count / prevCount) * 100).toFixed(0) : 0;
      return { stage, count, convRate: idx === 0 ? 100 : convRate };
    });

    // Add Won and Lost as outcome stages
    funnelEntries.push({ stage: "Won", count: counts["Won"], convRate: filteredLeads.length > 0 ? ((counts["Won"] / filteredLeads.length) * 100).toFixed(0) : 0 });
    funnelEntries.push({ stage: "Lost", count: counts["Lost"], convRate: filteredLeads.length > 0 ? ((counts["Lost"] / filteredLeads.length) * 100).toFixed(0) : 0 });

    return funnelEntries;
  }, [filteredLeads]);

  // Summary metrics
  const metrics = useMemo(() => {
    const total = filteredLeads.length;
    const withFollowUp = filteredLeads.filter(l => l.next_follow_up_date).length;
    const contacted = filteredLeads.filter(l => {
      const s = l.outreach_status || l.pipeline_stage || l.status || "";
      return s !== "New";
    }).length;
    const hot = filteredLeads.filter(l => {
      const s = l.outreach_status || l.pipeline_stage || l.status || "";
      return ["Qualified", "Proposal", "Negotiation"].includes(s);
    }).length;

    // Source breakdown
    const sources = {};
    filteredLeads.forEach(l => {
      const s = l.source || (isEs ? "Sin fuente" : "No source");
      sources[s] = (sources[s] || 0) + 1;
    });
    const topSources = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Type breakdown
    const outreachCount = filteredLeads.filter(l => l.lead_type === "outreach").length;
    const inboundCount = filteredLeads.filter(l => l.lead_type !== "outreach").length;

    // Won/Lost counts
    const won = filteredLeads.filter(l => {
      const s = l.outreach_status || l.pipeline_stage || l.status || "";
      return s === "Won" || s === "Converted";
    }).length;
    const lost = filteredLeads.filter(l => {
      const s = l.outreach_status || l.pipeline_stage || l.status || "";
      return s === "Lost";
    }).length;

    return { total, withFollowUp, contacted, hot, topSources, outreachCount, inboundCount, won, lost };
  }, [filteredLeads, isEs]);

  const maxFunnel = Math.max(...funnelData.map(d => d.count), 1);

  if (loading) return null;

  return (
    <div className="space-y-4" data-testid="crm-dashboard">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          {isEs ? "Dashboard CRM" : "CRM Dashboard"}
        </h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="dashboard-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todo" : "All time"}</SelectItem>
            <SelectItem value="7d">{isEs ? "7 días" : "7 days"}</SelectItem>
            <SelectItem value="30d">{isEs ? "30 días" : "30 days"}</SelectItem>
            <SelectItem value="90d">{isEs ? "90 días" : "90 days"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Total Leads" : "Total Leads"}</p>
                <p className="text-2xl font-bold">{metrics.total}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500 opacity-30" />
            </div>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700">
                {metrics.outreachCount} outreach
              </Badge>
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">
                {metrics.inboundCount} inbound
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Contactados" : "Contacted"}</p>
                <p className="text-2xl font-bold">{metrics.contacted}</p>
              </div>
              <Target className="w-8 h-8 text-yellow-500 opacity-30" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.total > 0 ? `${((metrics.contacted / metrics.total) * 100).toFixed(0)}%` : "0%"} {isEs ? "tasa contacto" : "contact rate"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Hot Leads" : "Hot Leads"}</p>
                <p className="text-2xl font-bold text-orange-600">{metrics.hot}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-500 opacity-30" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {isEs ? "Calificados + Propuesta + Negociación" : "Qualified + Proposal + Negotiation"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Ganados" : "Won"}</p>
                <p className="text-2xl font-bold text-emerald-600">{metrics.won}</p>
              </div>
              <DollarSign className="w-8 h-8 text-emerald-500 opacity-30" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.total > 0 ? `${((metrics.won / metrics.total) * 100).toFixed(0)}%` : "0%"} {isEs ? "tasa cierre" : "win rate"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel + Sources side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isEs ? "Embudo de Conversión" : "Conversion Funnel"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {funnelData.map((stage, idx) => {
                const widthPct = maxFunnel > 0 ? Math.max(8, (stage.count / maxFunnel) * 100) : 8;
                const color = STAGE_COLORS[stage.stage] || "#6b7280";
                return (
                  <div key={stage.stage} className="flex items-center gap-3" data-testid={`funnel-${stage.stage.toLowerCase()}`}>
                    <span className="text-xs font-medium w-24 text-right truncate">
                      {isEs ? (STAGE_LABELS_ES[stage.stage] || stage.stage) : stage.stage}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-8 bg-muted/30 rounded overflow-hidden">
                        <div className="h-full rounded flex items-center justify-end pr-2 transition-all duration-500"
                          style={{ width: `${widthPct}%`, backgroundColor: color + "30", borderLeft: `3px solid ${color}` }}>
                          <span className="text-xs font-bold" style={{ color }}>{stage.count}</span>
                        </div>
                      </div>
                      {idx > 0 && (
                        <span className="text-[10px] text-muted-foreground w-10 text-right">
                          {stage.convRate}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isEs ? "Top Fuentes" : "Top Sources"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {metrics.topSources.map(([source, count], idx) => (
                <div key={source} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-4">{idx + 1}</span>
                  <span className="text-sm flex-1 truncate">{source}</span>
                  <Badge variant="secondary" className="text-xs">{count}</Badge>
                  <span className="text-[10px] text-muted-foreground w-8 text-right">
                    {metrics.total > 0 ? `${((count / metrics.total) * 100).toFixed(0)}%` : "0%"}
                  </span>
                </div>
              ))}
              {metrics.topSources.length === 0 && (
                <p className="text-xs text-muted-foreground">{isEs ? "Sin datos" : "No data"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
