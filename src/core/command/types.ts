/**
 * Radio-only Command IR. Field names match `phases/_shared/command-ir.md`.
 * Heading/altitude/speed range checks belong to the Pilot agent (phase 1).
 */

/** One radio transmission. May contain several instructions. */
export interface Command {
  id: string;
  issuedAtSimMs: number;
  /** Resolved after callsign matching. */
  callsign: string;
  instructions: Instruction[];
  /** Raw text after ASR or the typed line, for logs and scoring. */
  sourceText: string;
  source: "text" | "voice";
  /**
   * Which parse stage produced `instructions` (phase 3+).
   * Omit only on pre-phase-3 fixtures.
   */
  parseStage?: ParseStage;
}

/** Compiler that won (`phases/_shared/parse-pipeline.md`). */
export type ParseStage = "typed" | "spoken_a" | "spoken_b" | "llm_c";

export type TurnDir = "LEFT" | "RIGHT" | "SHORTEST";

/** Runtime list of Instruction `type` discriminants. Keep in sync with `Instruction`. */
export const INSTRUCTION_TYPES = [
  "FLY_HEADING",
  "TURN_DEGREES",
  "PRESENT_HEADING",
  "ALTITUDE",
  "SPEED",
  "DIRECT",
  "EXPECT_APPROACH",
  "CLEARED_APPROACH",
  "INTERCEPT_LOCALIZER",
  "IDENT",
  "SAY_HEADING",
  "SAY_ALTITUDE",
  "DESCEND_VIA",
  "CLIMB_VIA",
  "JOIN_PROCEDURE",
  "CROSS",
  "GO_AROUND",
] as const;

export type Instruction =
  | { type: "FLY_HEADING"; headingDeg: number; turn: TurnDir }
  | { type: "TURN_DEGREES"; direction: "LEFT" | "RIGHT"; degrees: number }
  | { type: "PRESENT_HEADING" }
  | {
      type: "ALTITUDE";
      altitudeFt: number;
      verb: "CLIMB" | "DESCEND" | "MAINTAIN";
      expedite?: boolean;
      /**
       * Phase 4 ILS: hold this altitude until established on the localizer
       * (7110.65 “maintain (alt) until established”). Readback flag; kinematics
       * always hold assigned alt until loc capture once APP is armed.
       */
      untilEstablished?: boolean;
    }
  | {
      type: "SPEED";
      speedKt: number;
      verb: "MAINTAIN" | "INCREASE" | "REDUCE";
    }
  | { type: "DIRECT"; fixId: string }
  | { type: "EXPECT_APPROACH"; approachId: string }
  | { type: "CLEARED_APPROACH"; approachId: string }
  /** Join the loc and track inbound; do not arm GS. APP later clears the approach. */
  | { type: "INTERCEPT_LOCALIZER"; approachId: string }
  | { type: "IDENT" }
  | { type: "SAY_HEADING" }
  | { type: "SAY_ALTITUDE" }
  | { type: "DESCEND_VIA"; procedureId: string; transitionId?: string }
  | { type: "CLIMB_VIA"; procedureId: string; transitionId?: string }
  | { type: "JOIN_PROCEDURE"; procedureId: string; transitionId?: string }
  | {
      type: "CROSS";
      fixId: string;
      altitudeFt: number;
      restriction: "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW";
    }
  | { type: "GO_AROUND" };
