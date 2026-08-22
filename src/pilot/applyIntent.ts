/**
 * Apply accepted instructions to one aircraft. Left-to-right; last heading token
 * wins. TURN_DEGREES uses present heading at apply time, not assigned.
 * Does not run physics; intent takes effect on the next kinematics tick.
 */

import type { Aircraft, Instruction, MissedCatalog, ProcedureJoinCatalog, SessionLog } from "@core";
import {
  beginMissedApproach,
  joinNamedProcedure,
  missedApproachId,
  missedSpecFor,
  normalizeHeading,
  procedureRouteContainingFix,
} from "@core";

/** IDENT flash duration (sim ms). PPI may read `identUntilSimMs` later (T01-10). */
export const IDENT_FLASH_MS = 5000;

export interface ApplyIntentOpts {
  catalog?: (MissedCatalog & ProcedureJoinCatalog) | null;
  log?: SessionLog | null;
  fixXy?: ((id: string) => { xNm: number; yNm: number } | undefined) | null;
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
  aircraft.intent.lateral = { type: "HEADING", headingDeg };
  if (
    aircraft.intent.vertical?.type === "VIA_STAR" ||
    aircraft.intent.vertical?.type === "GS" ||
    aircraft.intent.vertical?.type === "MISSED_CLIMB"
  ) {
    aircraft.intent.vertical = { type: "ASSIGNED" };
  }
  aircraft.intent.cross = undefined;
  aircraft.intent.clearedApproachId = null;
  aircraft.intent.locInterceptApproachId = null;
}

function preferProcedureId(aircraft: Aircraft): string | undefined {
  if (aircraft.intent.lateral?.type === "PROCEDURE") {
    return aircraft.intent.lateral.starId;
  }
  if (aircraft.intent.vertical?.type === "VIA_STAR") {
    return aircraft.intent.vertical.starId;
  }
  return undefined;
}

/**
 * Analog: “direct [fix], rest of the arrival/departure.”
 * Trainer: DCT to a STAR/SID catalog fix joins remaining legs. A navaid or
 * other fix that is not on a procedure stays lone DIRECT.
 */
function applyDirect(aircraft: Aircraft, fixId: string, catalog: ApplyIntentOpts["catalog"]): void {
  const want = fixId.trim().toUpperCase();
  const current = aircraft.intent.lateral;
  if (current?.type === "PROCEDURE") {
    const idx = current.routeFixIds.findIndex((id) => id.trim().toUpperCase() === want);
    if (idx >= 0) {
      aircraft.intent.lateral = { ...current, toFixIndex: idx };
      return;
    }
  }
  const joined = procedureRouteContainingFix(catalog, want, preferProcedureId(aircraft));
  if (joined) {
    aircraft.intent.lateral = {
      type: "PROCEDURE",
      starId: joined.starId,
      toFixIndex: joined.toFixIndex,
      routeFixIds: joined.routeFixIds,
    };
    return;
  }
  aircraft.intent.lateral = { type: "DIRECT", fixId: want };
}

function publishedLateralHint(
  aircraft: Aircraft,
):
  | { type: "PROCEDURE"; starId: string; routeFixIds: string[]; toFixIndex: number }
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

function shouldKeepLateralForVia(aircraft: Aircraft): boolean {
  const type = aircraft.intent.lateral?.type;
  return type === "LOC" || type === "LANDING" || type === "INTERCEPT_LOC" || type === "MISSED";
}

/**
 * Analog: descend/climb via is the published path and its constraints.
 * Trainer: arm VIA_STAR and join PROCEDURE when the route is known. DCT join
 * stays lateral-only and must not call this.
 */
function applyVia(
  aircraft: Aircraft,
  procedureId: string,
  sense: "DESCEND" | "CLIMB",
  opts?: ApplyIntentOpts,
): void {
  aircraft.intent.vertical = {
    type: "VIA_STAR",
    starId: procedureId.trim().toUpperCase(),
    sense,
  };
  if (shouldKeepLateralForVia(aircraft)) {
    return;
  }
  const joined = joinNamedProcedure({
    catalog: opts?.catalog,
    procedureId,
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
      return;
    case "SPEED":
      aircraft.intent.assignedSpeedKt = instruction.speedKt;
      return;
    case "CLEARED_APPROACH":
      aircraft.intent.clearedApproachId = instruction.approachId;
      armLocIntercept(aircraft, instruction.approachId);
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
      return;
    case "DIRECT":
      applyDirect(aircraft, instruction.fixId, opts?.catalog);
      return;
    case "DESCEND_VIA":
      applyVia(aircraft, instruction.procedureId, "DESCEND", opts);
      return;
    case "CLIMB_VIA":
      applyVia(aircraft, instruction.procedureId, "CLIMB", opts);
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
    case "SAY_HEADING":
    case "SAY_ALTITUDE":
      return;
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}
