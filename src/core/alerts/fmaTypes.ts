import type { FmaPoint } from "../../scenario/procedures/types";

export type FmaDiagnostic = { path: string; message: string };

export type FmaPolygon = {
  points: FmaPoint[];
};

export type FmaMember = {
  runwayId: string;
  approachId: string;
  threshold: FmaPoint;
  courseTrueDeg: number;
  noz: FmaPolygon;
};

export type FmaNtz = {
  id: string;
  leftRunwayId: string;
  rightRunwayId: string;
  polygon: FmaPolygon;
};

export type FmaAmz = {
  id: string;
  label: string;
  airportId: string;
  runwayAliases: Record<string, string[]>;
  approachIds: string[];
  courseTrueDeg: number;
  members: FmaMember[];
  boundary: FmaPolygon;
  ntzs: FmaNtz[];
  dimensions: {
    captureLengthNm: number;
    ntzWidthFt: number;
    outerMarginNm: number;
    departureExtensionsNm: Record<string, number>;
  };
  /** Physical runway segment; departureEnd is the reciprocal threshold when resolved. */
  runwayGraphics: Array<{ runwayId: string; threshold: FmaPoint; departureEnd: FmaPoint }>;
  courseLines: Array<{
    runwayId: string;
    approach: [FmaPoint, FmaPoint];
    departure: [FmaPoint, FmaPoint];
  }>;
  referenceLines: Array<[FmaPoint, FmaPoint]>;
  fixBars: Array<{
    fixId: string;
    runwayId: string;
    point: FmaPoint;
    segment: [FmaPoint, FmaPoint];
  }>;
  referenceSpacingFt: 200;
  monitoring: {
    cautionHorizonS: number;
    surveillanceLossS: number;
    coastOutS: number;
    stabilizationS: number;
    courseToleranceDeg: number;
    alignmentHalfWidthNm: number;
    maximumPtlS: number;
  };
  provenance: "DERIVED_TRAINER" | "CATALOG_ADAPTED";
  verticalLimits?: { floorFt: number; ceilingFt: number };
};

export type FmaAssignment =
  | { kind: "RUNWAY"; runwayId: string }
  | { kind: "NONE" }
  | { kind: "AMBIGUOUS"; runwayIds: string[] };

export type FmaPrimaryCondition =
  "NTZ_WARNING" | "SURVEILLANCE_LOST" | "RUNWAY_ERROR" | "NTZ_CAUTION";

export type FmaAlertTrackInput = {
  aircraftId: string;
  associated: boolean;
  tracked: boolean;
  arrivalAirportId?: string | null;
  scratchpads: readonly (string | undefined)[];
  /** Ground track, clockwise from true north, from the latest report. */
  report: {
    xNm: number;
    yNm: number;
    groundTrackDeg: number;
    speedKt: number;
    altitudeFt?: number;
    reportedAtSimMs: number;
  };
  /** Last actual sensor report used for stabilization/NOZ qualification. */
  observation?: FmaAlertTrackInput["report"];
  /** Expected sensor cadence, used only to identify a real observation gap. */
  reportPeriodMs?: number;
  surveillance: "CURRENT" | "NOM" | "CST" | "FROZEN";
};

export type FmaAlertInhibit = {
  aircraftIds?: ReadonlySet<string>;
  ntzIds?: ReadonlySet<string>;
};

export type FmaAlertEpisode = {
  id: string;
  condition: FmaPrimaryCondition;
  onsetSimMs: number;
  amzId: string;
  runwayIds: string[];
  ntzIds: string[];
  evidence: string[];
};

export type FmaAlertTrackResult = {
  aircraftId: string;
  assignment: FmaAssignment;
  observedRunwayId: string | null;
  primary: FmaPrimaryCondition | null;
  episode: FmaAlertEpisode | null;
  onset: boolean;
  supplementary: { nom: boolean };
  diagnostic?: string;
};

export type FmaAlertState = {
  amzId: string | null;
  nextEpisode: number;
  alignment: Map<string, { runwayId: string; sinceMs: number; lastReportMs: number }>;
  assignedNozHistory: Map<string, { runwayId: string; seen: boolean }>;
  episodes: Map<string, FmaAlertEpisode>;
  lastReportMs: Map<string, number>;
};

export type FmaAlertEvaluation = {
  state: FmaAlertState;
  tracks: Map<string, FmaAlertTrackResult>;
  outlines: Map<string, "RED" | "YELLOW">;
  diagnostics: string[];
};
