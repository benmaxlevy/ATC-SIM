import { SessionLog, SIM_DT_S, createAircraft, createWorld, stepWorld } from "@core";
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
import { handleRadioText } from "@pilot";
import {
  createWorldForSession,
  createWorldFromScenario,
  loadKdem,
  loadKdemIls27,
  loadPlayableScenario,
} from "@scenario";
import {
  PALETTE,
  createScopeView,
  handlePpiLeftClick,
  nmToScreen,
  syncTrackDisplays,
  trackPaintColor,
} from "@scope";
import { bootSession, createApp, type AppDeps } from "./create-app";

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
  expect(main).toMatch(/resolveSessionSetup/);
  expect(main).toMatch(/loadPlayableScenario/);
  expect(main).not.toMatch(/loadKdem|loadKdemIls27/);
  expect(main).toMatch(/loadAndResolveSpeechBoot/);
  expect(main).toMatch(/handles\.ptt\.dispose/);
  expect(main).toMatch(/requestAnimationFrame/);
  expect(main).toMatch(/paintPpi/);
  expect(main).toMatch(/ensureWxMosaic/);
  expect(main).toMatch(/afterPhysicsTick/);
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
    stop() {},
    fxEnabled: true,
    setConnectSource() {},
    setFxEnabled() {},
  };
}

test("T03-09 — successful utterance logs voice.latency with both wall-clock marks", async () => {
  const { world } = dalWorld();
  const handles = createApp({
    speech: fakePort("turn left heading two seven zero"),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
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

const CHECKIN_GOLDEN =
  "Approach, Delta 123, descending via DEMO ONE arrival through one-one thousand (11000)";

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 16; i += 1) {
    await Promise.resolve();
  }
}

function viaDal123() {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 18.5,
    yNm: 13.5,
    headingDeg: 225,
    altitudeFt: 11000,
    speedKt: 250,
  });
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  };
  dal.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  const world = createWorld({
    aircraft: [dal],
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [],
      stars: [{ id: "DEM1", name: "DEMO ONE" }],
      approaches: [],
      sids: [],
    },
  });
  return { dal, world };
}

test("T04-15 AC3 — afterPhysicsTick delivers check-in text to the status line", async () => {
  const { dal, world } = viaDal123();
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  let status: string | null = null;
  const stop = handles.subscribeVoiceStatus((line) => {
    status = line;
  });
  while (world.simTimeMs < 9000) {
    stepWorld(world, SIM_DT_S);
  }
  handles.afterPhysicsTick();
  await flushMicrotasks();
  const events = handles.log.byType("radio.checkin");
  expect(events).toHaveLength(1);
  expect(events[0]?.callsign).toBe("DAL123");
  expect(events[0]?.starId).toBe("DEM1");
  expect(events[0]?.starName).toBe("DEMO ONE");
  expect(events[0]?.altitudeFt).toBe(dal.altitudeFt);
  expect(events[0]?.text).toBe(CHECKIN_GOLDEN);
  expect(status).toBe(CHECKIN_GOLDEN);
  stop();
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T04-15 AC4 — H270 before due keeps that arrival silent", async () => {
  const { world } = viaDal123();
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  const result = await handleRadioText(world, "DAL123 H270", handles.log);
  expect(result.accepted).toBe(true);
  world.simTimeMs = 9000;
  handles.afterPhysicsTick();
  await flushMicrotasks();
  expect(handles.log.byType("radio.checkin")).toHaveLength(0);
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T04-15 AC8 — null SpeechPort still logs check-in and does not throw", async () => {
  const { world } = viaDal123();
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  world.simTimeMs = 9000;
  expect(() => handles.afterPhysicsTick()).not.toThrow();
  await flushMicrotasks();
  expect(handles.log.byType("radio.checkin")).toHaveLength(1);
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T04-15 — kdem-ils27 VIA arrivals both check in without a command", async () => {
  const world = createWorldFromScenario(loadKdemIls27());
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  world.simTimeMs = 9000;
  handles.afterPhysicsTick();
  await flushMicrotasks();
  world.simTimeMs += 500;
  handles.afterPhysicsTick();
  await flushMicrotasks();
  const events = handles.log.byType("radio.checkin");
  expect(events).toHaveLength(2);
  expect(events.map((event) => event.callsign).sort()).toEqual(["AAL45", "DAL123"]);
  for (const event of events) {
    expect(event.starId).toBe("DEM1");
    expect(event.starName).toBe("DEMO ONE");
    expect(event.text).toContain("DEMO ONE");
    expect(event.text).not.toContain("DEM1");
    expect(event.text.toLowerCase()).toContain("descending via demo one arrival through");
  }
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T04-15 AC9 — downwind pack without VIA never checks in", async () => {
  const ac = createAircraft({
    id: "ac-dw",
    callsign: "DAL200",
    xNm: 8,
    yNm: 10,
    headingDeg: 100,
    altitudeFt: 6000,
    speedKt: 210,
  });
  const world = createWorld({ aircraft: [ac] });
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  while (world.simTimeMs < 10_000) {
    stepWorld(world, SIM_DT_S);
    handles.afterPhysicsTick();
  }
  expect(handles.log.byType("radio.checkin")).toHaveLength(0);
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T04-17 AC1/AC2 — default pack click DAL123 owns white then H270 turns", async () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  const rejected = await handleRadioText(world, "DAL123 H270", handles.log);
  expect(rejected.accepted).toBe(false);
  expect(rejected.reason).toBe("handoff-pending");

  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handlePpiLeftClick(view, world, tick.x, tick.y, 800, 800);
  expect(view.tracks.get(dal.id)!.ownership).toBe("owned");
  expect(trackPaintColor(view.tracks.get(dal.id)!.ownership)).toBe(PALETTE.owned);
  expect(world.sessionLog?.byType("handoff.inbound.accepted")).toHaveLength(1);

  const result = await handleRadioText(world, "DAL123 H270", handles.log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T04-17 AC3 — check-in waits for accept then fires once on NullSpeechPort", async () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  world.simTimeMs = 9000;
  handles.afterPhysicsTick();
  await flushMicrotasks();
  expect(handles.log.byType("radio.checkin")).toHaveLength(0);

  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handlePpiLeftClick(view, world, tick.x, tick.y, 800, 800);
  handles.afterPhysicsTick();
  await flushMicrotasks();
  const events = handles.log.byType("radio.checkin");
  expect(events).toHaveLength(1);
  expect(events[0]?.callsign).toBe("DAL123");
  expect(events[0]?.text).toContain("DEMO ONE");

  handles.afterPhysicsTick();
  await flushMicrotasks();
  expect(handles.log.byType("radio.checkin")).toHaveLength(1);
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("T04-17 AC4 — ils27 click is select-only; H270 works without a prior click", async () => {
  const world = createWorldFromScenario(loadKdemIls27());
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const handles = createApp({
    speech: new NullSpeechPort(),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: instantPlayer(),
  });
  const before = world.sessionLog?.byType("handoff.inbound.accepted")?.length ?? 0;
  const withoutClick = await handleRadioText(world, "DAL123 H270", handles.log);
  expect(withoutClick.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);

  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const tick = nmToScreen(dal.xNm, dal.yNm, view.camera, { widthPx: 800, heightPx: 800 });
  handlePpiLeftClick(view, world, tick.x, tick.y, 800, 800);
  expect(world.selectedAircraftId).toBe(dal.id);
  expect(world.sessionLog?.byType("handoff.inbound.accepted")?.length ?? 0).toBe(before);
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

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

test("replaceWorld dynamically updates app.world and switches scenario traffic", () => {
  const westScenario = loadKdem();
  const initialWorld = createWorldForSession(westScenario, null, 1);
  const app = createApp({
    speech: new NullSpeechPort(),
    world: initialWorld,
  });
  expect(app.world).toBe(initialWorld);
  expect(app.world.aircraft[0]?.intent.lateral?.type).toBe("PROCEDURE");
  if (app.world.aircraft[0]?.intent.lateral?.type === "PROCEDURE") {
    expect(app.world.aircraft[0].intent.lateral.routeFixIds).toContain("MERGE");
  }

  // Switch to East Flow
  const eastScenario = loadPlayableScenario("kdem-09");
  const eastWorld = createWorldForSession(eastScenario, null, 2);
  app.replaceWorld(eastWorld);

  // app.world returns the new world dynamically
  expect(app.world).toBe(eastWorld);
  expect(app.world.aircraft[0]?.intent.lateral?.type).toBe("PROCEDURE");
  if (app.world.aircraft[0]?.intent.lateral?.type === "PROCEDURE") {
    expect(app.world.aircraft[0].intent.lateral.routeFixIds).toContain("WEMER");
    expect(app.world.aircraft[0].intent.lateral.routeFixIds).not.toContain("MERGE");
  }
});
