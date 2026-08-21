import { expect, expectTypeOf, test } from "vitest";
import { commandFixtures, fixtureFlyHeading } from "./fixtures";
import { INSTRUCTION_TYPES } from "./instructions";
import type { Command, Instruction, TurnDir } from "./types";

test("Command has the frozen radio fields plus optional parseStage", () => {
  expectTypeOf<keyof Command>().toEqualTypeOf<
    "id" | "issuedAtSimMs" | "callsign" | "instructions" | "sourceText" | "source" | "parseStage"
  >();
});

test("INSTRUCTION_TYPES lists exactly the 11 Command IR discriminants", () => {
  expect(INSTRUCTION_TYPES).toHaveLength(11);
  expectTypeOf<Instruction["type"]>().toEqualTypeOf<(typeof INSTRUCTION_TYPES)[number]>();
});

test("TurnDir and FLY_HEADING match the frozen heading vector shape", () => {
  type FlyHeading = Extract<Instruction, { type: "FLY_HEADING" }>;
  expectTypeOf<TurnDir>().toEqualTypeOf<"LEFT" | "RIGHT" | "SHORTEST">();
  expectTypeOf<FlyHeading>().toEqualTypeOf<{
    type: "FLY_HEADING";
    headingDeg: number;
    turn: TurnDir;
  }>();
  expect(fixtureFlyHeading.instructions[0]).toEqual({
    type: "FLY_HEADING",
    headingDeg: 270,
    turn: "SHORTEST",
  });
});

test("fixtures cover every Instruction type", () => {
  const fromFixtures = new Set(
    commandFixtures.flatMap((command) =>
      command.instructions.map((instruction) => instruction.type),
    ),
  );
  expect(fromFixtures).toEqual(new Set(INSTRUCTION_TYPES));
});
