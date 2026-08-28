/**
 * Analog: CRC STARS SSA / preview area (docs.virtualnas.net/crc/stars — R07).
 * FOA STARS display data / altitude filter (R05).
 * Screen-fixed on the PPI (not world-fixed). Scope status only — never a Command,
 * readback, or intent. Not NAS STARS.
 *
 * SSA FILTER / GI TEXT (T02-27): CRC analog DCB SSA FILTER hides individual SSA
 * fields; GI TEXT FILTER toggles facility-authored general-information lines
 * (ATIS letter stub, runway in use). Not a HUD, caption, tooltip, or METAR panel.
 * No live weather fetch. Altitude FILTER on MAIN is the Mode C window, not SSA FILTER.
 */

import { formatFilterReadout, type AltitudeFilter, type FilterEntry } from "./altitudeFilter";
import { formatDcbRangeReadout, type RangeNm } from "./camera";

/** Default primary altimeter setting. */
export const SSA_ALTIMETER_STUB = "30.17";

/** Static fused-status stub. Not a live radar health system. */
export const SSA_FUSED_STUB = "OK/OK/NA FUSED";

/** Default configured terminal airport altimeters. */
export const DEFAULT_SSA_AIRPORT_ALTIMETERS: { airportCode: string; altimeter: string }[] = [
  { airportCode: "BOS", altimeter: "30.17" },
  { airportCode: "BED", altimeter: "30.17" },
  { airportCode: "OWD", altimeter: "30.18" },
  { airportCode: "BVY", altimeter: "30.17" },
  { airportCode: "LWM", altimeter: "30.19" },
];

/** Default active beacon code assignment banks. */
export const DEFAULT_SSA_BEACON_BANKS = ["2364", "56", "12"];

/** CRC analog SSA FILTER cells we actually paint. */
export const SSA_FILTER_FIELDS = [
  "TIME",
  "ALTSTG",
  "FILTER",
  "RANGE",
  "OFF_CNTR",
  "STATUS",
  "PTL",
] as const;
export type SsaFilterField = (typeof SSA_FILTER_FIELDS)[number];

export type SsaVisibility = Record<SsaFilterField, boolean>;

export function defaultSsaVisibility(): SsaVisibility {
  return {
    TIME: true,
    ALTSTG: true,
    FILTER: true,
    RANGE: true,
    OFF_CNTR: true,
    STATUS: true,
    PTL: true,
  };
}

/** Facility GI TEXT slots (CRC analog: up to 10 authored lines). */
export const GI_SLOT_COUNT = 10;

export function padGiTextLines(raw: readonly string[] | undefined): string[] {
  return Array.from({ length: GI_SLOT_COUNT }, (_, i) => {
    const value = raw?.[i];
    return typeof value === "string" ? value : "";
  });
}

/** Default: every non-empty GI line on. Empty slots stay unused (cannot paint). */
export function defaultGiVisibility(lines: readonly string[]): boolean[] {
  return padGiTextLines(lines).map((line) => line.length > 0);
}

/** SSA PTL readout (PTL: n.n or PTL n.n). */
export function formatSsaPtl(minutes: number): string {
  const n = minutes === 0.5 ? "0.5" : Number(minutes).toFixed(1);
  return `PTL: ${n}`;
}

export interface SsaAirportAltimeter {
  airportCode: string;
  altimeter: string;
}

export interface SsaInput {
  simTimeMs: number;
  rangeNm: RangeNm;
  /** True when view center ≠ airport ref (`OFF CNTR`). */
  offCenter: boolean;
  filter: AltitudeFilter;
  filterEntry: FilterEntry;
  /** SSA FILTER visibility. Omit = all existing fields on. */
  visibility?: SsaVisibility;
  /** PTL minutes for the SSA PTL readout. Default 1.0. */
  ptlMinutes?: number;
  /** Position subset number / TCP ID. Default 1. */
  subset?: number | string;
  /** Primary airport identifier. Default derived from scenario (e.g. "KDEM" or "BOS"). */
  airportCode?: string;
  /** Primary airport altimeter setting. Default "30.17" or scenario altimeter. */
  primaryAltimeter?: string;
  /** System / Network status string. Default "OK/OK/NA". */
  systemStatus?: string;
  /** Surveillance / Radar processing mode. Default "FUSED". */
  surveillanceMode?: string;
  /** Beacon code selection blocks. Default ["2364", "56", "12"]. */
  beaconBanks?: string[];
  /** Active Special Purpose Codes in red (e.g. ["RF", "EM"]). */
  spcAlerts?: string[];
  /** Associated track altitude filter [min, max] in hundreds. */
  associatedFilter?: { minHundreds: number; maxHundreds: number };
  /** Unassociated track altitude filter [min, max] in hundreds. */
  unassociatedFilter?: { minHundreds: number; maxHundreds: number };
  /** Terminal satellite and primary airport altimeter list. */
  airportAltimeters?: SsaAirportAltimeter[];
  /** Active Quicklook status string. Default "ALL". */
  quicklookStatus?: string;
  /** Active CRDA RPC or consolidation status. Derived dynamically from scenario. */
  crdaRpcStatus?: string;
  /** Whether an active alert (MSAW / CA / system) exists for top alert indicator ▼. */
  hasAlert?: boolean;
}

/** Sim clock as `HHMM/SS` (CRC SSA analog). Wall clock is unused. */
export function formatSsaTime(simTimeMs: number): string {
  const ms = Number.isFinite(simTimeMs) ? Math.max(0, simTimeMs) : 0;
  const totalSec = Math.floor(ms / 1000);
  const ss = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mm = totalMin % 60;
  const hh = Math.floor(totalMin / 60) % 24;
  return `${pad2(hh)}${pad2(mm)}/${pad2(ss)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export type SsaLineStyle = "normal" | "alert" | "spc";

export interface SsaRenderLine {
  text: string;
  style: SsaLineStyle;
}

/**
 * Builds structured SSA lines with styling metadata (alert indicator, red SPC, etc.).
 */
export function buildSsaRenderLines(input: SsaInput): SsaRenderLine[] {
  const vis = input.visibility ?? defaultSsaVisibility();
  const result: SsaRenderLine[] = [];

  // 1. Alert Indicator ▼ - red triangle enclosed in thin green border
  result.push({ text: "▼", style: "alert" });

  // 2. TCP / Display Subset: (1)
  const subset = input.subset ?? 1;
  result.push({ text: `(${subset})`, style: "normal" });

  // 3. Zulu Time / Sec + Primary Altimeter: 1620/02  30.17
  if (vis.TIME) {
    const timeStr = formatSsaTime(input.simTimeMs);
    const altStr = input.primaryAltimeter ?? SSA_ALTIMETER_STUB;
    result.push({ text: `${timeStr}  ${altStr}`, style: "normal" });
  } else if (vis.ALTSTG) {
    const altStr = input.primaryAltimeter ?? SSA_ALTIMETER_STUB;
    result.push({ text: altStr, style: "normal" });
  }

  // 4. System / Network Status + Radar Mode: OK/OK/NA FUSED
  if (vis.STATUS) {
    const netStatus = input.systemStatus ?? "OK/OK/NA";
    const mode = input.surveillanceMode ?? "FUSED";
    result.push({
      text: `${netStatus} ${mode}`,
      style: netStatus.includes("NA/NA/NA") ? "alert" : "normal",
    });
  }

  // 5. Beacon Code Selection Blocks: 2364  56  12
  const banks = input.beaconBanks ?? DEFAULT_SSA_BEACON_BANKS;
  if (banks.length > 0) {
    result.push({ text: banks.join("  "), style: "normal" });
  }

  // 6. Special Purpose Codes in Red: RF  EM
  const spcs = input.spcAlerts ?? [];
  if (spcs.length > 0) {
    result.push({ text: spcs.join("  "), style: "spc" });
  }

  // 7. Range + Predicted Track Line: 40NM PTL: 3.0
  const ptlMinutes = input.ptlMinutes ?? 1.0;
  const ptlText = formatSsaPtl(ptlMinutes);
  if (vis.RANGE && vis.PTL) {
    result.push({ text: `${input.rangeNm}NM ${ptlText}`, style: "normal" });
  } else if (vis.RANGE) {
    result.push({ text: formatDcbRangeReadout(input.rangeNm), style: "normal" });
  } else if (vis.PTL) {
    result.push({ text: ptlText, style: "normal" });
  }

  // Optional OFF CNTR
  if (input.offCenter && vis.OFF_CNTR) {
    result.push({ text: "OFF CNTR", style: "normal" });
  }

  // 8. Dual Altitude Filters: 001 160 U 001 160 A
  if (vis.FILTER) {
    if (input.filterEntry && input.filterEntry.phase !== "idle") {
      result.push({ text: formatFilterReadout(input.filter, input.filterEntry), style: "normal" });
    } else {
      const uMin = input.unassociatedFilter?.minHundreds ?? input.filter.minHundreds;
      const uMax = input.unassociatedFilter?.maxHundreds ?? input.filter.maxHundreds;
      const aMin = input.associatedFilter?.minHundreds ?? input.filter.minHundreds;
      const aMax = input.associatedFilter?.maxHundreds ?? input.filter.maxHundreds;
      result.push({
        text: `${pad3(uMin)} ${pad3(uMax)} U ${pad3(aMin)} ${pad3(aMax)} A`,
        style: "normal",
      });
    }
  }

  // 9. Active CRDA RPC / Consolidation Status: derived from scenario airport or explicit status
  const airport = input.airportCode ?? "KDEM";
  const defaultCrda = airport === "BOS" ? "*S1 BOS 27/22L" : `*S1 ${airport} 27/09`;
  const crdaStatus = input.crdaRpcStatus ?? defaultCrda;
  result.push({ text: crdaStatus, style: "normal" });

  return result;
}

/**
 * SSA lines for the top-left PPI block.
 * Pure strings — backward compatible string representation.
 */
export function buildSsaLines(input: SsaInput): string[] {
  return buildSsaRenderLines(input).map((line) => line.text);
}

/**
 * Visible non-empty GI TEXT lines. Empty authored slots never paint, even if
 * the GI FILTER cell is on. Sibling of buildSsaLines — canvas text, not a list widget.
 */
export function buildGiLines(lines: readonly string[], visible: readonly boolean[]): string[] {
  const padded = padGiTextLines(lines);
  const out: string[] = [];
  for (let i = 0; i < GI_SLOT_COUNT; i++) {
    const text = padded[i]!;
    if (text === "") {
      continue;
    }
    if (visible[i] === false) {
      continue;
    }
    out.push(text);
  }
  return out;
}
