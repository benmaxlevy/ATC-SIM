/**
 * Apply accepted instructions to one aircraft. Left-to-right; last heading token
 * wins. TURN_DEGREES uses present heading at apply time, not assigned.
 * Does not run physics; intent takes effect on the next kinematics tick.
 */

import type {
  Aircraft,
  DirectContinuation,
  FlightPlan,
  Instruction,
  MissedCatalog,
  ProcedureJoinCatalog,
  RadioRequest,
  SessionLog,
} from "@core";
import {
  beginMissedApproach,
  applyClassBInstruction,
  findOpenRadioRequest,
  joinNamedProcedure,
  joinProcedureTransition,
  missedApproachId,
  missedSpecFor,
  normalizeHeading,
  transitionRequestToIdentifying,
} from "@core";
import {
  resolveRegionalRunwayGeometryForAircraft,
  resolveRunwayGeometry,
  type VisualRunwayGeometry,
} from "../core/nav/approachContext";
import type { World } from "../core/world";
import type { RegionalFacility } from "../scenario/regional";

/** IDENT flash duration (sim ms). PPI may read `identUntilSimMs` later (T01-10). */
export const IDENT_FLASH_MS = 5000;
/** Trainer delay before a pilot's assigned beacon appears in surveillance. */
export const SQUAWK_REPORT_DELAY_MS = 1000;

export interface ApplyIntentOpts {
  catalog?: (MissedCatalog & ProcedureJoinCatalog) | null;
  log?: SessionLog | null;
  fixXy?: ((id: string) => { xNm: number; yNm: number } | undefined) | null;
  /** Scenario active runway; runway-tagged STAR transitions must match. */
  activeRunwayId?: string | null;
  squawkReportDelayMs?: number;
  /** Authoritative plan for the aircraft, when one exists. */
  flightPlan?: Pick<FlightPlan, "routeRecord">;
  radioRequests?: RadioRequest[];
  regional?: RegionalFacility | null;
  world?: World | null;
  destinationIcao?: string | null;
}

export function applyIntent(
  aircraft: Aircraft,
  instructions: Instruction[],
  simTimeMs: number,
  opts?: ApplyIntentOpts,
): void {
  for (const instruction of instructions) {
    applyOne(aircraft, instruction, simTimeMs, opts);
  }
}

/**
 * Analog: 7110.65 vector/heading cancels the published lateral path (STAR, loc, GS).
 * Trainer delta: FLY_HEADING / TURN_DEGREES / PRESENT_HEADING also drop VIA_STAR and GS to ASSIGNED.
 */
function setHeadingMode(
  aircraft: Aircraft,
  headingDeg: number,
  turn: Aircraft["intent"]["turn"],
): void {
  aircraft.intent.assignedHeadingDeg = headingDeg;
  aircraft.intent.turn = turn;

  const clearedApproachId = aircraft.intent.clearedApproachId;
  const isEstablishedOnApproach =
    aircraft.intent.lateral?.type === "LOC" ||
    aircraft.intent.lateral?.type === "LANDING" ||
    aircraft.intent.lateral?.type === "VISUAL_FINAL";

  if (clearedApproachId && !isEstablishedOnApproach) {
    aircraft.intent.lateral = { type: "INTERCEPT_LOC", approachId: clearedApproachId };
    aircraft.intent.locInterceptApproachId = clearedApproachId;
  } else {
    aircraft.intent.lateral = { type: "HEADING", headingDeg };
    aircraft.intent.clearedApproachId = null;
    aircraft.intent.locInterceptApproachId = null;
  }

  if (
    aircraft.intent.vertical?.type === "VIA_STAR" ||
    aircraft.intent.vertical?.type === "VIA_SID" ||
    aircraft.intent.vertical?.type === "GS" ||
    aircraft.intent.vertical?.type === "GLIDEPATH" ||
    aircraft.intent.vertical?.type === "MISSED_CLIMB"
  ) {
    aircraft.intent.vertical = { type: "ASSIGNED" };
  }
  aircraft.intent.cross = undefined;
}

function publishedLateralHint(aircraft: Aircraft):
  | {
      type: "PROCEDURE";
      starId?: string;
      sidId?: string;
      routeFixIds: readonly string[];
      toFixIndex: number;
    }
  | { type: "DIRECT"; fixId: string }
  | null {
  const lateral = aircraft.intent.lateral;
  if (lateral?.type === "PROCEDURE") {
    return lateral;
  }
  if (lateral?.type === "DIRECT") {
    return lateral;
  }
  return null;
}

function shouldKeepPublishedLateral(aircraft: Aircraft): boolean {
  const type = aircraft.intent.lateral?.type;
  return type === "LOC" || type === "LANDING" || type === "INTERCEPT_LOC" || type === "MISSED";
}

/**
 * DIRECT is a lateral amendment only.  If the target is still in the active
 * route, remember the exact remaining route position; otherwise hold the
 * present heading after the target.  Neither path edits the route record.
 */
function directContinuation(
  aircraft: Aircraft,
  fixId: string,
  flightPlan: ApplyIntentOpts["flightPlan"],
): DirectContinuation {
  // Tactical DIRECT is lateral-only. When an IFR clearance is active, its
  // immutable execution snapshot is the route to resume; never consult a
  // later-edited plan and silently retarget the aircraft.
  const record = aircraft.activeClearance?.route ?? flightPlan?.routeRecord;
  if (record?.lifecycle === "active") {
    const routeFixIds = record.route.segments.flatMap((segment) => segment.fixIds);
    const minimumIndex = Math.max(0, record.nextIndex);
    const targetIndex = routeFixIds.findIndex(
      (routeFixId, index) => index >= minimumIndex && routeFixId.trim().toUpperCase() === fixId,
    );
    if (targetIndex >= minimumIndex) {
      return {
        type: "RESUME_ROUTE",
        routeFixIds: [...routeFixIds],
        index: targetIndex + 1,
        routeRevision: record.revision,
      };
    }
  }
  return { type: "PRESENT_HEADING", headingDeg: aircraft.headingDeg };
}

/**
 * Analog: descend/climb via is the published path and its constraints.
 * JOIN is the same lateral join without VIA_STAR. DCT never calls this.
 */
function joinPublishedLateral(
  aircraft: Aircraft,
  procedureId: string,
  opts?: ApplyIntentOpts,
  transitionId?: string,
): void {
  if (shouldKeepPublishedLateral(aircraft)) {
    return;
  }
  const joined = joinNamedProcedure({
    catalog: opts?.catalog,
    procedureId,
    transitionId,
    activeRunwayId: opts?.activeRunwayId,
    current: publishedLateralHint(aircraft),
    xNm: aircraft.xNm,
    yNm: aircraft.yNm,
    fixXy: opts?.fixXy ?? undefined,
  });
  if (!joined) {
    return;
  }
  aircraft.intent.lateral = {
    type: "PROCEDURE",
    starId: joined.starId,
    toFixIndex: joined.toFixIndex,
    routeFixIds: joined.routeFixIds,
  };
}

function applyStarTransitionLateral(
  aircraft: Aircraft,
  procedureId: string,
  transitionId: string,
  opts?: ApplyIntentOpts,
): boolean {
  if (shouldKeepPublishedLateral(aircraft)) {
    return true;
  }
  const current = publishedLateralHint(aircraft);
  const want = procedureId.trim().toUpperCase();
  const onThisProc =
    current?.type === "PROCEDURE" &&
    ((current.starId && current.starId.trim().toUpperCase() === want) ||
      (current.sidId && current.sidId.trim().toUpperCase() === want));
  const remainingFixIds = onThisProc ? current.routeFixIds.slice(current.toFixIndex) : undefined;
  const currentRouteFixIds = onThisProc ? current.routeFixIds : undefined;
  const resolved = joinProcedureTransition({
    catalog: opts?.catalog,
    procedureId,
    transitionId,
    activeRunwayId: opts?.activeRunwayId,
    remainingFixIds,
    currentRouteFixIds,
  });
  if (!resolved.ok) {
    return false;
  }
  const sidMatch = (opts?.catalog?.sids ?? []).some(
    (sid) => sid.id.trim().toUpperCase() === resolved.join.starId.trim().toUpperCase(),
  );
  aircraft.intent.lateral = {
    type: "PROCEDURE",
    starId: resolved.join.starId,
    ...(sidMatch ? { sidId: resolved.join.starId } : {}),
    toFixIndex: resolved.join.toFixIndex,
    routeFixIds: resolved.join.routeFixIds,
  };
  return true;
}

/**
 * Analog: JO 7110.65 Climb Via / Descend Via amendments (R01); AIM phraseology
 * (R03). Trainer delta: named transition is catalog JSON, not NAS. Prove the
 * join before mutating VIA; controller altitude provenance belongs to the
 * associated flight plan, not aircraft intent.
 */
function applyVia(
  aircraft: Aircraft,
  procedureId: string,
  sense: "DESCEND" | "CLIMB",
  opts?: ApplyIntentOpts,
  transitionId?: string,
): void {
  aircraft.intent.speedRestrictionsDeleted = false;
  if (transitionId) {
    if (!applyStarTransitionLateral(aircraft, procedureId, transitionId, opts)) {
      return;
    }
    const normId = procedureId.trim().toUpperCase();
    aircraft.intent.vertical =
      sense === "CLIMB"
        ? { type: "VIA_SID", sidId: normId }
        : { type: "VIA_STAR", starId: normId, sense };
    aircraft.intent.controllerAssignedSpeedKt = undefined;
    return;
  }
  const normId = procedureId.trim().toUpperCase();
  aircraft.intent.vertical =
    sense === "CLIMB"
      ? { type: "VIA_SID", sidId: normId }
      : { type: "VIA_STAR", starId: normId, sense };
  aircraft.intent.controllerAssignedSpeedKt = undefined;
  joinPublishedLateral(aircraft, procedureId, opts, transitionId);
}

/**
 * Arm loc capture on the current lateral path. DIRECT / PROCEDURE stay in
 * force until the loc is capturable. Heading (or no path) becomes INTERCEPT_LOC
 * and flies that assigned heading until capture. Keep LOC if already on this
 * approach. A heading in the same command is the intercept heading.
 */
function armLocIntercept(aircraft: Aircraft, approachId: string): void {
  aircraft.intent.locInterceptApproachId = approachId;
  const lateral = aircraft.intent.lateral;
  const alreadyOnThisLoc =
    (lateral?.type === "LOC" || lateral?.type === "INTERCEPT_LOC") &&
    lateral.approachId === approachId;
  if (alreadyOnThisLoc) {
    return;
  }
  if (lateral?.type === "DIRECT" || lateral?.type === "PROCEDURE") {
    return;
  }
  aircraft.intent.lateral = { type: "INTERCEPT_LOC", approachId };
}

function cancelApproach(aircraft: Aircraft): void {
  const onApproach =
    Boolean(aircraft.intent.clearedApproachId) || aircraft.intent.lateral?.type === "VISUAL_FINAL";
  if (
    !onApproach ||
    aircraft.intent.lateral?.type === "MISSED" ||
    aircraft.intent.lateral?.type === "LANDING"
  ) {
    return;
  }

  aircraft.intent.assignedHeadingDeg = aircraft.headingDeg;
  aircraft.intent.turn = "SHORTEST";
  aircraft.intent.clearedApproachId = null;
  aircraft.intent.locInterceptApproachId = null;
  aircraft.intent.expectedApproachId = null;
  if (aircraft.intent.vertical?.type === "GS" || aircraft.intent.vertical?.type === "GLIDEPATH") {
    aircraft.intent.vertical = { type: "ASSIGNED" };
  }
  const lateralType = aircraft.intent.lateral?.type;
  if (
    lateralType === undefined ||
    lateralType === "HEADING" ||
    lateralType === "INTERCEPT_LOC" ||
    lateralType === "LOC" ||
    lateralType === "VISUAL_FINAL"
  ) {
    aircraft.intent.lateral = { type: "HEADING", headingDeg: aircraft.headingDeg };
  }
}

function applyClearedVisual(
  aircraft: Aircraft,
  instruction: Extract<Instruction, { type: "CLEARED_VISUAL" }>,
  opts?: ApplyIntentOpts,
): void {
  const clean = instruction.runwayId.replace(/^RW/i, "").toUpperCase();
  let geom: VisualRunwayGeometry | null = null;
  if (opts?.world) {
    geom = resolveRunwayGeometry(aircraft, clean, opts.world);
    if (!geom) return;
  } else if (opts?.regional) {
    geom = resolveRegionalRunwayGeometryForAircraft(
      aircraft,
      clean,
      opts.regional,
      opts.destinationIcao,
    );
  }
  if (!geom) return;

  aircraft.intent.assignedHeadingDeg = geom.headingDeg;
  aircraft.intent.clearedApproachId = `VISUAL ${geom.runwayId}`;
  aircraft.intent.locInterceptApproachId = null;
  aircraft.intent.expectedApproachId = null;
  aircraft.intent.assignedAltitudeFt = geom.fieldElevFt;
  aircraft.intent.lateral = {
    type: "VISUAL_FINAL",
    runwayId: geom.runwayId,
    threshold: geom.threshold,
    headingDeg: geom.headingDeg,
    fieldElevFt: geom.fieldElevFt,
  };
  aircraft.intent.vertical = {
    type: "GLIDEPATH",
    approachId: `VISUAL ${geom.runwayId}`,
  };
  aircraft.intent.cross = undefined;
}

function applyOne(
  aircraft: Aircraft,
  instruction: Instruction,
  simTimeMs: number,
  opts?: ApplyIntentOpts,
): void {
  switch (instruction.type) {
    case "FLY_HEADING":
      setHeadingMode(aircraft, instruction.headingDeg, instruction.turn);
      return;
    case "TURN_DEGREES": {
      const delta = instruction.direction === "LEFT" ? -instruction.degrees : instruction.degrees;
      setHeadingMode(
        aircraft,
        normalizeHeading(aircraft.headingDeg + delta),
        instruction.direction,
      );
      return;
    }
    case "PRESENT_HEADING":
      setHeadingMode(aircraft, aircraft.headingDeg, "SHORTEST");
      return;
    case "ALTITUDE":
      aircraft.intent.assignedAltitudeFt = instruction.altitudeFt;
      if (
        aircraft.intent.vertical?.type === "VIA_STAR" ||
        aircraft.intent.vertical?.type === "VIA_SID"
      ) {
        aircraft.intent.vertical = { type: "ASSIGNED" };
        aircraft.intent.cross = undefined;
      }
      return;
    case "SPEED":
      aircraft.intent.assignedSpeedKt = instruction.speedKt;
      aircraft.intent.controllerAssignedSpeedKt = instruction.speedKt;
      aircraft.intent.speedUntil = instruction.until;
      aircraft.intent.speedRestrictionsDeleted = undefined;
      return;
    case "CLEARED_APPROACH":
      aircraft.intent.clearedApproachId = instruction.approachId;
      armLocIntercept(aircraft, instruction.approachId);
      return;
    case "CLEARED_VISUAL":
      applyClearedVisual(aircraft, instruction, opts);
      return;
    case "INTERCEPT_LOCALIZER":
      aircraft.intent.clearedApproachId = null;
      if (aircraft.intent.vertical?.type === "GS") {
        aircraft.intent.vertical = { type: "ASSIGNED" };
      }
      armLocIntercept(aircraft, instruction.approachId);
      return;
    case "EXPECT_APPROACH":
      aircraft.intent.expectedApproachId = instruction.approachId;
      return;
    case "IDENT":
      aircraft.identUntilSimMs = simTimeMs + IDENT_FLASH_MS;
      if (opts?.radioRequests) {
        const openReq = findOpenRadioRequest(opts.radioRequests, aircraft.id);
        if (openReq) {
          transitionRequestToIdentifying(openReq, simTimeMs);
        }
      }
      return;
    case "ASSIGN_SQUAWK":
      aircraft.assignedSquawk = instruction.code;
      aircraft.pendingReportedSquawk = {
        code: instruction.code,
        dueSimMs: simTimeMs + (opts?.squawkReportDelayMs ?? SQUAWK_REPORT_DELAY_MS),
      };
      return;
    case "MAINTAIN_VFR":
      // Radio-only VFR marker for a future pickup path; no plan, route, or intent mutation.
      aircraft.maintainVfr = true;
      return;
    case "CLASS_B_CLEARANCE":
    case "REMAIN_OUTSIDE_BRAVO":
    case "RESUME_APPROPRIATE_VFR_ALTITUDES":
      if (opts?.world) applyClassBInstruction(aircraft, instruction, opts.world, opts.log);
      return;
    case "IFR_CLEARANCE":
      // IFR clearance application is an atomic world transaction, never a
      // partial intent-only mutation.
      return;
    case "DIRECT":
      {
        const fixId = instruction.fixId.trim().toUpperCase();
        aircraft.intent.lateral = {
          type: "DIRECT",
          fixId,
          continuation: directContinuation(aircraft, fixId, opts?.flightPlan),
        };
      }
      return;
    case "DESCEND_VIA":
      applyVia(aircraft, instruction.procedureId, "DESCEND", opts, instruction.transitionId);
      return;
    case "CLIMB_VIA":
      applyVia(aircraft, instruction.procedureId, "CLIMB", opts, instruction.transitionId);
      return;
    case "JOIN_PROCEDURE":
      if (instruction.transitionId) {
        applyStarTransitionLateral(
          aircraft,
          instruction.procedureId,
          instruction.transitionId,
          opts,
        );
        return;
      }
      joinPublishedLateral(aircraft, instruction.procedureId, opts);
      return;
    case "CROSS":
      aircraft.intent.cross = {
        fixId: instruction.fixId,
        altitudeFt: instruction.altitudeFt,
        restriction: instruction.restriction,
      };
      return;
    case "GO_AROUND": {
      const approachId = missedApproachId(aircraft);
      if (!approachId) {
        return;
      }
      beginMissedApproach(
        aircraft,
        missedSpecFor(approachId, opts?.catalog),
        { log: opts?.log, simTimeMs },
        approachId,
      );
      return;
    }
    case "DELETE_SPEED_RESTRICTIONS":
      aircraft.intent.controllerAssignedSpeedKt = undefined;
      aircraft.intent.speedUntil = undefined;
      aircraft.intent.speedRestrictionsDeleted = true;
      return;
    case "CANCEL_APPROACH":
      cancelApproach(aircraft);
      return;
    case "SAY_HEADING":
    case "SAY_ALTITUDE":
    case "REQUEST_DETAILS":
    case "STANDBY_REQUEST":
    case "APPROVE_FLIGHT_FOLLOWING":
    case "DECLINE_REQUEST":
    case "RADAR_CONTACT":
    case "TERMINATE_RADAR_SERVICE":
    case "ACKNOWLEDGE_IFR_CANCELLATION":
    case "CLASS_B_CLEARANCE_AS_REQUESTED":
    case "CONTACT_TOWER":
    case "CONTACT_CENTER":
      return;
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}
