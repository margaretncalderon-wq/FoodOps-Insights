/**
 * KoraLoader — brand-aware loading spinner using the K-node motif.
 *
 * Drop-in replacement for lucide's <Loader2 className="animate-spin" />
 * when you want the loading state to feel on-brand. Use for:
 *  - primary form submit buttons (login, register)
 *  - full-page loading screens
 *  - any moment where the user is waiting on Kora
 */
import React from "react";
import { KoraLogo } from "./KoraLogo";

export const KoraLoader = ({ size = 20, className = "" }) => (
  <KoraLogo
    size={size}
    animated
    showBg={false}
    className={`kora-loader ${className}`}
  />
);

export default KoraLoader;
