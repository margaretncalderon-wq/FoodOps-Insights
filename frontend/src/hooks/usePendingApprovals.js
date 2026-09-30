import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";

/**
 * Fetches the tenant's proposal approval overview:
 *   - require_approval (tenant toggle)
 *   - count_pending
 *   - pending[]   (sorted by urgency then FIFO)
 *   - event_status_map (used by EventsPage for filter chips)
 *
 * Auto-refreshes when `refreshKey` changes. Callers can also call `refresh()`.
 */
export function usePendingApprovals({ refreshKey = 0, pollMs = 0 } = {}) {
  const [data, setData] = useState({
    require_approval: false,
    count_pending: 0,
    pending: [],
    event_status_map: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/proposals/approval-overview`, {
        withCredentials: true,
      });
      setData(res.data || { require_approval: false, count_pending: 0, pending: [], event_status_map: {} });
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview, refreshKey]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(fetchOverview, pollMs);
    return () => clearInterval(id);
  }, [pollMs, fetchOverview]);

  return { ...data, loading, error, refresh: fetchOverview };
}
