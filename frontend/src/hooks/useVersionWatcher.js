import { useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE as API } from "../utils/api";

/**
 * Silent auto-reload watcher
 * -----------------------------------------------------------------------------
 * Polls /api/version. When the backend's build identifier changes we DO NOT
 * bother the user with a toast — instead we wait for a "safe moment" and
 * reload the tab silently, preserving scroll position.
 *
 * Design goals (per product owner, Feb 2026):
 *  · No banner, no toast, no persistent notification.
 *  · Never interrupt someone typing / editing / with a dialog open.
 *  · Never reload during network activity (unsaved requests in flight).
 *  · Never react to dev-mode restart storms (60s debounce on new builds).
 *
 * Trigger loop:
 *  1. Poll /api/version every 2 min + on focus + on visibility.
 *  2. When we see a new build we mark it "pending" with a timestamp.
 *     - If we see the SAME new build again 60s later → mark update ready.
 *     - If build reverts / changes → reset the debounce (false positive).
 *  3. Every 5s check `isSafeMoment()`. When it flips true → silent reload.
 *
 * State preservation:
 *  · window.scrollY saved to sessionStorage → restored on next mount.
 *  · JWT / session cookies survive reload as usual.
 *  · localStorage untouched, so form drafts stored there also survive.
 */
const DEBOUNCE_MS = 60_000;
const IDLE_MS = 30_000;
const POLL_MS = 120_000;
const CHECK_SAFE_MS = 5_000;
const SCROLL_KEY = "kora_last_scroll_y";
const ACTIVITY_EVENTS = ["mousemove", "keydown", "wheel", "touchstart", "click"];

export function useVersionWatcher() {
  const baselineRef = useRef(null);
  const pendingBuildRef = useRef(null);
  const pendingSinceRef = useRef(0);
  const updateReadyRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const reloadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Restore scroll if this mount is the result of a silent reload.
    try {
      const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || "0", 10);
      if (y > 0) {
        // Defer to next paint so React hydrates its content first.
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
      sessionStorage.removeItem(SCROLL_KEY);
    } catch {
      /* ignore storage errors */
    }

    const isSafeMoment = () => {
      // 1. No open modal / dialog — Radix leaves data-state="closed" on
      //    dismissed dialogs; only "open" state means the user is inside one.
      const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
      if (openDialog) return false;

      // 2. No input, textarea or contenteditable is focused.
      const el = document.activeElement;
      if (el) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
        if (el.isContentEditable) return false;
      }

      // 3. User has been idle for IDLE_MS.
      if (Date.now() - lastActivityRef.current < IDLE_MS) return false;

      // 4. No axios requests currently in flight (interceptor keeps this).
      if (typeof window.__koraAxiosPending === "number" && window.__koraAxiosPending > 0) {
        return false;
      }

      // 5. Page must be visible — reloading a background tab is fine, but a
      //    hidden tab may be a mobile PWA on lock-screen; wait for focus.
      if (document.visibilityState !== "visible") return false;

      return true;
    };

    const silentReload = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
      } catch { /* ignore */ }
      // Query-string bust for any intermediate CDN-cached HTML.
      const sep = window.location.href.includes("?") ? "&" : "?";
      window.location.href = `${window.location.href}${sep}_v=${Date.now()}`;
    };

    const check = async () => {
      try {
        const res = await axios.get(`${API}/api/version`, {
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
          if (pendingBuildRef.current !== build) {
            // First sighting of this new build — start the debounce clock.
            pendingBuildRef.current = build;
            pendingSinceRef.current = Date.now();
            return;
          }
          // Same pending build re-observed.
          if (Date.now() - pendingSinceRef.current >= DEBOUNCE_MS) {
            updateReadyRef.current = true;
          }
        } else {
          // Build reverted to baseline — was a dev restart. Cancel pending.
          pendingBuildRef.current = null;
          pendingSinceRef.current = 0;
        }
      } catch {
        // Network blip — try again on next poll. Never spam the console.
      }
    };

    const trySilentReload = () => {
      if (!updateReadyRef.current) return;
      if (isSafeMoment()) silentReload();
    };

    const bumpActivity = () => { lastActivityRef.current = Date.now(); };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, bumpActivity, { passive: true })
    );

    check();
    const pollInterval = setInterval(check, POLL_MS);
    const safeInterval = setInterval(trySilentReload, CHECK_SAFE_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      clearInterval(safeInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, bumpActivity)
      );
    };
  }, []);
}
