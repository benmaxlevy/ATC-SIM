import { SessionLog } from "@core";
import { NullSpeechPort } from "@speech";
import { expect, test } from "vitest";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { bootSession, createApp, type AppDeps } from "./create-app";

test("createApp requires deps.speech and returns that port plus a SessionLog", () => {
  expect(() => createApp({} as AppDeps)).toThrow("createApp requires deps.speech");
  const speech = new NullSpeechPort();
  const handles = createApp({ speech });
  expect(handles.speech).toBe(speech);
  expect(handles.log).toBeInstanceOf(SessionLog);
});

test("bootSession records one session.started and six KDEM arrivals", () => {
  const scenario = loadKdem();
  const app = createApp({
    speech: new NullSpeechPort(),
    world: createWorldFromScenario(scenario, 1),
  });
  bootSession(app, scenario, 1_700_000_000_000, 1);
  expect(app.log.byType("session.started")).toHaveLength(1);
  expect(app.log.byType("session.started")[0]).toMatchObject({
    type: "session.started",
    scenarioId: "KDEM",
    seed: 1,
  });
  expect(app.world.aircraft).toHaveLength(6);
});
