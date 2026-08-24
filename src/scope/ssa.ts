/**
 * Analog: CRC STARS SSA / preview area (docs.virtualnas.net/crc/stars — R07).
 * FOA STARS display data / altitude filter (R05).
 * Trainer delta: altimeter is a constant `KDEM 29.92` stub (no METAR). Fused
 * `OK` is static trainer text, not Site/Fused radar health. Screen-fixed on the
 * PPI (not world-fixed). Scope status only — never a Command, readback, or
 * intent. Not NAS STARS.
 *
 * SSA FILTER / GI TEXT (T02-27): CRC analog DCB SSA FILTER hides individual SSA
 * fields; GI TEXT FILTER toggles facility-authored general-information lines
 * (ATIS letter stub, runway in use). Not a HUD, caption, tooltip, or METAR panel.
 * No live weather fetch. Altitude FILTER on MAIN is the Mode C window, not SSA FILTER.
 */

import { formatFilterReadout, type AltitudeFilter, type FilterEntry } from "./altitudeFilter";
import { formatDcbRangeReadout, type RangeNm } from "./camera";

/** Constant altimeter stub. Not a live weather / METAR feed. */
export const SSA_ALTIMETER_STUB = "KDEM 29.92";

/** Static fused-status stub. Not a live radar health system. */
export const SSA_FUSED_STUB = "OK";

/** CRC analog SSA FILTER cells we actually paint. No live CODES / SPC / QL / CON/CPL. */
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

/** SSA PTL n.n readout (T02-25 minutes). Not a predicted-track draw toggle. */
export function formatSsaPtl(minutes: number): string {
  const n = minutes === 0.5 ? "0.5" : Number(minutes).toFixed(1);
  return `PTL ${n}`;
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
  /** PTL minutes for the SSA `PTL n.n` stub. Default 1.0. */
  ptlMinutes?: number;
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

/**
 * SSA lines for the top-left PPI block: time, altimeter stub, FILTER hundreds,
 * RANGE n, optional OFF CNTR, fused OK, PTL n.n. Hidden SSA FILTER fields are
 * omitted. Pure strings — no canvas, no Command IR.
 */
export function buildSsaLines(input: SsaInput): string[] {
  const vis = input.visibility ?? defaultSsaVisibility();
  const lines: string[] = [];
  if (vis.TIME) {
    lines.push(formatSsaTime(input.simTimeMs));
  }
  if (vis.ALTSTG) {
    lines.push(SSA_ALTIMETER_STUB);
  }
  if (vis.FILTER) {
    lines.push(formatFilterReadout(input.filter, input.filterEntry));
  }
  if (vis.RANGE) {
    lines.push(formatDcbRangeReadout(input.rangeNm));
  }
  if (input.offCenter && vis.OFF_CNTR) {
    lines.push("OFF CNTR");
  }
  if (vis.STATUS) {
    lines.push(SSA_FUSED_STUB);
  }
  if (vis.PTL) {
    lines.push(formatSsaPtl(input.ptlMinutes ?? 1));
  }
  return lines;
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
