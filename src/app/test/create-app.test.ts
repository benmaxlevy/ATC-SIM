import { SessionLog } from "@core";
import { NullSpeechPort } from "@speech";
import { expect, test, vi } from "vitest";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { bootSession, createApp, type AppDeps } from "../create-app";

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

test("replaceWorld attaches the VFR request queue to the replacement world", () => {
  const app = createApp({ speech: new NullSpeechPort() });
  const replacement = createWorldFromScenario(loadKdem(), 2);

  app.replaceWorld(replacement);

  expect(replacement.vfrRequestQueue).toBe(app.vfrRequestQueue);
});

test("pilot queue status supersedes an older transient voice status timer", async () => {
  vi.useFakeTimers();
  try {
    const statuses: Array<string | null> = [];
    const queue = {
      scheduleFromWorld: vi.fn(),
      reset: vi.fn(),
      drain: vi.fn(({ setStatus }: { setStatus?: (status: string) => void }) => {
        setStatus?.("Pilot callup");
      }),
    };
    const app = createApp({
      speech: new NullSpeechPort(),
      vfrRequestQueue: queue as unknown as AppDeps["vfrRequestQueue"],
    });
    app.subscribeVoiceStatus((status) => statuses.push(status));

    await app.voiceLoop.handlePttEvent({ type: "permission-denied" });
    expect(statuses.at(-1)).not.toBeNull();

    app.afterPhysicsTick();
    expect(statuses.at(-1)).toBe("Pilot callup");
    await vi.advanceTimersByTimeAsync(3000);

    expect(statuses.at(-1)).toBe("Pilot callup");
  } finally {
    vi.useRealTimers();
  }
});
