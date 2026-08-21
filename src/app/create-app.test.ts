import { SessionLog, createWorld } from "@core";
import { NullSpeechPort } from "@speech";
import { expect, test } from "vitest";
import { createApp, type AppDeps } from "./create-app";

test("createApp returns the same speech instance it was given", () => {
  const speech = new NullSpeechPort();
  const handles = createApp({ speech });
  expect(handles.speech).toBe(speech);
});

test("createApp requires deps.speech", () => {
  expect(() => createApp({} as AppDeps)).toThrow("createApp requires deps.speech");
});

test("createApp returns a SessionLog instance (AC6)", () => {
  const handles = createApp({ speech: new NullSpeechPort() });
  expect(handles.log).toBeInstanceOf(SessionLog);
});

test("T01-14 playable slice: main wires spawn, null speech, rAF, and resize paint", () => {
  const sources = import.meta.glob("../main.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const main = sources["../main.tsx"];
  expect(main).toBeDefined();
  expect(main).toMatch(/createWorldFromScenario/);
  expect(main).toMatch(/NullSpeechPort/);
  expect(main).toMatch(/requestAnimationFrame/);
  expect(main).toMatch(/paintPpi/);
  expect(main).toMatch(/addEventListener\("resize"/);
  expect(main).not.toMatch(/from\s+["']@speech["'].*(http|openai|deepgram)/i);
});

test("createApp defaults to an empty world and keeps a provided World", () => {
  const empty = createApp({ speech: new NullSpeechPort() });
  expect(empty.world.aircraft).toEqual([]);

  const world = createWorld();
  const handles = createApp({ speech: new NullSpeechPort(), world });
  expect(handles.world).toBe(world);
});
