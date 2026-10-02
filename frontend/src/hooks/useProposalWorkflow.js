import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";
import {
  resolvePalette,
  DEFAULT_STAGE_PALETTES,
  DEFAULT_STATUS_PALETTES,
  DEFAULT_STAGE_LABELS,
  DEFAULT_STATUS_LABELS,
} from "../utils/stageColorPalettes";

/**
 * useProposalWorkflow
 * -----------------------------------------------------------------------------
 * Loads the tenant's workflow config (stage labels + palettes + commercial
 * statuses + require_approval toggle) and exposes helpers so pages don't need
 * to know anything about the Tailwind palette registry.
 *
 * Values live in React state and update immediately after a PUT via the
 * returned `refresh()`. The hook is safe to call anywhere — it falls back to
 * defaults until the request resolves so the first paint is never broken.
 */
export function useProposalWorkflow() {
  const [stageConfig, setStageConfig] = useState({});
  const [statusConfig, setStatusConfig] = useState({});
  const [lostReasons, setLostReasons] = useState([]);
  const [requireApproval, setRequireApproval] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCfg = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/proposals/settings/workflow`, { withCredentials: true });
      setStageConfig(r.data?.stage_config || {});
      setStatusConfig(r.data?.commercial_status_config || {});
      setLostReasons(r.data?.lost_reasons || []);
      setRequireApproval(!!r.data?.require_approval);
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCfg(); }, [fetchCfg]);

  // Resolve a stage name → palette classes (bg/border/text/dot/stripe/chip/header).
  // Falls back to the default palette for the stage, then to slate.
  const getStagePalette = useCallback((stage) => {
    const palette = stageConfig[stage]?.palette
      || DEFAULT_STAGE_PALETTES[stage]
      || "slate";
    return resolvePalette(palette);
  }, [stageConfig]);

  const getStageLabel = useCallback((stage, lang = "en") => {
    const entry = stageConfig[stage];
    const key = lang === "es" ? "label_es" : "label_en";
    return entry?.[key] || DEFAULT_STAGE_LABELS[stage]?.[lang] || stage;
  }, [stageConfig]);

  const getStatusPalette = useCallback((status) => {
    const palette = statusConfig[status]?.palette
      || DEFAULT_STATUS_PALETTES[status]
      || "slate";
    return resolvePalette(palette);
  }, [statusConfig]);

  const getStatusLabel = useCallback((status, lang = "en") => {
    const entry = statusConfig[status];
    const key = lang === "es" ? "label_es" : "label_en";
    return entry?.[key] || DEFAULT_STATUS_LABELS[status]?.[lang] || status;
  }, [statusConfig]);

  const save = useCallback(async ({ stage_config, commercial_status_config, lost_reasons }) => {
    const body = {};
    if (stage_config) body.stage_config = stage_config;
    if (commercial_status_config) body.commercial_status_config = commercial_status_config;
    if (lost_reasons) body.lost_reasons = lost_reasons;
    const r = await axios.put(`${API}/proposals/settings/workflow`, body, { withCredentials: true });
    setStageConfig(r.data?.stage_config || {});
    setStatusConfig(r.data?.commercial_status_config || {});
    setLostReasons(r.data?.lost_reasons || []);
    return r.data;
  }, []);

  // Lost reason helpers.
  const getLostReasonLabel = useCallback((key, lang = "en") => {
    const r = lostReasons.find((x) => x.key === key);
    if (!r) return key || "";
    return lang === "es" ? r.label_es : r.label_en;
  }, [lostReasons]);

  return useMemo(() => ({
    loading,
    stageConfig,
    statusConfig,
    lostReasons,
    requireApproval,
    getStagePalette,
    getStageLabel,
    getStatusPalette,
    getStatusLabel,
    getLostReasonLabel,
    refresh: fetchCfg,
    save,
  }), [loading, stageConfig, statusConfig, lostReasons, requireApproval, getStagePalette, getStageLabel, getStatusPalette, getStatusLabel, getLostReasonLabel, fetchCfg, save]);
}
