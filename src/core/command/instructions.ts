/** Runtime list of Instruction `type` discriminants. Keep in sync with `types.ts`. */
export const INSTRUCTION_TYPES = [
  "FLY_HEADING",
  "TURN_DEGREES",
  "PRESENT_HEADING",
  "ALTITUDE",
  "SPEED",
  "DIRECT",
  "EXPECT_APPROACH",
  "CLEARED_APPROACH",
  "IDENT",
  "SAY_HEADING",
  "SAY_ALTITUDE",
  "DESCEND_VIA",
  "CLIMB_VIA",
  "CROSS",
] as const;
