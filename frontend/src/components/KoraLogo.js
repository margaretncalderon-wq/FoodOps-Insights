/**
 * KoraLogo — the official K-node brand mark.
 *
 * Static logo uses the PNG asset directly (pixel-perfect, no reconstruction).
 * The SVG rebuild is kept for the animated variant (KoraLoader), which needs
 * per-node control to pulse individual squares.
 */
import React from "react";

const NAVY = "#192332";
const GREEN = "#AED768";
const WHITE = "#F4F1EA";

// SVG-based version — only used when `animated` is true (via KoraLoader).
const KoraLogoAnimated = ({ size, className, showBg }) => (
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    className={className}
    aria-label="Kora OS"
    role="img"
  >
    {showBg && <rect x="0" y="0" width="100" height="100" rx="16" fill={NAVY} />}
    <g stroke={WHITE} strokeWidth="2" strokeLinecap="round">
      <line x1="42" y1="50" x2="30" y2="26" />
      <line x1="42" y1="50" x2="30" y2="74" />
      <line x1="52" y1="50" x2="72" y2="26" />
      <line x1="52" y1="50" x2="72" y2="74" />
    </g>
    <g fill={WHITE}>
      <rect x="20" y="16" width="20" height="20" rx="5" className="kora-node kora-node-1" />
      <rect x="62" y="16" width="20" height="20" rx="5" className="kora-node kora-node-2" />
      <rect x="20" y="64" width="20" height="20" rx="5" className="kora-node kora-node-3" />
      <rect x="62" y="64" width="20" height="20" rx="5" className="kora-node kora-node-4" />
    </g>
    <rect x="37" y="40" width="24" height="24" rx="6" fill={GREEN} className="kora-node-center" />
  </svg>
);

export const KoraLogo = ({ size = 40, animated = false, className = "", showBg = true }) => {
  if (animated) {
    return <KoraLogoAnimated size={size} className={className} showBg={showBg} />;
  }
  // Static logo — use the PNG asset directly for pixel-perfect brand fidelity.
  return (
    <img
      src="/kora-icon.png"
      alt="Kora OS"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
};

export default KoraLogo;
