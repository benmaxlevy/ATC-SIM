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
}

export type TurnDir = "LEFT" | "RIGHT" | "SHORTEST";

export type Instruction =
  | { type: "FLY_HEADING"; headingDeg: number; turn: TurnDir }
  | { type: "TURN_DEGREES"; direction: "LEFT" | "RIGHT"; degrees: number }
  | { type: "PRESENT_HEADING" }
  | {
      type: "ALTITUDE";
      altitudeFt: number;
      verb: "CLIMB" | "DESCEND" | "MAINTAIN";
      expedite?: boolean;
    }
  | {
      type: "SPEED";
      speedKt: number;
      verb: "MAINTAIN" | "INCREASE" | "REDUCE";
    }
  | { type: "DIRECT"; fixId: string }
  | { type: "EXPECT_APPROACH"; approachId: string }
  | { type: "CLEARED_APPROACH"; approachId: string }
  | { type: "IDENT" }
  | { type: "SAY_HEADING" }
  | { type: "SAY_ALTITUDE" };
