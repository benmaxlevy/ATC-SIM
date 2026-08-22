import { expect, test } from "vitest";
import { INSTRUCTION_TYPES, createWorld, type World } from "@core";
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
  expect(INSTRUCTION_TYPES).toHaveLength(15);
});

test("World has simTimeMs, paused, simRate, and empty aircraft", () => {
  const world: World = createWorld();
  const doubleRate: World = createWorld({ simTimeMs: 1000, simRate: 2 });
  expect(world.simTimeMs).toBe(0);
  expect(world.paused).toBe(false);
  expect(world.simRate).toBe(1);
  expect(world.aircraft).toEqual([]);
  expect(world.selectedAircraftId).toBeNull();
  expect(doubleRate.simRate).toBe(2);
});
