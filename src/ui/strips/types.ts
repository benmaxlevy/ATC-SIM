/**
 * Terminal Flight Progress Strip domain models.
 * FAA Order 7110.65 Chapter 2 §3; virtual NAS terminal specifications.
 */

export type FlightRules = "IFR" | "VFR";

export type CWTCategory = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

/**
 * Shared physical terminal flight progress strip layout.
 *
 * FAA JO 7110.65 §2-3-4 assigns arrival and departure data to these numbered
 * spaces. The trainer keeps the optional spaces explicit so both strip types
 * can share one geometry while later policy decides which values are shown.
 */
export const TERMINAL_STRIP_LAYOUT = [
  ["1", "2", "3", "4"],
  ["5", "6", "7"],
  ["8", "8A", "8B"],
  ["9", "9A", "9B", "9C"],
  ["10", "11", "12", "13", "14", "15", "16", "17", "18"],
] as const;

export type TerminalStripColumn = (typeof TERMINAL_STRIP_LAYOUT)[number];
export type TerminalStripBox = TerminalStripColumn[number];

export interface StripAnnotationBoxes {
  /** Upper annotation box 8A (e.g. runway assignment). */
  box8A?: string;
  /** Upper annotation box 8B (e.g. departure/arrival fix or gate). */
  box8B?: string;
  /** Lower annotation boxes 10 to 18 (array of 9 elements). */
  boxes10to18?: string[];
}

export type AnnotationBoxKey =
  "8A" | "8B" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18";

export interface BaseStripData {
  /** Unique strip identifier. */
  id: string;
  /** Aircraft identification / callsign (Box 1). */
  acid: string;
  /** Revision index (Box 2). Undefined or 0 when unrevised. */
  revisionNumber?: number;
  /** Aircraft type designator, e.g. 'B738', 'A321', 'C172' (Box 3). */
  rawType: string;
  /** Number of aircraft when the strip represents more than one aircraft (Box 3). */
  aircraftCount?: number;
  /** Equipment suffix, e.g. 'L', 'G' (Box 3). */
  equipmentSuffix?: string;
  /** Heavy aircraft flag (Box 3 prefix 'H/' when CWT inactive). */
  isHeavy?: boolean;
  /** Consolidated Wake Turbulence category 'A' through 'I' (Box 3 prefix when CWT active). */
  cwtCategory?: CWTCategory;
  /** Computer identification number / CID (Box 4). */
  cid?: string;
  /** Assigned secondary-radar beacon code (Box 5). */
  beaconCode: string;
  /** Reported surveillance squawk; kept separate from the assigned Box 5 code. */
  reportedSquawk?: string;
  /** Explicit terminal spaces retained for the shared strip contract. */
  box9A?: string;
  box9B?: string;
  box9C?: string;
  /** Upper (8A, 8B) and lower (10–18) annotation boxes. */
  annotationBoxes?: StripAnnotationBoxes;
  /** Whether the strip is visually indented (cocked) horizontally. */
  indented?: boolean;
}

export interface DepartureStripData extends BaseStripData {
  stripType: "DEPARTURE";
  /** Proposed departure time in Zulu HHMM (Box 6). */
  proposedDepartureTime: string;
  /** Requested altitude in flight level or hundreds of feet (Box 7). */
  requestedAltitude: string;
  /** Departure airport ICAO/FAA code (Box 8). */
  departureAirport: string;
  /** Filed flight plan route (Box 9). */
  route: string;
  /** Destination airport ICAO/FAA code (Box 9). */
  destinationAirport: string;
  /** Clearance remarks or equipment notes (Box 9). */
  remarks?: string;
}

export interface ArrivalStripData extends BaseStripData {
  stripType: "ARRIVAL";
  /** Previous fix or reporting point (Box 6). */
  previousFix?: string;
  /** Coordination fix or entry point (Box 7). */
  coordinationFix: string;
  /** Estimated time of arrival over coordination fix in Zulu HHMM (Box 8). */
  estimatedTimeOfArrival: string;
  /** Altitude in hundreds of feet or an authorized facility notation (Box 9). */
  altitude?: string;
  /** Altitude and operational remarks (Box 9). */
  altitudeRemarks?: string;
  /** Retained flight-plan classification; not a terminal Box 9 value. */
  flightRules: FlightRules;
  /** Minimum fuel, destination, pointout, vector, or speed data (Box 9A). */
  minimumFuel?: string;
  /** Destination airport ICAO/FAA code (Box 9A). */
  destinationAirport: string;
  /** Inbound remarks or arrival procedure notes (Box 9A). */
  remarks?: string;
}

export type FlightStrip = DepartureStripData | ArrivalStripData;

/**
 * Interactive Strip Bay Separator / Divider bar.
 * Used by controllers to segregate flight strips within rack bays.
 */
export interface StripSeparator {
  /** Unique separator identifier. */
  id: string;
  /** Fixed separator type tag. */
  stripType: "SEPARATOR";
  /** Text label displayed on the separator bar (e.g. 'RWY 27L', 'DEPARTURES'). */
  label: string;
  /** Section rack where the separator resides ('departures' or 'arrivals'). */
  section: "departures" | "arrivals";
  /** Creation timestamp for sorting/debugging. */
  createdAt?: number;
}

export type RackStripItem = FlightStrip | StripSeparator;

export function isStripSeparator(item: unknown): item is StripSeparator {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as { stripType?: string }).stripType === "SEPARATOR"
  );
}
