import { expect, test } from "vitest";
import { parseCommand } from "@parse";

test("parseCommand throws until phase 1", () => {
  expect(() => parseCommand("H270")).toThrow(Error);
  expect(() => parseCommand("H270")).toThrow(/phase 1/);
});
