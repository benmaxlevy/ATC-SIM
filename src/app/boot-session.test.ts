import { createWorldFromScenario, loadKdem } from "@scenario";
import { NullSpeechPort } from "@speech";
import { expect, test } from "vitest";
import { bootSession } from "./boot-session";
import { createApp } from "./create-app";

test("bootSession appends exactly one session.started with scenarioId KDEM (AC4)", () => {
  const app = createApp({ speech: new NullSpeechPort() });
  const scenario = loadKdem();
  const wallMs = 1_700_000_000_000;

  bootSession(app, scenario, wallMs, 1);

  const events = app.log.all();
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({
    type: "session.started",
    atSimMs: 0,
    atWallMs: wallMs,
    scenarioId: "KDEM",
    seed: 1,
  });
});

test("boot wires createWorldFromScenario so the session World has 6 arrivals", () => {
  const scenario = loadKdem();
  const app = createApp({
    speech: new NullSpeechPort(),
    world: createWorldFromScenario(scenario, 1),
  });
  bootSession(app, scenario, 1_700_000_000_000, 1);
  expect(app.world.aircraft).toHaveLength(6);
  const dal = app.world.aircraft.find((ac) => ac.callsign === "DAL123");
  expect(dal).toBeDefined();
  expect(dal?.intent.lateral?.type).toBe("PROCEDURE");
});

test("bootSession persists a non-default spawn seed", () => {
  const app = createApp({ speech: new NullSpeechPort() });
  bootSession(app, loadKdem(), 1_700_000_000_000, 42);
  expect(app.log.all()[0]).toMatchObject({ type: "session.started", seed: 42 });
});
