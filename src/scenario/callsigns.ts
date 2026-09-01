/**
 * Seeded ICAO airline+number assignment. Scenario JSON has routes only.
 * Unique full callsign and unique numeric tail for the session used-set.
 */

export const TRAFFIC_AIRLINES = [
  "AAL",
  "DAL",
  "UAL",
  "SWA",
  "JBU",
  "ASA",
  "FFT",
  "SKW",
  "EDV",
  "RPA",
] as const;

export type TrafficAirline = (typeof TRAFFIC_AIRLINES)[number];

const MAX_ALLOCATE_ATTEMPTS = 20_000;

export function callsignNumericTail(callsign: string): string {
  const rest = callsign
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]{3}/, "");
  const digits = rest.match(/^\d+/);
  return digits?.[0] ?? rest;
}

export function usedCallsignSet(callsigns: Iterable<string> = []): Set<string> {
  const used = new Set<string>();
  for (const callsign of callsigns) {
    const next = callsign.trim().toUpperCase();
    if (next.length > 0) {
      used.add(next);
    }
  }
  return used;
}

function usedTails(used: ReadonlySet<string>): Set<string> {
  const tails = new Set<string>();
  for (const callsign of used) {
    tails.add(callsignNumericTail(callsign));
  }
  return tails;
}

/**
 * Pick one unused `AIRLINE`+1–9999. Mutates `used` to include the result.
 */
export function allocateCallsign(rng: () => number, used: Set<string>): string {
  const tails = usedTails(used);
  for (let attempt = 0; attempt < MAX_ALLOCATE_ATTEMPTS; attempt += 1) {
    const airline = TRAFFIC_AIRLINES[Math.floor(rng() * TRAFFIC_AIRLINES.length)]!;
    const flightNum = 1 + Math.floor(rng() * 9999);
    const callsign = `${airline}${flightNum}`;
    const tail = String(flightNum);
    if (!used.has(callsign) && !tails.has(tail)) {
      used.add(callsign);
      tails.add(tail);
      return callsign;
    }
  }
  throw new Error("Unable to allocate a unique callsign");
}
