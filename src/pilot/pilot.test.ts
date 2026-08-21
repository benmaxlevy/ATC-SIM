import { expect, test } from "vitest";
import { applyCommand } from "@pilot";

test("applyCommand throws until phase 1", () => {
  expect(() => applyCommand({}, {})).toThrow(Error);
  expect(() => applyCommand({}, {})).toThrow(/phase 1/);
});
