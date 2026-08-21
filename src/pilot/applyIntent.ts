/**
 * Apply accepted instructions to one aircraft. Left-to-right; last heading token
 * wins. TURN_DEGREES uses present heading at apply time, not assigned.
 * Does not run physics; intent takes effect on the next kinematics tick.
 */

import type { Aircraft, Instruction } from "@core";
import { normalizeHeading } from "@core";

/** IDENT flash duration (sim ms). PPI may read `identUntilSimMs` later (T01-10). */
export const IDENT_FLASH_MS = 5000;

export function applyIntent(
  aircraft: Aircraft,
  instructions: Instruction[],
  simTimeMs: number,
): void {
  for (const instruction of instructions) {
    applyOne(aircraft, instruction, simTimeMs);
  }
}

function applyOne(aircraft: Aircraft, instruction: Instruction, simTimeMs: number): void {
  switch (instruction.type) {
    case "FLY_HEADING":
      aircraft.intent.assignedHeadingDeg = instruction.headingDeg;
      aircraft.intent.turn = instruction.turn;
      return;
    case "TURN_DEGREES": {
      const delta = instruction.direction === "LEFT" ? -instruction.degrees : instruction.degrees;
      aircraft.intent.assignedHeadingDeg = normalizeHeading(aircraft.headingDeg + delta);
      aircraft.intent.turn = instruction.direction;
      return;
    }
    case "PRESENT_HEADING":
      aircraft.intent.assignedHeadingDeg = aircraft.headingDeg;
      aircraft.intent.turn = "SHORTEST";
      return;
    case "ALTITUDE":
      aircraft.intent.assignedAltitudeFt = instruction.altitudeFt;
      return;
    case "SPEED":
      aircraft.intent.assignedSpeedKt = instruction.speedKt;
      return;
    case "CLEARED_APPROACH":
      aircraft.intent.clearedApproachId = instruction.approachId;
      return;
    case "IDENT":
      aircraft.identUntilSimMs = simTimeMs + IDENT_FLASH_MS;
      return;
    case "SAY_HEADING":
    case "SAY_ALTITUDE":
    case "DIRECT":
    case "EXPECT_APPROACH":
      return;
    default: {
      const _exhaustive: never = instruction;
      return _exhaustive;
    }
  }
}
