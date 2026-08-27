/**
 * Analog: CRC STARS TPA/ATPA slew chords, Command Reference Table 36
 * (docs.virtualnas.net/crc/stars — R07). `*J` / `*P` / `**J` / `**P` /
 * `*D+` / `*D+E` / `*D+I` / `*AE` / `*AI` / `*BE` / `*BI` / `*DE` / `*DI`.
 *
 * Display-only scope actions against the slewed track. Never Command IR,
 * readback, or intent — `DAL123 H270` on the radio command line still turns.
 * F7 `<MULTI FUNC>` inhibit commands (`M`, `C`, `Y`) remain deferred.
 *
 * Trainer delta: parser + PPI `*` entry only (same FIL-prompt grammar as the
 * altitude filter: buffer on the PPI, Esc cancels, Backspace edits). A complete
 * buffer slews on the next target click with no Enter (R07 command-then-slew).
 * Enter still applies immediately to the slewed track, or arms track-scoped
 * `*J` / `*P` when nothing is slewed. No `window.prompt`, no HTML `<input>`.
 * `applyStarsChordAction` fills T02-46 in-trail / cone-mileage flags, T02-48
 * per-track rings, cones, and size-readout inhibit, and ATPA cone-enable
 * (`*AE` / `*AI` / `*BE` / `*BI`). Not NAS STARS.
 */

import type { World } from "@core";
import { CHORD_TIMEOUT_MS, chordTimedOut, digitFromKey } from "./keymap";
import type { ScopeView } from "./scopeView";
import { ensureTrackDisplay, selectedTrackId } from "./trackDisplay";

export const STARS_CHORD_NM_MIN = 1;
export const STARS_CHORD_NM_MAX = 30;

export type StarsChordTarget = "slewed" | "all";
export type StarsChordToggleMode = "toggle" | "enable" | "inhibit";
export type StarsChordEnableMode = "enable" | "inhibit";

export type StarsChordAction =
  | { type: "jRing"; target: "slewed"; radiusNm: number }
  | { type: "jRingClear"; target: StarsChordTarget }
  | { type: "cone"; target: "slewed"; lengthNm: number }
  | { type: "coneClear"; target: StarsChordTarget }
  | { type: "tpaSizeReadout"; mode: StarsChordToggleMode }
  | { type: "atpaWarningAlert"; mode: StarsChordEnableMode }
  | { type: "atpaMonitor"; mode: StarsChordEnableMode }
  | { type: "inTrailDistance"; mode: StarsChordEnableMode };

export type StarsChordResult =
  | { kind: "incomplete" }
  | { kind: "invalid"; reason: string }
  | { kind: "action"; action: StarsChordAction };

const FIXED_ACTIONS: Readonly<Record<string, StarsChordAction>> = {
  "*D+": { type: "tpaSizeReadout", mode: "toggle" },
  "*D+E": { type: "tpaSizeReadout", mode: "enable" },
  "*D+I": { type: "tpaSizeReadout", mode: "inhibit" },
  "*AE": { type: "atpaWarningAlert", mode: "enable" },
  "*AI": { type: "atpaWarningAlert", mode: "inhibit" },
  "*BE": { type: "atpaMonitor", mode: "enable" },
  "*BI": { type: "atpaMonitor", mode: "inhibit" },
  "*DE": { type: "inTrailDistance", mode: "enable" },
  "*DI": { type: "inTrailDistance", mode: "inhibit" },
};

const FIXED_KEYS = Object.keys(FIXED_ACTIONS);

function invalid(reason: string): StarsChordResult {
  return { kind: "invalid", reason };
}

function inChordNmRange(n: number): boolean {
  return Number.isFinite(n) && n >= STARS_CHORD_NM_MIN && n <= STARS_CHORD_NM_MAX;
}

function jpSetAction(letter: "J" | "P", nm: number): StarsChordAction {
  return letter === "J"
    ? { type: "jRing", target: "slewed", radiusNm: nm }
    : { type: "cone", target: "slewed", lengthNm: nm };
}

function parseJpMileage(letter: "J" | "P", rest: string): StarsChordResult {
  if (rest === "") {
    return {
      kind: "action",
      action: {
        type: letter === "J" ? "jRingClear" : "coneClear",
        target: "slewed",
      },
    };
  }
  if (/^\d+\.$/.test(rest)) {
    return { kind: "incomplete" };
  }
  if (/^\d+$/.test(rest) || /^\d+\.\d$/.test(rest)) {
    const nm = Number(rest);
    if (!inChordNmRange(nm)) {
      return invalid(`radius/length ${rest} is outside 1–30 NM`);
    }
    return { kind: "action", action: jpSetAction(letter, nm) };
  }
  return invalid(`malformed ${letter} mileage`);
}

/**
 * Pure string parser for STARS TPA/ATPA `*` chords (R07 Table 36).
 * `**J` / `**P` are matched before the single-`*` forms so `*J` cannot swallow them.
 * A live prefix (`*D`, `*J2.`) is `incomplete`; commit maps that to `invalid`.
 * Out-of-range mileage is `invalid`, never clamped.
 */
export function parseStarsChord(buffer: string): StarsChordResult {
  if (buffer === "" || buffer === "*") {
    return { kind: "incomplete" };
  }
  if (!buffer.startsWith("*")) {
    return invalid("not a * chord");
  }

  if (buffer.startsWith("**")) {
    if (buffer === "**") {
      return { kind: "incomplete" };
    }
    if (buffer === "**J") {
      return { kind: "action", action: { type: "jRingClear", target: "all" } };
    }
    if (buffer === "**P") {
      return { kind: "action", action: { type: "coneClear", target: "all" } };
    }
    return invalid("unknown ** chord");
  }

  if (buffer.startsWith("*J")) {
    return parseJpMileage("J", buffer.slice(2));
  }
  if (buffer.startsWith("*P")) {
    return parseJpMileage("P", buffer.slice(2));
  }

  const fixed = FIXED_ACTIONS[buffer];
  if (fixed) {
    return { kind: "action", action: fixed };
  }
  if (FIXED_KEYS.some((key) => key.startsWith(buffer))) {
    return { kind: "incomplete" };
  }
  return invalid("unknown * chord");
}

/** Enter-commit: a still-live prefix (`*D`) is `invalid`, not a silent no-op. */
export function commitStarsChord(buffer: string): StarsChordResult {
  const parsed = parseStarsChord(buffer);
  if (parsed.kind === "incomplete") {
    return invalid("incomplete chord");
  }
  return parsed;
}

export type StarsChordEntryPhase = "idle" | "entry";

/** Scope-focus `*` chord. Idle when not entering. Display only. */
export interface StarsChordEntry {
  phase: StarsChordEntryPhase;
  /** Live buffer including the leading `*`. Empty when idle. */
  buffer: string;
  lastKeyAtMs: number;
  /** Brief invalid-commit flash (`*D INV`); null when none. */
  rejection: string | null;
}

export function idleStarsChordEntry(): StarsChordEntry {
  return { phase: "idle", buffer: "", lastKeyAtMs: 0, rejection: null };
}

export function beginStarsChordEntry(entry: StarsChordEntry, nowMs: number): void {
  entry.phase = "entry";
  entry.buffer = "*";
  entry.lastKeyAtMs = nowMs;
  entry.rejection = null;
}

export function cancelStarsChordEntry(entry: StarsChordEntry): void {
  const idle = idleStarsChordEntry();
  entry.phase = idle.phase;
  entry.buffer = idle.buffer;
  entry.lastKeyAtMs = idle.lastKeyAtMs;
  entry.rejection = idle.rejection;
}

/** Reject a live buffer as `… INV` and idle it so the flash can auto-clear. */
export function rejectStarsChordEntry(entry: StarsChordEntry, nowMs: number): void {
  entry.rejection = `${entry.buffer} INV`;
  entry.phase = "idle";
  entry.buffer = "";
  entry.lastKeyAtMs = nowMs;
}

/**
 * Live `*` buffers never use the L/F 1.5 s window. They end only on Esc,
 * a successful commit (Enter or slew click), or a new `*` chord.
 * The brief `... INV` rejection flash still auto-clears on CHORD_TIMEOUT_MS.
 */
export function expireStarsChordEntry(entry: StarsChordEntry, nowMs: number): boolean {
  if (entry.phase === "entry") {
    return false;
  }
  if (entry.rejection != null && chordTimedOut(entry.lastKeyAtMs, nowMs, CHORD_TIMEOUT_MS)) {
    entry.rejection = null;
    return true;
  }
  return false;
}

/** Format a committed chord back to the PPI readout (`*J3`, `*P`, `*J`). */
export function formatStarsChordAction(action: StarsChordAction): string {
  if (action.type === "jRing") {
    return `*J${action.radiusNm}`;
  }
  if (action.type === "cone") {
    return `*P${action.lengthNm}`;
  }
  if (action.type === "jRingClear") {
    return action.target === "all" ? "**J" : "*J";
  }
  if (action.type === "coneClear") {
    return action.target === "all" ? "**P" : "*P";
  }
  if (action.type === "tpaSizeReadout") {
    if (action.mode === "enable") {
      return "*D+E";
    }
    if (action.mode === "inhibit") {
      return "*D+I";
    }
    return "*D+";
  }
  if (action.type === "atpaWarningAlert") {
    return action.mode === "enable" ? "*AE" : "*AI";
  }
  if (action.type === "atpaMonitor") {
    return action.mode === "enable" ? "*BE" : "*BI";
  }
  return action.mode === "enable" ? "*DE" : "*DI";
}

/** Live `*J2.5`, armed `*J3`, or `*D INV` after a rejected commit. Null when idle. */
export function formatStarsChordReadout(
  entry: StarsChordEntry,
  armed: StarsChordAction | null = null,
): string | null {
  if (entry.phase === "entry" && entry.buffer.length > 0) {
    return entry.buffer;
  }
  if (entry.rejection) {
    return entry.rejection;
  }
  if (armed) {
    return formatStarsChordAction(armed);
  }
  return null;
}

function chordCharFromKey(key: string, code?: string): string | null {
  if (key === "*" || key === "Multiply") {
    return "*";
  }
  if (key === "+" || key === "Add") {
    return "+";
  }
  if (key === "." || key === "Decimal") {
    return ".";
  }
  const digit = digitFromKey(key, code);
  if (digit !== null) {
    return String(digit);
  }
  if (/^[a-zA-Z]$/.test(key)) {
    return key.toUpperCase();
  }
  return null;
}

export interface StarsChordKeyOutcome {
  consumed: boolean;
  action: StarsChordAction | null;
}

/**
 * Scope-focus `*` chord. Returns consumed when the key is taken (including
 * reject/cancel). A live buffer never times out; only the INV flash does.
 * Never Command IR.
 */
export function handleStarsChordEntryKey(
  entry: StarsChordEntry,
  key: string,
  nowMs: number,
  code?: string,
): StarsChordKeyOutcome {
  if (expireStarsChordEntry(entry, nowMs) && entry.phase === "idle") {
    return { consumed: false, action: null };
  }
  if (entry.phase === "idle") {
    return { consumed: false, action: null };
  }
  if (key === "Escape") {
    cancelStarsChordEntry(entry);
    return { consumed: true, action: null };
  }
  if (key === "Backspace") {
    if (entry.buffer.length <= 1) {
      cancelStarsChordEntry(entry);
      return { consumed: true, action: null };
    }
    entry.buffer = entry.buffer.slice(0, -1);
    entry.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  if (key === "Enter" || key === "NumpadEnter") {
    const committed = commitStarsChord(entry.buffer);
    if (committed.kind === "action") {
      cancelStarsChordEntry(entry);
      return { consumed: true, action: committed.action };
    }
    rejectStarsChordEntry(entry, nowMs);
    return { consumed: true, action: null };
  }
  const ch = chordCharFromKey(key, code);
  if (ch !== null) {
    entry.buffer += ch;
    entry.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  cancelStarsChordEntry(entry);
  return { consumed: false, action: null };
}

export type StarsChordApplyResult = "applied" | "unsupported";
export type StarsChordArmOrApplyResult = "applied" | "armed" | "unsupported";

/** Track-scoped J-ring / cone actions that wait for a slew when nothing is selected. */
export function starsChordActionNeedsSlew(action: StarsChordAction): boolean {
  return (
    action.type === "jRing" ||
    action.type === "cone" ||
    ((action.type === "jRingClear" || action.type === "coneClear") && action.target === "slewed")
  );
}

function applyEnableMode(
  current: boolean,
  mode: StarsChordToggleMode | StarsChordEnableMode,
): boolean {
  if (mode === "enable") {
    return true;
  }
  if (mode === "inhibit") {
    return false;
  }
  return !current;
}

/**
 * Map a parsed TPA/ATPA chord onto scope state. T02-46 owns Intrail Distance
 * (`*DE` / `*DI`) and A/TPA Mileage (`*D+` / `*D+E` / `*D+I`). T02-48 fills
 * the same `*D+` action's **manual TPA** half (J-ring / `*P` size digits) plus
 * `*J` / `*P` / `**J` / `**P`. `*AE` / `*AI` drive warning+alert
 * (`atpaWarningAlertEnabled` / `alertCones`); `*BE` / `*BI` drive monitor
 * (`atpaMonitorEnabled` / `monitorCones`). Flag families use the slewed track
 * if one is slewed, otherwise the global `view.atpa` latch. Track-scoped
 * `*J` / `*P` with no slew are a silent no-op here — `armOrApplyStarsChordAction`
 * arms them for the next target click. Display only — never Command IR.
 */
export function applyStarsChordAction(
  view: ScopeView,
  world: World | undefined,
  action: StarsChordAction,
): StarsChordApplyResult {
  const slewedId = world !== undefined ? selectedTrackId(world) : null;

  if (action.type === "jRing") {
    if (!slewedId) {
      return "applied";
    }
    ensureTrackDisplay(view.tracks, slewedId).tpaRingNm = action.radiusNm;
    return "applied";
  }
  if (action.type === "jRingClear") {
    if (action.target === "all") {
      for (const td of view.tracks.values()) {
        td.tpaRingNm = undefined;
      }
      return "applied";
    }
    if (slewedId) {
      ensureTrackDisplay(view.tracks, slewedId).tpaRingNm = undefined;
    }
    return "applied";
  }
  if (action.type === "cone") {
    if (!slewedId) {
      return "applied";
    }
    ensureTrackDisplay(view.tracks, slewedId).tpaConeNm = action.lengthNm;
    return "applied";
  }
  if (action.type === "coneClear") {
    if (action.target === "all") {
      for (const td of view.tracks.values()) {
        td.tpaConeNm = undefined;
      }
      return "applied";
    }
    if (slewedId) {
      ensureTrackDisplay(view.tracks, slewedId).tpaConeNm = undefined;
    }
    return "applied";
  }
  if (action.type === "inTrailDistance") {
    if (slewedId) {
      const td = ensureTrackDisplay(view.tracks, slewedId);
      td.atpaInTrailDistanceEnabled = applyEnableMode(
        td.atpaInTrailDistanceEnabled !== false,
        action.mode,
      );
    } else {
      view.atpa.inTrailDistance = applyEnableMode(view.atpa.inTrailDistance, action.mode);
    }
    return "applied";
  }
  if (action.type === "tpaSizeReadout") {
    if (slewedId) {
      const td = ensureTrackDisplay(view.tracks, slewedId);
      td.atpaConeMileageEnabled = applyEnableMode(td.atpaConeMileageEnabled !== false, action.mode);
      td.tpaSizeReadoutEnabled = applyEnableMode(td.tpaSizeReadoutEnabled !== false, action.mode);
    } else {
      view.atpa.coneMileage = applyEnableMode(view.atpa.coneMileage, action.mode);
    }
    return "applied";
  }
  if (action.type === "atpaWarningAlert") {
    if (slewedId) {
      const td = ensureTrackDisplay(view.tracks, slewedId);
      td.atpaWarningAlertEnabled = applyEnableMode(
        td.atpaWarningAlertEnabled !== false,
        action.mode,
      );
    } else {
      view.atpa.alertCones = applyEnableMode(view.atpa.alertCones, action.mode);
    }
    return "applied";
  }
  if (action.type === "atpaMonitor") {
    if (slewedId) {
      const td = ensureTrackDisplay(view.tracks, slewedId);
      td.atpaMonitorEnabled = applyEnableMode(td.atpaMonitorEnabled !== false, action.mode);
    } else {
      view.atpa.monitorCones = applyEnableMode(view.atpa.monitorCones, action.mode);
    }
    return "applied";
  }
  return "unsupported";
}

/**
 * Enter-commit: apply immediately when a slew target is present (or the action
 * needs none). Track-scoped `*J` / `*P` with nothing slewed arm and stay on
 * the PPI until the next target click, Esc, or a new `*` chord. `**J` / `**P`
 * still apply with no target. Flag families never arm; no-slew Enter falls
 * back to the global `view.atpa` latch. A live buffer also slews on click.
 */
export function armOrApplyStarsChordAction(
  view: ScopeView,
  world: World | undefined,
  action: StarsChordAction,
): StarsChordArmOrApplyResult {
  if (starsChordActionNeedsSlew(action)) {
    const slewedId = world !== undefined ? selectedTrackId(world) : null;
    if (!slewedId) {
      view.starsChordArmed = action;
      return "armed";
    }
  }
  view.starsChordArmed = null;
  return applyStarsChordAction(view, world, action);
}
