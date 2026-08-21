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
