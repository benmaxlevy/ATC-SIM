/**
 * Seeded ICAO airline+number assignment. Scenario JSON has routes only.
 * Unique full callsign and unique numeric tail for the session used-set.
 */

export interface TrafficAirline {
  readonly icao: string;
  readonly name: string;
  readonly aircraftTypes: readonly string[];
}

/** Curated US-carrier fleet mix used by generated trainer traffic. */
export const TRAFFIC_AIRLINES = [
  {
    icao: "AAL",
    name: "American Airlines",
    aircraftTypes: ["A320", "A321", "B738", "B739", "B788", "B789", "E145", "E170", "CRJ9"],
  },
  {
    icao: "DAL",
    name: "Delta Air Lines",
    aircraftTypes: [
      "A320",
      "A321",
      "A333",
      "B737",
      "B738",
      "B739",
      "B752",
      "B763",
      "B772",
      "B77W",
      "B788",
      "E170",
      "E190",
      "CRJ9",
    ],
  },
  {
    icao: "UAL",
    name: "United Airlines",
    aircraftTypes: [
      "A320",
      "A321",
      "B737",
      "B738",
      "B739",
      "B752",
      "B763",
      "B772",
      "B77W",
      "B788",
      "B789",
      "CRJ9",
    ],
  },
  {
    icao: "SWA",
    name: "Southwest Airlines",
    aircraftTypes: ["B737", "B738", "B739", "B38M", "B39M"],
  },
  { icao: "JBU", name: "JetBlue", aircraftTypes: ["A320", "A321", "E190"] },
  { icao: "ASA", name: "Alaska Airlines", aircraftTypes: ["B737", "B738", "B739", "B38M", "B39M"] },
  { icao: "FFT", name: "Frontier Airlines", aircraftTypes: ["A320", "A321", "A20N", "A21N"] },
  { icao: "SKW", name: "SkyWest Airlines", aircraftTypes: ["E170", "CRJ9"] },
  { icao: "EDV", name: "Endeavor Air", aircraftTypes: ["CRJ9"] },
  { icao: "RPA", name: "Republic Airways", aircraftTypes: ["E170", "E190"] },
  { icao: "UPS", name: "UPS Airlines", aircraftTypes: ["B744", "B752", "B763"] },
  { icao: "GTI", name: "Atlas Air", aircraftTypes: ["B744", "B748", "B77F", "B763"] },
] as const satisfies readonly TrafficAirline[];

export const TRAFFIC_AIRLINE_CODES = TRAFFIC_AIRLINES.map((airline) => airline.icao);
export type TrafficAirlineCode = (typeof TRAFFIC_AIRLINE_CODES)[number];

export interface TrafficPair {
  readonly airline: TrafficAirline;
  readonly aircraftType: string;
  readonly callsign: string;
}

const MAX_ALLOCATE_ATTEMPTS = 20_000;
const SQUAWK_MIN = 0o2000;
const SQUAWK_MAX = 0o7777;
const RESERVED_SQUAWKS = new Set(["7500", "7600", "7700"]);

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

/** Allocate an unused four-digit octal beacon, excluding emergency codes. */
export function allocateSquawkCode(usedCodes: Iterable<string> = []): string {
  const used = new Set<string>();
  for (const code of usedCodes) {
    const normalized = code.trim();
    if (normalized.length > 0) used.add(normalized);
  }
  for (let value = SQUAWK_MIN; value <= SQUAWK_MAX; value += 1) {
    const code = value.toString(8).padStart(4, "0");
    if (!RESERVED_SQUAWKS.has(code) && !used.has(code)) return code;
  }
  throw new Error("Unable to allocate a unique squawk code");
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
export function allocateCallsign(
  rng: () => number,
  used: Set<string>,
  airlineCode?: string,
): string {
  const tails = usedTails(used);
  for (let attempt = 0; attempt < MAX_ALLOCATE_ATTEMPTS; attempt += 1) {
    const airline =
      airlineCode ?? TRAFFIC_AIRLINES[Math.floor(rng() * TRAFFIC_AIRLINES.length)]!.icao;
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

/** Select a valid airline/type pair, then allocate its matching callsign. */
export function allocateTrafficPair(rng: () => number, used: Set<string>): TrafficPair {
  const airline = TRAFFIC_AIRLINES[Math.floor(rng() * TRAFFIC_AIRLINES.length)]!;
  const aircraftType = airline.aircraftTypes[Math.floor(rng() * airline.aircraftTypes.length)]!;
  return { airline, aircraftType, callsign: allocateCallsign(rng, used, airline.icao) };
}

/** Allocate a valid callsign for an already-authored aircraft type. */
export function allocateTrafficPairForType(
  rng: () => number,
  used: Set<string>,
  aircraftType: string,
): TrafficPair {
  const type = aircraftType.trim().toUpperCase();
  const eligible = TRAFFIC_AIRLINES.filter((airline) =>
    (airline.aircraftTypes as readonly string[]).includes(type),
  );
  const airline = (
    eligible.length > 0
      ? eligible[Math.floor(rng() * eligible.length)]
      : TRAFFIC_AIRLINES[Math.floor(rng() * TRAFFIC_AIRLINES.length)]
  )!;
  return { airline, aircraftType: type, callsign: allocateCallsign(rng, used, airline.icao) };
}
