import { expect, test } from "vitest";
import type { World } from "@core";
import { parseCommand } from "@parse";
import { applyCommand } from "@pilot";
import { PpiPlaceholderId } from "@scope";
import { NullSpeechPort, SPEECH_PACKAGE } from "@speech";
import { SCENARIO_PACKAGE } from "@scenario";
import { App } from "@ui";

test("package barrels import without circular init crash", () => {
  expect(parseCommand).toBeTypeOf("function");
  expect(applyCommand).toBeTypeOf("function");
  expect(PpiPlaceholderId).toBe("ppi-placeholder");
  expect(SPEECH_PACKAGE).toBe("speech");
  expect(new NullSpeechPort().id).toBe("null");
  expect(SCENARIO_PACKAGE).toBe("scenario");
  expect(App).toBeTypeOf("function");
});

test("World stub has simTimeMs, simRate, and empty aircraft", () => {
  const world: World = {
    simTimeMs: 0,
    simRate: 1,
    aircraft: [],
  };
  const doubleRate: World = {
    simTimeMs: 1000,
    simRate: 2,
    aircraft: [],
  };
  expect(world.simTimeMs).toBe(0);
  expect(world.simRate).toBe(1);
  expect(world.aircraft).toEqual([]);
  expect(doubleRate.simRate).toBe(2);
});
