/**
 * Preview Area command grammar. Pure string parsers.
 * Preview never emits Command, readback, or intent. Not NAS STARS.
 */

import type { LoadedVideoMap } from "@scenario";
import { parseStrictFilterHundreds } from "./altitudeFilter";
import { resolveVideoMapToken, type VideoMapTokenLayout } from "./dcb/dcbFunctions";
import { DEFAULT_GEOGRAPHIC_MAPS } from "./coordinationList";
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
 * Optional `flid` on INIT/TERM is only for typed identity entry.
 * Do not put F3-specific field names on ScopeView.
 */
export type PreviewArmedAction =
  | {
      readonly type: "createFlightPlan";
      pendingDiscrete: boolean;
      acid: string;
      /** Present only when entered through the explicit FLT DATA command. */
      creationMode?: "fltData" | "vfr";
      assignedBeacon?: string;
      beaconAllocation?: "ifr" | "vfr" | "general1" | "general2" | "general3" | "general4";
      tcp?: string;
      flightType?: "A" | "P" | "E";
      airportId?: string;
      scratchpads: string[];
      aircraftType?: string;
      aircraftCount?: number;
      equipment?: string;
      requestedAltitudeFt?: number;
      flightRules?: string;
      fixes?: string[];
      eta?: string;
      ptd?: string;
    }
  | { readonly type: "deleteVfrFlightPlan"; readonly flid: string }
  | {
      readonly type: "createVfrActiveTrack";
      readonly intermediateFix?: string;
      readonly requestedAltitudeFt?: number;
    }
  | { readonly type: "initCntl"; readonly flid?: string }
  | {
      readonly type: "termCntl";
      readonly flid?: string;
      readonly flightType?: "A" | "P" | "E";
      readonly coordinationTime?: string;
    }
  | { readonly type: "releaseAssignedBeacon"; readonly flid: string }
  | {
      readonly type: "modifyFlightPlan";
      readonly flid: string;
      readonly field:
        | "acid"
        | "assignedBeacon"
        | "tcp"
        | "fixes"
        | "flightType"
        | "scratchpads"
        | "requestedAltitudeFt"
        | "assignedAltitudeFt"
        | "aircraftType"
        | "equipment"
        | "eta"
        | "ptd";
      readonly value: string;
      readonly scratchpadSlot?: 1 | 2;
    }
  | { readonly type: "beaconBlock"; readonly digits: string }
  | { readonly type: "beaconDiscrete"; readonly digits: string }
  | { readonly type: "toggleList"; readonly listId: string }
  | { readonly type: "resizeList"; readonly listId: string; readonly maxLines: number }
  | { readonly type: "armRelocateList"; readonly listId: string }
  | { readonly type: "resetListPosition"; readonly listId: string }
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
      readonly associatedOnly?: boolean;
      readonly associatedFloorHundreds?: number;
      readonly associatedCeilingHundreds?: number;
    }
  | { readonly type: "addBeaconCodeFilter"; readonly code: string }
  | { readonly type: "removeBeaconCodeFilter"; readonly code: string }
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
  | { readonly type: "associateFlightPlan"; readonly index: number }
  | { readonly type: "deleteFlightPlanEntry"; readonly index: number }
  /** Single-track CA inhibit toggle (`CA K <trk>`). */
  | { readonly type: "caSingleTrackInhibit"; readonly trk?: string }
  /** Pair CA inhibit/enable toggle (`CA P <trk1> [<trk2>]`). */
  | { readonly type: "caPairToggle"; readonly trk1?: string; readonly trk2?: string }
  /** Controller-owned pair CA setting (`CA C [E|I]`). */
  | {
      readonly type: "caControllerPairs";
      readonly mode: "toggle" | "enable" | "inhibit";
    }
  /** Pair CA inhibit slew toggle (`CA [ENTER]`). */
  | { readonly type: "caPairSlew"; readonly trk1?: string }
  /** `*MCI Enter`: Toggle Mode C Intruder alerting on/off. */
  | { readonly type: "toggleMci" }
  /** `<MULTI FUNC> Q <SLEW>`: suppress only the selected current LA alert. */
  | { readonly type: "msawCurrentAlertInhibit" }
  /** `<MULTI FUNC> V <SLEW>`: toggle selected-track MSAW processing. */
  | { readonly type: "toggleMsawProcessing" }
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
export const SQUAWK_CODE = /^[0-7]{4}$/;
const SCRATCHPAD = /^[A][A-Z0-9+/. *]{0,4}$/;
const SCRATCHPAD_2 = /^\+[A-Z0-9+/. *]{0,4}$/;
const AIRCRAFT = /^(?:(\d{1,2})\/)?([A-Z][A-Z0-9]{1,3})(?:\/([A-Z]))?$/;
const FLIGHT_RULES = /^[A-Z]$/;
const FIX_DATA = /^(?:[A-Z0-9]{1,4})?\*(?:[A-Z0-9]{1,4})?(?:\*[APE])?$/;
const ETA_OR_PTD = /^(?:[01]\d|2[0-3])[0-5]\dE$/;

function isCreationAcid(value: string): boolean {
  return /^[A-Z][A-Z0-9]{1,6}$/.test(value) && (value.length !== 2 || /\d$/.test(value));
}

function isDefiniteFltDataAircraft(token: string): boolean {
  return (
    token.length >= 3 &&
    token.length <= 4 &&
    AIRCRAFT.test(token) &&
    !SCRATCHPAD.test(token) &&
    !FIX_DATA.test(token) &&
    !ETA_OR_PTD.test(token)
  );
}

export type FlightPlanCreationParse =
  | { kind: "incomplete" }
  | { kind: "invalid"; reason: string }
  | { kind: "action"; action: Extract<PreviewArmedAction, { type: "createFlightPlan" }> };

export function parseVfrFlightPlanCommand(buffer: string): PreviewCommandResult {
  const tokens = buffer.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: "incomplete" };
  if (tokens.length === 1) {
    if (!/^(?:\d{1,2}|[A-Z][A-Z0-9]{1,6})$/.test(tokens[0]!)) {
      return invalid("ILL ACID");
    }
    return { kind: "action", action: { type: "deleteVfrFlightPlan", flid: tokens[0]! } };
  }
  if (tokens[0] === "*") {
    let altitude: number | undefined;
    let intermediateFix: string | undefined;
    for (const token of tokens.slice(1)) {
      if (/^\d{3}$/.test(token)) {
        if (altitude !== undefined) return invalid("FORMAT");
        altitude = Number(token) * 100;
      } else if (/^[A-Z0-9]{1,4}$/.test(token)) {
        if (intermediateFix) return invalid("FORMAT");
        intermediateFix = token;
      } else return invalid("FORMAT");
    }
    return {
      kind: "action",
      action: { type: "createVfrActiveTrack", intermediateFix, requestedAltitudeFt: altitude },
    };
  }
  const acid = tokens[0]!;
  if (!/^[A-Z][A-Z0-9]{1,6}$/.test(acid) || (acid.length === 2 && !/\d$/.test(acid))) {
    return invalid("ILL ACID");
  }
  const route = /^([A-Z0-9]{1,4})\*([A-Z0-9]{1,4})$/.exec(tokens[1]!);
  if (!route) return invalid("ILL ROUTE");
  const fields: Extract<PreviewArmedAction, { type: "createFlightPlan" }> = {
    type: "createFlightPlan",
    pendingDiscrete: false,
    creationMode: "vfr",
    acid,
    flightRules: "VFR",
    fixes: [tokens[1]!],
    scratchpads: [],
  };
  let aircraftSeen = false;
  for (const token of tokens.slice(2)) {
    if (/^\d{3}$/.test(token)) {
      if (fields.requestedAltitudeFt !== undefined) return invalid("FORMAT");
      fields.requestedAltitudeFt = Number(token) * 100;
    } else if (/^[A-Z][A-Z0-9]{1,3}(?:\/[A-Z])?$/.test(token)) {
      if (aircraftSeen) return invalid("FORMAT");
      const [aircraftType, equipment] = token.split("/");
      fields.aircraftType = aircraftType;
      fields.equipment = equipment;
      aircraftSeen = true;
    } else if (/^[A-Z0-9]{1,2}$/.test(token)) {
      if (fields.tcp) return invalid("FORMAT");
      fields.tcp = token;
    } else return invalid("FORMAT");
  }
  return { kind: "action", action: fields };
}

/** Keyboard-only abbreviated creation grammar from TI 6191.409 §§5.5.1/5.5.7. */
export function parseFlightPlanCreation(
  buffer: string,
  pendingDiscrete = false,
  fltData = false,
): FlightPlanCreationParse {
  const tokens = buffer.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: "incomplete" };
  const acid = tokens[0]!;
  if (acid === "ALL" || !isCreationAcid(acid)) return { kind: "invalid", reason: "ILL ACID" };
  if (tokens.length === 1 && pendingDiscrete) return { kind: "incomplete" };
  const fields: Extract<PreviewArmedAction, { type: "createFlightPlan" }> = {
    type: "createFlightPlan",
    pendingDiscrete,
    acid,
    scratchpads: [],
    ...(fltData ? { creationMode: "fltData" as const } : {}),
  };
  const used = new Set<string>();
  let etaOrPtd: string | undefined;
  // Table 5-7 permits both one/two-character TCPs and two-to-four-character
  // aircraft types. A two-character token is unambiguous only in context:
  // once a definite aircraft field is present, it is the TCP field; otherwise
  // it remains a valid two-character aircraft type.
  const hasDefiniteAircraft = fltData && tokens.slice(1).some(isDefiniteFltDataAircraft);
  for (const token of tokens.slice(1)) {
    if (/^\d{4}$/.test(token)) {
      if (!/^[0-7]{4}$/.test(token)) return { kind: "invalid", reason: "FORMAT" };
      if (used.has("beacon")) return { kind: "invalid", reason: "FORMAT" };
      fields.assignedBeacon = token;
      used.add("beacon");
      continue;
    }
    if (token === "+" || token === "/" || /^\/[1-4]$/.test(token)) {
      if (used.has("beacon")) return { kind: "invalid", reason: "FORMAT" };
      fields.beaconAllocation =
        token === "+"
          ? "ifr"
          : token === "/"
            ? "vfr"
            : (`general${token.slice(1)}` as "general1" | "general2" | "general3" | "general4");
      used.add("beacon");
      continue;
    }
    // Manual FLT DATA allows two-to-four-character aircraft types. A
    // two-character letter/number value would otherwise be consumed by the
    // one/two-character TCP rule. Numeric-leading two-character values stay
    // TCPs (for example 1R); asterisk-shaped values are fix data below.
    if (fltData && /^[A-Z][A-Z0-9]$/.test(token) && !hasDefiniteAircraft) {
      if (used.has("aircraft")) return { kind: "invalid", reason: "FORMAT" };
      fields.aircraftType = token;
      used.add("aircraft");
      continue;
    }
    if (
      /^[A-Z0-9]{1,2}$/.test(token) &&
      (!/^[APE]/.test(token) ||
        (fltData && hasDefiniteAircraft && /^[A-Z][A-Z0-9]$/.test(token))) &&
      (fltData || token.length === 2)
    ) {
      if (pendingDiscrete) return { kind: "invalid", reason: "FORMAT" };
      if (used.has("tcp")) return { kind: "invalid", reason: "FORMAT" };
      fields.tcp = token;
      used.add("tcp");
      continue;
    }
    if (token === "A" && !used.has("beacon") && (fltData || used.has("type"))) {
      fields.beaconAllocation = undefined;
      used.add("beacon");
      continue;
    }
    if (fltData && FIX_DATA.test(token)) {
      if (used.has("fixes")) return { kind: "invalid", reason: "FORMAT" };
      fields.fixes = [token];
      used.add("fixes");
      continue;
    }
    if (fltData && ETA_OR_PTD.test(token)) {
      if (used.has("etaOrPtd")) return { kind: "invalid", reason: "FORMAT" };
      etaOrPtd = token;
      used.add("etaOrPtd");
      continue;
    }
    if (fltData && /^[APE]$/.test(token)) return { kind: "invalid", reason: "FORMAT" };
    // E1 is not the manual's two-character flight-type form. Reserve this
    // otherwise ambiguous token instead of letting it become an aircraft type.
    if (!fltData && /^E[A-Z0-9]$/.test(token)) return { kind: "invalid", reason: "FORMAT" };
    if (/^[APE]$/.test(token) || /^[AP][A-Z0-9]$/.test(token)) {
      if (pendingDiscrete) return { kind: "invalid", reason: "FORMAT" };
      if (used.has("type")) return { kind: "invalid", reason: "FORMAT" };
      fields.flightType = token[0] as "A" | "P" | "E";
      fields.airportId = token.length === 2 ? token[1] : undefined;
      used.add("type");
      continue;
    }
    if (SCRATCHPAD.test(token)) {
      if (used.has("sp1")) return { kind: "invalid", reason: "ILL SCR" };
      const value = token.slice(1);
      if (/^(NAT|CST|AMB|RDR|ADB|XXX|\d{3})/.test(value))
        return { kind: "invalid", reason: "ILL SCR" };
      fields.scratchpads = [value, ...fields.scratchpads.slice(1)];
      used.add("sp1");
      continue;
    }
    if (SCRATCHPAD_2.test(token)) {
      if (used.has("sp2")) return { kind: "invalid", reason: "ILL SCR" };
      const value = token.slice(1);
      if (/^(NAT|CST|AMB|RDR|ADB|XXX|\d{3})/.test(value))
        return { kind: "invalid", reason: "ILL SCR" };
      fields.scratchpads = [fields.scratchpads[0] ?? "", value];
      used.add("sp2");
      continue;
    }
    if (/^\d{3}$/.test(token)) {
      if (pendingDiscrete) return { kind: "invalid", reason: "FORMAT" };
      if (used.has("alt")) return { kind: "invalid", reason: "FORMAT" };
      fields.requestedAltitudeFt = Number(token) * 100;
      used.add("alt");
      continue;
    }
    if (/^\.[A-Z]$/.test(token)) {
      if (pendingDiscrete) return { kind: "invalid", reason: "FORMAT" };
      if (used.has("rules")) return { kind: "invalid", reason: "ILL VALUE" };
      if (!FLIGHT_RULES.test(token[1]!) || /[BFHLRJMX]/.test(token[1]!))
        return { kind: "invalid", reason: "ILL VALUE" };
      fields.flightRules = token[1];
      used.add("rules");
      continue;
    }
    const aircraft = AIRCRAFT.exec(token);
    if (aircraft) {
      if (used.has("aircraft")) return { kind: "invalid", reason: "FORMAT" };
      fields.aircraftCount = aircraft[1] ? Number(aircraft[1]) : undefined;
      if (
        fields.aircraftCount !== undefined &&
        (fields.aircraftCount < 2 || fields.aircraftCount > 99)
      )
        return { kind: "invalid", reason: "ILL NUM" };
      fields.aircraftType = aircraft[2];
      fields.equipment = aircraft[3];
      used.add("aircraft");
      continue;
    }
    return { kind: "invalid", reason: "FORMAT" };
  }
  if (etaOrPtd) {
    const status = fields.fixes?.[0]?.split("*").at(-1);
    if (status === "P") fields.ptd = etaOrPtd;
    else fields.eta = etaOrPtd;
  }
  if (pendingDiscrete && !fields.assignedBeacon && !fields.beaconAllocation)
    return { kind: "invalid", reason: "FORMAT" };
  return { kind: "action", action: fields };
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
 * TI 6191.409 §§7.14–7.15 analog. `*` is this trainer's existing MULTI
 * FUNC entry; Q/V are Preview-only slew controls, never radio commands.
 * This remains controller-local trainer behavior, not certified MSAW.
 */
function parseMsawMultiFuncCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) return null;
  const compact = compactStarCommand(buffer);
  if (compact === "*Q") return { kind: "action", action: { type: "msawCurrentAlertInhibit" } };
  if (compact === "*V") return { kind: "action", action: { type: "toggleMsawProcessing" } };
  return null;
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

  // Purged *CA alias is strictly rejected
  if (compact === "*CA") {
    return invalid("unknown preview command");
  }

  // *MCI Enter: toggle Mode C Intruder alerting
  if (compact === "*MCI") {
    return { kind: "action", action: { type: "toggleMci" } };
  }
  if (compact === "*M" || compact === "*MC") {
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
 * TI 6191.409 §4.11.1–4.11.2: `*F` displays or modifies both filter bands.
 */
export function parseAltitudeFilterCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactStarCommand(buffer);

  if (compact === "*F") {
    return { kind: "action", action: { type: "displayFilters" } };
  }

  if (compact.startsWith("*FC")) {
    const rest = compact.slice(3);
    if (!/^\d*$/.test(rest)) return invalid("invalid altitude filter limits");
    if (rest.length < 6) return { kind: "incomplete" };
    if (rest.length !== 6) return invalid("invalid altitude filter limits");
    const first = parseStrictFilterHundreds(rest.slice(0, 3));
    const second = parseStrictFilterHundreds(rest.slice(3, 6));
    if (first === null || second === null) return invalid("altitude filter out of range");
    return {
      kind: "action",
      action: {
        type: "setAltitudeFilterLimits",
        floorHundreds: Math.min(first, second),
        ceilingHundreds: Math.max(first, second),
        associatedOnly: true,
      },
    };
  }

  if (compact.startsWith("*F")) {
    const rest = compact.slice(2);
    if (!/^\d*$/.test(rest)) {
      return invalid("invalid altitude filter limits");
    }
    if (!/^\d{6}(?:\d{6})?$/.test(rest)) {
      return rest.length < 6 ? { kind: "incomplete" } : invalid("invalid altitude filter limits");
    }
    const floorHundreds = parseStrictFilterHundreds(rest.slice(0, 3));
    const ceilingHundreds = parseStrictFilterHundreds(rest.slice(3, 6));
    if (floorHundreds === null || ceilingHundreds === null) {
      return invalid("altitude filter out of range");
    }
    const action = {
      type: "setAltitudeFilterLimits" as const,
      floorHundreds: Math.min(floorHundreds, ceilingHundreds),
      ceilingHundreds: Math.max(floorHundreds, ceilingHundreds),
    };
    if (rest.length === 12) {
      const associatedFloorHundreds = parseStrictFilterHundreds(rest.slice(6, 9));
      const associatedCeilingHundreds = parseStrictFilterHundreds(rest.slice(9, 12));
      if (associatedFloorHundreds === null || associatedCeilingHundreds === null) {
        return invalid("altitude filter out of range");
      }
      return {
        kind: "action",
        action: {
          ...action,
          associatedFloorHundreds: Math.min(associatedFloorHundreds, associatedCeilingHundreds),
          associatedCeilingHundreds: Math.max(associatedFloorHundreds, associatedCeilingHundreds),
        },
      };
    }
    return { kind: "action", action };
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
  return {
    kind: "action",
    action: {
      type: "setAltitudeFilterLimits",
      floorHundreds: Math.min(floorHundreds, ceilingHundreds),
      ceilingHundreds: Math.max(floorHundreds, ceilingHundreds),
    },
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

const LIST_TOGGLE_TOKENS: ReadonlyArray<{
  token: string;
  listId: string;
  allowResize: boolean;
}> = [
  { token: "TV", listId: "VL", allowResize: true },
  { token: "TC", listId: "COAST", allowResize: true },
  { token: "TS", listId: "SIGN_ON", allowResize: false },
  { token: "TM", listId: "AL", allowResize: false },
  { token: "TX", listId: "ML", allowResize: false },
  { token: "TN", listId: "CRDA", allowResize: false },
  { token: "T", listId: "FL", allowResize: true },
];

const TOWER_LIST_IDS: Readonly<Record<"1" | "2" | "3", string>> = {
  "1": "TOWER_1",
  "2": "TOWER_2",
  "3": "TOWER_3",
};

/**
 * Removed list aliases that must be rejected / invalid.
 * STARS strictly authorizes only: *S, *T, *TV, *TM, *TC, *TS, *TX, *TN, *P1-*P3.
 */
const REMOVED_LIST_ALIASES =
  /^\*\s*(FL|TAB|FPL|VL|VFR|TL[A-Z0-9]*|ML|AL|CR|CRDA|CS|COAST|SO|SIGN_ON|SSA)(?:\s*.*)?$/i;

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
 * Table 31/32 system lists. Spaces optional (`*T` = `* T`).
 * Authorized commands only:
 * - *S: relocate SSA (*S + click), reset (*S D / *SD)
 * - *T: toggle TAB list (*T Enter), relocate (*T + click), resize (*T 15 Enter), reset (*T D)
 * - *TV: toggle VFR list (*TV Enter), relocate (*TV + click), resize (*TV 15 Enter), reset (*TV D)
 * - *TM: toggle LA/CA/MCI list (*TM Enter), relocate (*TM + click), reset (*TM D)
 * - *TC: toggle COAST list (*TC Enter), relocate (*TC + click), resize (*TC 15 Enter), reset (*TC D)
 * - *TS: toggle SIGN ON list (*TS Enter), relocate (*TS + click), reset (*TS D)
 * - *TX: toggle VIDEO MAPS list (*TX Enter), relocate (*TX + click), reset (*TX D)
 * - *TN: toggle CRDA list (*TN Enter), relocate (*TN + click), reset (*TN D)
 * - *P1-*P3: toggle Tower list (*P1 Enter), relocate (*P1 + click), resize (*P1 10 Enter), reset (*P1 D)
 * - *P: Preview relocation is resolved on slew by previewRelocateListId; Enter remains TPA.
 *
 * All aliases (*FL, *TAB, *VL, *TL, *ML, *AL, *CR, *CS, *SO, *SSA, *TL<ID>) are rejected.
 */
function parseListCommand(buffer: string): PreviewCommandResult | null {
  if (!buffer.startsWith("*")) {
    return null;
  }
  const compact = compactPreviewStars(buffer);
  if (compact === "*" || compact === "") {
    return null;
  }

  // Strictly reject removed command aliases
  if (REMOVED_LIST_ALIASES.test(buffer)) {
    return invalid("unknown preview command");
  }

  // Reset default anchor: *<ID> D or *<ID>D (only authorized tokens: T, TV, TM, TC, TS, TX, TN, P1, P2, P3, S)
  const resetMatch = /^\*\s*(TV|TC|TS|TM|TX|TN|P1|P2|P3|T|S)\s*D$/i.exec(buffer);
  if (resetMatch) {
    const token = resetMatch[1]!.toUpperCase();
    if (token === "S") {
      return { kind: "action", action: { type: "resetListPosition", listId: "SSA" } };
    }
    if (token === "P1") {
      return { kind: "action", action: { type: "resetListPosition", listId: "TOWER_1" } };
    }
    if (token === "P2") {
      return { kind: "action", action: { type: "resetListPosition", listId: "TOWER_2" } };
    }
    if (token === "P3") {
      return { kind: "action", action: { type: "resetListPosition", listId: "TOWER_3" } };
    }
    const matched = LIST_TOGGLE_TOKENS.find((row) => row.token === token);
    if (matched) {
      return { kind: "action", action: { type: "resetListPosition", listId: matched.listId } };
    }
  }

  // Tower lists *P1, *P2, *P3 (with optional space and optional size 1-100)
  if (/^\*\s*[Pp][123]/i.test(buffer)) {
    const tower = /^\*\s*[Pp]([123])(?:\s*(\d{1,3}))?$/i.exec(buffer);
    if (tower) {
      const listId = TOWER_LIST_IDS[tower[1] as "1" | "2" | "3"];
      if (tower[2] !== undefined) {
        return listResizeAction(listId, tower[2]);
      }
      return { kind: "action", action: { type: "toggleList", listId } };
    }
    return invalid("malformed tower list command");
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
        if (!row.allowResize) {
          return invalid("list cannot be resized");
        }
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
  if (maps && maps.length > 0) {
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
  const def = DEFAULT_GEOGRAPHIC_MAPS.find(
    (m) => m.mapId === normalized || String(m.id) === normalized || m.name === normalized,
  );
  if (def) {
    return {
      kind: "action",
      action:
        explicitState === undefined
          ? { type: "toggleVideoMap", mapId: def.mapId }
          : { type: "toggleVideoMap", mapId: def.mapId, explicitState },
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
  if (compact === "MAP") {
    return { kind: "incomplete" };
  }
  if (compact === "MAPALLOFF") {
    return { kind: "action", action: { type: "setAllVideoMaps", enabled: false } };
  }
  if (compact.startsWith("MAP")) {
    const rest = compact.slice(3);
    if (rest.length === 0) {
      return { kind: "incomplete" };
    }
    return mapToggleAction(rest, maps, undefined, layout);
  }
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
  "ackPointout",
  "setLeaderDir",
  "resetLeaderDir",
  "setLeaderLength",
  "setLeaderDirAndLength",
  "beaconatorSlew",
  "armPerTrackPtl",
  "associateFlightPlan",
  "caSingleTrackInhibit",
  "caPairSlew",
  "caPairToggle",
  "msawCurrentAlertInhibit",
  "toggleMsawProcessing",
  "createVfrActiveTrack",
]);

function compactTrackingBuffer(buffer: string): string {
  return buffer.replace(/\s+/g, "");
}

function isFlidPrefixToken(token: string): boolean {
  return /^[A-Z]{1,3}$/.test(token);
}

function isCompleteFlidToken(token: string): boolean {
  if (/^\d{4}$/.test(token)) return SQUAWK_CODE.test(token);
  return (
    FULL_CALLSIGN.test(token) ||
    SUFFIX_CALLSIGN.test(token) ||
    SQUAWK_CODE.test(token) ||
    /^\d{1,2}$/.test(token)
  );
}

function parseTermIdentity(rest: string): PreviewCommandResult {
  const match = /^(\S+?)(?:\/([APE]))?(?: ((?:[01]\d|2[0-3])[0-5]\d))?$/.exec(rest);
  if (!match || (match[3] !== undefined && /^\d{1,2}$/.test(match[1]!))) return invalid("FORMAT");
  const flid = match[1]!;
  if (!isCompleteFlidToken(flid) || flid === "ALL") return invalid("FORMAT");
  return {
    kind: "action",
    action: {
      type: "termCntl",
      flid,
      ...(match[2] ? { flightType: match[2] as "A" | "P" | "E" } : {}),
      ...(match[3] ? { coordinationTime: match[3] } : {}),
    },
  };
}

function parseTrackFlidRest(kind: "initCntl" | "termCntl", rest: string): PreviewCommandResult {
  if (rest.length === 0) {
    return { kind: "action", action: { type: kind } };
  }
  if (kind === "termCntl" && rest === "ALL") {
    return invalid("TERM CNTL ALL");
  }
  if (kind === "termCntl" && (rest.includes("/") || rest.includes(" "))) {
    return parseTermIdentity(rest);
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
 * `*LA` / `*BCN` tracking and display commands. `*F` is handled by the
 * altitude-filter parser above and is never a forced-FDB command.
 */
export function parseTrackingCommand(buffer: string): PreviewCommandResult | null {
  const compact = compactTrackingBuffer(buffer);
  const spaced = buffer.trim().toUpperCase().replace(/\s+/g, " ");
  if (compact === "**F") {
    return { kind: "action", action: { type: "clearAllForcedFdb" } };
  }
  if (compact.startsWith("/")) {
    if (/^\/\S+(?:\/[APE])? \d{4}$/.test(spaced)) {
      return parseTrackFlidRest("termCntl", spaced.slice(1));
    }
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
  if (/^\d{2}$/.test(compact)) {
    return { type: "associateFlightPlan", index: Number(compact) };
  }
  return null;
}

export function isTrackingSlewAction(action: PreviewArmedAction | null): boolean {
  return action != null && TRACKING_SLEW_TYPES.has(action.type);
}

function parseDeleteCommand(buffer: string): PreviewCommandResult | null {
  const upper = buffer.toUpperCase().trim();
  if (!upper.startsWith("*DEL") && !upper.startsWith("* DEL")) {
    return null;
  }
  const matchBare = /^\*\s*DEL\s*$/i.exec(buffer);
  if (matchBare) {
    return { kind: "incomplete" };
  }
  const match = /^\*\s*DEL\s*(\d{1,2})$/i.exec(buffer);
  if (match) {
    const idx = Number(match[1]);
    return { kind: "action", action: { type: "deleteFlightPlanEntry", index: idx } };
  }
  return invalid("invalid flight plan delete command");
}

/**
 * Analog: CRC MULTI FUNC M flight-plan field edit (TI 6191.409 §5.6.17).
 * Trainer delta: identity + field + value are committed in one typed preview
 * row; no radio clearance, Command IR, or pilot intent is emitted.
 */
function parseFlightPlanModification(buffer: string): PreviewCommandResult | null {
  const tokens = buffer.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens[0] === "*B") {
    if (tokens.length < 2) return { kind: "incomplete" };
    if (tokens.length !== 2) return invalid("FORMAT");
    return { kind: "action", action: { type: "releaseAssignedBeacon", flid: tokens[1]! } };
  }
  if (tokens[0] !== "*M") return null;
  // STARS §5.6.17 enters the field data directly after the identity.
  // Keep the labelled form below as a compatibility path.
  if (tokens.length === 3) {
    const identity = tokens[1]!;
    const value = tokens[2]!;
    if (/^(?:[0-7]{4}|\+|\/|\/[1-4]|A)$/.test(value)) {
      return {
        kind: "action",
        action: { type: "modifyFlightPlan", flid: identity, field: "assignedBeacon", value },
      };
    }
    if (/^Δ[A-Z0-9+/. *]{0,4}$/.test(value) || /^\+[A-Z0-9+/. *]{1,4}$/.test(value)) {
      return {
        kind: "action",
        action: {
          type: "modifyFlightPlan",
          flid: identity,
          field: "scratchpads",
          value,
          scratchpadSlot: value.startsWith("Δ") ? 1 : 2,
        },
      };
    }
    return invalid("FORMAT");
  }
  if (tokens.length < 4) return { kind: "incomplete" };
  const fields = new Set(["ACID", "TCP", "FIXES", "TYPE", "SP", "RALT", "AALT", "ETA", "PTD"]);
  if (!fields.has(tokens[2]!)) return invalid("FORMAT");
  const aliases: Record<
    string,
    | "acid"
    | "assignedBeacon"
    | "tcp"
    | "fixes"
    | "flightType"
    | "scratchpads"
    | "requestedAltitudeFt"
    | "assignedAltitudeFt"
    | "eta"
    | "ptd"
  > = {
    ACID: "acid",
    TCP: "tcp",
    FIXES: "fixes",
    TYPE: "flightType",
    SP: "scratchpads",
    RALT: "requestedAltitudeFt",
    AALT: "assignedAltitudeFt",
    ETA: "eta",
    PTD: "ptd",
  };
  const value = tokens.slice(3).join(" ");
  if (tokens[2] === "ETA" || tokens[2] === "PTD") {
    if (!/^(?:[01]\d|2[0-3])[0-5]\dE$/.test(value)) return invalid("FORMAT");
  } else if (tokens[2] === "AALT") {
    if (!/^A\d{3}$/.test(value)) return invalid("FORMAT");
  } else if (tokens[2] === "RALT") {
    if (!/^\d{3}$/.test(value)) return invalid("FORMAT");
  } else if (tokens[2] === "BCN") {
    if (!/^(?:[0-7]{4}|\+|\/|\/[1-4]|A)$/.test(value)) return invalid("FORMAT");
  } else if (tokens[2] === "SP") {
    const scratchpad = value.slice(1);
    if (
      !/^[Δ+][A-Z0-9+/. *]{0,4}$/.test(value) ||
      /^(?:NAT|CST|AMB|RDR|ADB|XXX|\d{3})/.test(scratchpad)
    )
      return invalid("ILL SCR");
  } else if (tokens[2] === "FIXES") {
    if (!/^(?:[A-Z0-9]{1,4})?\*(?:[A-Z0-9]{1,4})?(?:\*[APE])?$/.test(value))
      return invalid("FORMAT");
  }
  return {
    kind: "action",
    action: {
      type: "modifyFlightPlan",
      flid: tokens[1]!,
      field: aliases[tokens[2]!]!,
      value,
      ...(tokens[2] === "SP" ? { scratchpadSlot: value.startsWith("Δ") ? 1 : 2 } : {}),
    },
  };
}

/**
 * Authentic Raytheon STARS Conflict Alert preview grammar (TI 6191.409 Sections 7.3, 7.9–7.12).
 * - `CA K <trk>`: Single-track inhibit toggle.
 * - `CA P <trk1> [<trk2>]`: Pair inhibit/enable toggle. If trk2 omitted, waits for slew click on track 2.
 * - `CA C [E|I]`: Toggle, force enable, or force inhibit CA for qualifying owned pairs.
 * - `CA [ENTER]`: Enters two-click pending pair-inhibit slew mode.
 * - Disallowed supervisor commands / non-standard aliases (CA A, CA E, CA M, CA Q) are strictly rejected.
 */
export function parseCaCommand(buffer: string): PreviewCommandResult | null {
  const trimmed = buffer.trim();
  if (trimmed === "C") {
    return { kind: "incomplete" };
  }
  const upper = trimmed.toUpperCase();
  if (upper === "CA") {
    return { kind: "action", action: { type: "caPairSlew" } };
  }
  if (!upper.startsWith("CA")) {
    return null;
  }

  const afterCa = upper.slice(2);
  let sub = "";
  let restTokens: string[] = [];

  if (afterCa.startsWith(" ")) {
    const tokens = afterCa.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return { kind: "action", action: { type: "caPairSlew" } };
    }
    sub = tokens[0];
    restTokens = tokens.slice(1);
  } else {
    const firstChar = afterCa[0];
    sub = firstChar;
    const remaining = afterCa.slice(1).trim();
    restTokens = remaining.length > 0 ? remaining.split(/\s+/).filter(Boolean) : [];
  }

  if (sub === "K") {
    if (restTokens.length === 0) {
      return { kind: "action", action: { type: "caSingleTrackInhibit" } };
    }
    if (restTokens.length === 1) {
      return { kind: "action", action: { type: "caSingleTrackInhibit", trk: restTokens[0] } };
    }
    return invalid("invalid CA K command");
  }

  if (sub === "P") {
    if (restTokens.length === 0) {
      return { kind: "action", action: { type: "caPairToggle" } };
    }
    if (restTokens.length === 1) {
      return { kind: "action", action: { type: "caPairToggle", trk1: restTokens[0] } };
    }
    if (restTokens.length === 2) {
      return {
        kind: "action",
        action: { type: "caPairToggle", trk1: restTokens[0], trk2: restTokens[1] },
      };
    }
    return invalid("invalid CA P command");
  }

  if (sub === "C") {
    if (restTokens.length === 0) {
      return { kind: "action", action: { type: "caControllerPairs", mode: "toggle" } };
    }
    if (restTokens.length === 1 && (restTokens[0] === "E" || restTokens[0] === "I")) {
      return {
        kind: "action",
        action: { type: "caControllerPairs", mode: restTokens[0] === "E" ? "enable" : "inhibit" },
      };
    }
    return invalid("invalid CA C command");
  }

  return invalid("unknown CA command");
}

export function parsePreviewCommand(
  buffer: string,
  maps?: readonly LoadedVideoMap[],
  layout?: VideoMapTokenLayout,
): PreviewCommandResult {
  if (buffer === "") {
    return { kind: "incomplete" };
  }
  const del = parseDeleteCommand(buffer);
  if (del) {
    return del;
  }
  const modification = parseFlightPlanModification(buffer);
  if (modification) return modification;
  const ca = parseCaCommand(buffer);
  if (ca) {
    return ca;
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
  const msawMultiFunc = parseMsawMultiFuncCommand(buffer);
  if (msawMultiFunc) {
    return msawMultiFunc;
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
  if (key === "`" || key === "Backquote") {
    return "Δ";
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
