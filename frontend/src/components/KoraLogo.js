/**
 * KoraLogo — inline SVG rebuild of the K-node brand mark.
 *
 * Why an SVG rebuild instead of the PNG? So we can animate individual nodes.
 * The 4 outer (white) nodes pulse softly with a staggered delay, echoing the
 * brand motif ("connected operations") as a heartbeat in the sidebar.
 *
 * Sizing is driven by the wrapper's width/height — pass `size` (px) or let it
 * inherit from a parent container.
 */
import React from "react";

const NAVY = "#192332";
const GREEN = "#AED768";
const WHITE = "#F4F1EA";

export const KoraLogo = ({ size = 40, animated = false, className = "", showBg = true }) => {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-label="Kora OS"
      role="img"
    >
      {showBg && <rect x="0" y="0" width="100" height="100" rx="16" fill={NAVY} />}
      {/* Connecting lines from center node to the 4 outer nodes */}
      <g stroke={WHITE} strokeWidth="2" strokeLinecap="round">
        <line x1="42" y1="50" x2="30" y2="26" />
        <line x1="42" y1="50" x2="30" y2="74" />
        <line x1="52" y1="50" x2="72" y2="26" />
        <line x1="52" y1="50" x2="72" y2="74" />
      </g>

      {/* 4 outer white nodes — animated */}
      <g fill={WHITE}>
        <rect x="20" y="16" width="20" height="20" rx="5" className={animated ? "kora-node kora-node-1" : ""} />
        <rect x="62" y="16" width="20" height="20" rx="5" className={animated ? "kora-node kora-node-2" : ""} />
        <rect x="20" y="64" width="20" height="20" rx="5" className={animated ? "kora-node kora-node-3" : ""} />
        <rect x="62" y="64" width="20" height="20" rx="5" className={animated ? "kora-node kora-node-4" : ""} />
      </g>

      {/* Center green node — the "heart" */}
      <rect
        x="37"
        y="40"
        width="24"
        height="24"
        rx="6"
        fill={GREEN}
        className={animated ? "kora-node-center" : ""}
      />
    </svg>
  );
};

export default KoraLogo;
