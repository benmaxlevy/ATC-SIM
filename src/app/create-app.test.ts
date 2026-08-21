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

test("createApp defaults to an empty world and keeps a provided World", () => {
  const empty = createApp({ speech: new NullSpeechPort() });
  expect(empty.world.aircraft).toEqual([]);

  const world = createWorld();
  const handles = createApp({ speech: new NullSpeechPort(), world });
  expect(handles.world).toBe(world);
});
