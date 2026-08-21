import { expect, expectTypeOf, test } from "vitest";
import { fixtureFlyHeading, type Command } from "@core";
import { applyCommand } from "@pilot";

test("applyCommand throws until phase 1", () => {
  expect(() => applyCommand({}, fixtureFlyHeading)).toThrow(Error);
  expect(() => applyCommand({}, fixtureFlyHeading)).toThrow(/phase 1/);
});

test("applyCommand accepts Command", () => {
  expectTypeOf(applyCommand).parameter(1).toEqualTypeOf<Command>();
});
