import { SessionLog, createAircraft, createWorld } from "@core";
import {
  DEFAULT_PTT_KEY,
  NullSpeechPort,
  createPttCaptureController,
  type AudioClip,
  type ReadbackPlayer,
  type SpeechPort,
  type Transcript,
} from "@speech";
import { expect, test, vi } from "vitest";
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

test("T01-14 playable slice: main wires spawn, speech factory, rAF, and resize paint", () => {
  const sources = import.meta.glob("../main.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const main = sources["../main.tsx"];
  expect(main).toBeDefined();
  expect(main).toMatch(/createWorldForSession/);
  expect(main).toMatch(/parseTrafficCount/);
  expect(main).toMatch(/parseSpawnSeed/);
  expect(main).toMatch(/parseScenarioChoice/);
  expect(main).toMatch(/loadKdemIls27/);
  expect(main).toMatch(/loadAndResolveSpeechBoot/);
  expect(main).toMatch(/handles\.ptt\.dispose/);
  expect(main).toMatch(/requestAnimationFrame/);
  expect(main).toMatch(/paintPpi/);
  expect(main).toMatch(/addEventListener\("resize"/);
  expect(main).not.toMatch(/from\s+["']@speech["'].*(http|openai|deepgram)/i);
  expect(main).not.toMatch(/openai|deepgram|elevenlabs/i);
});

test("createApp constructs PTT capture with the Left Control default (T03-01)", () => {
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

test("T03-15 AC1 — confidence 0.5 heading moves the aircraft and is not Say again", async () => {
  const { dal, world } = dalWorld();
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

  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("LEFT");
  const accepted = handles.log.byType("command.accepted");
  expect(accepted).toHaveLength(1);
  expect(accepted[0]?.command.source).toBe("voice");
  expect(accepted[0]?.command.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
  ]);
  expect(handles.log.byType("command.rejected")).toHaveLength(0);
  expect(lines.some((line) => line !== null && /say again/i.test(line))).toBe(false);
  expect(handles.log.byType("voice.latency")[0]?.sttConfidence).toBe(0.5);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-15 AC2 — garbage at confidence 0.5 is parse_miss and does not move", async () => {
  const { dal, world } = dalWorld();
  const intentBefore = { ...dal.intent };
  const handles = createApp({
    speech: fakePort("pizza the runway", { confidence: 0.5 }),
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
  expect(rejected[0]?.reason).toBe("parse_miss");
  expect(rejected[0]?.sourceText).toBe("pizza the runway");
  expect(lines).toEqual(["Unable to parse"]);
  expect(handles.log.byType("voice.latency")[0]?.sttConfidence).toBe(0.5);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-15 AC7 — settings confidence 1.0 does not skip a parseable 0.5 heading", async () => {
  const { dal, world } = dalWorld();
  const handles = createApp({
    speech: fakePort("turn left heading two seven zero", { confidence: 0.5 }),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  handles.speechSettings.setConfidenceThreshold(1);

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("LEFT");
  expect(handles.log.byType("command.accepted")).toHaveLength(1);
  expect(handles.speechSettings.prefs.confidenceThreshold).toBe(1);
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
  expect(lines).toEqual(["Microphone blocked — allow in browser settings", "TX"]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

function instantPlayer(): ReadbackPlayer {
  const now = (): number =>
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  return {
    playing: false,
    async warmUp() {},
    async playPcm(_clip, hooks) {
      hooks?.onAudioStart?.(now());
      return { ok: true };
    },
    async playBrowser(_text, _voiceId, hooks) {
      hooks?.onAudioStart?.(now());
      return { ok: true };
    },
    stop() {},
    fxEnabled: true,
    setConnectSource() {},
    setFxEnabled() {},
  };
}

test("T03-09 — overlay defaults on and setLatencyOverlayVisible hides it", () => {
  const handles = createApp({ speech: new NullSpeechPort() });
  expect(handles.getLatencyOverlayVisible()).toBe(true);
  const seen: boolean[] = [];
  const stop = handles.subscribeLatencyOverlay((state) => {
    seen.push(state.visible);
    expect(state.snapshot.backendId).toBe("null");
  });
  handles.setLatencyOverlayVisible(false);
  expect(handles.getLatencyOverlayVisible()).toBe(false);
  expect(seen).toEqual([true, false]);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-09 — successful utterance logs voice.latency with both wall-clock marks", async () => {
  const { world } = dalWorld();
  const handles = createApp({
    speech: fakePort("turn left heading two seven zero"),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  const overlays: Array<{ stt: number | null; aud: number | null; n: number }> = [];
  const stop = handles.subscribeLatencyOverlay((state) => {
    overlays.push({
      stt: state.snapshot.lastTranscriptMs,
      aud: state.snapshot.lastAudioStartMs,
      n: state.snapshot.sampleCount,
    });
  });

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  const latency = handles.log.byType("voice.latency");
  expect(latency).toHaveLength(1);
  expect(latency[0]?.pttUpToTranscriptMs).toBeGreaterThanOrEqual(0);
  expect(latency[0]?.pttUpToAudioStartMs).toBeGreaterThanOrEqual(0);
  expect(latency[0]?.pttUpToAudioStartMs).toBeGreaterThanOrEqual(latency[0]!.pttUpToTranscriptMs!);
  expect(latency[0]?.backendId).toBe("fake");
  expect(overlays.at(-1)?.n).toBe(1);
  expect(overlays.at(-1)?.aud).toBeGreaterThanOrEqual(0);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-09 — STT failure logs transcript_ms and null audio-start", async () => {
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
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });

  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  const latency = handles.log.byType("voice.latency");
  expect(latency).toHaveLength(1);
  expect(latency[0]?.pttUpToTranscriptMs).toBeGreaterThanOrEqual(0);
  expect(latency[0]?.pttUpToAudioStartMs).toBeNull();
  expect(latency[0]?.backendId).toBe("http");
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-10 — setSpeechPort while idle swaps id and disposes the previous port", () => {
  const dispose = vi.fn();
  const first: SpeechPort = {
    id: "http",
    async transcribe(): Promise<Transcript> {
      return { text: "ignored", confidence: 1, latencyMs: 1 };
    },
    async synthesize(): Promise<AudioClip> {
      return nonEmptyClip();
    },
    dispose,
  };
  const second: SpeechPort = {
    id: "null",
    async transcribe(): Promise<Transcript> {
      return { text: "ignored", confidence: 1, latencyMs: 1 };
    },
    async synthesize(): Promise<AudioClip> {
      return nonEmptyClip();
    },
  };
  const handles = createApp({
    speech: first,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  expect(handles.setSpeechPort(second)).toBe(true);
  expect(handles.speech).toBe(second);
  expect(handles.voiceLoop.speechPortId).toBe("null");
  expect(dispose).toHaveBeenCalledOnce();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T03-10 AC5 — settings PTT bind updates the capture controller", () => {
  const key = "atc-sim.speech.prefs";
  const previous = globalThis.localStorage?.getItem(key) ?? null;
  const handles = createApp({
    speech: new NullSpeechPort(),
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  try {
    expect(handles.ptt.pttKey).toBe(DEFAULT_PTT_KEY);
    handles.speechSettings.setPttKey("CapsLock");
    expect(handles.ptt.pttKey).toBe("CapsLock");
    expect(handles.speechSettings.prefs.pttKey).toBe("CapsLock");
  } finally {
    if (previous === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, previous);
    }
    handles.ptt.dispose();
    handles.voiceLoop.dispose();
  }
});
