import { useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API_BASE as API } from "../utils/api";

/**
 * Polls /api/version periodically. When the backend's build identifier
 * changes between polls (i.e. the platform redeployed), we surface a
 * persistent toast asking the user to reload — that's how we evict the
 * cached index.html / JS bundle for every tenant without anyone having
 * to clear browser cache manually.
 *
 * Trigger points:
 *   1. Mount       — capture the baseline build.
 *   2. Every 120s  — poll while the tab is open.
 *   3. Visibility  — re-check when the user comes back to the tab.
 *
 * The toast is shown at most once per session; if the user dismisses it
 * the next focus / poll will re-check and re-emit if the build still
 * differs.
 */
export function useVersionWatcher() {
  const baselineRef = useRef(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const reload = () => {
      // Bust the SPA's runtime cache. `location.reload(true)` is deprecated
      // but still honoured in most browsers; the query-string busts any
      // intermediate CDN-cached HTML as a belt-and-suspenders measure.
      const sep = window.location.href.includes("?") ? "&" : "?";
      window.location.href = `${window.location.href}${sep}_v=${Date.now()}`;
    };

    const showUpdateToast = () => {
      if (notifiedRef.current) return;
      notifiedRef.current = true;
      toast.info(
        (typeof document !== "undefined" && document.documentElement.lang === "en")
          ? "A new version of Kora is available."
          : "Hay una nueva versión de Kora disponible.",
        {
          duration: Infinity,
          id: "kora-version-update",
          action: {
            label: (typeof document !== "undefined" && document.documentElement.lang === "en") ? "Reload" : "Recargar",
            onClick: reload,
          },
          onDismiss: () => { notifiedRef.current = false; },
        }
      );
    };

    const check = async () => {
      try {
        const res = await axios.get(`${API}/api/version`, {
          // Anti-cache: bust any intermediate CDN that might cache the
          // response for a brief window.
          params: { _ts: Date.now() },
          timeout: 5000,
        });
        const build = res.data?.build;
        if (cancelled || !build) return;
        if (baselineRef.current === null) {
          baselineRef.current = build;
          return;
        }
        if (build !== baselineRef.current) {
          showUpdateToast();
        }
      } catch {
        // Silently ignore — network blips shouldn't spam the user.
      }
    };

    check();
    const interval = setInterval(check, 120_000); // 2 minutes
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);
}
