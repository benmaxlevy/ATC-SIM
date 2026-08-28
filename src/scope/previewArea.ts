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
 * T02-51 shipped the machine, readout, Esc cancel, and INV flash. T02-52 wires
 * F3 INIT CNTL / F4 TERM CNTL as armed actions (not typed `F3` in the buffer).
 * `B##` / `B####` are display-only filters (toggle `beaconSelectCodes`; no
 * slewed track). T02-61 adds the unified scope-focus lexer: `*`, `+`, `/`,
 * letters, digits, and spaces buffer here. T02-62 adds Table 31/32 list
 * mnemonics (`*T` / `*TAB` / `*TV` / `*TC` / `*TS` / `*P1`–`*P3` / `*TM` /
 * `*TX` / `*TN` toggle or `[1-100]` resize; `*S` slew-relocates SSA). T02-64
 * adds `*C` / `*OFF` / `*RR` / `*PTL` / `*HIST`. T02-65 adds `*F` / `*LA` /
 * `*BCN` / `*BCN DEL`. Spaces are optional (`*T` = `* T`, `*F` = `* F`). Bare
 * `*P` / `*P3` stay TPA via the starsChord fallback; `*P1`–`*P3` are tower
 * lists, not PTL. Bare `*B` / `*BE` / `*BI` stay TPA; only `*BCN…` is the
 * beacon-code filter. `BE` / `BI` LDB inhibit and assign-code (`M ####`)
 * remain deferred. Unknown complete input is invalid, not a silent no-op. Not
 * NAS STARS.
 */

import type { World } from "@core";
import type { LoadedVideoMap } from "@scenario";
import { parseStrictFilterHundreds } from "./altitudeFilter";
import { resolveVideoMapToken } from "./dcbFunctions";
import { CHORD_TIMEOUT_MS, chordTimedOut, digitFromKey } from "./keymap";

export type PreviewPhase = "idle" | "entry" | "armed";

/**
 * Armed preview action, discriminated on `type`.
 * T02-52: `initCntl` / `termCntl` (FLID lives on `PreviewAreaState.flid`).
 * T02-53: `beaconBlock` / `beaconDiscrete`. T02-62: `toggleList` / `resizeList`
 * / `armRelocateList`. T02-64: scope recenter / RR / PTL / HIST. Slew forms
 * (`armRecenterScope`, `armRecenterRangeRings`) apply via DCB PLACE flags.
 * T02-63: `toggleVideoMap` / `setAllVideoMaps`. T02-65: `displayFilters` /
 * `setAltitudeFilterLimits` / `addBeaconCodeFilter` / `removeBeaconCodeFilter`.
 * Do not put F3-specific field names on ScopeView.
 */
export type PreviewArmedAction =
  | { readonly type: "initCntl" }
  | { readonly type: "termCntl" }
  | { readonly type: "beaconBlock"; readonly digits: string }
  | { readonly type: "beaconDiscrete"; readonly digits: string }
  | { readonly type: "toggleList"; readonly listId: string }
  | { readonly type: "resizeList"; readonly listId: string; readonly maxLines: number }
  | { readonly type: "armRelocateList"; readonly listId: string }
  | { readonly type: "armRecenterScope" }
  | { readonly type: "resetScopeCenter" }
  | { readonly type: "setRangeRingInterval"; readonly intervalNm: number }
  | { readonly type: "armRecenterRangeRings" }
  | { readonly type: "resetRangeRingsCenter" }
  | { readonly type: "setPtlMinutes"; readonly minutes: number }
  | { readonly type: "setHistoryDots"; readonly count: number }
  | { readonly type: "toggleVideoMap"; readonly mapId: string; readonly explicitState?: boolean }
  | { readonly type: "setAllVideoMaps"; readonly enabled: boolean }
  | { readonly type: "displayFilters" }
  | {
      readonly type: "setAltitudeFilterLimits";
      readonly floorHundreds: number;
      readonly ceilingHundreds: number;
    }
  | { readonly type: "addBeaconCodeFilter"; readonly code: string }
  | { readonly type: "removeBeaconCodeFilter"; readonly code: string };

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
 * `B##` / `B####` cannot live as enumerated rows: `B45` is a complete CODE
 * BLOCK and a live prefix of `B4501`. `parseBeaconSelect` owns those digits.
 * T02-61: `*` / `+` / `/` are live prefixes. T02-62 list rows live in
 * `parseListCommand` (`*P1` vs TPA `*P`). T02-64 `*C` / `*RR` / `*PTL` /
 * `*HIST` live in `parseScopeDisplayCommand`. T02-63 `*D` / `M` video-map
 * rows live in `parseVideoMapCommand`. T02-65 `*F` / `*LA` / `*BCN` live in
 * `parseAltitudeFilterCommand` / `parseBeaconFilterCommand`. Do not rewrite
 * the state machine to add rows.
 */
type PreviewTableEntry = { kind: "prefix" } | { kind: "action"; action: PreviewArmedAction };

const PREVIEW_TABLE: Readonly<Record<string, PreviewTableEntry>> = {
  // T02-53: `B` begins beacon-code select. Digits + commit in parseBeaconSelect.
  B: { kind: "prefix" },
  // T02-61: Multifunction / Track / Slew-Drop. Later tickets add complete rows.
  "*": { kind: "prefix" },
  "+": { kind: "prefix" },
  "/": { kind: "prefix" },
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

/** Keyboard RR spacing. DCB spinner stays `RR_INTERVALS_NM` `[2, 5, 10]`. */
const RR_KEYBOARD_INTERVALS_NM = [2, 5, 10, 20] as const;
const PTL_KEYBOARD_MAX_MINUTES = 15;
const HIST_KEYBOARD_MAX_DOTS = 9;

/** `* C` == `*C`, `* RR 10` == `*RR10`. Does not touch `+` / `/` / beacon. */
function compactStarCommand(buffer: string): string {
  if (!buffer.startsWith("*")) {
    return buffer;
  }
  return `*${buffer.slice(1).replace(/ /g, "")}`;
}

/**
 * T02-64 Table 28 / 36 display commands. Null when this is not our family
 * (`*J`, `*P`, `*P3`, `*T`, `*D`, … stay on the T02-61 incomplete / starsChord
 * fallback). `*PTL` is ours; `*PT` is only a live PTL prefix.
 */
export function parseScopeDisplayCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactStarCommand(buffer);

  if (compact.startsWith("*PTL")) {
    const rest = compact.slice(4);
    if (rest.length === 0) {
      return { kind: "incomplete" };
    }
    if (!/^\d+$/.test(rest)) {
      return invalid("invalid PTL minutes");
    }
    const minutes = Number(rest);
    if (minutes < 0 || minutes > PTL_KEYBOARD_MAX_MINUTES) {
      return invalid("PTL minutes out of range");
    }
    return { kind: "action", action: { type: "setPtlMinutes", minutes } };
  }
  if (compact === "*PT") {
    return { kind: "incomplete" };
  }

  if (compact.startsWith("*HIST")) {
    const rest = compact.slice(5);
    if (rest.length === 0) {
      return { kind: "incomplete" };
    }
    if (!/^\d+$/.test(rest)) {
      return invalid("invalid HIST count");
    }
    const count = Number(rest);
    if (count < 0 || count > HIST_KEYBOARD_MAX_DOTS) {
      return invalid("HIST count out of range");
    }
    return { kind: "action", action: { type: "setHistoryDots", count } };
  }
  if (compact === "*H" || compact === "*HI" || compact === "*HIS") {
    return { kind: "incomplete" };
  }

  if (compact === "*C") {
    return { kind: "action", action: { type: "armRecenterScope" } };
  }

  if (compact === "*OFF") {
    return { kind: "action", action: { type: "resetScopeCenter" } };
  }
  if (compact === "*O" || compact === "*OF") {
    return { kind: "incomplete" };
  }
  if (compact.startsWith("*OFF")) {
    return invalid("unknown OFF command");
  }

  if (compact.startsWith("*RR")) {
    const rest = compact.slice(3);
    if (rest.length === 0) {
      return { kind: "incomplete" };
    }
    if (rest === "C") {
      return { kind: "action", action: { type: "armRecenterRangeRings" } };
    }
    if (rest === "OFF") {
      return { kind: "action", action: { type: "resetRangeRingsCenter" } };
    }
    if (rest === "O" || rest === "OF") {
      return { kind: "incomplete" };
    }
    if (/^\d+$/.test(rest)) {
      const intervalNm = Number(rest);
      if ((RR_KEYBOARD_INTERVALS_NM as readonly number[]).includes(intervalNm)) {
        return { kind: "action", action: { type: "setRangeRingInterval", intervalNm } };
      }
      return invalid("invalid RR interval");
    }
    return invalid("invalid RR command");
  }
  if (compact === "*R") {
    return { kind: "incomplete" };
  }

  return null;
}

const BEACON_FILTER_OCTAL = /^[0-7]+$/;

function parseBeaconFilterCode(
  code: string,
  kind: "addBeaconCodeFilter" | "removeBeaconCodeFilter",
): PreviewCommandResult {
  if (code.length === 0) {
    return { kind: "incomplete" };
  }
  if (!BEACON_FILTER_OCTAL.test(code)) {
    return invalid("invalid beacon code");
  }
  if (code.length === 2 || code.length === 4) {
    return { kind: "action", action: { type: kind, code } };
  }
  if (code.length < 4) {
    return { kind: "incomplete" };
  }
  return invalid("invalid beacon code");
}

/**
 * Table 29 altitude filters. Exact `*F` displays current bounds; `*LA` sets
 * 3-digit hundreds 0–180. Spaces optional (`*F` = `* F`). `*FILTER` is not
 * ours. Null when this is not our family so other `*` rows stay intact.
 */
export function parseAltitudeFilterCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactStarCommand(buffer);

  if (compact === "*F") {
    return { kind: "action", action: { type: "displayFilters" } };
  }

  if (compact === "*L") {
    return { kind: "incomplete" };
  }
  if (!compact.startsWith("*LA")) {
    return null;
  }

  const rest = compact.slice(3);
  if (rest.length === 0) {
    return { kind: "incomplete" };
  }
  if (!/^\d+$/.test(rest)) {
    return invalid("invalid altitude filter limits");
  }
  if (rest.length < 6) {
    return { kind: "incomplete" };
  }
  if (rest.length > 6) {
    return invalid("invalid altitude filter limits");
  }
  const floorHundreds = parseStrictFilterHundreds(rest.slice(0, 3));
  const ceilingHundreds = parseStrictFilterHundreds(rest.slice(3, 6));
  if (floorHundreds === null || ceilingHundreds === null) {
    return invalid("altitude filter out of range");
  }
  if (floorHundreds > ceilingHundreds) {
    return invalid("altitude filter floor above ceiling");
  }
  return {
    kind: "action",
    action: { type: "setAltitudeFilterLimits", floorHundreds, ceilingHundreds },
  };
}

/**
 * Table 30 preview `*BCN` / `*BCN DEL`. Bare `*B` / `*BE` / `*BI` stay TPA
 * (return null). `*BC` is a live prefix of `*BCN`. Codes are 2-digit blocks or
 * 4-digit discrete, octal 0–7 only.
 */
export function parseBeaconFilterCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactStarCommand(buffer);

  if (compact === "*B" || compact.startsWith("*BE") || compact.startsWith("*BI")) {
    return null;
  }
  if (compact === "*BC") {
    return { kind: "incomplete" };
  }
  if (!compact.startsWith("*BCN")) {
    return null;
  }

  const rest = compact.slice(4);
  if (rest.length === 0) {
    return { kind: "incomplete" };
  }
  if (rest === "D" || rest === "DE" || rest === "DEL") {
    return { kind: "incomplete" };
  }
  if (rest.startsWith("DEL")) {
    return parseBeaconFilterCode(rest.slice(3), "removeBeaconCodeFilter");
  }
  return parseBeaconFilterCode(rest, "addBeaconCodeFilter");
}

/**
 * Table 30 beacon select. `B45` is a complete CODE BLOCK **and** a live prefix
 * of `B4501`, so the key handler waits for Enter at two digits; four digits may
 * auto-commit. 0 / 1 / 3 digits stay incomplete until Enter maps them to INV.
 */
function parseBeaconSelect(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("B")) {
    return null;
  }
  if (buffer.length === 1) {
    return null;
  }
  const digits = buffer.slice(1);
  if (!/^\d+$/.test(digits)) {
    return invalid("unknown preview command");
  }
  if (digits.length === 2) {
    return { kind: "action", action: { type: "beaconBlock", digits } };
  }
  if (digits.length === 4) {
    return { kind: "action", action: { type: "beaconDiscrete", digits } };
  }
  if (digits.length > 4) {
    return invalid("unknown preview command");
  }
  return { kind: "incomplete" };
}

/** Longest-first so `TAB` / `TV` win over `T`. */
const LIST_TOGGLE_TOKENS: ReadonlyArray<{ token: string; listId: string }> = [
  { token: "TAB", listId: "TAB" },
  { token: "TV", listId: "VFR" },
  { token: "TC", listId: "COAST" },
  { token: "TS", listId: "SIGN_ON" },
  { token: "TM", listId: "ALERT" },
  { token: "TX", listId: "MAPS" },
  { token: "TN", listId: "CRDA" },
  { token: "T", listId: "TAB" },
];

const TOWER_LIST_IDS: Readonly<Record<"1" | "2" | "3", string>> = {
  "1": "TOWER_1",
  "2": "TOWER_2",
  "3": "TOWER_3",
};

function compactPreviewStars(buffer: string): string {
  return buffer.replace(/ /g, "");
}

function listResizeAction(listId: string, digits: string): PreviewCommandResult {
  const maxLines = Number(digits);
  if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 100) {
    return invalid("list maxLines out of range");
  }
  return { kind: "action", action: { type: "resizeList", listId, maxLines } };
}

/**
 * Table 31/32 system lists. Spaces optional (`*T` = `* T`). `*P1`/`*P2`/`*P3`
 * are tower lists; bare `*P` and `*P10` stay TPA; `*PTL` stays incomplete
 * (T02-64). `*S` arms SSA relocate and does not toggle SSA.
 */
function parseListCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactPreviewStars(buffer);
  if (compact === "*" || compact === "") {
    return null;
  }

  // Space before a size so `*P10` remains TPA cone 10 NM, not TOWER_1 resize 0.
  const tower = /^(\*)\s*P([123])(?:\s+(\d{1,3}))?$/.exec(buffer);
  if (tower) {
    const listId = TOWER_LIST_IDS[tower[2] as "1" | "2" | "3"];
    if (tower[3] !== undefined) {
      return listResizeAction(listId, tower[3]);
    }
    return { kind: "action", action: { type: "toggleList", listId } };
  }

  const rest = compact.slice(1);
  if (rest === "S") {
    return { kind: "action", action: { type: "armRelocateList", listId: "SSA" } };
  }

  for (const row of LIST_TOGGLE_TOKENS) {
    if (rest === row.token) {
      return { kind: "action", action: { type: "toggleList", listId: row.listId } };
    }
    if (rest.startsWith(row.token)) {
      const suffix = rest.slice(row.token.length);
      if (/^\d+$/.test(suffix)) {
        return listResizeAction(row.listId, suffix);
      }
      return invalid("malformed list command");
    }
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

function compactPreviewBuffer(buffer: string): string {
  return buffer.replace(/\s+/g, "");
}

function isTpaDBuffer(compact: string): boolean {
  return compact === "*DE" || compact === "*DI" || compact.startsWith("*D+");
}

function mapToggleAction(
  token: string,
  maps: readonly LoadedVideoMap[] | undefined,
  explicitState?: boolean,
): PreviewCommandResult {
  const normalized = token.toUpperCase();
  if (maps) {
    const map = resolveVideoMapToken(maps, normalized);
    if (!map) {
      return invalid("unknown video map");
    }
    return {
      kind: "action",
      action:
        explicitState === undefined
          ? { type: "toggleVideoMap", mapId: map.id }
          : { type: "toggleVideoMap", mapId: map.id, explicitState },
    };
  }
  return {
    kind: "action",
    action:
      explicitState === undefined
        ? { type: "toggleVideoMap", mapId: normalized }
        : { type: "toggleVideoMap", mapId: normalized, explicitState },
  };
}

/**
 * Table 28 video-map rows. Spaces are optional (`*D LOC27` == `*DLOC27`).
 * Bare `*D` and TPA `*DE` / `*DI` / `*D+` stay with starsChord — return null.
 */
function parseVideoMapCommand(
  buffer: string,
  maps?: readonly LoadedVideoMap[],
): PreviewCommandResult | null {
  const compact = compactPreviewBuffer(buffer);
  if (/^M[A-Z0-9_]/.test(compact)) {
    return mapToggleAction(compact.slice(1), maps);
  }
  if (!compact.startsWith("*D") || compact === "*D" || isTpaDBuffer(compact)) {
    return null;
  }
  const rest = compact.slice(2);
  if (rest === "ALL") {
    return { kind: "action", action: { type: "setAllVideoMaps", enabled: true } };
  }
  if (rest === "NONE") {
    return { kind: "action", action: { type: "setAllVideoMaps", enabled: false } };
  }
  if (rest === "OFF") {
    return invalid("unknown video map");
  }
  if (rest.startsWith("OFF")) {
    return mapToggleAction(rest.slice(3), maps, false);
  }
  return mapToggleAction(rest, maps);
}

/**
 * Pure string parser for the Preview Area buffer.
 * T02-51: empty and live prefixes are `incomplete`; anything else is `invalid`.
 * T02-52 / T02-53 add `action` rows to `PREVIEW_TABLE` without replacing this.
 * T02-62 list mnemonics are parsed in `parseListCommand`. T02-63 video-map
 * commands are matched before the `*` catch-all prefix. T02-65 `*F` / `*LA` /
 * `*BCN` are parsed in `parseAltitudeFilterCommand` / `parseBeaconFilterCommand`.
 */
export function parsePreviewCommand(
  buffer: string,
  maps?: readonly LoadedVideoMap[],
): PreviewCommandResult {
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
  const beacon = parseBeaconSelect(buffer);
  if (beacon) {
    return beacon;
  }
  const display = parseScopeDisplayCommand(buffer);
  if (display) {
    return display;
  }
  const altitude = parseAltitudeFilterCommand(buffer);
  if (altitude) {
    return altitude;
  }
  const beaconFilter = parseBeaconFilterCommand(buffer);
  if (beaconFilter) {
    return beaconFilter;
  }
  const videoMap = parseVideoMapCommand(buffer, maps);
  if (videoMap) {
    return videoMap;
  }
  const list = parseListCommand(buffer);
  if (list) {
    return list;
  }
  const keys = Object.keys(PREVIEW_TABLE);
  if (keys.some((key) => key.startsWith(buffer))) {
    return { kind: "incomplete" };
  }
  // `+FLID`, `/` slew, TPA `*J`/`*P`, and later `*PTL` stay incomplete.
  // Enter still maps incomplete → INV via commitPreviewCommand (or starsChord).
  if (keys.some((key) => key.length > 0 && buffer.startsWith(key))) {
    return { kind: "incomplete" };
  }
  return invalid("unknown preview command");
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

/** Enter-commit: a still-live prefix (`B`, `B4`, `B450`) is `invalid`, not a silent no-op. */
export function commitPreviewCommand(
  buffer: string,
  maps?: readonly LoadedVideoMap[],
): PreviewCommandResult {
  const parsed = parsePreviewCommand(buffer, maps);
  if (parsed.kind === "incomplete") {
    return invalid("incomplete preview command");
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

/**
 * STARS preview alphabet: Multifunction `*`, Track `+`, Slew/Drop `/`,
 * alphanumerics, space, and TPA tenths `.`. Numpad `Multiply` / `Add` / digits
 * map to the same characters. Never Command IR.
 */
export function previewBufferCharFromKey(key: string, code?: string): string | null {
  if (key === "*" || key === "Multiply") {
    return "*";
  }
  if (key === "+" || key === "Add") {
    return "+";
  }
  if (key === "/") {
    return "/";
  }
  if (key === " " || key === "Spacebar") {
    return " ";
  }
  if (key === "." || key === "Decimal") {
    return ".";
  }
  if (key === "_") {
    return "_";
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

/** Idle start keys: prefixes + alphanumerics + space. `.` only appends once live. */
export function isPreviewBufferStartChar(ch: string): boolean {
  return ch === "*" || ch === "+" || ch === "/" || /^[A-Z0-9 ]$/.test(ch);
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
): PreviewKeyOutcome {
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
    const parsed = parsePreviewCommand(state.buffer, maps);
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
