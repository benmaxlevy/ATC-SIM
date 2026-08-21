/**
 * Analog: CRC/vNAS STARS TCW has no legal banner over the DCB (R07).
 * Trainer delta: exact T00-01 copy on first boot (dismiss once per profile)
 * and still in F1. Not a header spanning the DCB. Not NAS STARS.
 */

import { useState } from "react";
import { DISCLAIMER_COPY, dismissDisclaimer, isDisclaimerDismissed } from "./disclaimer-copy";

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
