import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { API_BASE as API } from "../utils/api";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const NOTIFICATION_POLL_INTERVAL = 30000; // 30 seconds

/**
 * Hook for real-time presence + notification polling.
 * Sends heartbeat every 30s with current page/entity context.
 * Also polls for updated notification counts.
 */
export function usePresence({ page = "", entityType = null, entityId = null, entityTitle = null, orgId = null } = {}) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [entityViewers, setEntityViewers] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const heartbeatRef = useRef(null);
  const notifRef = useRef(null);

  const sendHeartbeat = useCallback(async () => {
    try {
      await axios.post(`${API}/api/presence/heartbeat`, {
        page,
        entity_type: entityType,
        entity_id: entityId,
        entity_title: entityTitle,
        org_id: orgId
      }, { withCredentials: true });
    } catch {
      // silently fail
    }
  }, [page, entityType, entityId, entityTitle, orgId]);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const params = orgId ? `?org_id=${orgId}` : "";
      const res = await axios.get(`${API}/api/presence/online${params}`, { withCredentials: true });
      setOnlineUsers(res.data?.online_users || []);
    } catch {
      // silently fail
    }
  }, [orgId]);

  const fetchEntityViewers = useCallback(async () => {
    if (!entityType || !entityId) {
      setEntityViewers([]);
      return;
    }
    try {
      const res = await axios.get(`${API}/api/presence/entity/${entityType}/${entityId}`, { withCredentials: true });
      setEntityViewers(res.data?.viewers || []);
    } catch {
      // silently fail
    }
  }, [entityType, entityId]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/comments/my-notifications?unread_only=true&limit=1`, { withCredentials: true });
      setUnreadNotifications(res.data?.unread_count || 0);
    } catch {
      // silently fail
    }
  }, []);

  const leaveEntity = useCallback(async () => {
    try {
      await axios.post(`${API}/api/presence/leave`, {}, { withCredentials: true });
    } catch {
      // silently fail
    }
  }, []);

  // Start heartbeat + polling
  useEffect(() => {
    // Send initial heartbeat immediately
    sendHeartbeat();
    fetchOnlineUsers();
    fetchNotifications();
    if (entityId) fetchEntityViewers();

    // Set up intervals
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat();
      fetchOnlineUsers();
      if (entityId) fetchEntityViewers();
    }, HEARTBEAT_INTERVAL);

    notifRef.current = setInterval(fetchNotifications, NOTIFICATION_POLL_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (notifRef.current) clearInterval(notifRef.current);
    };
  }, [sendHeartbeat, fetchOnlineUsers, fetchEntityViewers, fetchNotifications, entityId]);

  return {
    onlineUsers,
    entityViewers,
    unreadNotifications,
    leaveEntity,
    refetchOnline: fetchOnlineUsers,
    refetchEntityViewers: fetchEntityViewers
  };
}
