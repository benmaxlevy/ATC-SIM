import { expect, expectTypeOf, test } from "vitest";
import { SessionLog, createAircraft, createWorld, fixtureFlyHeading, type Command } from "@core";
import {
  applyCommand,
  formatCallsignSpeech,
  formatReadback,
  formatRejectReadback,
  handleRadioText,
  numericTail,
  resolveCallsign,
  validateInstructions,
} from "@pilot";

test("applyCommand applies a resolved Command without parsing", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal] });
  applyCommand(world, fixtureFlyHeading);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("SHORTEST");
});

test("applyCommand throws when the callsign is missing", () => {
  expect(() => applyCommand(createWorld(), fixtureFlyHeading)).toThrow(/no aircraft/);
});

test("applyCommand accepts Command", () => {
  expectTypeOf(applyCommand).parameter(1).toEqualTypeOf<Command>();
});

test("readback formatters export from @pilot for T01-07", () => {
  expect(formatCallsignSpeech).toBeTypeOf("function");
  expect(formatReadback).toBeTypeOf("function");
  expect(formatRejectReadback).toBeTypeOf("function");
});

test("resolveCallsign, numericTail, handleRadioText, and validate export from @pilot", () => {
  expect(resolveCallsign).toBeTypeOf("function");
  expect(numericTail).toBeTypeOf("function");
  expect(handleRadioText).toBeTypeOf("function");
  expect(validateInstructions).toBeTypeOf("function");
  expect(SessionLog).toBeTypeOf("function");
});
