import { loadKdem } from "@scenario";
import { NullSpeechPort } from "@speech";
import { expect, test } from "vitest";
import { bootSession } from "./boot-session";
import { createApp } from "./create-app";

test("bootSession appends exactly one session.started with scenarioId KDEM (AC4)", () => {
  const app = createApp({ speech: new NullSpeechPort() });
  const scenario = loadKdem();
  const wallMs = 1_700_000_000_000;

  bootSession(app, scenario, wallMs);

  const events = app.log.all();
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({
    type: "session.started",
    atSimMs: 0,
    atWallMs: wallMs,
    scenarioId: "KDEM",
  });
});
