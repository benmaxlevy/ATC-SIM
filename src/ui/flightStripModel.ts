/**
 * Analog: FAA PCG flight progress strip (R02) / 7110.65 ch. 2 §3 strip posting.
 * vice (R08) has a flight-strip window; CRC STARS (R07) lists plans on the PPI.
 * Trainer delta: callsign + assigned heading/altitude/speed only — not FDIO,
 * vStrips, ERAM, scratchpad, or sequence numbers. T02-20 presents this list
 * on the PPI; this module stays the data model. Not NAS STARS.
 *
 * Strips are a view of World intent. They never emit Command IR.
 */

import { normalizeHeading, setSelectedAircraft, type Aircraft, type World } from "@core";

/** Window heading — glossary **flight strip** / **strip bay**. */
export const STRIP_BAY_HEADING = "Flight strips";

export const STRIP_BAY_EMPTY = "Strip bay empty";

export interface FlightStripView {
  aircraftId: string;
  callsign: string;
  /** `H270` or `H---` when assigned heading is missing/non-finite. */
  headingField: string;
  /** Assigned altitude in hundreds, e.g. `A030` — not Mode C. */
  altitudeField: string;
  /** Assigned speed, e.g. `S210` — not ground speed. */
  speedField: string;
  selected: boolean;
}

/**
 * Callsign lexicographic (ASCII code units). Sort key is callsign only so
 * moving targets do not reshuffle the bay every frame.
 */
export function compareCallsigns(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function sortStripsByCallsign<T extends { callsign: string }>(items: readonly T[]): T[] {
  return items.slice().sort((left, right) => compareCallsigns(left.callsign, right.callsign));
}

export function formatAssignedHeading(headingDeg: number | null | undefined): string {
  if (headingDeg == null || !Number.isFinite(headingDeg)) {
    return "H---";
  }
  const deg = normalizeHeading(Math.round(headingDeg));
  return `H${String(deg).padStart(3, "0")}`;
}

/** Hundreds of feet, zero-padded to 3 — same contract as datablocks (`A030`). */
export function formatAssignedAltitudeHundreds(altitudeFt: number): string {
  if (!Number.isFinite(altitudeFt)) {
    return "A---";
  }
  const hundreds = Math.max(0, Math.round(altitudeFt / 100));
  return `A${String(hundreds).padStart(3, "0")}`;
}

export function formatAssignedSpeed(speedKt: number): string {
  if (!Number.isFinite(speedKt)) {
    return "S---";
  }
  const kt = Math.max(0, Math.round(speedKt));
  return `S${String(kt).padStart(3, "0")}`;
}

function stripFromAircraft(ac: Aircraft, selectedAircraftId: string | null): FlightStripView {
  return {
    aircraftId: ac.id,
    callsign: ac.callsign,
    headingField: formatAssignedHeading(ac.intent.assignedHeadingDeg),
    altitudeField: formatAssignedAltitudeHundreds(ac.intent.assignedAltitudeFt),
    speedField: formatAssignedSpeed(ac.intent.assignedSpeedKt),
    selected: ac.id === selectedAircraftId,
  };
}

/**
 * One strip per aircraft, top-to-bottom by callsign.
 * Altitude filter (when present) must not hide strips — this list ignores Mode C.
 * Reads intent at call time; do not copy into long-lived strip-local state.
 */
export function stripsFromWorld(world: World): FlightStripView[] {
  const sorted = sortStripsByCallsign(world.aircraft);
  return sorted.map((ac) => stripFromAircraft(ac, world.selectedAircraftId));
}

/**
 * Shared selection id with the PPI. Scope action only: no parser, no readback,
 * no intent write.
 */
export function selectTrackFromStrip(world: World, aircraftId: string): void {
  setSelectedAircraft(world, aircraftId);
}
