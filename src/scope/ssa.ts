/**
 * Analog: CRC STARS SSA / preview area (docs.virtualnas.net/crc/stars — R07).
 * FOA STARS display data / altitude filter (R05).
 * Trainer delta: altimeter is a constant `KDEM 29.92` stub (no METAR). Fused
 * `OK` is static trainer text, not Site/Fused radar health. Screen-fixed on the
 * PPI (not world-fixed). Scope status only — never a Command, readback, or
 * intent. Not NAS STARS.
 */

import {
  formatFilterReadout,
  type AltitudeFilter,
  type FilterEntry,
} from "./altitudeFilter";
import { formatDcbRangeReadout, type RangeNm } from "./camera";

/** Constant altimeter stub. Not a live weather / METAR feed. */
export const SSA_ALTIMETER_STUB = "KDEM 29.92";

/** Static fused-status stub. Not a live radar health system. */
export const SSA_FUSED_STUB = "OK";

export interface SsaInput {
  simTimeMs: number;
  rangeNm: RangeNm;
  /** True when view center ≠ airport ref (`OFF CNTR`). */
  offCenter: boolean;
  filter: AltitudeFilter;
  filterEntry: FilterEntry;
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
 * RANGE n, optional OFF CNTR, fused OK. Pure strings — no canvas, no Command IR.
 */
export function buildSsaLines(input: SsaInput): string[] {
  const lines = [
    formatSsaTime(input.simTimeMs),
    SSA_ALTIMETER_STUB,
    formatFilterReadout(input.filter, input.filterEntry),
    formatDcbRangeReadout(input.rangeNm),
  ];
  if (input.offCenter) {
    lines.push("OFF CNTR");
  }
  lines.push(SSA_FUSED_STUB);
  return lines;
}
