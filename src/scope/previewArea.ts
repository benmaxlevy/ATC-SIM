/**
 * Preview Area + Command Reference. Typed scope commands paint in the
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
import type { ScopeView } from "./scopeView";
import { getFlightPlanEntries } from "./systemLists";
import {
  ensureTrackDisplay,
  setCaPairInhibited,
  toggleCaPairInhibited,
  acknowledgeAlert,
  toggleTrackCaInhibited,
} from "./trackDisplay";
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
  parseCaCommand,
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
export function resolveScopeFlid(token: string, world: World, view?: ScopeView): ScopeFlidResult {
  const normalized = token.trim().toUpperCase();
  if (normalized.length === 0) {
    return { ok: false, reason: "unknown" };
  }
  if (view && /^\d{1,2}$/.test(normalized)) {
    const idx = Number(normalized);
    const entries = getFlightPlanEntries(world, view);
    const entry = entries.find((e) => e.index === idx);
    if (entry) {
      const ac = world.aircraft.find(
        (a) => a.callsign === entry.callsign || (entry.aircraftId && a.id === entry.aircraftId),
      );
      const aircraftId = entry.aircraftId ?? ac?.id ?? entry.callsign;
      return { ok: true, aircraftId };
    }
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
  /** CRC mnemonic painted in the Preview Area, e.g. `INIT CNTL`. Never `"F3"`. */
  mnemonic: string;
  /** Optional FLID / ACID typed after a function key. */
  flid: string | null;
  lastKeyAtMs: number;
  /** Brief invalid-commit flash (`buffer INV`); null when none. */
  rejection: string | null;
  /** Generic armed-action discriminator. Null when none. */
  armed: PreviewArmedAction | null;
  /** Slew action alias for armed tracking/inhibit actions. */
  slewAction?: PreviewArmedAction | null;
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
    slewAction: null,
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
  state.slewAction = idle.slewAction;
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
 * Live list commands (`*T`, `*TV`, `*TM`, `*TC`, `*TS`, `*TX`, `*TN`, `*P1`–`*P3`, `*S`, `*P`)
 * or armed `armRelocateList` → list id to slew.
 * Resize buffers (`*T10`, `*P1 10`, etc.) do not relocate.
 */
export function previewRelocateListId(state: PreviewAreaState): string | null {
  if (state.armed?.type === "armRelocateList") {
    return state.armed.listId;
  }
  if (state.phase !== "entry") {
    return null;
  }
  // Bare *P relocates Preview on empty scope; Enter and aircraft clicks retain TPA semantics.
  if (/^\*\s*P$/i.test(state.buffer)) {
    return "PREVIEW";
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
    case "ackPointout":
      return "*";
    case "setLeaderDir":
      if (action.flid) {
        return `*L${action.dir ?? action.starsDir ?? 8} ${action.flid}`;
      }
      if (action.starsDir) {
        return `*${action.starsDir}`;
      }
      return `*L${action.dir ?? 8}`;
    case "resetLeaderDir":
      return "*0";
    case "setLeaderLength":
      return action.flid ? `/${action.lengthStep} ${action.flid}` : `/${action.lengthStep}`;
    case "setLeaderDirAndLength":
      return action.flid
        ? `${action.dir}/${action.lengthStep} ${action.flid}`
        : `${action.dir}/${action.lengthStep}`;
    case "setDefaultLeaderLength":
      return `*LDR ${action.lengthStep}`;
    case "beaconatorSlew":
      return "*B";
    case "armPerTrackPtl":
      return "*R";
    case "caPairSlew":
      return action.trk1 ? `CA ${action.trk1}` : "CA";
    case "caSingleTrackInhibit":
      return action.trk ? `CA K ${action.trk}` : "CA K";
    case "caPairInhibit":
      return action.trk1 ? `CA P ${action.trk1}` : "CA P";
    case "caPairEnable":
      return action.trk1 ? `CA E ${action.trk1}` : "CA E";
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
  state.slewAction = action;
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
  state.slewAction = { type: "armRelocateList", listId };
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
  state.slewAction = { type: kind };
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
  view?: ScopeView,
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
    const resolved = resolveScopeFlid(flid, world, view);
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
  view?: ScopeView,
): boolean {
  const flid = state.flid;
  if (!flid) {
    return true;
  }
  const resolved = resolveScopeFlid(flid, world, view);
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

export function executeCaSingleTrackInhibit(
  view: ScopeView,
  trk: string | undefined,
  world?: World,
  nowMs: number = Date.now(),
): boolean {
  if (trk === undefined) {
    armPreviewSlewAction(view.preview, { type: "caSingleTrackInhibit" }, nowMs);
    return true;
  }
  let aircraftId = trk;
  if (world) {
    const resolved = resolveScopeFlid(trk, world, view);
    if (!resolved.ok) {
      view.preview.buffer = `CA K ${trk}`;
      rejectPreviewArea(view.preview, nowMs);
      return false;
    }
    aircraftId = resolved.aircraftId;
  }
  toggleTrackCaInhibited(view, aircraftId);
  if (world) {
    const ac = world.aircraft.find((a) => a.id === aircraftId);
    if (ac && ac.callsign && ac.callsign !== aircraftId) {
      const tdCallsign = view.tracks.get(ac.callsign);
      if (tdCallsign) {
        tdCallsign.inhibitCA = view.tracks.get(aircraftId)?.inhibitCA;
        tdCallsign.caInhibited = view.tracks.get(aircraftId)?.caInhibited;
      }
    }
  }
  cancelPreviewArea(view.preview);
  return true;
}

export function executeCaPairInhibit(
  view: ScopeView,
  trk1: string | undefined,
  trk2?: string,
  world?: World,
  nowMs: number = Date.now(),
): boolean {
  if (trk1 === undefined) {
    armPreviewSlewAction(view.preview, { type: "caPairInhibit" }, nowMs);
    return true;
  }
  let id1 = trk1;
  let id2 = trk2;
  if (world) {
    const res1 = resolveScopeFlid(trk1, world, view);
    if (!res1.ok) {
      view.preview.buffer = trk2 ? `CA P ${trk1} ${trk2}` : `CA P ${trk1}`;
      rejectPreviewArea(view.preview, nowMs);
      return false;
    }
    id1 = res1.aircraftId;
    if (trk2 !== undefined) {
      const res2 = resolveScopeFlid(trk2, world, view);
      if (!res2.ok) {
        view.preview.buffer = `CA P ${trk1} ${trk2}`;
        rejectPreviewArea(view.preview, nowMs);
        return false;
      }
      id2 = res2.aircraftId;
    }
  }

  if (id2 !== undefined) {
    setCaPairInhibited(view, id1, id2, true);
    if (world) {
      const ac1 = world.aircraft.find((a) => a.id === id1);
      const ac2 = world.aircraft.find((a) => a.id === id2);
      if (ac1 && ac2) {
        setCaPairInhibited(view, ac1.callsign, ac2.callsign, true);
      }
    }
    cancelPreviewArea(view.preview);
    return true;
  }

  // trk2 omitted: wait for slew click on track 2
  armPreviewSlewAction(view.preview, { type: "caPairInhibit", trk1: id1 }, nowMs);
  return true;
}

export function executeCaPairEnable(
  view: ScopeView,
  trk1: string | undefined,
  trk2?: string,
  world?: World,
  nowMs: number = Date.now(),
): boolean {
  if (trk1 === undefined) {
    armPreviewSlewAction(view.preview, { type: "caPairEnable" }, nowMs);
    return true;
  }
  let id1 = trk1;
  let id2 = trk2;
  if (world) {
    const res1 = resolveScopeFlid(trk1, world, view);
    if (!res1.ok) {
      view.preview.buffer = trk2 ? `CA E ${trk1} ${trk2}` : `CA E ${trk1}`;
      rejectPreviewArea(view.preview, nowMs);
      return false;
    }
    id1 = res1.aircraftId;
    if (trk2 !== undefined) {
      const res2 = resolveScopeFlid(trk2, world, view);
      if (!res2.ok) {
        view.preview.buffer = `CA E ${trk1} ${trk2}`;
        rejectPreviewArea(view.preview, nowMs);
        return false;
      }
      id2 = res2.aircraftId;
    }
  }

  if (id2 !== undefined) {
    setCaPairInhibited(view, id1, id2, false);
    if (world) {
      const ac1 = world.aircraft.find((a) => a.id === id1);
      const ac2 = world.aircraft.find((a) => a.id === id2);
      if (ac1 && ac2) {
        setCaPairInhibited(view, ac1.callsign, ac2.callsign, false);
      }
    }
    cancelPreviewArea(view.preview);
    return true;
  }

  // trk2 omitted: wait for slew click on track 2
  armPreviewSlewAction(view.preview, { type: "caPairEnable", trk1: id1 }, nowMs);
  return true;
}

export function executeCaPairSlew(view: ScopeView, nowMs: number = Date.now()): void {
  armPreviewSlewAction(view.preview, { type: "caPairSlew" }, nowMs);
}

export function handleCaSlewClick(
  view: ScopeView,
  world: World,
  clickedTrackId: string,
  nowMs: number = Date.now(),
): boolean {
  const armed = view.preview.armed;
  if (!armed) return false;

  if (armed.type === "caPairSlew") {
    if (!armed.trk1) {
      // Step 1: record Track 1
      view.preview.armed = { type: "caPairSlew", trk1: clickedTrackId };
      view.preview.slewAction = view.preview.armed;
      const ac = world.aircraft.find((a) => a.id === clickedTrackId);
      view.preview.mnemonic = `CA ${ac?.callsign ?? clickedTrackId}`;
      view.preview.lastKeyAtMs = nowMs;
      return true;
    }
    // Step 2: toggle pairwise inhibit between Track 1 and Track 2
    const trk1 = armed.trk1;
    const trk2 = clickedTrackId;
    toggleCaPairInhibited(view, trk1, trk2);
    const ac1 = world.aircraft.find((a) => a.id === trk1);
    const ac2 = world.aircraft.find((a) => a.id === trk2);
    if (ac1 && ac2) {
      toggleCaPairInhibited(view, ac1.callsign, ac2.callsign);
    }
    cancelPreviewArea(view.preview);
    return true;
  }

  if (armed.type === "caSingleTrackInhibit") {
    toggleTrackCaInhibited(view, clickedTrackId);
    cancelPreviewArea(view.preview);
    return true;
  }

  if (armed.type === "caPairInhibit") {
    if (!armed.trk1) {
      view.preview.armed = { type: "caPairInhibit", trk1: clickedTrackId };
      view.preview.slewAction = view.preview.armed;
      return true;
    }
    const trk1 = armed.trk1;
    const trk2 = clickedTrackId;
    setCaPairInhibited(view, trk1, trk2, true);
    const ac1 = world.aircraft.find((a) => a.id === trk1);
    const ac2 = world.aircraft.find((a) => a.id === trk2);
    if (ac1 && ac2) {
      setCaPairInhibited(view, ac1.callsign, ac2.callsign, true);
    }
    cancelPreviewArea(view.preview);
    return true;
  }

  if (armed.type === "caPairEnable") {
    if (!armed.trk1) {
      view.preview.armed = { type: "caPairEnable", trk1: clickedTrackId };
      view.preview.slewAction = view.preview.armed;
      return true;
    }
    const trk1 = armed.trk1;
    const trk2 = clickedTrackId;
    setCaPairInhibited(view, trk1, trk2, false);
    const ac1 = world.aircraft.find((a) => a.id === trk1);
    const ac2 = world.aircraft.find((a) => a.id === trk2);
    if (ac1 && ac2) {
      setCaPairInhibited(view, ac1.callsign, ac2.callsign, false);
    }
    cancelPreviewArea(view.preview);
    return true;
  }

  return false;
}

export function handleImpliedCaAcknowledge(
  view: ScopeView,
  world: World,
  clickedTrackId: string,
): boolean {
  if (previewAreaIsLive(view.preview) && view.preview.buffer.trim().length > 0) {
    return false;
  }
  if (!world.alerts?.ca || world.alerts.ca.length === 0) {
    return false;
  }
  const ac = world.aircraft.find((a) => a.id === clickedTrackId || a.callsign === clickedTrackId);
  if (!ac) {
    return false;
  }
  let acknowledged = false;
  for (const alert of world.alerts.ca) {
    if (alert.callsignA === ac.callsign || alert.callsignB === ac.callsign) {
      acknowledgeAlert(view, alert.callsignA, alert.callsignB);
      const otherCallsign = alert.callsignA === ac.callsign ? alert.callsignB : alert.callsignA;
      const otherAc = world.aircraft.find((a) => a.callsign === otherCallsign);
      if (otherAc) {
        acknowledgeAlert(view, ac.id, otherAc.id);
        const tdOther = ensureTrackDisplay(view.tracks, otherAc.id);
        tdOther.caAcknowledged = true;
      }
      const tdThis = ensureTrackDisplay(view.tracks, ac.id);
      tdThis.caAcknowledged = true;
      acknowledged = true;
    }
  }
  return acknowledged;
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
