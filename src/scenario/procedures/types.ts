/**
 * Facility-generic procedure catalog (ICAO folder under `src/scenario/data/`).
 * Runtime geometry is local ENU NM (+x east, +y north of ARP). Optional
 * lat/lon is an import boundary for a later CIFP/NASR writer — omit on KDEM.
 * `airportId` is a string, not a `"KDEM"` literal.
 */

export type NavaidKind = "VOR" | "VORDME" | "NDB" | "DME" | "LOC" | "GS" | "OM" | "MM" | "IM";

export type NavFixKind = "WAYPOINT" | "INTERSECTION" | "FAF" | "MAPT" | "THRESHOLD";

/** ILS is the KDEM demo; the union is so later RNAV/VOR/LOC rows parse. */
export type ApproachType = "ILS" | "LOC" | "RNAV" | "VOR" | "NDB";

export interface GeoPoint {
  xNm: number;
  yNm: number;
  /** Present after a real CIFP/NASR import. Omit on KDEM demo. */
  latDeg?: number;
  lonDeg?: number;
}

export interface Navaid extends GeoPoint {
  /** Uppercase [A-Z0-9]{2,8} (ILS DME ids may be 7 chars, e.g. IDEMDME). */
  id: string;
  kind: NavaidKind;
  name?: string;
  freqMhz?: number;
  freqKhz?: number;
  class?: "T" | "L" | "H";
  courseDeg?: number;
  lengthNm?: number;
  beamHalfWidthDeg?: number;
  gsAngleDeg?: number;
  tchFt?: number;
  pairedWith?: string;
  note?: string;
}

export interface NavFix extends GeoPoint {
  id: string;
  kind: NavFixKind;
  formedBy?: string;
  note?: string;
}

export type AltConstraint =
  | { type: "AT"; altitudeFt: number }
  | { type: "AT_OR_ABOVE"; altitudeFt: number }
  | { type: "AT_OR_BELOW"; altitudeFt: number };

export type SpeedConstraint =
  | { type: "AT"; speedKt: number }
  | { type: "AT_OR_ABOVE"; speedKt: number }
  | { type: "AT_OR_BELOW"; speedKt: number };

export interface StarLeg {
  fixId: string;
  altConstraint?: AltConstraint;
  speedConstraint?: SpeedConstraint;
}

export interface StarTransition {
  id: string;
  name: string;
  legs: StarLeg[];
}

export interface StarProcedure {
  id: string;
  name: string;
  transitions: StarTransition[];
  common: StarLeg[];
  termination: "VECTORS";
}

export interface SidProcedure {
  id: string;
  name: string;
  runway?: string;
  legs: Array<{ fixId: string; altConstraint?: AltConstraint }>;
}

export interface MissedApproach {
  headingDeg: number;
  climbToFt: number;
  directFixId?: string;
}

/**
 * Published approach. Loc/GS numbers used for flying come from here plus
 * threshold `RW27`. Antenna xy on ILS navaids is documentation / future map;
 * GS origin stays the threshold unless a catalog `originNote` documents a shift.
 */
export interface ApproachProcedure {
  id: string;
  type: ApproachType;
  runway: string;
  name: string;
  locNavaidId?: string;
  gsNavaidId?: string;
  fafFixId?: string;
  thresholdFixId?: string;
  courseDeg?: number;
  lengthNm?: number;
  beamHalfWidthDeg?: number;
  gsAngleDeg?: number;
  tchFt?: number;
  fafDistanceNm?: number;
  gsInterceptAltFt?: number;
  daFt?: number;
  missed?: MissedApproach;
}

export interface ProcedureCatalog {
  schemaVersion: 1;
  airportId: string;
  name: string;
  magVarDeg: number;
  fieldElevFt: number;
  arp: { latDeg: number; lonDeg: number };
  originNote?: string;
  navaids: Navaid[];
  fixes: NavFix[];
  stars: StarProcedure[];
  approaches: ApproachProcedure[];
  sids: SidProcedure[];
}

/** Ids a later `DCT` command may resolve: named fixes and navaids. */
export function catalogDctIds(catalog: ProcedureCatalog): Set<string> {
  const ids = new Set<string>();
  for (const navaid of catalog.navaids) {
    ids.add(navaid.id);
  }
  for (const fix of catalog.fixes) {
    ids.add(fix.id);
  }
  return ids;
}
