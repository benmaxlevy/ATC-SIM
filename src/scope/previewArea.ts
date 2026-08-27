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
 * T02-51 ships the machine, readout, Esc cancel, and INV flash. INIT CNTL /
 * TERM CNTL actions arrive in T02-52. Beacon `B` actions arrive in T02-53.
 * T02-51's parse table is empty / live prefix / else invalid. Unknown complete
 * input is invalid, not a silent no-op. Not NAS STARS.
 */

import { CHORD_TIMEOUT_MS, chordTimedOut } from "./keymap";

export type PreviewPhase = "idle" | "entry" | "armed";

/**
 * Armed preview action, discriminated on `type`.
 * T02-51 has no parseable actions. T02-52 extends with `initCntl` / `termCntl`.
 * T02-53 extends with beacon select. Do not put F3-specific field names on
 * ScopeView — later tickets add variants here.
 */
export type PreviewArmedAction = { readonly type: string };

export type PreviewCommandResult =
  | { kind: "incomplete" }
  | { kind: "invalid"; reason: string }
  | { kind: "action"; action: PreviewArmedAction };

/**
 * Extension table for `parsePreviewCommand`. Complete commands map to
 * `{ kind: "action" }`. Prefix-only rows stay incomplete until T02-52 / T02-53
 * replace them with actions. Do not rewrite the state machine to add rows.
 */
type PreviewTableEntry =
  | { kind: "prefix" }
  | { kind: "action"; action: PreviewArmedAction };

const PREVIEW_TABLE: Readonly<Record<string, PreviewTableEntry>> = {
  // T02-53: `B` begins beacon-code select. Digits + commit arrive then.
  B: { kind: "prefix" },
  // T02-52: INIT CNTL / TERM CNTL (F3 / F4) register actions here.
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
