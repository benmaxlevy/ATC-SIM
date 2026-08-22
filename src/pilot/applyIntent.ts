/**
 * Apply accepted instructions to one aircraft. Left-to-right; last heading token
 * wins. TURN_DEGREES uses present heading at apply time, not assigned.
 * Does not run physics; intent takes effect on the next kinematics tick.
 */

import type { Aircraft, Instruction, MissedCatalog, SessionLog } from "@core";
import { beginMissedApproach, missedApproachId, missedSpecFor, normalizeHeading } from "@core";

/** IDENT flash duration (sim ms). PPI may read `identUntilSimMs` later (T01-10). */
export const IDENT_FLASH_MS = 5000;

export interface ApplyIntentOpts {
  catalog?: MissedCatalog | null;
  log?: SessionLog | null;
}

export function applyIntent(
  aircraft: Aircraft,
  instructions: Instruction[],
  simTimeMs: number,
  opts?: ApplyIntentOpts,
): void {
  let headingAssignedThisCommand = false;
  for (const instruction of instructions) {
    if (
      instruction.type === "FLY_HEADING" ||
      instruction.type === "TURN_DEGREES" ||
      instruction.type === "PRESENT_HEADING"
    ) {
      headingAssignedThisCommand = true;
    }
    applyOne(aircraft, instruction, simTimeMs, opts, !headingAssignedThisCommand);
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
}

/**
 * Keep LOC if already established on this approach; otherwise arm intercept.
 * Without a heading in this command, snap assigned heading to present heading
 * so INTERCEPT_LOC does not turn toward a stale STAR/spawn assigned heading
 * (or the loc inbound) to "find" the loc. A heading in the same command is
 * the intercept heading (R240 IL ILS27).
 */
function armLocIntercept(
  aircraft: Aircraft,
  approachId: string,
  snapToPresentHeading: boolean,
): void {
  const lateral = aircraft.intent.lateral;
  const alreadyOnThisLoc =
    (lateral?.type === "LOC" || lateral?.type === "INTERCEPT_LOC") &&
    lateral.approachId === approachId;
  if (alreadyOnThisLoc) {
    return;
  }
  if (snapToPresentHeading) {
    aircraft.intent.assignedHeadingDeg = aircraft.headingDeg;
    aircraft.intent.turn = "SHORTEST";
  }
  aircraft.intent.lateral = { type: "INTERCEPT_LOC", approachId };
}

function applyOne(
  aircraft: Aircraft,
  instruction: Instruction,
  simTimeMs: number,
  opts: ApplyIntentOpts | undefined,
  snapInterceptToPresent: boolean,
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
      armLocIntercept(aircraft, instruction.approachId, snapInterceptToPresent);
      return;
    case "INTERCEPT_LOCALIZER":
      aircraft.intent.clearedApproachId = null;
      if (aircraft.intent.vertical?.type === "GS") {
        aircraft.intent.vertical = { type: "ASSIGNED" };
      }
      armLocIntercept(aircraft, instruction.approachId, snapInterceptToPresent);
      return;
    case "EXPECT_APPROACH":
      aircraft.intent.expectedApproachId = instruction.approachId;
      return;
    case "IDENT":
      aircraft.identUntilSimMs = simTimeMs + IDENT_FLASH_MS;
      return;
    case "DIRECT":
      aircraft.intent.lateral = { type: "DIRECT", fixId: instruction.fixId };
      return;
    case "DESCEND_VIA":
      aircraft.intent.vertical = {
        type: "VIA_STAR",
        starId: instruction.procedureId,
        sense: "DESCEND",
      };
      return;
    case "CLIMB_VIA":
      aircraft.intent.vertical = {
        type: "VIA_STAR",
        starId: instruction.procedureId,
        sense: "CLIMB",
      };
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
