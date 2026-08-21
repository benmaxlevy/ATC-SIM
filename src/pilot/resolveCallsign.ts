/**
 * Analog: vice typed ATC tokens resolve full callsign or unambiguous suffix (R08).
 * Trainer delta: World.selectedAircraftId supplies callsign when the token is
 * omitted; ambiguous suffix rejects and nobody moves. Not NAS STARS.
 *
 * World-aware on purpose so `@parse` stays World-free. Does not apply intent.
 */

import type { Aircraft, World } from "@core";

export type ResolveReason =
  "UNKNOWN_CALLSIGN" | "AMBIGUOUS_CALLSIGN" | "NO_CALLSIGN_OR_SELECTION" | "SELECTED_NOT_FOUND";

export type ResolveResult =
  { ok: true; aircraftId: string; callsign: string } | { ok: false; reason: ResolveReason };

/** Full callsign: three-letter ICAO prefix + 1–4 digits + optional letter. */
const FULL_CALLSIGN = /^[A-Z]{3}[0-9]{1,4}[A-Z]?$/;

/** Numeric suffix (digits / digits+letter) used when the airline prefix is omitted. */
const SUFFIX_CALLSIGN = /^[0-9]{1,4}[A-Z]?$/;

/** Strip ICAO prefix `[A-Z]{3}`; remainder must equal a suffix token (`123` ≠ `123A`). */
export function numericTail(callsign: string): string {
  return callsign.replace(/^[A-Z]{3}/, "");
}

export function resolveCallsign(input: {
  callsignToken: string | null;
  world: World;
}): ResolveResult {
  const token = input.callsignToken;
  if (token !== null) {
    return resolveExplicitToken(token, input.world.aircraft);
  }
  return resolveFromSelection(input.world);
}

function resolveExplicitToken(token: string, aircraft: Aircraft[]): ResolveResult {
  const matches = matchAircraft(token, aircraft);
  if (matches.length === 1) {
    const ac = matches[0]!;
    return { ok: true, aircraftId: ac.id, callsign: ac.callsign };
  }
  if (matches.length === 0) {
    return { ok: false, reason: "UNKNOWN_CALLSIGN" };
  }
  return { ok: false, reason: "AMBIGUOUS_CALLSIGN" };
}

function matchAircraft(token: string, aircraft: Aircraft[]): Aircraft[] {
  if (FULL_CALLSIGN.test(token)) {
    return aircraft.filter((ac) => ac.callsign === token);
  }
  if (SUFFIX_CALLSIGN.test(token)) {
    return aircraft.filter((ac) => numericTail(ac.callsign) === token);
  }
  return [];
}

function resolveFromSelection(world: World): ResolveResult {
  if (world.selectedAircraftId === null) {
    return { ok: false, reason: "NO_CALLSIGN_OR_SELECTION" };
  }
  const selected = world.aircraft.find((ac) => ac.id === world.selectedAircraftId);
  if (!selected) {
    return { ok: false, reason: "SELECTED_NOT_FOUND" };
  }
  return { ok: true, aircraftId: selected.id, callsign: selected.callsign };
}
