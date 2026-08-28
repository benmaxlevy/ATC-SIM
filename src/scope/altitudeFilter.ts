/**
 * Analog: FAA FOA STARS **altitude filter** / Mode C display (R05,
 * https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html);
 * CRC STARS altitude filter (R07). Compare Mode C hundreds, inclusive.
 *
 * Trainer delta: default 000–180 (show everything v1 can fly — not a third
 * “filter off” mode). Scope-focus `F` chord only — never always-on, never a
 * Command / readback. Out of filter: keep **target** + **history**; suppress
 * datablock, leader, and PTL. Strips still list everyone (T02-11). DCB FILTER
 * cell starts the same `F` chord (`beginFilterEntry`); apply uses
 * `tryApplyAltitudeFilter` (same max>=min predicate). Not an altitude cull or
 * visibility slider. Not NAS STARS.
 */

import { CHORD_TIMEOUT_MS, chordTimedOut, digitFromKey } from "./keymap";

/** Inclusive Mode C window in hundreds of feet (phase README decision 9). */
export interface AltitudeFilter {
  minHundreds: number; // 0–180 inclusive
  maxHundreds: number; // 0–180, >= min
}

export const FILTER_HUNDREDS_MIN = 0;
export const FILTER_HUNDREDS_MAX = 180;

/** Default altitude filter: 000–180, i.e. show all v1 Mode C. */
export const DEFAULT_ALTITUDE_FILTER: AltitudeFilter = {
  minHundreds: FILTER_HUNDREDS_MIN,
  maxHundreds: FILTER_HUNDREDS_MAX,
};

export type FilterEntryPhase = "idle" | "min" | "max";

/** Scope-focus F chord. Idle when not entering. Display only. */
export interface FilterEntry {
  phase: FilterEntryPhase;
  /** 0–3 digits for the active min or max field. */
  digits: string;
  lastKeyAtMs: number;
  previous: AltitudeFilter;
  /** Min hundreds after the first Enter; used in `max` phase. */
  pendingMin: number;
}

export function cloneAltitudeFilter(f: AltitudeFilter): AltitudeFilter {
  return { minHundreds: f.minHundreds, maxHundreds: f.maxHundreds };
}

export function idleFilterEntry(filter: AltitudeFilter): FilterEntry {
  return {
    phase: "idle",
    digits: "",
    lastKeyAtMs: 0,
    previous: cloneAltitudeFilter(filter),
    pendingMin: filter.minHundreds,
  };
}

export function clampFilterHundreds(n: number): number {
  if (!Number.isFinite(n)) {
    return FILTER_HUNDREDS_MIN;
  }
  return Math.max(FILTER_HUNDREDS_MIN, Math.min(FILTER_HUNDREDS_MAX, Math.round(n)));
}

/** 1–3 digits (`50` → 050). Invalid / empty → null. Clamps 0–180. */
export function parseFilterHundreds(digits: string): number | null {
  if (!/^\d{1,3}$/.test(digits)) {
    return null;
  }
  return clampFilterHundreds(Number.parseInt(digits, 10));
}

/**
 * Preview `*LA` hundreds: exactly 3 digits, 0–180 inclusive.
 * Out of range is null (no clamp) so `*LA 000 999` can INV.
 */
export function parseStrictFilterHundreds(digits: string): number | null {
  if (!/^\d{3}$/.test(digits)) {
    return null;
  }
  const n = Number.parseInt(digits, 10);
  if (n < FILTER_HUNDREDS_MIN || n > FILTER_HUNDREDS_MAX) {
    return null;
  }
  return n;
}

/**
 * Mode C (feet) vs the altitude filter, inclusive hundreds.
 * Non-finite Mode C is treated as outside the band.
 */
export function inAltitudeFilter(modeCFt: number, f: AltitudeFilter): boolean {
  if (!Number.isFinite(modeCFt)) {
    return false;
  }
  const h = Math.round(modeCFt / 100);
  return h >= f.minHundreds && h <= f.maxHundreds;
}

export function formatFilterHundreds(hundreds: number): string {
  return String(clampFilterHundreds(hundreds)).padStart(3, "0");
}

/**
 * Apply min/max hundreds when max >= min. Same predicate as the scope-focus
 * `F` chord commit. Invalid windows do not mutate `filter`.
 */
export function tryApplyAltitudeFilter(
  filter: AltitudeFilter,
  minHundreds: number,
  maxHundreds: number,
): boolean {
  if (!Number.isFinite(minHundreds) || !Number.isFinite(maxHundreds)) {
    return false;
  }
  const min = clampFilterHundreds(minHundreds);
  const max = clampFilterHundreds(maxHundreds);
  if (max < min) {
    return false;
  }
  filter.minHundreds = min;
  filter.maxHundreds = max;
  return true;
}

/** FIL fields: parse 1–3 digit hundreds, then the same apply predicate. */
export function tryApplyAltitudeFilterDigits(
  filter: AltitudeFilter,
  minDigits: string,
  maxDigits: string,
): boolean {
  const min = parseFilterHundreds(minDigits);
  const max = parseFilterHundreds(maxDigits);
  if (min === null || max === null) {
    return false;
  }
  return tryApplyAltitudeFilter(filter, min, max);
}

function padPartialDigits(digits: string): string {
  return (digits + "___").slice(0, 3);
}

/** Hundreds band only (`000-180` / `050-___`). DCB FILTER second row. */
export function formatFilterBand(filter: AltitudeFilter, entry: FilterEntry): string {
  if (entry.phase === "idle") {
    return `${formatFilterHundreds(filter.minHundreds)}-${formatFilterHundreds(filter.maxHundreds)}`;
  }
  const min =
    entry.phase === "max" ? formatFilterHundreds(entry.pendingMin) : padPartialDigits(entry.digits);
  const max = entry.phase === "min" ? "___" : padPartialDigits(entry.digits);
  return `${min}-${max}`;
}

/**
 * Idle: `FILTER 000-180` (glossary / DCB label).
 * Entry: `FIL 050-___` while typing hundreds.
 */
export function formatFilterReadout(filter: AltitudeFilter, entry: FilterEntry): string {
  const band = formatFilterBand(filter, entry);
  return entry.phase === "idle" ? `FILTER ${band}` : `FIL ${band}`;
}

export function beginFilterEntry(entry: FilterEntry, filter: AltitudeFilter, nowMs: number): void {
  entry.phase = "min";
  entry.digits = "";
  entry.lastKeyAtMs = nowMs;
  entry.previous = cloneAltitudeFilter(filter);
  entry.pendingMin = filter.minHundreds;
}

export function cancelFilterEntry(entry: FilterEntry, filter: AltitudeFilter): void {
  const previous = cloneAltitudeFilter(entry.previous);
  filter.minHundreds = previous.minHundreds;
  filter.maxHundreds = previous.maxHundreds;
  const idle = idleFilterEntry(previous);
  entry.phase = idle.phase;
  entry.digits = idle.digits;
  entry.lastKeyAtMs = idle.lastKeyAtMs;
  entry.previous = idle.previous;
  entry.pendingMin = idle.pendingMin;
}

export function expireFilterEntry(
  entry: FilterEntry,
  filter: AltitudeFilter,
  nowMs: number,
): boolean {
  if (entry.phase === "idle") {
    return false;
  }
  if (!chordTimedOut(entry.lastKeyAtMs, nowMs, CHORD_TIMEOUT_MS)) {
    return false;
  }
  cancelFilterEntry(entry, filter);
  return true;
}

function commitFilterField(entry: FilterEntry, filter: AltitudeFilter, nowMs: number): void {
  const parsed = parseFilterHundreds(entry.digits);
  if (parsed === null) {
    cancelFilterEntry(entry, filter);
    return;
  }
  if (entry.phase === "min") {
    entry.pendingMin = parsed;
    entry.phase = "max";
    entry.digits = "";
    entry.lastKeyAtMs = nowMs;
    return;
  }
  if (!tryApplyAltitudeFilter(filter, entry.pendingMin, parsed)) {
    cancelFilterEntry(entry, filter);
    return;
  }
  const idle = idleFilterEntry(filter);
  entry.phase = idle.phase;
  entry.digits = idle.digits;
  entry.lastKeyAtMs = idle.lastKeyAtMs;
  entry.previous = idle.previous;
  entry.pendingMin = idle.pendingMin;
}

/**
 * Scope-focus F chord. Returns true when the key is consumed (including
 * reject/cancel). Timeout restores the previous altitude filter with no throw.
 */
export function handleFilterEntryKey(
  entry: FilterEntry,
  filter: AltitudeFilter,
  key: string,
  nowMs: number,
): boolean {
  if (expireFilterEntry(entry, filter, nowMs)) {
    return false;
  }
  if (entry.phase === "idle") {
    return false;
  }
  if (key === "Escape") {
    cancelFilterEntry(entry, filter);
    return true;
  }
  if (key === "Backspace") {
    entry.digits = entry.digits.slice(0, -1);
    entry.lastKeyAtMs = nowMs;
    return true;
  }
  if (key === "Enter" || key === "NumpadEnter") {
    commitFilterField(entry, filter, nowMs);
    return true;
  }
  const digit = digitFromKey(key);
  if (digit !== null) {
    if (entry.digits.length < 3) {
      entry.digits += String(digit);
    }
    entry.lastKeyAtMs = nowMs;
    return true;
  }
  cancelFilterEntry(entry, filter);
  return false;
}
