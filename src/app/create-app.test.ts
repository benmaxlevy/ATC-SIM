import { SessionLog, createAircraft, createWorld } from "@core";
import {
  DEFAULT_PTT_KEY,
  NullSpeechPort,
  createPttCaptureController,
  type AudioClip,
  type SpeechPort,
  type Transcript,
} from "@speech";
import { expect, test } from "vitest";
import { createApp, type AppDeps } from "./create-app";

function nonEmptyClip(): AudioClip {
  return { sampleRate: 16000, channels: 1, pcm16: new Int16Array(1600) };
}

function fakePort(text: string): SpeechPort {
  return {
    id: "fake",
    async transcribe(): Promise<Transcript> {
      return { text, confidence: 1, latencyMs: 3 };
    },
    async synthesize(): Promise<AudioClip> {
      return nonEmptyClip();
    },
  };
}

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
  expect(main).toMatch(/createWorldForSession/);
  expect(main).toMatch(/parseTrafficCount/);
  expect(main).toMatch(/NullSpeechPort/);
  expect(main).toMatch(/handles\.ptt\.dispose/);
  expect(main).toMatch(/requestAnimationFrame/);
  expect(main).toMatch(/paintPpi/);
  expect(main).toMatch(/addEventListener\("resize"/);
  expect(main).not.toMatch(/from\s+["']@speech["'].*(http|openai|deepgram)/i);
});

test("createApp constructs PTT capture with the backtick default (T03-01)", () => {
  const handles = createApp({ speech: new NullSpeechPort() });
  expect(handles.ptt.pttKey).toBe(DEFAULT_PTT_KEY);
  const injected = createPttCaptureController({ onEvent: () => {}, attachTo: null });
  const reused = createApp({ speech: new NullSpeechPort(), ptt: injected });
  expect(reused.ptt).toBe(injected);
  injected.dispose();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
  reused.voiceLoop.dispose();
});

test("createApp defaults to an empty world and keeps a provided World", () => {
  const empty = createApp({ speech: new NullSpeechPort() });
  expect(empty.world.aircraft).toEqual([]);

  const world = createWorld();
  const handles = createApp({ speech: new NullSpeechPort(), world });
  expect(handles.world).toBe(world);
  empty.ptt.dispose();
  empty.voiceLoop.dispose();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-02 — voice loop applies spoken heading through the same pilot path", async () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal], selectedAircraftId: "ac-dal" });
  const handles = createApp({
    speech: fakePort("turn left heading two seven zero"),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("LEFT");
  const accepted = handles.log.byType("command.accepted");
  expect(accepted).toHaveLength(1);
  expect(accepted[0]?.command.source).toBe("voice");
  expect(accepted[0]?.command.callsign).toBe("DAL123");
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-02 — NullSpeechPort PTT-up does not throw through createApp", async () => {
  const handles = createApp({ speech: new NullSpeechPort() });
  await expect(
    handles.voiceLoop.handlePttEvent({
      type: "ptt-up",
      result: { kind: "clip", clip: nonEmptyClip() },
    }),
  ).resolves.toBeUndefined();
  expect(handles.log.byType("command.accepted")).toHaveLength(0);
  expect(handles.log.byType("command.rejected")).toHaveLength(0);
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});
