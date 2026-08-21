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

function fakePort(
  text: string,
  extras: { confidence?: number; synthesizeError?: boolean } = {},
): SpeechPort {
  return {
    id: "fake",
    async transcribe(): Promise<Transcript> {
      return { text, confidence: extras.confidence ?? 1, latencyMs: 3 };
    },
    async synthesize(): Promise<AudioClip> {
      if (extras.synthesizeError) {
        throw new Error("tts down");
      }
      return nonEmptyClip();
    },
  };
}

function dalWorld() {
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
  return { dal, world };
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
  const { dal, world } = dalWorld();
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
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));
  await expect(
    handles.voiceLoop.handlePttEvent({
      type: "ptt-up",
      result: { kind: "clip", clip: nonEmptyClip() },
    }),
  ).resolves.toBeUndefined();
  expect(handles.log.byType("command.accepted")).toHaveLength(0);
  const rejected = handles.log.byType("command.rejected");
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toBe("voice_backend_unavailable");
  expect(lines).toEqual(["Voice backend unavailable"]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-08 AC1 — confidence 0.5 does not move the aircraft and logs low_confidence", async () => {
  const { dal, world } = dalWorld();
  const intentBefore = { ...dal.intent };
  const handles = createApp({
    speech: fakePort("turn left heading two seven zero", { confidence: 0.5 }),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dal.intent).toEqual(intentBefore);
  expect(handles.log.byType("command.accepted")).toHaveLength(0);
  const rejected = handles.log.byType("command.rejected");
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toBe("low_confidence");
  expect(rejected[0]?.sourceText).toBe("turn left heading two seven zero");
  expect(lines).toEqual(["Say again (0.50)"]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-08 AC2 — permission-denied status is microphone blocked; tick path does not throw", async () => {
  const handles = createApp({
    speech: fakePort("ignored"),
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));

  await expect(
    handles.voiceLoop.handlePttEvent({ type: "permission-denied" }),
  ).resolves.toBeUndefined();
  expect(handles.log.byType("command.rejected")[0]?.reason).toBe("mic_denied");
  expect(lines).toEqual(["Microphone blocked — allow in browser settings"]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-08 AC3 — STT throw logs stt_failed and does not dispatch", async () => {
  const { dal, world } = dalWorld();
  const intentBefore = { ...dal.intent };
  const port: SpeechPort = {
    id: "http",
    async transcribe() {
      throw new Error("radio down");
    },
    async synthesize() {
      return nonEmptyClip();
    },
  };
  const handles = createApp({
    speech: port,
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dal.intent).toEqual(intentBefore);
  expect(handles.log.byType("command.rejected")[0]?.reason).toBe("stt_failed");
  expect(lines).toEqual(["Radio failed — say again"]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-08 AC4 — spoken parse miss logs parse_miss with sourceText", async () => {
  const { dal, world } = dalWorld();
  const intentBefore = { ...dal.intent };
  const handles = createApp({
    speech: fakePort("asdf qwerty please vector"),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dal.intent).toEqual(intentBefore);
  const rejected = handles.log.byType("command.rejected");
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toBe("parse_miss");
  expect(rejected[0]?.sourceText).toBe("asdf qwerty please vector");
  expect(lines).toEqual(["Unable to parse"]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-08 AC5 — ignored-locked is radio busy and does not transcribe", async () => {
  const port = fakePort("turn left heading two seven zero");
  let transcribeCalls = 0;
  const counting: SpeechPort = {
    id: "fake",
    async transcribe(clip) {
      transcribeCalls += 1;
      return port.transcribe(clip);
    },
    synthesize: port.synthesize,
  };
  const handles = createApp({
    speech: counting,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));

  await handles.voiceLoop.handlePttEvent({ type: "ignored-locked" });
  expect(transcribeCalls).toBe(0);
  expect(handles.log.byType("command.rejected")[0]?.reason).toBe("ptt_locked");
  expect(lines).toEqual(["Radio busy — standby"]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-08 — TTS fail after accept keeps intent and does not log command.rejected", async () => {
  const { dal, world } = dalWorld();
  const handles = createApp({
    speech: fakePort("turn left heading two seven zero", { synthesizeError: true }),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(handles.log.byType("command.accepted")).toHaveLength(1);
  expect(handles.log.byType("command.rejected")).toHaveLength(0);
  expect(lines.at(-1)).toBe("Readback audio failed");
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-08 — PTT-down clears the status line", async () => {
  const handles = createApp({
    speech: fakePort("ignored"),
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  const lines: Array<string | null> = [];
  const stop = handles.subscribeVoiceStatus((status) => lines.push(status));

  await handles.voiceLoop.handlePttEvent({ type: "permission-denied" });
  await handles.voiceLoop.handlePttEvent({ type: "ptt-down" });
  expect(lines).toEqual(["Microphone blocked — allow in browser settings", null]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});
