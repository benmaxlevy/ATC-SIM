/**
 * Analog: CRC STARS keyboard / DCB (docs.virtualnas.net/crc/stars — R07).
 * CRC F1 = hold for beacon-code readout; F3 = INIT CNTL initiate track;
 * L1–L9 = leader direction; DCB RANGE spinner; PTL OWN/ALL; `/` = leader
 * length. vice (R08) is typed-radio feel, not this map.
 * Trainer delta: exported Windows subset only — F1 is help, F3 is color
 * stub, PageUp/Down range presets 5–60 (no CRC 6/8/12/16/24), `/` when
 * scope-focused buffers into the Preview Area (not leader length; Tab cycles
 * radio ↔ PPI). 1.5 s L/F
 * chord window (`*` persists until Esc, commit, or a new `*`); leftover digits never go to the parser; no keyboard leader-length menu
 * (`/` is Preview Area slew/drop prefix). DCB LDR length is a discrete px spinner. `F` is scope-focus only.
 * `*` with PPI focused is TPA/ATPA slew chords (R07 Table 36), never Command IR.
 * Inject `nowMs` in tests. Not NAS STARS.
 */

export type KeyFocus = "always" | "scope";

export interface KeyBinding {
  id: string;
  focus: KeyFocus;
  windowsKeys: string; // e.g. "PageUp" | "L then 1–9"
  action: string;
  crcAnalog: string;
}

/** Help overlay footer — phase README keyboard-feel freeze. */
export const HELP_FOOTER = "TRAINER KEYS — NOT CRC";

/** One-line in-app pointer (T02-13). Overlay itself is F1; this is how you find it. */
export const HELP_KEYS_POINTER = "F1 lists keys.";

/** Radio vs scope pipeline. Overlay must include this; never a CRC cheat sheet. */
export const RADIO_CONFLICT_WARNING =
  "Radio commands stay on the command line and never come from scope keys. L090 is a left turn to heading 090 when the command line is focused.";

/** Glossary terms the overlay must teach (range, datablock, leader, initiate track). */
export const HELP_GLOSSARY_NOTE =
  "Trainer names: range, datablock, leader, initiate track. CRC keys are a reference, not a 1:1 spec.";

/**
 * Frozen Windows subset from phases/02-scope/README.md.
 * Help overlay renders this array — do not duplicate rows in JSX.
 */
export const KEY_BINDINGS: KeyBinding[] = [
  {
    id: "range-in",
    focus: "always",
    windowsKeys: "PageUp",
    action: "Range in (smaller NM preset). At 5 NM: no-op, no wrap.",
    crcAnalog: "DCB RANGE spinner / Ctrl+F10 RANGE",
  },
  {
    id: "range-out",
    focus: "always",
    windowsKeys: "PageDown",
    action: "Range out (larger NM preset). At 60 NM: no-op, no wrap.",
    crcAnalog: "DCB RANGE spinner / Ctrl+F10 RANGE",
  },
  {
    id: "center-airport",
    focus: "always",
    windowsKeys: "Home",
    action: "Center on airport ref (KDEM ARP).",
    crcAnalog: "CENTER then click / Ctrl+F1 re-center",
  },
  {
    id: "center-click",
    focus: "always",
    windowsKeys: "End",
    action: "Center on last PPI click (or airport if none this session).",
    crcAnalog: "CENTER then click",
  },
  {
    id: "help",
    focus: "always",
    windowsKeys: "F1",
    action: "Toggle this help overlay. Not CRC F1. preventDefault so Chrome help does not open.",
    crcAnalog: "CRC F1 hold = beacon-code readout (beaconator)",
  },
  {
    id: "initiate-track",
    focus: "always",
    windowsKeys: "F3",
    action:
      "INIT CNTL initiate track: selected applies now; no selection arms command-then-slew; type FLID then Enter or slew. Color stub, no NAS associate.",
    crcAnalog: "F3 INIT CNTL / <INIT CNTL><FLID><SLEW> / <INIT CNTL><FLID><ENTER>",
  },
  {
    id: "drop-track",
    focus: "always",
    windowsKeys: "F4",
    action:
      "TERM CNTL drop track: selected drops now; no selection arms command-then-slew; type FLID then Enter or slew. Trainer drop, not TERM CNTL ALL.",
    crcAnalog: "F4 TERM CNTL / <TERM CNTL><SLEW> / <TERM CNTL><FLID><ENTER>",
  },
  {
    id: "ptl",
    focus: "always",
    windowsKeys: "F7",
    action: "Toggle PTL ALL (predicted track line). If OWN and ALL are off, F7 turns ALL on.",
    crcAnalog: "DCB PTL OWN / PTL ALL (CRC F7 is MULTIFUNC)",
  },
  {
    id: "history",
    focus: "always",
    windowsKeys: "F8",
    action: "Toggle history dots (0 ↔ last non-zero count).",
    crcAnalog: "DCB HISTORY (dot count 0–5)",
  },
  {
    id: "cycle-focus",
    focus: "always",
    windowsKeys: "Tab",
    action: "Cycle focus: command line ↔ PPI. Does not steal Tab from help overlay inputs.",
    crcAnalog: "Not CRC — trainer radio vs scope focus",
  },
  {
    id: "mouse-range",
    focus: "always",
    windowsKeys: "Wheel up / down",
    action: "Range in / out (same presets as PageUp/PageDown). No zoom-to-cursor.",
    crcAnalog: "DCB RANGE spinner wheel",
  },
  {
    id: "mouse-pan",
    focus: "always",
    windowsKeys: "Right-button drag (middle-button still works)",
    action: "Slew view center (trainer sugar). Not CRC.",
    crcAnalog: "Not CRC — CRC is CENTER then click",
  },
  {
    id: "mouse-select",
    focus: "always",
    windowsKeys: "Left click on target or datablock",
    action: "Select track.",
    crcAnalog: "Slew / click target",
  },
  {
    id: "mouse-accept-handoff",
    focus: "always",
    windowsKeys: "Left click pending inbound track",
    action: "CLICK accept inbound handoff (CRC slew analog)",
    crcAnalog: "CRC STARS: slew the track to accept the handoff",
  },
  {
    id: "mouse-deselect",
    focus: "always",
    windowsKeys: "Left click empty PPI",
    action: "Deselect.",
    crcAnalog: "Click empty display",
  },
  {
    id: "mouse-center",
    focus: "always",
    windowsKeys: "Double-click empty PPI",
    action: "Center view on that world point.",
    crcAnalog: "CENTER then click",
  },
  {
    id: "mouse-place-cntr",
    focus: "always",
    windowsKeys: "DCB PLACE CNTR, then PPI click",
    action:
      "Set view center to that world point. DCB OFF CNTR (or Home) recenters the airport. End uses last click. No zoom-to-cursor.",
    crcAnalog: "DCB PLACE CNTR then click",
  },
  {
    id: "mouse-place-rr",
    focus: "always",
    windowsKeys: "DCB PLACE RR, then PPI click",
    action: "Set range-ring origin to that world point. RR CNTR snaps origin to the view center.",
    crcAnalog: "DCB PLACE RR then click",
  },
  {
    id: "leader",
    focus: "scope",
    windowsKeys: "L then 1–9",
    action: "Leader direction (L1–L9). Top-row or numpad. Selected track, or all if none selected.",
    crcAnalog: "CRC L1–L9 leader (keyboard `/` is not length; DCB LDR spinner has 0/24/36/48 px)",
  },
  {
    id: "datablock",
    focus: "scope",
    windowsKeys: "T",
    action: "Full ↔ limited datablock. Selected track, or all if none selected.",
    crcAnalog: "Tag/untag analog (FDB / LDB)",
  },
  {
    id: "mode-c",
    focus: "scope",
    windowsKeys: "M",
    action: "Mode C field on/off on full datablocks.",
    crcAnalog: "CRC Mode C field toggle",
  },
  {
    id: "altitude-filter",
    focus: "scope",
    windowsKeys: "F then 3-digit min, Enter, 3-digit max, Enter",
    action: "Altitude filter in Mode C hundreds. Esc cancels.",
    crcAnalog: "CRC altitude filter",
  },
  {
    id: "history-scope",
    focus: "scope",
    windowsKeys: "H",
    action: "History dots (same as F8: 0 ↔ last non-zero) when the PPI is focused.",
    crcAnalog: "DCB history (always-on duplicate is F8)",
  },
  {
    id: "tower-handoff",
    focus: "always",
    windowsKeys: "Shift+H",
    action: "Initiate handoff: Tower (if on approach) or Center (if climbing outbound)",
    crcAnalog: "CRC handoff / HO — we do not initiate/accept a second facility",
  },
  {
    id: "radio-focus",
    focus: "scope",
    windowsKeys: "/",
    action:
      "Preview Area slew/drop prefix (buffers `/`). Tab cycles PPI ↔ command line. Radio-focused / types as phase 1.",
    crcAnalog:
      "CRC / is leader length — we do not bind that; CRC <SLEW> analog is / or canvas click",
  },
  {
    id: "stars-tpa-atpa",
    focus: "scope",
    windowsKeys: "* then J/P/D+/AE/BE/DE, Enter commits",
    action:
      "TPA/ATPA slew chord on the selected track (J-ring, cone, size/ATPA flags). Display only — never Command IR.",
    crcAnalog: "CRC STARS TPA/ATPA Table 36 (*J *P **J **P *D+ *AE *BE *DE)",
  },
];

export function isMouseBinding(binding: KeyBinding): boolean {
  return binding.id.startsWith("mouse-");
}

export function alwaysOnKeyBindings(): KeyBinding[] {
  return KEY_BINDINGS.filter((b) => b.focus === "always" && !isMouseBinding(b));
}

export function scopeFocusKeyBindings(): KeyBinding[] {
  return KEY_BINDINGS.filter((b) => b.focus === "scope");
}

export function mouseKeyBindings(): KeyBinding[] {
  return KEY_BINDINGS.filter(isMouseBinding);
}

export function bindingById(id: string): KeyBinding | undefined {
  return KEY_BINDINGS.find((b) => b.id === id);
}

export const SCOPE_CHORD_WINDOW_MS = 1500;
/** Chord window after L or F (phase README frozen decision 2). */
export const CHORD_TIMEOUT_MS = SCOPE_CHORD_WINDOW_MS;

/** Pending scope-focus chord (`L` leader; `F` filter). */
export interface ScopeChord {
  /** Prefix letter, uppercase. */
  prefix: string;
  startedAtMs: number;
  /** Optional status hint, e.g. `L_`. */
  hint: string;
  /** Digit buffer for multi-key chords (filter). Leader uses one digit. */
  buffer: string;
}

export function beginScopeChord(prefix: string, nowMs: number, hint: string): ScopeChord {
  return { prefix, startedAtMs: nowMs, hint, buffer: "" };
}

export function isScopeChordLive(chord: ScopeChord | null | undefined, nowMs: number): boolean {
  return chord != null && nowMs - chord.startedAtMs <= SCOPE_CHORD_WINDOW_MS;
}

/** Filter entry expires at exactly timeout (T02-06). Leader chord stays live through the window. */
export function chordTimedOut(
  lastKeyAtMs: number,
  nowMs: number,
  timeoutMs: number = CHORD_TIMEOUT_MS,
): boolean {
  return nowMs - lastKeyAtMs >= timeoutMs;
}

export function isArrowKey(key: string): boolean {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

/**
 * Top-row or numpad digit 0–9. Arrow keys (NumLock off) return null even when
 * `code` is Numpad8 etc. — require a real digit key.
 * `code` covers Digit/Numpad when `key` is not a digit character.
 * `key` may also be `Numpad3` (T02-06 filter chord).
 */
export function digitFromKey(key: string, code?: string): number | null {
  if (isArrowKey(key)) {
    return null;
  }
  if (/^[0-9]$/.test(key)) {
    return Number(key);
  }
  const fromKey = /^Numpad([0-9])$/.exec(key);
  if (fromKey) {
    return Number(fromKey[1]);
  }
  const fromCode = code?.match(/^(?:Digit|Numpad)([0-9])$/);
  if (fromCode) {
    return Number(fromCode[1]);
  }
  return null;
}

export function leaderDigitFromKey(
  key: string,
  code?: string,
): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null {
  const n = digitFromKey(key, code);
  if (n == null || n < 1 || n > 9) {
    return null;
  }
  return n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export function isLeaderPrefixKey(key: string): boolean {
  return key === "L" || key === "l";
}

/** Scope-focus altitude filter chord. Never always-on. */
export function isFilterChordKey(key: string): boolean {
  return key === "F" || key === "f";
}

/** Scope-focus Table 30 beacon select. Never always-on; radio `B` is literal. */
export function isBeaconSelectKey(key: string): boolean {
  return key === "B" || key === "b";
}

/** Scope-focus STARS TPA/ATPA `*` chord. Never always-on; radio `*` is literal. */
export function isStarsChordPrefixKey(key: string): boolean {
  return key === "*" || key === "Multiply";
}

/** F1 is always-on help. Not CRC F1. */
export function isHelpToggleKey(key: string): boolean {
  return key === "F1";
}

/** Tab cycles command line ↔ PPI. Always-on except help overlay inputs. */
export function isCycleFocusKey(key: string): boolean {
  return key === "Tab";
}

/**
 * Unmodified slash. Scope-focused `/` buffers into the Preview Area (T02-61).
 * Radio-focused `/` is left to phase 1 (insert or no-op). Tab cycles focus.
 */
export function isRadioFocusSlashKey(key: string): boolean {
  return key === "/";
}

/** Scope-focus Track Key `+`. Never always-on; radio `+` is literal. */
export function isPreviewPlusKey(key: string): boolean {
  return key === "+" || key === "Add";
}

/**
 * Always-on handoff action. Shift+H — not scope-focus H (history) and not radio H270.
 * Auto-detects Tower (for arrivals on final) vs Center (for climbing departures).
 */
export function isHandoffKey(event: { key: string; shiftKey?: boolean }): boolean {
  return event.shiftKey === true && (event.key === "H" || event.key === "h");
}

export const isTowerHandoffKey = isHandoffKey;
