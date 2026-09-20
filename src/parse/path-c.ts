/**
 * Path C: optional POST /parse on our speech-api after typed/A/B miss.
 * Schema-checks Command IR v0. Illegal type (e.g. CHAT) → miss, no dispatch.
 * DOM-free: inject fetch. Never throws through the sim tick.
 */

import {
  INSTRUCTION_TYPES,
  type ClearanceRouteSegment,
  type Instruction,
  type TurnDir,
} from "@core";
import type { CatalogFixMatchMethod } from "./spoken/catalog-ground";
import { cancelApproachSequenceError } from "./instruction-order";

export const PATH_C_SCHEMA_VERSION = "command-ir-v0" as const;
/** Browser/service semantic guard contract. Bump when Path C safety rules change. */
export const PATH_C_CONTRACT_VERSION = "command-ir-v0-safe-1" as const;
export const DEFAULT_PARSE_URL = "http://127.0.0.1:8090/parse";
/** Path C is optional salvage; it must not hold the radio loop indefinitely. */
export const DEFAULT_PARSE_TIMEOUT_MS = 3000;
/** Retrieved Path C `fixes=` / approaches / procedures cap. Not file-order 64. */
export const MAX_PATH_C_FIXES = 16;

export type PathCRouteCandidateKind = "FIX" | "NAVAID";

export interface PathCTranscriptSpan {
  start: number;
  end: number;
  text: string;
}

export interface PathCRouteCandidate {
  id: string;
  kind: PathCRouteCandidateKind;
  aliases: string[];
  spans: PathCTranscriptSpan[];
}

export interface PathCRouteCandidateInput {
  id: string;
  kind: PathCRouteCandidateKind;
  aliases?: readonly string[];
}

export interface PathCRouteFixMatchCandidate {
  id: string;
  kind: PathCRouteCandidateKind;
  score: number;
  method: CatalogFixMatchMethod;
  distance?: number;
}

export interface PathCRouteFixMatch {
  span: PathCTranscriptSpan;
  candidates: PathCRouteFixMatchCandidate[];
}

export interface PathCTransitionCandidate {
  id: string;
  aliases: string[];
  spans: PathCTranscriptSpan[];
}

export interface PathCProcedureCandidate {
  id: string;
  aliases: string[];
  spans: PathCTranscriptSpan[];
  transitions: PathCTransitionCandidate[];
}

/** Route-scoped evidence. No facility-wide search is allowed in this object. */
export interface PathCRouteWindow {
  transcript: string;
  fixMatches: PathCRouteFixMatch[];
  procedures: PathCProcedureCandidate[];
}

export interface PathCContext {
  callsigns: string[];
  selectedCallsign?: string | null;
  /** Facility catalog ids. Optional; never kinematics, n-best, or STT confidence. */
  fixes?: string[];
  /** STAR/SID ids + published names. Optional. */
  procedures?: Array<{ id: string; name?: string }>;
  /** Approach ids + published names/runways. Optional. */
  approaches?: Array<{ id: string; name?: string; runway?: string }>;
  /** Clearance-limit airport namespace; never a generic fix list. */
  airports?: Array<{ icao: string; name: string; aliases?: readonly string[] }>;
  /** Optional route-window evidence for constrained IFR clearance salvage. */
  routeWindow?: PathCRouteWindow;
  /** Non-airport clearance-limit candidates, separately scoped from route legs. */
  clearanceLimits?: PathCRouteCandidate[];
}

export interface PathCRequest {
  text: string;
  source: "text" | "voice";
  schemaVersion: typeof PATH_C_SCHEMA_VERSION;
  /** Live strips + selection. Optional; never n-best or STT confidence. */
  context?: PathCContext;
}

export interface PathCSuccess {
  callsignToken: string | null;
  instructions: Instruction[];
}

export interface ParsePathCDeps {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  url?: string;
  timeoutMs?: number;
}

export type ParsePathCFn = (req: PathCRequest) => Promise<PathCSuccess | null>;

const TURN_DIRS = new Set<TurnDir>(["LEFT", "RIGHT", "SHORTEST"]);
const LR = new Set(["LEFT", "RIGHT"]);
const ALT_VERBS = new Set(["CLIMB", "DESCEND", "MAINTAIN"]);
const SPEED_VERBS = new Set(["MAINTAIN", "INCREASE", "REDUCE"]);
const CROSS_RESTRICTIONS = new Set(["AT", "AT_OR_ABOVE", "AT_OR_BELOW"]);
const LEGAL_TYPES = new Set<string>(INSTRUCTION_TYPES);
const ROUTE_FIX_MATCH_METHODS = new Set<CatalogFixMatchMethod>([
  "exact",
  "alias",
  "folded",
  "levenshtein",
]);
const ROUTE_CONNECTORS = new Set(["direct", "then"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function keysOk(
  obj: object,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(obj);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      return false;
    }
  }
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Closed Instruction union. Extra keys or unknown type → miss. */
export function isLegalInstruction(value: unknown): value is Instruction {
  const obj = asRecord(value);
  if (obj === null) {
    return false;
  }
  const type = obj.type;
  if (typeof type !== "string" || !LEGAL_TYPES.has(type)) {
    return false;
  }
  if (type === "FLY_HEADING") {
    return (
      keysOk(obj, ["type", "headingDeg", "turn"]) &&
      isFiniteNumber(obj.headingDeg) &&
      typeof obj.turn === "string" &&
      TURN_DIRS.has(obj.turn as TurnDir)
    );
  }
  if (type === "TURN_DEGREES") {
    return (
      keysOk(obj, ["type", "direction", "degrees"]) &&
      typeof obj.direction === "string" &&
      LR.has(obj.direction) &&
      isFiniteNumber(obj.degrees)
    );
  }
  if (
    type === "PRESENT_HEADING" ||
    type === "IDENT" ||
    type === "SAY_HEADING" ||
    type === "SAY_ALTITUDE" ||
    type === "GO_AROUND" ||
    type === "CANCEL_APPROACH" ||
    type === "MAINTAIN_VFR" ||
    type === "REQUEST_DETAILS" ||
    type === "STANDBY_REQUEST" ||
    type === "APPROVE_FLIGHT_FOLLOWING" ||
    type === "TERMINATE_RADAR_SERVICE" ||
    type === "ACKNOWLEDGE_IFR_CANCELLATION" ||
    type === "CLASS_B_CLEARANCE_AS_REQUESTED"
  ) {
    return keysOk(obj, ["type"]);
  }
  if (type === "REMAIN_OUTSIDE_BRAVO" || type === "RESUME_APPROPRIATE_VFR_ALTITUDES") {
    return keysOk(obj, ["type"]);
  }
  if (type === "DECLINE_REQUEST") {
    return (
      keysOk(obj, ["type", "service"]) &&
      typeof obj.service === "string" &&
      (obj.service === "FLIGHT_FOLLOWING" ||
        obj.service === "IFR_PICKUP" ||
        obj.service === "CLASS_B_ACCESS")
    );
  }
  if (type === "RADAR_CONTACT") {
    // Bare `radar contact` (identification, no position report) or the full
    // all-or-nothing position form. A partial position never validates.
    if (keysOk(obj, ["type"])) {
      return true;
    }
    return (
      keysOk(obj, ["type", "distanceNm", "referenceId", "referenceKind"]) &&
      isFiniteNumber(obj.distanceNm) &&
      obj.distanceNm > 0 &&
      typeof obj.referenceId === "string" &&
      obj.referenceId.length > 0 &&
      typeof obj.referenceKind === "string" &&
      (obj.referenceKind === "FIX" ||
        obj.referenceKind === "NAVAID" ||
        obj.referenceKind === "AIRPORT")
    );
  }
  if (type === "ALTITUDE") {
    if (
      !keysOk(obj, ["type", "altitudeFt", "verb"], ["expedite", "untilEstablished"]) ||
      !isFiniteNumber(obj.altitudeFt) ||
      typeof obj.verb !== "string" ||
      !ALT_VERBS.has(obj.verb)
    ) {
      return false;
    }
    if ("expedite" in obj && typeof obj.expedite !== "boolean") {
      return false;
    }
    if ("untilEstablished" in obj && typeof obj.untilEstablished !== "boolean") {
      return false;
    }
    return true;
  }
  if (type === "SPEED") {
    return (
      keysOk(obj, ["type", "speedKt", "verb"]) &&
      isFiniteNumber(obj.speedKt) &&
      typeof obj.verb === "string" &&
      SPEED_VERBS.has(obj.verb)
    );
  }
  if (type === "DIRECT") {
    return keysOk(obj, ["type", "fixId"]) && typeof obj.fixId === "string" && obj.fixId.length > 0;
  }
  if (type === "CLASS_B_CLEARANCE") {
    if (
      !keysOk(obj, ["type", "operation"], ["route", "altitudeFt"]) ||
      typeof obj.operation !== "string" ||
      !new Set(["THROUGH", "TO_ENTER", "OUT_OF"]).has(obj.operation)
    ) {
      return false;
    }
    if (obj.route !== undefined) {
      if (!Array.isArray(obj.route) || obj.route.length === 0) return false;
      for (const leg of obj.route) {
        const row = asRecord(leg);
        if (
          row === null ||
          !keysOk(row, ["type", "fixId"]) ||
          row.type !== "DIRECT" ||
          typeof row.fixId !== "string" ||
          row.fixId.length === 0
        ) {
          return false;
        }
      }
    }
    return obj.altitudeFt === undefined || isFiniteNumber(obj.altitudeFt);
  }
  if (type === "EXPECT_APPROACH" || type === "CLEARED_APPROACH" || type === "INTERCEPT_LOCALIZER") {
    return (
      keysOk(obj, ["type", "approachId"]) &&
      typeof obj.approachId === "string" &&
      obj.approachId.length > 0
    );
  }
  if (type === "CLEARED_VISUAL") {
    return (
      keysOk(obj, ["type", "runwayId"]) &&
      typeof obj.runwayId === "string" &&
      /^\d{1,2}[LRC]?$/i.test(obj.runwayId)
    );
  }
  if (type === "ASSIGN_SQUAWK") {
    return (
      keysOk(obj, ["type", "code", "source"]) &&
      typeof obj.code === "string" &&
      /^[0-7]{4}$/.test(obj.code) &&
      (obj.source === "DISCRETE" || obj.source === "VFR") &&
      (obj.source === "VFR" ? obj.code === "1200" : true)
    );
  }
  if (type === "IFR_CLEARANCE") {
    if (
      !keysOk(
        obj,
        ["type", "limitId", "access"],
        ["altitudeFt", "climbVia", "frequency", "squawk"],
      ) ||
      typeof obj.limitId !== "string" ||
      obj.limitId.length === 0
    ) {
      return false;
    }
    const access = asRecord(obj.access);
    if (access === null || typeof access.type !== "string") return false;
    const accessType = access.type;
    if (accessType === "AS_FILED" || accessType === "DIRECT" || accessType === "RADAR_VECTORS") {
      if (!keysOk(access, ["type"])) return false;
    } else if (accessType === "FIX_THEN_DIRECT") {
      if (!keysOk(access, ["type", "fixId"]) || typeof access.fixId !== "string") return false;
    } else if (accessType === "SID") {
      if (
        !keysOk(access, ["type", "procedureId"], ["transitionId"]) ||
        typeof access.procedureId !== "string" ||
        (access.transitionId !== undefined && typeof access.transitionId !== "string")
      )
        return false;
    } else if (accessType === "EXPLICIT_ROUTE") {
      if (!keysOk(access, ["type", "segments"]) || !Array.isArray(access.segments)) return false;
      for (const segment of access.segments) {
        const row = asRecord(segment);
        if (row === null || typeof row.type !== "string") return false;
        if (row.type === "DIRECT") {
          if (!keysOk(row, ["type", "fixId"]) || typeof row.fixId !== "string" || !row.fixId) {
            return false;
          }
        } else if (row.type === "PROCEDURE") {
          if (
            !keysOk(row, ["type", "procedureId"], ["transitionId"]) ||
            typeof row.procedureId !== "string" ||
            !row.procedureId ||
            (row.transitionId !== undefined &&
              (typeof row.transitionId !== "string" || !row.transitionId))
          ) {
            return false;
          }
        } else {
          return false;
        }
      }
    } else {
      return false;
    }
    if (obj.altitudeFt !== undefined && !isFiniteNumber(obj.altitudeFt)) return false;
    if (obj.climbVia !== undefined && typeof obj.climbVia !== "boolean") return false;
    if (obj.frequency !== undefined && typeof obj.frequency !== "string") return false;
    if (
      obj.squawk !== undefined &&
      (typeof obj.squawk !== "string" || !/^[0-7]{4}$/.test(obj.squawk))
    )
      return false;
    return true;
  }
  if (type === "DESCEND_VIA" || type === "CLIMB_VIA" || type === "JOIN_PROCEDURE") {
    const trans = obj.transitionId;
    return (
      keysOk(obj, ["type", "procedureId"], ["transitionId"]) &&
      typeof obj.procedureId === "string" &&
      obj.procedureId.length > 0 &&
      (trans === undefined || (typeof trans === "string" && trans.length > 0))
    );
  }
  if (type === "CROSS") {
    return (
      keysOk(obj, ["type", "fixId", "altitudeFt", "restriction"]) &&
      typeof obj.fixId === "string" &&
      obj.fixId.length > 0 &&
      isFiniteNumber(obj.altitudeFt) &&
      typeof obj.restriction === "string" &&
      CROSS_RESTRICTIONS.has(obj.restriction)
    );
  }
  return false;
}

export function schemaCheckPathC(body: unknown): PathCSuccess | null {
  const obj = asRecord(body);
  if (obj === null) {
    return null;
  }
  if (obj.ok !== true) {
    return null;
  }
  const tokenRaw = obj.callsignToken;
  if (tokenRaw !== null && tokenRaw !== undefined && typeof tokenRaw !== "string") {
    return null;
  }
  const callsignToken = typeof tokenRaw === "string" && tokenRaw.trim() !== "" ? tokenRaw : null;
  const list = obj.instructions;
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const instructions: Instruction[] = [];
  for (const item of list) {
    if (!isLegalInstruction(item)) {
      return null;
    }
    instructions.push(item);
  }
  if (cancelApproachSequenceError(instructions) !== null) {
    return null;
  }
  return { callsignToken, instructions };
}

function hasEvidence(
  spans: readonly PathCTranscriptSpan[] | undefined,
  transcript?: string,
): boolean {
  return (
    Array.isArray(spans) &&
    spans.length > 0 &&
    spans.every(
      (span) =>
        span !== null &&
        typeof span === "object" &&
        Number.isInteger(span.start) &&
        Number.isInteger(span.end) &&
        span.start >= 0 &&
        span.end > span.start &&
        typeof span.text === "string" &&
        span.text.trim().length > 0 &&
        (transcript === undefined ||
          (span.end <= transcript.length && transcript.slice(span.start, span.end) === span.text)),
    )
  );
}

function routeSegmentEvidenceIntervals(
  segment: Extract<ClearanceRouteSegment, { type: "DIRECT" | "PROCEDURE" }>,
  route: PathCRouteWindow,
): Array<[number, number]> {
  if (segment.type === "DIRECT") {
    return (Array.isArray(route.fixMatches) ? route.fixMatches : [])
      .filter(
        (match) =>
          match !== null &&
          typeof match === "object" &&
          directFixMatchIsUnambiguous(match, segment.fixId) &&
          hasEvidence([match.span], route.transcript),
      )
      .map((match) => [match.span.start, match.span.end] as [number, number]);
  }
  const procedure = route.procedures.find((item) => item.id === segment.procedureId);
  if (procedure === undefined || !hasEvidence(procedure.spans, route.transcript)) return [];
  if (segment.transitionId === undefined) {
    return procedure.spans.map((span) => [span.start, span.end] as [number, number]);
  }
  const transition = procedure.transitions.find((item) => item.id === segment.transitionId);
  if (transition === undefined || !hasEvidence(transition.spans, route.transcript)) return [];
  return procedure.spans.flatMap((procedureSpan) =>
    transition.spans
      .filter(
        (transitionSpan) =>
          transitionSpan.start >= procedureSpan.start && transitionSpan.end > procedureSpan.end,
      )
      .map((transitionSpan) => [procedureSpan.start, transitionSpan.end] as [number, number]),
  );
}

type RouteEvidenceInterval = [number, number];

function orderedRouteEvidencePaths(
  segments: readonly Extract<ClearanceRouteSegment, { type: "DIRECT" | "PROCEDURE" }>[],
  route: PathCRouteWindow,
): RouteEvidenceInterval[][] {
  let paths: RouteEvidenceInterval[][] = [[]];
  for (const segment of segments) {
    const intervals = routeSegmentEvidenceIntervals(segment, route);
    const next: RouteEvidenceInterval[][] = [];
    const seen = new Set<string>();
    for (const path of paths) {
      const previousEnd = path.at(-1)?.[1] ?? -1;
      for (const interval of intervals) {
        if (interval[0] < previousEnd) continue;
        const candidate = [...path, interval];
        const key = JSON.stringify(candidate);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(candidate);
      }
    }
    paths = next;
    if (paths.length === 0) return [];
  }
  return paths;
}

function directFixMatchIsUnambiguous(match: PathCRouteFixMatch, fixId: string): boolean {
  if (!Array.isArray(match.candidates) || match.candidates.length === 0) {
    return false;
  }
  const selected = match.candidates.find((candidate) => candidate.id === fixId);
  if (selected === undefined) {
    return false;
  }
  const bestScore = Math.max(...match.candidates.map((candidate) => candidate.score));
  return (
    selected.score === bestScore &&
    match.candidates.filter((candidate) => candidate.score === bestScore).length === 1
  );
}

function routeEvidenceCovered(
  route: PathCRouteWindow,
  intervals: readonly RouteEvidenceInterval[],
): boolean {
  const tokens = route.transcript.trim().split(/\s+/).filter(Boolean);
  let offset = 0;
  for (const token of tokens) {
    const start = offset;
    const end = start + token.length;
    offset = end + 1;
    const control = token.toLowerCase();
    if (control === "direct" || control === "then") continue;
    if (
      !intervals.some(([intervalStart, intervalEnd]) => start < intervalEnd && end > intervalStart)
    ) {
      return false;
    }
  }
  for (const match of route.fixMatches) {
    if (
      match === null ||
      typeof match !== "object" ||
      !hasEvidence([match.span], route.transcript) ||
      !Array.isArray(match.candidates) ||
      match.candidates.length === 0 ||
      match.candidates.some(
        (candidate) =>
          typeof candidate.id !== "string" ||
          candidate.id.length === 0 ||
          (candidate.kind !== "FIX" && candidate.kind !== "NAVAID") ||
          !Number.isFinite(candidate.score) ||
          !ROUTE_FIX_MATCH_METHODS.has(candidate.method),
      )
    ) {
      return false;
    }
    if (
      match.span.text
        .trim()
        .split(/\s+/)
        .some((token) => ROUTE_CONNECTORS.has(token.toLowerCase()))
    ) {
      return false;
    }
  }
  for (const procedure of route.procedures) {
    if (!hasEvidence(procedure.spans, route.transcript)) {
      return false;
    }
    for (const transition of procedure.transitions) {
      if (transition.spans.length === 0) continue;
      if (!hasEvidence(transition.spans, route.transcript)) {
        return false;
      }
    }
  }
  return true;
}

/** Validate route-only Path C output against the exact evidence sent in its request. */
export function routePathCOutputIsGrounded(
  instructions: readonly Instruction[],
  context: PathCContext | undefined,
): boolean {
  const route = context?.routeWindow;
  if (route === undefined) return true;
  if (context === undefined) return false;
  if (!Array.isArray(route.fixMatches) || !Array.isArray(route.procedures)) return false;
  if (instructions.length !== 1 || instructions[0]?.type !== "IFR_CLEARANCE") return false;
  const clearance = instructions[0];
  if (clearance.access.type !== "EXPLICIT_ROUTE" || clearance.access.segments.length === 0) {
    return false;
  }
  const airportIds = new Set((context.airports ?? []).map((airport) => airport.icao));
  const limitIds = new Set([
    ...airportIds,
    ...(context.clearanceLimits ?? []).map((candidate) => candidate.id),
  ]);
  if (!limitIds.has(clearance.limitId)) return false;
  const evidencePaths = orderedRouteEvidencePaths(clearance.access.segments, route);
  if (!evidencePaths.some((path) => routeEvidenceCovered(route, path))) return false;
  const procedures = new Map(route.procedures.map((procedure) => [procedure.id, procedure]));
  for (const segment of clearance.access.segments) {
    if (segment.type === "DIRECT") {
      if (
        airportIds.has(segment.fixId) ||
        !route.fixMatches.some(
          (match) =>
            match !== null &&
            typeof match === "object" &&
            directFixMatchIsUnambiguous(match, segment.fixId) &&
            hasEvidence([match.span], route.transcript),
        )
      ) {
        return false;
      }
      continue;
    }
    const procedure = procedures.get(segment.procedureId);
    if (procedure === undefined || !hasEvidence(procedure.spans, route.transcript)) return false;
    if (segment.transitionId !== undefined) {
      const transition = procedure.transitions.find((item) => item.id === segment.transitionId);
      if (transition === undefined || !hasEvidence(transition.spans, route.transcript))
        return false;
    }
  }
  return true;
}

function requestHasContext(context: PathCContext | undefined): boolean {
  return Boolean(
    context &&
    (context.callsigns.length > 0 ||
      context.selectedCallsign ||
      (context.fixes?.length ?? 0) > 0 ||
      (context.procedures?.length ?? 0) > 0 ||
      (context.approaches?.length ?? 0) > 0 ||
      (context.airports?.length ?? 0) > 0 ||
      context.routeWindow !== undefined ||
      (context.clearanceLimits?.length ?? 0) > 0),
  );
}

/**
 * Unambiguous cues for self-contained commands: instructions whose acceptance
 * needs no catalog retrieval (bare request-control types, `roger`-answer
 * radar contact, visual runway). A transcript carrying one may engage Path C
 * even when identifier retrieval comes back empty, so a noisy miss on these
 * forms still reaches the model. Engagement is not acceptance: schema,
 * completeness, grounding, and identifier-listed guards still apply.
 */
const SELF_CONTAINED_CUES: RegExp[] = [
  /\bradar\s+contact\b/,
  /\bsay\s+request\b/,
  /\bstand\s*by\b/,
  /\bapprove\s+flight\s+following\b/,
  /\bunable\s+(?:to\s+provide\s+)?flight\s+following\b/,
  /\bunable\s+(?:to\s+provide\s+)?ifr\s+pickup\b/,
  /\bcleared\s+as\s+requested\b/,
  /\bunable\s+(?:to\s+provide\s+)?class\s+b\s+clearance\b/,
  /\bradar\s+service\s+terminated\b/,
  /\bifr\s+cancellation\s+received\b/,
  /\bmaintain\s+vfr\b/,
  /\b(?:cleared|clear)\s+visual\b/,
  /\b(?:cleared|clear)\s+(?:(?:to\s+enter|into)|through|out\s+of)\b[\s\S]*\bbravo\s+airspace\b/,
  /\bremain\s+outside\s+bravo\s+airspace\b/,
  /\bresume\s+appropriate\s+vfr\s+altitudes\b/,
];

export function pathCHasSelfContainedCue(text: string): boolean {
  const normalized = text.toLowerCase();
  return SELF_CONTAINED_CUES.some((pattern) => pattern.test(normalized));
}

/**
 * Reject a model result that silently drops an independent supported clause.
 * This is intentionally conservative: it only requires an instruction when
 * the transcript contains an unambiguous command cue for that instruction.
 */
export function pathCResultIsComplete(
  sourceText: string,
  instructions: readonly Instruction[],
): boolean {
  const text = sourceText.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  const hasType = (...types: string[]) =>
    instructions.some((instruction) => types.includes(instruction.type));
  if (has(/\b(?:fly|turn|heading|vector)\b/) && !hasType("FLY_HEADING", "TURN_DEGREES")) {
    return false;
  }
  if (
    has(/\b(?:climb|descend|altitude|flight\s+level|feet|thousand)\b/) &&
    !hasType("ALTITUDE", "DESCEND_VIA", "CLIMB_VIA")
  ) {
    return false;
  }
  if (has(/\b(?:speed|knots?)\b/) && !hasType("SPEED")) {
    return false;
  }
  if (has(/\b(?:proceed\s+)?direct\b/) && !hasType("DIRECT")) {
    return false;
  }
  if (has(/\b(?:cross|crossing)\b/) && !hasType("CROSS")) {
    return false;
  }
  if (
    has(/\b(?:approach|localizer|ils|cleared\s+(?:the\s+)?runway)\b/) &&
    !has(/\bcancel\s+approach\s+clearance\b/) &&
    !hasType("EXPECT_APPROACH", "CLEARED_APPROACH", "INTERCEPT_LOCALIZER", "CLEARED_VISUAL")
  ) {
    return false;
  }
  if (has(/\b(?:cleared|clear)\s+visual\b/) && !hasType("CLEARED_VISUAL")) {
    return false;
  }
  if (has(/\b(?:go\s+around|going\s+around)\b/) && !hasType("GO_AROUND")) {
    return false;
  }
  if (has(/\b(?:ident|iden)\b/) && !hasType("IDENT")) {
    return false;
  }
  if (has(/\bsay\s+heading\b/) && !hasType("SAY_HEADING")) {
    return false;
  }
  if (has(/\bsay\s+altitude\b/) && !hasType("SAY_ALTITUDE")) {
    return false;
  }
  if (has(/\bcancel\s+approach\s+clearance\b/) && !hasType("CANCEL_APPROACH")) {
    return false;
  }
  if (
    has(
      /\b(?:cleared|clear)\s+(?:(?:to\s+enter|into)|through|out\s+of)\b[\s\S]*\bbravo\s+airspace\b/,
    ) &&
    !hasType("CLASS_B_CLEARANCE")
  ) {
    return false;
  }
  if (has(/\bcleared\s+as\s+requested\b/) && !hasType("CLASS_B_CLEARANCE_AS_REQUESTED")) {
    return false;
  }
  if (has(/\bremain\s+outside\s+bravo\s+airspace\b/) && !hasType("REMAIN_OUTSIDE_BRAVO")) {
    return false;
  }
  if (
    has(/\bresume\s+appropriate\s+vfr\s+altitudes\b/) &&
    !hasType("RESUME_APPROPRIATE_VFR_ALTITUDES")
  ) {
    return false;
  }
  if (has(/\bsay\s+request\b/) && !hasType("REQUEST_DETAILS")) {
    return false;
  }
  if (has(/\bstand\s*by\b/) && !hasType("STANDBY_REQUEST")) {
    return false;
  }
  if (has(/\bapprove\s+flight\s+following\b/) && !hasType("APPROVE_FLIGHT_FOLLOWING")) {
    return false;
  }
  if (has(/\bunable\s+(?:to\s+provide\s+)?flight\s+following\b/)) {
    const dec = instructions.find(
      (instruction): instruction is Extract<Instruction, { type: "DECLINE_REQUEST" }> =>
        instruction.type === "DECLINE_REQUEST",
    );
    if (!dec || dec.service !== "FLIGHT_FOLLOWING") return false;
  }
  if (has(/\bunable\s+(?:to\s+provide\s+)?ifr\s+pickup\b/)) {
    const dec = instructions.find(
      (instruction): instruction is Extract<Instruction, { type: "DECLINE_REQUEST" }> =>
        instruction.type === "DECLINE_REQUEST",
    );
    if (!dec || dec.service !== "IFR_PICKUP") return false;
  }
  if (has(/\bunable\s+(?:to\s+provide\s+)?class\s+b\s+clearance\b/)) {
    const dec = instructions.find(
      (instruction): instruction is Extract<Instruction, { type: "DECLINE_REQUEST" }> =>
        instruction.type === "DECLINE_REQUEST",
    );
    if (!dec || dec.service !== "CLASS_B_ACCESS") return false;
  }
  if (has(/\bradar\s+contact\b/) && !hasType("RADAR_CONTACT")) {
    return false;
  }
  const radarContact = instructions.find(
    (instruction): instruction is Extract<Instruction, { type: "RADAR_CONTACT" }> =>
      instruction.type === "RADAR_CONTACT",
  );
  // Position-report radar contact (`radar contact <N> miles [direction]
  // from|of <reference>`); bare `radar contact` needs only its cue. Either
  // form still requires the cue above.
  const hasRadarPositionCue = has(
    /\bmiles?\s+(?:(?:north|south|east|west|northeast|northwest|southeast|southwest|north\s+east|south\s+east|north\s+west|south\s+west)\s+)?(?:from|of)\b/,
  );
  if (radarContact) {
    const hasPositionFields =
      radarContact.distanceNm !== undefined ||
      radarContact.referenceId !== undefined ||
      radarContact.referenceKind !== undefined;
    if (hasPositionFields && !hasRadarPositionCue) {
      return false;
    }
    if (
      hasRadarPositionCue &&
      (radarContact.distanceNm === undefined || radarContact.referenceId === undefined)
    ) {
      return false;
    }
  }
  if (has(/\bradar\s+service\s+terminated\b/) && !hasType("TERMINATE_RADAR_SERVICE")) {
    return false;
  }
  if (has(/\bifr\s+cancellation\s+received\b/) && !hasType("ACKNOWLEDGE_IFR_CANCELLATION")) {
    return false;
  }
  return instructions.length > 0;
}

function defaultFetch():
  ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  return null;
}

/**
 * POST /parse. Timeout / network / 503 / SCHEMA → null (miss). Never throws.
 */
export async function fetchParsePathC(
  req: PathCRequest,
  deps: ParsePathCDeps = {},
): Promise<PathCSuccess | null> {
  const runFetch = deps.fetch ?? defaultFetch();
  if (runFetch === null) {
    return null;
  }
  const url = deps.url ?? DEFAULT_PARSE_URL;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const context = req.context;
    const raced = await Promise.race([
      runFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          source: req.source,
          schemaVersion: PATH_C_SCHEMA_VERSION,
          ...(requestHasContext(context)
            ? {
                context: {
                  callsigns: context!.callsigns,
                  ...(context!.selectedCallsign
                    ? { selectedCallsign: context!.selectedCallsign }
                    : {}),
                  ...(context!.fixes && context!.fixes.length > 0 ? { fixes: context!.fixes } : {}),
                  ...(context!.procedures && context!.procedures.length > 0
                    ? { procedures: context!.procedures }
                    : {}),
                  ...(context!.approaches && context!.approaches.length > 0
                    ? { approaches: context!.approaches }
                    : {}),
                  ...(context!.airports && context!.airports.length > 0
                    ? { airports: context!.airports }
                    : {}),
                  ...(context!.routeWindow ? { routeWindow: context!.routeWindow } : {}),
                  ...(context!.clearanceLimits && context!.clearanceLimits.length > 0
                    ? { clearanceLimits: context!.clearanceLimits }
                    : {}),
                },
              }
            : {}),
        }),
        signal: controller.signal,
      })
        .then((response) => ({ kind: "res" as const, response }))
        .catch(() => ({ kind: "err" as const })),
      timeout,
    ]);
    if (raced === "timeout" || raced.kind === "err") {
      return null;
    }
    const response = raced.response;
    if (!response.ok) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = (await response.json()) as unknown;
    } catch {
      return null;
    }
    const checked = schemaCheckPathC(parsed);
    return checked && routePathCOutputIsGrounded(checked.instructions, req.context)
      ? checked
      : null;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function createParsePathC(deps: ParsePathCDeps = {}): ParsePathCFn {
  return (req) => fetchParsePathC(req, deps);
}
