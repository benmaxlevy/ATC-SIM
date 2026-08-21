import { expect, expectTypeOf, test } from "vitest";
import { fixtureFlyHeading, type Command } from "@core";
import {
  applyCommand,
  formatCallsignSpeech,
  formatReadback,
  formatRejectReadback,
  numericTail,
  resolveCallsign,
} from "@pilot";

test("applyCommand throws until phase 1", () => {
  expect(() => applyCommand({}, fixtureFlyHeading)).toThrow(Error);
  expect(() => applyCommand({}, fixtureFlyHeading)).toThrow(/phase 1/);
});

test("applyCommand accepts Command", () => {
  expectTypeOf(applyCommand).parameter(1).toEqualTypeOf<Command>();
});

test("readback formatters export from @pilot for T01-07", () => {
  expect(formatCallsignSpeech).toBeTypeOf("function");
  expect(formatReadback).toBeTypeOf("function");
  expect(formatRejectReadback).toBeTypeOf("function");
});

test("resolveCallsign and numericTail export from @pilot", () => {
  expect(resolveCallsign).toBeTypeOf("function");
  expect(numericTail).toBeTypeOf("function");
});
