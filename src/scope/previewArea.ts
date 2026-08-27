/**
 * Analog: CRC STARS Preview Area + Command Reference
 * (docs.virtualnas.net/crc/stars — R07). Typed scope commands paint under the
 * SSA; Tracking Aircraft Table 18/19 names INIT CNTL / TERM CNTL; Table 30
 * names beacon-code select.
 *
 * The preview buffer is a **display-only** scope action surface. It is not the
 * radio command line. `DAL123 H270` remains the radio path and still compiles
 * to Command IR. Preview never emits Command, readback, or intent. No
 * `window.prompt`, no HTML `<input>`.
 *
 * T02-51 shipped the machine, readout, Esc cancel, and INV flash. T02-52 wires
 * F3 INIT CNTL / F4 TERM CNTL as armed actions (not typed `F3` in the buffer).
 * Beacon `B` actions arrive in T02-53. T02-51's parse table is live prefix /
 * else invalid — F-keys do not add typed rows. Unknown complete input is
 * invalid, not a silent no-op. Not NAS STARS.
 */

import type { World } from "@core";
import { CHORD_TIMEOUT_MS, chordTimedOut } from "./keymap";

export type PreviewPhase = "idle" | "entry" | "armed";

/**
 * Armed preview action, discriminated on `type`.
 * T02-52: `initCntl` / `termCntl` (FLID lives on `PreviewAreaState.flid`).
 * T02-53 extends with beacon select. Do not put F3-specific field names on
 * ScopeView — later tickets add variants here.
 */
export type PreviewArmedAction = { readonly type: "initCntl" } | { readonly type: "termCntl" };

/** Full callsign / numeric-tail / 4-digit squawk — duplicated, not `@pilot`. */
const FULL_CALLSIGN = /^[A-Z]{3}[0-9]{1,4}[A-Z]?$/;
const SUFFIX_CALLSIGN = /^[0-9]{1,4}[A-Z]?$/;
const SQUAWK_CODE = /^[0-9]{4}$/;

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

export type PreviewCommandResult =
  | { kind: "incomplete" }
  | { kind: "invalid"; reason: string }
  | { kind: "action"; action: PreviewArmedAction };

/**
 * Extension table for `parsePreviewCommand`. Complete commands map to
 * `{ kind: "action" }`. Prefix-only rows stay incomplete. INIT CNTL / TERM CNTL
 * are F-keys (armed on `PreviewAreaState`), not typed `F3` / `F4` buffers.
 * Do not rewrite the state machine to add rows.
 */
type PreviewTableEntry = { kind: "prefix" } | { kind: "action"; action: PreviewArmedAction };

const PREVIEW_TABLE: Readonly<Record<string, PreviewTableEntry>> = {
  // T02-53: `B` begins beacon-code select. Digits + commit arrive then.
  B: { kind: "prefix" },
};

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

function invalid(reason: string): PreviewCommandResult {
  return { kind: "invalid", reason };
}

/**
 * Pure string parser for the Preview Area buffer.
 * T02-51: empty and live prefixes are `incomplete`; anything else is `invalid`.
 * T02-52 / T02-53 add `action` rows to `PREVIEW_TABLE` without replacing this.
 */
export function parsePreviewCommand(buffer: string): PreviewCommandResult {
  if (buffer === "") {
    return { kind: "incomplete" };
  }
  const exact = PREVIEW_TABLE[buffer];
  if (exact) {
    if (exact.kind === "action") {
      return { kind: "action", action: exact.action };
    }
    return { kind: "incomplete" };
  }
  const keys = Object.keys(PREVIEW_TABLE);
  if (keys.some((key) => key.startsWith(buffer))) {
    return { kind: "incomplete" };
  }
  return invalid("unknown preview command");
}

export function previewCntlArmed(
  state: PreviewAreaState,
): state is PreviewAreaState & { armed: PreviewArmedAction } {
  return (
    state.phase === "armed" &&
    (state.armed?.type === "initCntl" || state.armed?.type === "termCntl")
  );
}

/** F3 / F4 with no selection: arm command-then-slew. Mnemonic is never `"F3"` / `"F4"`. */
export function armPreviewCntl(
  state: PreviewAreaState,
  kind: "initCntl" | "termCntl",
  nowMs: number,
): void {
  state.phase = "armed";
  state.mnemonic = kind === "initCntl" ? "INIT CNTL" : "TERM CNTL";
  state.buffer = "";
  state.flid = null;
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
