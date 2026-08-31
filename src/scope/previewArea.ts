/**
 * Analog: CRC STARS Preview Area + Command Reference
 * (docs.virtualnas.net/crc/stars — R07). Typed scope commands paint under the
 * SSA; Tracking Aircraft Table 18/19 names INIT CNTL / TERM CNTL; Table 30
 * names beacon-code select (`B##` CODE BLOCK / `B####` discrete).
 *
 * The preview buffer is a **display-only** scope action surface. It is not the
 * radio command line. `DAL123 H270` remains the radio path and still compiles
 * to Command IR. Preview never emits Command, readback, or intent. No
 * `window.prompt`, no HTML `<input>`.
 *
 * Grammar lives in `previewParse.ts`. This module owns idle/entry/armed state,
 * slew apply, and key handling. Not NAS STARS.
 */

import type { World } from "@core";
import type { LoadedVideoMap } from "@scenario";
import { DCB_PREF_NAME_MAX_CHARS, parseDcbPrefName } from "./dcb/dcbPref";
import { type VideoMapTokenLayout } from "./dcb/dcbFunctions";
import { CHORD_TIMEOUT_MS, chordTimedOut, digitFromKey } from "./keymap";
import { cloneWxLevels, type WxLevels } from "./wx";
import {
  FULL_CALLSIGN,
  SQUAWK_CODE,
  SUFFIX_CALLSIGN,
  isTrackingSlewAction,
  parsePreviewCommand,
  parseTrackingSlewBuffer,
  previewBufferCharFromKey,
  type PreviewArmedAction,
  type PreviewCommandResult,
} from "./previewParse";

export type { PreviewArmedAction, PreviewCommandResult } from "./previewParse";
export {
  isPreviewBufferStartChar,
  isTrackingSlewAction,
  parseAltitudeFilterCommand,
  parseBeaconFilterCommand,
  parsePreviewCommand,
  parseScopeDisplayCommand,
  parseTrackingCommand,
  parseTrackingSlewBuffer,
  previewBufferCharFromKey,
} from "./previewParse";

export type PreviewPhase = "idle" | "entry" | "armed";

function numericTail(callsign: string): string {
  return callsign.replace(/^[A-Z]{3}/, "");
}

export type ScopeFlidResult =
  { ok: true; aircraftId: string } | { ok: false; reason: "unknown" | "ambiguous" };

/**
 * Resolve a Preview Area FLID: full callsign, numeric tail, or unique 4-digit
 * squawk. Two tails, two squawks, or tail vs squawk → ambiguous.
 */
export function resolveScopeFlid(token: string, world: World): ScopeFlidResult {
  const normalized = token.trim().toUpperCase();
  if (normalized.length === 0) {
    return { ok: false, reason: "unknown" };
  }
  const ids = new Set<string>();
  if (FULL_CALLSIGN.test(normalized)) {
    for (const ac of world.aircraft) {
      if (ac.callsign === normalized) {
        ids.add(ac.id);
      }
    }
  } else if (SUFFIX_CALLSIGN.test(normalized)) {
    for (const ac of world.aircraft) {
      if (numericTail(ac.callsign) === normalized) {
        ids.add(ac.id);
      }
    }
  }
  if (SQUAWK_CODE.test(normalized)) {
    for (const ac of world.aircraft) {
      if (ac.squawk === normalized) {
        ids.add(ac.id);
      }
    }
  }
  if (ids.size === 1) {
    return { ok: true, aircraftId: ids.values().next().value! };
  }
  if (ids.size === 0) {
    return { ok: false, reason: "unknown" };
  }
  return { ok: false, reason: "ambiguous" };
}
export type PreviewAreaState = {
  phase: PreviewPhase;
  /** Live typed buffer. Empty when idle. */
  buffer: string;
  /** CRC mnemonic painted under the SSA, e.g. `INIT CNTL`. Never `"F3"`. */
  mnemonic: string;
  /** Optional FLID / ACID typed after a function key. */
  flid: string | null;
  lastKeyAtMs: number;
  /** Brief invalid-commit flash (`buffer INV`); null when none. */
  rejection: string | null;
  /** Generic armed-action discriminator. Null when none. */
  armed: PreviewArmedAction | null;
};

export function idlePreviewArea(): PreviewAreaState {
  return {
    phase: "idle",
    buffer: "",
    mnemonic: "",
    flid: null,
    lastKeyAtMs: 0,
    rejection: null,
    armed: null,
  };
}

export function previewAreaIsLive(state: PreviewAreaState): boolean {
  return state.phase === "entry" || state.phase === "armed";
}

export function cancelPreviewArea(state: PreviewAreaState): void {
  const idle = idlePreviewArea();
  state.phase = idle.phase;
  state.buffer = idle.buffer;
  state.mnemonic = idle.mnemonic;
  state.flid = idle.flid;
  state.lastKeyAtMs = idle.lastKeyAtMs;
  state.rejection = idle.rejection;
  state.armed = idle.armed;
}

/**
 * Esc on a live preview (entry or armed) cancels to idle. Returns true when
 * consumed so callers skip `*` chord Esc and DCB Esc.
 */
export function handlePreviewEscape(state: PreviewAreaState): boolean {
  if (!previewAreaIsLive(state)) {
    return false;
  }
  cancelPreviewArea(state);
  return true;
}

/** Reject a live buffer as `… INV` and idle it so the flash can auto-clear. */
export function rejectPreviewArea(state: PreviewAreaState, nowMs: number): void {
  state.rejection = `${state.buffer} INV`;
  state.phase = "idle";
  state.buffer = "";
  state.mnemonic = "";
  state.flid = null;
  state.armed = null;
  state.lastKeyAtMs = nowMs;
}

/**
 * Live entry / armed never use the 1.5 s window. They end only on Esc or a
 * later ticket's commit. The brief `... INV` rejection flash still auto-clears
 * on CHORD_TIMEOUT_MS (same shape as T02-49 `*` chords).
 */
export function expirePreviewArea(state: PreviewAreaState, nowMs: number): boolean {
  if (state.phase === "entry" || state.phase === "armed") {
    return false;
  }
  if (state.rejection != null && chordTimedOut(state.lastKeyAtMs, nowMs, CHORD_TIMEOUT_MS)) {
    state.rejection = null;
    return true;
  }
  return false;
}

/**
 * Live mnemonic + optional FLID / buffer, or `Q INV` after a rejected commit.
 * Null when idle with no flash. F3's mnemonic is `INIT CNTL`, never `"F3"`.
 */
export function formatPreviewReadout(state: PreviewAreaState): string | null {
  if (state.rejection) {
    return state.rejection;
  }
  if (state.phase === "idle") {
    return null;
  }
  const parts: string[] = [];
  if (state.mnemonic.length > 0) {
    parts.push(state.mnemonic);
  }
  if (state.flid) {
    parts.push(state.flid);
  } else if (state.buffer.length > 0 && state.buffer !== state.mnemonic) {
    parts.push(state.buffer);
  }
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return null;
}
/**
 * Live `*T` / `*S` (no size) or armed `armRelocateList` → list id to slew.
 * Resize buffers (`*T10`) do not relocate.
 */
export function previewRelocateListId(state: PreviewAreaState): string | null {
  if (state.armed?.type === "armRelocateList") {
    return state.armed.listId;
  }
  if (state.phase !== "entry") {
    return null;
  }
  const parsed = parsePreviewCommand(state.buffer);
  if (parsed.kind !== "action") {
    return null;
  }
  if (parsed.action.type === "toggleList" || parsed.action.type === "armRelocateList") {
    return parsed.action.listId;
  }
  return null;
}
/** Armed tracking chord or live `+` `/` `*` `*1`–`*8` `*0` `*B` buffer. */
export function previewTrackingSlew(state: PreviewAreaState): PreviewArmedAction | null {
  if (state.phase === "armed" && state.armed && isTrackingSlewAction(state.armed)) {
    const armed = state.armed;
    if ((armed.type === "initCntl" || armed.type === "termCntl") && state.flid) {
      return { type: armed.type, flid: state.flid };
    }
    return armed;
  }
  if (state.phase !== "entry") {
    return null;
  }
  return parseTrackingSlewBuffer(state.buffer);
}

function trackingMnemonic(action: PreviewArmedAction): string {
  switch (action.type) {
    case "initCntl":
      return "INIT CNTL";
    case "termCntl":
      return "TERM CNTL";
    case "acceptHandoff":
      return "HO ACCEPT";
    case "ackPointout":
      return "*";
    case "setLeaderDir":
      return `*${action.starsDir}`;
    case "resetLeaderDir":
      return "*0";
    case "beaconatorSlew":
      return "*B";
    case "armPerTrackPtl":
      return "*R";
    case "saveAsPref":
      return "PREF";
    default:
      return "";
  }
}

export function isPrefNameEntry(state: PreviewAreaState): boolean {
  return state.phase === "entry" && state.armed?.type === "saveAsPref";
}

/**
 * Analog: CRC STARS PREF SAVE AS name prompt (R07). Trainer delta: preview
 * buffer / status-line chord, not a proprietary dialog or HTML field.
 */
export function beginPrefNameEntry(state: PreviewAreaState, nowMs: number): void {
  state.phase = "entry";
  state.buffer = "";
  state.mnemonic = "PREF";
  state.flid = null;
  state.rejection = null;
  state.armed = { type: "saveAsPref" };
  state.lastKeyAtMs = nowMs;
}

function prefNameInvalidReadout(buffer: string): string {
  return buffer.length > 0 ? `PREF ${buffer} INV` : "PREF INV";
}

function handlePrefNameKey(
  state: PreviewAreaState,
  key: string,
  nowMs: number,
  code?: string,
): PreviewKeyOutcome {
  if (key === "Escape") {
    return { consumed: false, action: null };
  }
  if (key === "Backspace") {
    state.rejection = null;
    if (state.buffer.length > 0) {
      state.buffer = state.buffer.slice(0, -1);
    }
    state.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  if (key === "Enter" || key === "NumpadEnter") {
    const parsed = parseDcbPrefName(state.buffer);
    if (parsed.ok) {
      cancelPreviewArea(state);
      return { consumed: true, action: { type: "saveAsPref", name: parsed.name } };
    }
    state.rejection = prefNameInvalidReadout(state.buffer);
    state.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  const ch = previewBufferCharFromKey(key, code);
  if (ch !== null && /^[A-Z0-9]$/.test(ch)) {
    state.rejection = null;
    if (state.buffer.length < DCB_PREF_NAME_MAX_CHARS) {
      state.buffer += ch;
    }
    state.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  if (ch !== null) {
    state.rejection = null;
    state.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  return { consumed: false, action: null };
}

/** Arm a command-then-slew tracking chord. INIT/TERM mnemonic is never `"F3"` / `"F4"`. */
export function armPreviewSlewAction(
  state: PreviewAreaState,
  action: PreviewArmedAction,
  nowMs: number,
): void {
  if (action.type === "initCntl" || action.type === "termCntl") {
    armPreviewCntl(state, action.type, nowMs, action.flid);
    return;
  }
  state.phase = "armed";
  state.buffer = "";
  state.mnemonic = trackingMnemonic(action);
  state.flid = null;
  state.rejection = null;
  state.armed = action;
  state.lastKeyAtMs = nowMs;
}

export function previewCntlArmed(state: PreviewAreaState): state is PreviewAreaState & {
  armed: { readonly type: "initCntl" } | { readonly type: "termCntl" };
} {
  return (
    state.phase === "armed" &&
    (state.armed?.type === "initCntl" || state.armed?.type === "termCntl")
  );
}

/** `*S` Enter: stay armed for SSA slew. Does not toggle SSA visibility. */
export function armPreviewRelocateList(
  state: PreviewAreaState,
  listId: string,
  nowMs: number,
  buffer = "*S",
): void {
  state.phase = "armed";
  state.buffer = buffer;
  state.mnemonic = "";
  state.flid = null;
  state.rejection = null;
  state.armed = { type: "armRelocateList", listId };
  state.lastKeyAtMs = nowMs;
}

/** F3 / F4 with no selection: arm command-then-slew. Mnemonic is never `"F3"` / `"F4"`. */
export function armPreviewCntl(
  state: PreviewAreaState,
  kind: "initCntl" | "termCntl",
  nowMs: number,
  flid?: string,
): void {
  state.phase = "armed";
  state.mnemonic = kind === "initCntl" ? "INIT CNTL" : "TERM CNTL";
  state.buffer = "";
  state.flid = flid && flid.length > 0 ? flid : null;
  state.rejection = null;
  state.armed = { type: kind };
  state.lastKeyAtMs = nowMs;
}

function previewRejectionBuffer(state: PreviewAreaState): string {
  const parts: string[] = [];
  if (state.mnemonic.length > 0) {
    parts.push(state.mnemonic);
  }
  if (state.flid) {
    parts.push(state.flid);
  } else if (state.buffer.length > 0 && state.buffer !== state.mnemonic) {
    parts.push(state.buffer);
  }
  return parts.length > 0 ? parts.join(" ") : state.buffer;
}

/** INV flash using mnemonic + FLID so empty-buffer INIT/TERM still read as `INIT CNTL INV`. */
export function rejectPreviewCntl(state: PreviewAreaState, nowMs: number): void {
  state.buffer = previewRejectionBuffer(state);
  rejectPreviewArea(state, nowMs);
}

const FLID_CHAR = /^[A-Za-z0-9]$/;

export type PreviewFlidKeyResult =
  | { consumed: false }
  | { consumed: true; apply?: { type: "initCntl" | "termCntl"; aircraftId: string } };

/**
 * Typed ACID / Enter / Backspace while INIT CNTL or TERM CNTL is armed.
 * Empty Enter stays armed (slew form). `TERM CNTL ALL` is invalid, not drop-all.
 * Idle preview does not consume keys.
 */
export function handlePreviewFlidKey(
  state: PreviewAreaState,
  key: string,
  nowMs: number,
  world?: World,
): PreviewFlidKeyResult {
  if (!previewCntlArmed(state)) {
    return { consumed: false };
  }
  if (key === "Backspace") {
    if (state.flid && state.flid.length > 0) {
      const next = state.flid.slice(0, -1);
      state.flid = next.length > 0 ? next : null;
    }
    state.lastKeyAtMs = nowMs;
    return { consumed: true };
  }
  if (key === "Enter") {
    const flid = state.flid;
    if (!flid) {
      state.lastKeyAtMs = nowMs;
      return { consumed: true };
    }
    if (state.armed.type === "termCntl" && flid === "ALL") {
      rejectPreviewCntl(state, nowMs);
      return { consumed: true };
    }
    if (!world) {
      rejectPreviewCntl(state, nowMs);
      return { consumed: true };
    }
    const resolved = resolveScopeFlid(flid, world);
    if (!resolved.ok) {
      rejectPreviewCntl(state, nowMs);
      return { consumed: true };
    }
    const type = state.armed.type;
    cancelPreviewArea(state);
    return { consumed: true, apply: { type, aircraftId: resolved.aircraftId } };
  }
  if (FLID_CHAR.test(key)) {
    const next = (state.flid ?? "") + key.toUpperCase();
    state.flid = next;
    state.lastKeyAtMs = nowMs;
    return { consumed: true };
  }
  return { consumed: false };
}

/** Typed-FLID slew: unique match of the clicked track, else INV. No FLID → any hit. */
export function previewFlidMatchesSlew(
  state: PreviewAreaState,
  aircraftId: string,
  world: World,
): boolean {
  const flid = state.flid;
  if (!flid) {
    return true;
  }
  const resolved = resolveScopeFlid(flid, world);
  return resolved.ok && resolved.aircraftId === aircraftId;
}

/** Enter-commit: a still-live prefix (`B`, `B4`, `B450`) is `invalid`, not a silent no-op. */
export function commitPreviewCommand(
  buffer: string,
  maps?: readonly LoadedVideoMap[],
  layout?: VideoMapTokenLayout,
): PreviewCommandResult {
  const parsed = parsePreviewCommand(buffer, maps, layout);
  if (parsed.kind === "incomplete") {
    return { kind: "invalid", reason: "incomplete preview command" };
  }
  return parsed;
}

/** Add `token` if absent, remove if present. Stores `"45"` or `"4501"`. */
export function toggleBeaconSelectCode(codes: string[], token: string): void {
  const i = codes.indexOf(token);
  if (i >= 0) {
    codes.splice(i, 1);
    return;
  }
  codes.push(token);
}

/** Add `token` if absent. Does not toggle off a duplicate `*BCN`. */
export function addBeaconSelectCode(codes: string[], token: string): void {
  if (!codes.includes(token)) {
    codes.push(token);
  }
}

/** Remove `token` if present. No-op when absent. */
export function removeBeaconSelectCode(codes: string[], token: string): void {
  const i = codes.indexOf(token);
  if (i >= 0) {
    codes.splice(i, 1);
  }
}

export function applyPreviewBeaconAction(codes: string[], action: PreviewArmedAction): boolean {
  if (action.type === "beaconBlock" || action.type === "beaconDiscrete") {
    toggleBeaconSelectCode(codes, action.digits);
    return true;
  }
  if (action.type === "addBeaconCodeFilter") {
    addBeaconSelectCode(codes, action.code);
    return true;
  }
  if (action.type === "removeBeaconCodeFilter") {
    removeBeaconSelectCode(codes, action.code);
    return true;
  }
  return false;
}

const WX_LEVELS_ALL_ON: WxLevels = [true, true, true, true, true, true];
const WX_LEVELS_ALL_OFF: WxLevels = [false, false, false, false, false, false];

/** Toggle one VIP latch or replace all six. Null when `action` is not WX. */
export function applyPreviewWxAction(
  levels: WxLevels,
  action: PreviewArmedAction,
): WxLevels | null {
  if (action.type === "toggleWxLevel") {
    const next = cloneWxLevels(levels);
    const i = action.level - 1;
    return [
      i === 0 ? !next[0] : next[0],
      i === 1 ? !next[1] : next[1],
      i === 2 ? !next[2] : next[2],
      i === 3 ? !next[3] : next[3],
      i === 4 ? !next[4] : next[4],
      i === 5 ? !next[5] : next[5],
    ];
  }
  if (action.type === "setWxLevelsAll") {
    return action.enabled ? WX_LEVELS_ALL_ON : WX_LEVELS_ALL_OFF;
  }
  return null;
}

export type PreviewKeyOutcome = {
  consumed: boolean;
  action: PreviewArmedAction | null;
  /**
   * Enter on a live `*` buffer: caller tries T02-49 `commitStarsChord` before INV.
   * Undefined / null when this key is not that commit.
   */
  starsBuffer?: string | null;
};

/** Live `B…` CODE BLOCK / discrete entry (not INIT/TERM). */
export function isBeaconPreviewEntry(state: PreviewAreaState): boolean {
  return state.phase === "entry" && /^B\d*$/.test(state.buffer);
}

export function beginPreviewBeaconEntry(state: PreviewAreaState, nowMs: number): void {
  beginPreviewBufferEntry(state, "B", nowMs);
}

export function beginPreviewBufferEntry(state: PreviewAreaState, ch: string, nowMs: number): void {
  state.phase = "entry";
  state.buffer = ch;
  state.mnemonic = "";
  state.flid = null;
  state.rejection = null;
  state.armed = null;
  state.lastKeyAtMs = nowMs;
}

/**
 * Unified Preview Area typer. Live `B…` still uses Table 30 auto-commit rules.
 * Other live buffers wait for Enter; incomplete prefixes INV on Enter.
 * A live `*` buffer returns `starsBuffer` so T02-49 TPA/ATPA chords still dispatch.
 */
export function handlePreviewBufferKey(
  state: PreviewAreaState,
  key: string,
  nowMs: number,
  code?: string,
  maps?: readonly LoadedVideoMap[],
  layout?: VideoMapTokenLayout,
): PreviewKeyOutcome {
  if (isPrefNameEntry(state)) {
    return handlePrefNameKey(state, key, nowMs, code);
  }
  if (isBeaconPreviewEntry(state)) {
    return handlePreviewBeaconKey(state, key, nowMs, code);
  }
  if (state.phase !== "entry") {
    return { consumed: false, action: null };
  }
  if (key === "Escape") {
    return { consumed: false, action: null };
  }
  if (key === "Backspace") {
    if (state.buffer.length <= 1) {
      cancelPreviewArea(state);
      return { consumed: true, action: null };
    }
    state.buffer = state.buffer.slice(0, -1);
    state.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  if (key === "Enter" || key === "NumpadEnter") {
    const parsed = parsePreviewCommand(state.buffer, maps, layout);
    if (parsed.kind === "action") {
      cancelPreviewArea(state);
      return { consumed: true, action: parsed.action };
    }
    if (parsed.kind === "invalid") {
      rejectPreviewArea(state, nowMs);
      return { consumed: true, action: null };
    }
    if (state.buffer.startsWith("*")) {
      return { consumed: true, action: null, starsBuffer: state.buffer };
    }
    rejectPreviewArea(state, nowMs);
    return { consumed: true, action: null };
  }
  const ch = previewBufferCharFromKey(key, code);
  if (ch !== null) {
    state.buffer += ch;
    state.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  return { consumed: false, action: null };
}

/**
 * Scope-focus `B` then digits. Enter commits; four digits may auto-commit;
 * Esc is handled by `handlePreviewEscape`; Backspace edits; any other key is
 * INV. Never Command IR.
 */
export function handlePreviewBeaconKey(
  state: PreviewAreaState,
  key: string,
  nowMs: number,
  code?: string,
): PreviewKeyOutcome {
  if (!isBeaconPreviewEntry(state)) {
    return { consumed: false, action: null };
  }
  if (key === "Escape") {
    return { consumed: false, action: null };
  }
  if (key === "Backspace") {
    if (state.buffer.length <= 1) {
      cancelPreviewArea(state);
      return { consumed: true, action: null };
    }
    state.buffer = state.buffer.slice(0, -1);
    state.lastKeyAtMs = nowMs;
    return { consumed: true, action: null };
  }
  if (key === "Enter" || key === "NumpadEnter") {
    const committed = commitPreviewCommand(state.buffer);
    if (committed.kind === "action") {
      cancelPreviewArea(state);
      return { consumed: true, action: committed.action };
    }
    rejectPreviewArea(state, nowMs);
    return { consumed: true, action: null };
  }
  const digit = digitFromKey(key, code);
  if (digit !== null) {
    state.buffer += String(digit);
    state.lastKeyAtMs = nowMs;
    const parsed = parsePreviewCommand(state.buffer);
    if (parsed.kind === "invalid") {
      rejectPreviewArea(state, nowMs);
      return { consumed: true, action: null };
    }
    if (parsed.kind === "action" && parsed.action.type === "beaconDiscrete") {
      cancelPreviewArea(state);
      return { consumed: true, action: parsed.action };
    }
    return { consumed: true, action: null };
  }
  if (/^[a-zA-Z]$/.test(key)) {
    state.buffer += key.toUpperCase();
  }
  rejectPreviewArea(state, nowMs);
  return { consumed: true, action: null };
}
