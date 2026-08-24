/**
 * Analog: CRC STARS has no F1 help overlay (CRC F1 hold = beaconator — R07).
 * Trainer delta: F1 lists the frozen Windows subset from KEY_BINDINGS. Footer
 * is exactly TRAINER KEYS — NOT CRC. Rows are CRC analog → our key. Sim keeps
 * ticking while open. T00-01 disclaimer copy is here after T02-15 (not a
 * banner over the DCB). Not NAS STARS.
 */

import {
  HELP_FOOTER,
  HELP_GLOSSARY_NOTE,
  HELP_OVERLAY_ID,
  RADIO_CONFLICT_WARNING,
  alwaysOnKeyBindings,
  mouseKeyBindings,
  scopeFocusKeyBindings,
  type KeyBinding,
} from "@scope";
import { DISCLAIMER_COPY } from "./disclaimer-copy";

export interface ScopeHelpOverlayProps {
  open: boolean;
}

function HelpRow({ binding }: { binding: KeyBinding }) {
  return (
    <tr>
      <td className="scope-help-crc">{binding.crcAnalog}</td>
      <td className="scope-help-arrow" aria-hidden="true">
        →
      </td>
      <td className="scope-help-key">{binding.windowsKeys}</td>
      <td className="scope-help-action">{binding.action}</td>
    </tr>
  );
}

function HelpTable({ caption, bindings }: { caption: string; bindings: KeyBinding[] }) {
  return (
    <table className="scope-help-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>CRC analog</th>
          <th aria-hidden="true" />
          <th>Our key</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {bindings.map((binding) => (
          <HelpRow key={binding.id} binding={binding} />
        ))}
      </tbody>
    </table>
  );
}

export function ScopeHelpOverlay({ open }: ScopeHelpOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      id={HELP_OVERLAY_ID}
      className="scope-help-overlay"
      role="dialog"
      aria-label="Trainer keys"
      aria-modal="false"
    >
      <div className="scope-help-panel">
        <h2 className="scope-help-title">Scope keyboard</h2>
        <p className="scope-help-glossary">{HELP_GLOSSARY_NOTE}</p>
        <p className="scope-help-radio">{RADIO_CONFLICT_WARNING}</p>
        <HelpTable caption="Always-on" bindings={alwaysOnKeyBindings()} />
        <HelpTable
          caption="Scope-focus (command line blurred)"
          bindings={scopeFocusKeyBindings()}
        />
        <HelpTable caption="Mouse (pointer over PPI)" bindings={mouseKeyBindings()} />
        <p className="scope-help-dcb">
          SHIFT swaps MAIN and AUX. AUX has HISTORY, PTL length/OWN/ALL, and DCB
          TOP/LEFT/RIGHT/BOTTOM. VOL is disabled. FILTER stays on MAIN. Esc closes
          a DCB submenu (DONE). RANGE / RR / LDR DIR / LDR are spinners. PLACE CNTR
          then PPI click sets view center; OFF CNTR recenters the airport. PLACE RR
          then PPI click sets range-ring origin; RR CNTR snaps origin to the view
          center.
        </p>
        <p className="scope-help-disclaimer">{DISCLAIMER_COPY}</p>
        <p className="scope-help-footer">{HELP_FOOTER}</p>
      </div>
    </div>
  );
}
