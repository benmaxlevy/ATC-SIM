/**
 * Airport-independent CIFP source model (T04-31).
 *
 * Produced by the developer-tool parser from local ARINC 424 / comma-subset
 * text. T04-32 (spatial seed) and T04-33 (procedure closure) import these
 * types. Runtime `src/` must not import this module.
 *
 * Coordinates stay source `latDeg` / `lonDeg`. Scenario-local ENU (`xNm` /
 * `yNm`) is derived only when emitting a `ProcedureCatalog` pack.
 */

export type CifpDialect = "fixed-width" | "comma-separated";

export type CifpDiagnosticSeverity = "error" | "warning" | "skip";

export interface CifpRecordIdentity {
  /** Stable key: section + airport + record id + discriminator. */
  key: string;
  section: string;
  airportId?: string;
  recordId: string;
}

export interface SourceLatLon {
  latDeg: number;
  lonDeg: number;
}

export interface CifpDiagnostic {
  severity: CifpDiagnosticSeverity;
  code: string;
  message: string;
  lineNo?: number;
  airportId?: string;
  section?: string;
  identity?: string;
}

export interface NormalizedAirport {
  identity: CifpRecordIdentity;
  airportId: string;
  name: string;
  magVarDeg: number;
  fieldElevFt: number;
  arp: SourceLatLon;
  lineNo: number;
}

export interface NormalizedRunway {
  identity: CifpRecordIdentity;
  airportId: string;
  runwayId: string;
  threshold: SourceLatLon;
  bearingDeg?: number;
  lengthFt?: number;
  lineNo: number;
}

export type NormalizedNavaidKind =
  "VOR" | "VORDME" | "NDB" | "DME" | "LOC" | "GS" | "OM" | "MM" | "IM";

export interface NormalizedNavaid {
  identity: CifpRecordIdentity;
  airportId?: string;
  id: string;
  kind: NormalizedNavaidKind;
  name?: string;
  position: SourceLatLon;
  freqMhz?: number;
  freqKhz?: number;
  class?: "T" | "L" | "H";
  courseDeg?: number;
  gsAngleDeg?: number;
  tchFt?: number;
  locWidthDeg?: number;
  pairedLocId?: string;
  lineNo: number;
}

export type NormalizedFixKind = "WAYPOINT" | "INTERSECTION" | "FAF" | "MAPT" | "THRESHOLD";

export interface NormalizedFix {
  identity: CifpRecordIdentity;
  airportId?: string;
  id: string;
  kind: NormalizedFixKind;
  position: SourceLatLon;
  lineNo: number;
}

export type AltConstraintType = "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW";

export interface NormalizedAltConstraint {
  type: AltConstraintType;
  altitudeFt: number;
}

export interface NormalizedSpeedConstraint {
  type: AltConstraintType;
  speedKt: number;
}

/** Fix-terminated legs the current catalog can represent as a named-fix sequence. */
export const SUPPORTED_PATH_TERMINATORS = ["IF", "TF", "CF", "DF"] as const;
export type SupportedPathTerminator = (typeof SUPPORTED_PATH_TERMINATORS)[number];

/**
 * Path terminators that must never be emitted as straight catalog legs.
 * RF / holds / DME arcs / procedure turns are the AC4 hard set; heading and
 * course-unterminated legs are also skipped so they cannot become TF.
 */
export const UNSUPPORTED_PATH_TERMINATORS = [
  "RF",
  "HA",
  "HF",
  "HM",
  "AF",
  "PI",
  "CA",
  "CD",
  "CI",
  "CR",
  "VA",
  "VD",
  "VI",
  "VM",
  "VR",
  "FA",
  "FC",
  "FD",
  "FM",
] as const;

export type UnsupportedPathTerminator = (typeof UNSUPPORTED_PATH_TERMINATORS)[number];

export interface NormalizedProcedureLeg {
  sequence: number;
  fixId?: string;
  pathTerminator: string;
  supported: boolean;
  altConstraint?: NormalizedAltConstraint;
  speedConstraint?: NormalizedSpeedConstraint;
  courseDeg?: number;
  missed: boolean;
  lineNo: number;
  routeType: string;
  transitionId: string;
}

export interface NormalizedStarTransition {
  id: string;
  name: string;
  legs: NormalizedProcedureLeg[];
}

export interface NormalizedStar {
  identity: CifpRecordIdentity;
  airportId: string;
  id: string;
  name: string;
  transitions: NormalizedStarTransition[];
  common: NormalizedProcedureLeg[];
}

/**
 * ARINC 424-18 airport SID (`PD`) route types this importer maps into
 * `SidProcedure`. Other route-type letters are diagnosed and skipped.
 *
 * - `0` engine-out, `1` SID runway transition, `4` RNAV SID runway transition
 * - `2` SID common, `5` RNAV SID common
 * - `3` SID enroute transition, `6` RNAV SID enroute transition
 * - `T` / `F` / `S` / `M` (RNP / FMS / military): bucket by transition ident
 *   (`RW*` → runway, empty → common, else enroute)
 */
export const SID_RUNWAY_ROUTE_TYPES = ["0", "1", "4"] as const;
export const SID_COMMON_ROUTE_TYPES = ["2", "5"] as const;
export const SID_ENROUTE_ROUTE_TYPES = ["3", "6"] as const;
export const SID_QUALIFIED_ROUTE_TYPES = ["T", "F", "S", "M"] as const;

export interface NormalizedSidRunwayTransition {
  runwayId: string;
  initialHeadingDeg?: number;
  initialClimbFt?: number;
  legs: NormalizedProcedureLeg[];
}

export interface NormalizedSidEnrouteTransition {
  id: string;
  name: string;
  legs: NormalizedProcedureLeg[];
}

export interface NormalizedSid {
  identity: CifpRecordIdentity;
  airportId: string;
  id: string;
  name: string;
  runwayTransitions: NormalizedSidRunwayTransition[];
  common: NormalizedProcedureLeg[];
  enrouteTransitions: NormalizedSidEnrouteTransition[];
  initialClimbFt?: number;
}

export type NormalizedApproachType = "ILS" | "LOC" | "RNAV" | "VOR" | "NDB";

export interface NormalizedApproach {
  identity: CifpRecordIdentity;
  airportId: string;
  id: string;
  type: NormalizedApproachType;
  runway: string;
  name: string;
  locNavaidId?: string;
  gsNavaidId?: string;
  fafFixId?: string;
  thresholdFixId?: string;
  courseDeg?: number;
  gsAngleDeg?: number;
  tchFt?: number;
  daFt?: number;
  missedHeadingDeg?: number;
  missedClimbFt?: number;
  missedFixId?: string;
  legs: NormalizedProcedureLeg[];
}

export interface NormalizedCifpSource {
  dialect: CifpDialect;
  airports: NormalizedAirport[];
  runways: NormalizedRunway[];
  navaids: NormalizedNavaid[];
  fixes: NormalizedFix[];
  stars: NormalizedStar[];
  sids: NormalizedSid[];
  approaches: NormalizedApproach[];
  diagnostics: CifpDiagnostic[];
  skippedByType: Record<string, number>;
}

export interface CifpSkipStats {
  count: number;
  byType: Record<string, number>;
}

export function isSupportedPathTerminator(code: string): boolean {
  return (SUPPORTED_PATH_TERMINATORS as readonly string[]).includes(code);
}

export function isUnsupportedPathTerminator(code: string): boolean {
  return (UNSUPPORTED_PATH_TERMINATORS as readonly string[]).includes(code);
}

export function sourceErrorCount(source: NormalizedCifpSource): number {
  return source.diagnostics.filter((row) => row.severity === "error").length;
}
