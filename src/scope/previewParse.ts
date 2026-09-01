/**
 * Analog: CRC STARS Preview Area command grammar (R07). Pure string parsers.
 * Preview never emits Command, readback, or intent. Not NAS STARS.
 */

import type { LoadedVideoMap } from "@scenario";
import { parseStrictFilterHundreds } from "./altitudeFilter";
import { resolveVideoMapToken, type VideoMapTokenLayout } from "./dcb/dcbFunctions";
import { digitFromKey } from "./keymap";
import {
  isStarsLeaderClock,
  leaderDirFromStarsClock,
  leaderLengthPxFromStep,
  type LeaderDir,
  type StarsLeaderClock,
} from "./leader";
import type { VipLevel } from "./wx";

/**
 * Armed preview action, discriminated on `type`.
 * T02-52: `initCntl` / `termCntl` (FLID lives on `PreviewAreaState.flid`).
 * T02-53: `beaconBlock` / `beaconDiscrete`. T02-62: `toggleList` / `resizeList`
 * / `armRelocateList`. T02-64: scope recenter / RR / PTL / HIST. Slew forms
 * (`armRecenterScope`, `armRecenterRangeRings`) apply via DCB PLACE flags.
 * T02-74: exact `*R` arms per-track PTL; `*RR…` stays range rings.
 * T02-63: `toggleVideoMap` / `setAllVideoMaps`. T02-71: `toggleWxLevel` /
 * `setWxLevelsAll`. T02-65: `displayFilters` /
 * `setAltitudeFilterLimits` / `addBeaconCodeFilter` / `removeBeaconCodeFilter`.
 * T02-66: handoff accept, pointout ack, leader clock, beaconator slew.
 * T02-73: `saveAsPref` is the SAVE AS name commit (name on Enter only).
 * Optional `flid` on INIT/TERM is only for typed `+[Callsign]` Enter.
 * Do not put F3-specific field names on ScopeView.
 */
export type PreviewArmedAction =
  | { readonly type: "initCntl"; readonly flid?: string }
  | { readonly type: "termCntl"; readonly flid?: string }
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
  | { readonly type: "armPerTrackPtl" }
  | { readonly type: "setPtlMinutes"; readonly minutes: number }
  | { readonly type: "setHistoryDots"; readonly count: number }
  | { readonly type: "toggleWxLevel"; readonly level: VipLevel }
  | { readonly type: "setWxLevelsAll"; readonly enabled: boolean }
  | { readonly type: "toggleVideoMap"; readonly mapId: string; readonly explicitState?: boolean }
  | { readonly type: "setAllVideoMaps"; readonly enabled: boolean }
  | { readonly type: "displayFilters" }
  | {
      readonly type: "setAltitudeFilterLimits";
      readonly floorHundreds: number;
      readonly ceilingHundreds: number;
    }
  | { readonly type: "addBeaconCodeFilter"; readonly code: string }
  | { readonly type: "removeBeaconCodeFilter"; readonly code: string }
  | { readonly type: "acceptHandoff" }
  | { readonly type: "ackPointout" }
  | {
      readonly type: "setLeaderDir";
      readonly dir?: LeaderDir;
      readonly starsDir?: StarsLeaderClock;
      readonly flid?: string;
      readonly scope?: "single" | "allOwned" | "allUnowned" | "allUnassociated";
    }
  | { readonly type: "resetLeaderDir" }
  | {
      readonly type: "setLeaderLength";
      readonly lengthStep: number;
      readonly lengthPx: number;
      readonly flid?: string;
    }
  | {
      readonly type: "setLeaderDirAndLength";
      readonly dir: LeaderDir;
      readonly lengthStep: number;
      readonly lengthPx: number;
      readonly flid?: string;
    }
  | {
      readonly type: "setDefaultLeaderLength";
      readonly lengthStep: number;
      readonly lengthPx: number;
    }
  | { readonly type: "forceFdb"; readonly flid?: string }
  | { readonly type: "clearAllForcedFdb" }
  | { readonly type: "beaconatorSlew" }
  | { readonly type: "saveAsPref"; readonly name?: string };

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
 * `parseListCommand` (`* P1` vs TPA `*P3`). T02-64 `*C` / `*RR` / `*PTL` /
 * `*HIST` and T02-71 `*WX` live in `parseScopeDisplayCommand`. T02-63 `*D` / `M` video-map
 * rows live in `parseVideoMapCommand`. T02-65 `*F` / `*LA` / `*BCN` live in
 * `parseAltitudeFilterCommand` / `parseBeaconFilterCommand`. T02-66 tracking
 * chords live in `parseTrackingCommand` (`+` / `/` Enter arm; `*1`–`*8` /
 * `*0` leader). Do not rewrite the state machine to add rows.
 */
type PreviewTableEntry = { kind: "prefix" } | { kind: "action"; action: PreviewArmedAction };

const PREVIEW_TABLE: Readonly<Record<string, PreviewTableEntry>> = {
  // T02-53: `B` begins beacon-code select. Digits + commit in parseBeaconSelect.
  B: { kind: "prefix" },
  // T02-61: Multifunction. Track `+` / Slew `/` complete in parseTrackingCommand.
  "*": { kind: "prefix" },
};

/** Full callsign / numeric-tail / 4-digit squawk — duplicated, not `@pilot`. */
export const FULL_CALLSIGN = /^[A-Z]{3}[0-9]{1,4}[A-Z]?$/;
export const SUFFIX_CALLSIGN = /^[0-9]{1,4}[A-Z]?$/;
export const SQUAWK_CODE = /^[0-9]{4}$/;

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
 * fallback). `*PTL` is ours; `*PT` is only a live PTL prefix. `*WX` is ours;
 * `*W` is only a live WX prefix.
 */
export function parseScopeDisplayCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactStarCommand(buffer);

  if (compact.startsWith("*WX")) {
    const rest = compact.slice(3);
    if (rest.length === 0) {
      return { kind: "incomplete" };
    }
    if (rest === "ALL") {
      return { kind: "action", action: { type: "setWxLevelsAll", enabled: true } };
    }
    if (rest === "OFF") {
      return { kind: "action", action: { type: "setWxLevelsAll", enabled: false } };
    }
    if (rest === "A" || rest === "AL" || rest === "O" || rest === "OF") {
      return { kind: "incomplete" };
    }
    if (/^[1-6]$/.test(rest)) {
      return {
        kind: "action",
        action: { type: "toggleWxLevel", level: Number(rest) as VipLevel },
      };
    }
    return invalid("invalid WX command");
  }
  if (compact === "*W") {
    return { kind: "incomplete" };
  }

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
  // Exact `*R` only. `startsWith("*RR")` above owns range rings; do not prefix-match.
  if (compact === "*R") {
    return { kind: "action", action: { type: "armPerTrackPtl" } };
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
 * Table 31/32 system lists. Spaces optional (`*T` = `* T`). Tower lists are
 * the spaced CRC form `* P1`/`* P2`/`* P3`; compact `*P1`/`*P3`/`*P10` stay
 * TPA cones. `*PTL` stays incomplete (T02-64). `*S` arms SSA relocate and
 * does not toggle SSA.
 */
function parseListCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactPreviewStars(buffer);
  if (compact === "*" || compact === "") {
    return null;
  }

  // Require a space after `*` so `*P3` is a 3 NM cone, not TOWER_3.
  const tower = /^\*\s+P([123])(?:\s+(\d{1,3}))?$/.exec(buffer);
  if (tower) {
    const listId = TOWER_LIST_IDS[tower[1] as "1" | "2" | "3"];
    if (tower[2] !== undefined) {
      return listResizeAction(listId, tower[2]);
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
  layout?: VideoMapTokenLayout,
): PreviewCommandResult {
  const normalized = token.toUpperCase();
  if (maps) {
    const map = resolveVideoMapToken(maps, normalized, layout);
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
  layout?: VideoMapTokenLayout,
): PreviewCommandResult | null {
  const compact = compactPreviewBuffer(buffer);
  if (/^M[A-Z0-9_]/.test(compact)) {
    return mapToggleAction(compact.slice(1), maps, undefined, layout);
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
    return mapToggleAction(rest.slice(3), maps, false, layout);
  }
  return mapToggleAction(rest, maps, undefined, layout);
}

const TRACKING_SLEW_TYPES: ReadonlySet<PreviewArmedAction["type"]> = new Set([
  "initCntl",
  "termCntl",
  "forceFdb",
  "acceptHandoff",
  "ackPointout",
  "setLeaderDir",
  "resetLeaderDir",
  "setLeaderLength",
  "setLeaderDirAndLength",
  "beaconatorSlew",
  "armPerTrackPtl",
]);

function compactTrackingBuffer(buffer: string): string {
  return buffer.replace(/\s+/g, "");
}

function isFlidPrefixToken(token: string): boolean {
  return /^[A-Z]{1,3}$/.test(token);
}

function isCompleteFlidToken(token: string): boolean {
  return FULL_CALLSIGN.test(token) || SUFFIX_CALLSIGN.test(token) || SQUAWK_CODE.test(token);
}

function parseTrackFlidRest(kind: "initCntl" | "termCntl", rest: string): PreviewCommandResult {
  if (rest.length === 0) {
    return { kind: "action", action: { type: kind } };
  }
  if (kind === "termCntl" && rest === "ALL") {
    return invalid("TERM CNTL ALL");
  }
  if (isCompleteFlidToken(rest)) {
    return { kind: "action", action: { type: kind, flid: rest } };
  }
  if (isFlidPrefixToken(rest)) {
    return { kind: "incomplete" };
  }
  return invalid(kind === "initCntl" ? "unknown init FLID" : "unknown drop FLID");
}

/**
 * T02-66 tracking / datablock chords + Table 24/25 leader line direction and length.
 * `* P1` is a tower list (parseListCommand). Bare `*` and `*B` stay incomplete.
 * `*F` / `*LA` / `*BCN` — `*F` forces Full Data Block on slewed track or target acid.
 */
export function parseTrackingCommand(buffer: string): PreviewCommandResult | null {
  const compact = compactTrackingBuffer(buffer);
  if (compact === "**F") {
    return { kind: "action", action: { type: "clearAllForcedFdb" } };
  }
  if (compact.startsWith("*F")) {
    const rest = compact.slice(2);
    if (rest.length === 0) {
      return { kind: "action", action: { type: "forceFdb" } };
    }
    if (isCompleteFlidToken(rest)) {
      return { kind: "action", action: { type: "forceFdb", flid: rest } };
    }
    if (isFlidPrefixToken(rest)) {
      return { kind: "incomplete" };
    }
    return invalid("unknown FLID");
  }
  if (compact.startsWith("+")) {
    return parseTrackFlidRest("initCntl", compact.slice(1));
  }
  if (compact.startsWith("/")) {
    const lenMatch = /^\/([0-7])(.*)$/.exec(compact);
    if (lenMatch) {
      const step = Number(lenMatch[1]);
      const rest = lenMatch[2];
      const lengthPx = leaderLengthPxFromStep(step);
      if (rest.length === 0) {
        return { kind: "action", action: { type: "setLeaderLength", lengthStep: step, lengthPx } };
      }
      if (isCompleteFlidToken(rest)) {
        return {
          kind: "action",
          action: { type: "setLeaderLength", lengthStep: step, lengthPx, flid: rest },
        };
      }
      if (isFlidPrefixToken(rest)) {
        return { kind: "incomplete" };
      }
      return invalid("unknown FLID");
    }
    return parseTrackFlidRest("termCntl", compact.slice(1));
  }

  // Direct position digits 1–9 / length 0–7 (Table 25 & Table 8)
  const dirMatch = /^([1-9])(?:\/([0-7])?)?(.*)$/.exec(compact);
  if (dirMatch && !compact.startsWith("*")) {
    const dir = Number(dirMatch[1]) as LeaderDir;
    if (compact.includes("/")) {
      const dirLenMatch = /^([1-9])\/([0-7])(.*)$/.exec(compact);
      if (dirLenMatch) {
        const step = Number(dirLenMatch[2]);
        const rest = dirLenMatch[3];
        const lengthPx = leaderLengthPxFromStep(step);
        if (rest.length === 0) {
          return {
            kind: "action",
            action: { type: "setLeaderDirAndLength", dir, lengthStep: step, lengthPx },
          };
        }
        if (isCompleteFlidToken(rest)) {
          return {
            kind: "action",
            action: { type: "setLeaderDirAndLength", dir, lengthStep: step, lengthPx, flid: rest },
          };
        }
        if (isFlidPrefixToken(rest)) {
          return { kind: "incomplete" };
        }
        return invalid("unknown FLID");
      }
      if (compact.endsWith("/")) {
        return { kind: "incomplete" };
      }
      return invalid("invalid leader length");
    }
    const rest = dirMatch[3];
    if (rest.length === 0) {
      return { kind: "action", action: { type: "setLeaderDir", dir } };
    }
    if (isCompleteFlidToken(rest)) {
      return { kind: "action", action: { type: "setLeaderDir", dir, flid: rest } };
    }
    if (isFlidPrefixToken(rest)) {
      return { kind: "incomplete" };
    }
    return invalid("unknown FLID");
  }

  if (compact.startsWith("*L")) {
    if (compact === "*L") {
      return { kind: "incomplete" };
    }
    if (compact.startsWith("*LA")) {
      return null;
    }
    if (compact === "*LD") {
      return { kind: "incomplete" };
    }
    if (compact.startsWith("*LDR")) {
      const rest = compact.slice(4);
      if (rest.length === 0) {
        return { kind: "incomplete" };
      }
      if (/^[0-7]$/.test(rest)) {
        const step = Number(rest);
        return {
          kind: "action",
          action: {
            type: "setDefaultLeaderLength",
            lengthStep: step,
            lengthPx: leaderLengthPxFromStep(step),
          },
        };
      }
      return invalid("invalid LDR length");
    }

    const starLDirLenMatch = /^\*L([1-9])\/([0-7])(.*)$/.exec(compact);
    if (starLDirLenMatch) {
      const dir = Number(starLDirLenMatch[1]) as LeaderDir;
      const step = Number(starLDirLenMatch[2]);
      const rest = starLDirLenMatch[3];
      const lengthPx = leaderLengthPxFromStep(step);
      if (rest.length === 0) {
        return {
          kind: "action",
          action: { type: "setLeaderDirAndLength", dir, lengthStep: step, lengthPx },
        };
      }
      if (isCompleteFlidToken(rest)) {
        return {
          kind: "action",
          action: { type: "setLeaderDirAndLength", dir, lengthStep: step, lengthPx, flid: rest },
        };
      }
      if (isFlidPrefixToken(rest)) {
        return { kind: "incomplete" };
      }
      return invalid("unknown FLID");
    }

    if (/^\*L[1-9]\/$/.test(compact)) {
      return { kind: "incomplete" };
    }

    const starLMatch = /^\*L([1-9])(.*)$/.exec(compact);
    if (starLMatch) {
      const dir = Number(starLMatch[1]) as LeaderDir;
      const rest = starLMatch[2];
      if (rest.length === 0) {
        return { kind: "action", action: { type: "setLeaderDir", dir, scope: "allOwned" } };
      }
      if (rest === "*") {
        return { kind: "action", action: { type: "setLeaderDir", dir, scope: "allUnowned" } };
      }
      if (rest === "U") {
        return { kind: "action", action: { type: "setLeaderDir", dir, scope: "allUnassociated" } };
      }
      if (rest === String(dir)) {
        return { kind: "action", action: { type: "setLeaderDir", dir } };
      }
      if (rest.startsWith(String(dir)) && isCompleteFlidToken(rest.slice(1))) {
        return { kind: "action", action: { type: "setLeaderDir", dir, flid: rest.slice(1) } };
      }
      if (isCompleteFlidToken(rest)) {
        return { kind: "action", action: { type: "setLeaderDir", dir, flid: rest } };
      }
      if (isFlidPrefixToken(rest)) {
        return { kind: "incomplete" };
      }
      return invalid("unknown leader command");
    }
  }

  if (!compact.startsWith("*") || compact === "*" || compact === "") {
    return null;
  }
  const rest = compact.slice(1);
  if (rest === "0") {
    return { kind: "action", action: { type: "resetLeaderDir" } };
  }
  if (/^[1-8]$/.test(rest) && isStarsLeaderClock(Number(rest))) {
    return {
      kind: "action",
      action: {
        type: "setLeaderDir",
        starsDir: Number(rest) as StarsLeaderClock,
        dir: leaderDirFromStarsClock(Number(rest) as StarsLeaderClock),
      },
    };
  }
  return null;
}

/**
 * Live-buffer slew (no Enter): bare `*` ack/highlight, `*B` beaconator, plus
 * complete parseTrackingCommand rows (`+`, `/`, `*1`–`*8`, `*0`).
 */
export function parseTrackingSlewBuffer(buffer: string): PreviewArmedAction | null {
  const compact = compactTrackingBuffer(buffer);
  if (compact === "*") {
    return { type: "ackPointout" };
  }
  if (compact === "*B") {
    return { type: "beaconatorSlew" };
  }
  const parsed = parseTrackingCommand(buffer);
  if (parsed?.kind === "action") {
    return parsed.action;
  }
  return null;
}

export function isTrackingSlewAction(action: PreviewArmedAction | null): boolean {
  return action != null && TRACKING_SLEW_TYPES.has(action.type);
}

export function parsePreviewCommand(
  buffer: string,
  maps?: readonly LoadedVideoMap[],
  layout?: VideoMapTokenLayout,
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
  const videoMap = parseVideoMapCommand(buffer, maps, layout);
  if (videoMap) {
    return videoMap;
  }
  const list = parseListCommand(buffer);
  if (list) {
    return list;
  }
  const tracking = parseTrackingCommand(buffer);
  if (tracking) {
    return tracking;
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
