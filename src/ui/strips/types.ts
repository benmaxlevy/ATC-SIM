/**
 * Terminal Flight Progress Strip domain models.
 * FAA Order 7110.65 Chapter 2 §3; virtual NAS terminal specifications.
 */

export type FlightRules = "IFR" | "VFR";

export type CWTCategory = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

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
  /** Equipment suffix, e.g. 'L', 'G' (Box 3). */
  equipmentSuffix?: string;
  /** Heavy aircraft flag (Box 3 prefix 'H/' when CWT inactive). */
  isHeavy?: boolean;
  /** Consolidated Wake Turbulence category 'A' through 'I' (Box 3 prefix when CWT active). */
  cwtCategory?: CWTCategory;
  /** Computer identification number / CID (Box 4). */
  cid?: string;
  /** Transponder beacon code / squawk (Box 5). */
  beaconCode: string;
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
  /** Flight rules: 'IFR' or 'VFR' (Box 9). */
  flightRules: FlightRules;
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
