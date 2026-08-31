/**
 * Analog: CRC/vNAS STARS TCW has no legal banner over the DCB (R07).
 * Trainer delta: exact T00-01 copy on first boot (dismiss once per profile)
 * and still in F1. Not a header spanning the DCB. Not NAS STARS.
 */

import { useState } from "react";

/** Frozen T00-01 UI disclaimer. Do not paraphrase. */
export const DISCLAIMER_COPY =
  "ATC-SIM is a training and entertainment product. It is not an FAA training device, is not certified for operational or NAS use, and is not affiliated with the FAA or any STARS vendor. The display is a STARS-like visual analog only.";

/** Per-profile dismiss so the T00-01 copy is not an always-on glass banner (T02-15). */
export const DISCLAIMER_DISMISSED_KEY = "atc-sim.disclaimer.dismissed";

function profileStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** True after the first-run panel was dismissed on this browser profile. */
export function isDisclaimerDismissed(store?: Storage): boolean {
  try {
    return (store ?? profileStorage())?.getItem(DISCLAIMER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember dismiss for this profile. Private-mode failures stay session-only via React state. */
export function dismissDisclaimer(store?: Storage): void {
  try {
    (store ?? profileStorage())?.setItem(DISCLAIMER_DISMISSED_KEY, "1");
  } catch {
    // Quota / private mode: overlay still hides for this session.
  }
}

export interface DisclaimerProps {
  /** Injected in tests. Browser uses localStorage. */
  storage?: Storage;
}

export function Disclaimer({ storage }: DisclaimerProps) {
  const [open, setOpen] = useState(() => !isDisclaimerDismissed(storage));
  if (!open) {
    return null;
  }

  return (
    <div
      className="disclaimer-first-run"
      role="dialog"
      aria-label="Training disclaimer"
      aria-modal="false"
    >
      <p className="disclaimer-first-run-copy">{DISCLAIMER_COPY}</p>
      <button
        type="button"
        className="disclaimer-first-run-dismiss"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          dismissDisclaimer(storage);
          setOpen(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
