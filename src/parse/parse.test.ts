import { expect, expectTypeOf, test } from "vitest";
import type { Command } from "@core";
import { parseCommand } from "@parse";

test("parseCommand throws until phase 1", () => {
  expect(() => parseCommand("H270")).toThrow(Error);
  expect(() => parseCommand("H270")).toThrow(/phase 1/);
});

test("parseCommand is typed to return Command", () => {
  expectTypeOf(parseCommand).returns.toEqualTypeOf<Command>();
});
