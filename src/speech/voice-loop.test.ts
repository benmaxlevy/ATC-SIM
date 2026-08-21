import { expect, test, vi } from "vitest";
import { SessionLog, createAircraft, createWorld, type Aircraft, type Command } from "@core";
import { parseCommand } from "@parse";
import { handleRadioCommand, handleRadioText } from "@pilot";
import { NullSpeechPort } from "./null-speech-port";
import type { AudioClip, SpeechPort, Transcript } from "./types";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  createVoiceLoop,
  type ParseCommandFn,
  type VoiceLoopStatus,
} from "./voice-loop";
import type { ReadbackPlayer } from "./playback/readback-player";
import {
  DEFAULT_PTT_KEY,
  createPttCaptureController,
  type CaptureBackend,
  type PttCaptureEvent,
  type PttKeyEvent,
} from "./capture/ptt-controller";

function nonEmptyClip(): AudioClip {
  return {
    sampleRate: 16000,
    channels: 1,
    pcm16: new Int16Array(1600),
  };
}

function sample(callsign: string, id = "ac-dal"): Aircraft {
  return createAircraft({
    id,
    callsign,
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

function fakePort(
  text: string,
  extras: { confidence?: number; latencyMs?: number } = {},
): SpeechPort & {
  transcribeCalls: number;
  lastClip: AudioClip | null;
  synthesizeCalls: number;
  lastSynthesizeText: string | null;
  synthClip: AudioClip;
} {
  const port = {
    id: "fake",
    transcribeCalls: 0,
    lastClip: null as AudioClip | null,
    synthesizeCalls: 0,
    lastSynthesizeText: null as string | null,
    synthClip: nonEmptyClip(),
    async transcribe(audio: AudioClip): Promise<Transcript> {
      port.transcribeCalls += 1;
      port.lastClip = audio;
      return {
        text,
        confidence: extras.confidence ?? 1,
        latencyMs: extras.latencyMs ?? 4,
      };
    },
    async synthesize(readback: string): Promise<AudioClip> {
      port.synthesizeCalls += 1;
      port.lastSynthesizeText = readback;
      return port.synthClip;
    },
  };
  return port;
}

function statusCodes(events: Array<VoiceLoopStatus | null>): Array<VoiceLoopStatus["code"] | null> {
  return events.map((event) => (event === null ? null : event.code));
}

test("DEFAULT_CONFIDENCE_THRESHOLD is 0.55", () => {
  expect(DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.55);
});

test("AC1 — spoken turn left heading two seven zero dispatches voice FLY_HEADING 270 LEFT", async () => {
  const clip = nonEmptyClip();
  const dispatched: Command[] = [];
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    getIssuedAtSimMs: () => 250,
  });

  await loop.handlePttEvent({ type: "ptt-down" });
  await loop.handlePttEvent({ type: "ptt-up", result: { kind: "clip", clip } });

  expect(dispatched).toHaveLength(1);
  const command = dispatched[0]!;
  expect(command.source).toBe("voice");
  expect(command.callsign).toBe("DAL123");
  expect(command.sourceText).toBe("turn left heading two seven zero");
  expect(command.parseStage).toBe("spoken_a");
  expect(command.issuedAtSimMs).toBe(250);
  expect(command.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
});

test("AC2 — voice heading matches typed DAL123 L270 on the same pilot apply", async () => {
  const typedAc = sample("DAL123", "ac-typed");
  const voiceAc = sample("DAL123", "ac-voice");
  const typedWorld = createWorld({ aircraft: [typedAc], simTimeMs: 400 });
  const voiceWorld = createWorld({
    aircraft: [voiceAc],
    simTimeMs: 400,
    selectedAircraftId: "ac-voice",
  });
  const typedLog = new SessionLog();
  const voiceLog = new SessionLog();

  const typed = await handleRadioText(typedWorld, "DAL123 L270", typedLog);
  expect(typed.accepted).toBe(true);
  expect(typed.command?.source).toBe("text");

  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: (command) => {
      handleRadioCommand(voiceWorld, command, voiceLog);
    },
    getSelectedCallsign: () => "DAL123",
    getIssuedAtSimMs: () => voiceWorld.simTimeMs,
  });
  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(voiceAc.intent.assignedHeadingDeg).toBe(typedAc.intent.assignedHeadingDeg);
  expect(voiceAc.intent.turn).toBe(typedAc.intent.turn);
  expect(voiceAc.intent.assignedHeadingDeg).toBe(270);
  expect(voiceAc.intent.turn).toBe("LEFT");
  expect(voiceLog.byType("command.accepted")).toHaveLength(1);
  expect(voiceLog.byType("command.accepted")[0]?.command.source).toBe("voice");
  expect(typedLog.byType("command.accepted")[0]?.command.source).toBe("text");
});

test("AC3 — typed command line H270 is still source text", async () => {
  const dal = sample("DAL123");
  const world = createWorld({ aircraft: [dal], selectedAircraftId: dal.id });
  const result = await handleRadioText(world, "H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.command?.source).toBe("text");
  expect(result.command?.parseStage).toBe("typed");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});

test("AC4 — NullSpeechPort transcribe throw does not dispatch and does not escape", async () => {
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const loop = createVoiceLoop({
    speechPort: new NullSpeechPort(),
    parseCommand,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    onStatus: (reason) => statuses.push(reason),
  });

  await expect(
    loop.handlePttEvent({ type: "ptt-up", result: { kind: "clip", clip: nonEmptyClip() } }),
  ).resolves.toBeUndefined();
  expect(dispatched).toEqual([]);
  expect(statusCodes(statuses)).toEqual(["voice_backend_unavailable"]);
  expect(loop.inFlight).toBe(false);
});

test("AC1 — confidence 0.5 does not parse or dispatch (T03-08)", async () => {
  const parseSpy: ParseCommandFn = vi.fn(parseCommand);
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const dal = sample("DAL123");
  const intentBefore = { ...dal.intent };
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero", { confidence: 0.5 }),
    parseCommand: parseSpy,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    onStatus: (reason) => statuses.push(reason),
  });

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(parseSpy).not.toHaveBeenCalled();
  expect(dispatched).toEqual([]);
  expect(statusCodes(statuses)).toEqual(["low_confidence"]);
  expect(statuses[0]).toMatchObject({ code: "low_confidence", confidence: 0.5 });
  expect(dal.intent).toEqual(intentBefore);
});

test("AC5 — confidence 0.54 does not parse or dispatch", async () => {
  const parseSpy: ParseCommandFn = vi.fn(parseCommand);
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero", { confidence: 0.54 }),
    parseCommand: parseSpy,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    onStatus: (reason) => statuses.push(reason),
  });

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(parseSpy).not.toHaveBeenCalled();
  expect(dispatched).toEqual([]);
  expect(statusCodes(statuses)).toEqual(["low_confidence"]);
});

test("confidence 0.55 is not below threshold and still parses", async () => {
  const parseSpy: ParseCommandFn = vi.fn(parseCommand);
  const dispatched: Command[] = [];
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero", { confidence: 0.55 }),
    parseCommand: parseSpy,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
  });

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(parseSpy).toHaveBeenCalledTimes(1);
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0]?.source).toBe("voice");
});

test("empty clip does not call transcribe", async () => {
  const port = fakePort("ignored");
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    onStatus: (reason) => statuses.push(reason),
  });

  await loop.handlePttEvent({ type: "ptt-up", result: { kind: "empty" } });
  expect(port.transcribeCalls).toBe(0);
  expect(dispatched).toEqual([]);
  expect(statusCodes(statuses)).toEqual(["empty_clip"]);
});

test("transcribe is not called while another is in flight", async () => {
  let release!: (transcript: Transcript) => void;
  const transcribeCalls: AudioClip[] = [];
  const port: SpeechPort = {
    id: "slow",
    transcribe(audio) {
      transcribeCalls.push(audio);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    async synthesize() {
      return nonEmptyClip();
    },
  };
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    onStatus: (reason) => statuses.push(reason),
    setTransmitLocked: vi.fn(),
  });

  const first = loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  await Promise.resolve();
  expect(loop.inFlight).toBe(true);
  expect(transcribeCalls).toHaveLength(1);

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  expect(transcribeCalls).toHaveLength(1);
  expect(statusCodes(statuses)).toEqual(["ptt_locked"]);

  release({ text: "turn left heading two seven zero", confidence: 1, latencyMs: 1 });
  await first;
  expect(dispatched).toHaveLength(1);
  expect(loop.inFlight).toBe(false);
});

test("PTT-up marks t0 and records transcript latency; audio-start stays null", async () => {
  const clock = { ms: 1000 };
  const seen: Array<{ pttUpToTranscriptMs: number | null; pttUpToAudioStartMs: number | null }> =
    [];
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: () => {},
    getSelectedCallsign: () => "DAL123",
    now: () => clock.ms,
    onMetrics: (metrics) => {
      seen.push({
        pttUpToTranscriptMs: metrics.pttUpToTranscriptMs,
        pttUpToAudioStartMs: metrics.pttUpToAudioStartMs,
      });
    },
  });

  clock.ms = 1000;
  const transcribe = loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  clock.ms = 1040;
  await transcribe;

  expect(loop.lastUtteranceMetrics?.t0).toBe(1000);
  expect(loop.lastUtteranceMetrics?.pttUpToTranscriptMs).toBe(40);
  expect(loop.lastUtteranceMetrics?.pttUpToAudioStartMs).toBeNull();
  expect(seen.at(-1)).toEqual({ pttUpToTranscriptMs: 40, pttUpToAudioStartMs: null });
});

test("beginUtterance is called on ptt-down when the port implements it", async () => {
  const begin = vi.fn();
  const port: SpeechPort & { beginUtterance: () => void } = {
    id: "live",
    beginUtterance: begin,
    async transcribe() {
      return { text: "turn left heading two seven zero", confidence: 1, latencyMs: 1 };
    },
    async synthesize() {
      return nonEmptyClip();
    },
  };
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: () => {},
    getSelectedCallsign: () => "DAL123",
  });
  await loop.handlePttEvent({ type: "ptt-down" });
  expect(begin).toHaveBeenCalledTimes(1);
});

test("voice-loop tests run without a DOM", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});

const ACCEPTED_READBACK = "delta one two three turn left heading two seven zero";

function holdingPlayer(onStartNow?: () => number): {
  player: ReadbackPlayer;
  clips: AudioClip[];
  browserTexts: string[];
  release: () => void;
} {
  const clips: AudioClip[] = [];
  const browserTexts: string[] = [];
  let releasePlay: (() => void) | null = null;
  let playing = false;
  const player: ReadbackPlayer = {
    get playing() {
      return playing;
    },
    async warmUp() {},
    async playPcm(clip, hooks) {
      if (playing) {
        return { ok: false, reason: "overlap" };
      }
      clips.push(clip);
      playing = true;
      hooks?.onAudioStart?.(onStartNow?.() ?? 0);
      await new Promise<void>((resolve) => {
        releasePlay = resolve;
      });
      playing = false;
      return { ok: true };
    },
    async playBrowser(text, _voiceId, hooks) {
      if (playing) {
        return { ok: false, reason: "overlap" };
      }
      browserTexts.push(text);
      playing = true;
      hooks?.onAudioStart?.(onStartNow?.() ?? 0);
      await new Promise<void>((resolve) => {
        releasePlay = resolve;
      });
      playing = false;
      return { ok: true };
    },
    stop() {
      playing = false;
      releasePlay?.();
    },
    setConnectSource() {},
  };
  return {
    player,
    clips,
    browserTexts,
    release: () => {
      releasePlay?.();
    },
  };
}

function instantPlayer(onStartNow?: () => number): {
  player: ReadbackPlayer;
  clips: AudioClip[];
  browserTexts: string[];
} {
  const clips: AudioClip[] = [];
  const browserTexts: string[] = [];
  const player: ReadbackPlayer = {
    playing: false,
    async warmUp() {},
    async playPcm(clip, hooks) {
      clips.push(clip);
      hooks?.onAudioStart?.(onStartNow?.() ?? 0);
      return { ok: true };
    },
    async playBrowser(text, _voiceId, hooks) {
      browserTexts.push(text);
      hooks?.onAudioStart?.(onStartNow?.() ?? 0);
      return { ok: true };
    },
    stop() {},
    setConnectSource() {},
  };
  return { player, clips, browserTexts };
}

class FakeCaptureBackend implements CaptureBackend {
  onAudio: ((samples: Float32Array) => void) | null = null;
  startCalls = 0;
  armed = false;

  async ensureStarted(): Promise<{ sampleRate: number }> {
    this.startCalls += 1;
    return { sampleRate: 48000 };
  }

  setArmed(armed: boolean): void {
    this.armed = armed;
  }

  dispose(): void {
    this.onAudio = null;
  }
}

function pttKey(): PttKeyEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    key: DEFAULT_PTT_KEY,
    repeat: false,
    target: null,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
  };
}

async function flushUntil(pred: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (pred()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error(`timed out waiting for ${label}`);
}

test("AC1 — accepted voice command plays the synthesize clip", async () => {
  const port = fakePort("turn left heading two seven zero");
  const synthClip: AudioClip = {
    sampleRate: 16000,
    channels: 1,
    pcm16: Int16Array.from([1, 2, 3, 4]),
  };
  port.synthClip = synthClip;
  const { player, clips } = instantPlayer();
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: () => ({ accepted: true, readback: ACCEPTED_READBACK }),
    getSelectedCallsign: () => "DAL123",
    readbackPlayer: player,
  });

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(port.synthesizeCalls).toBe(1);
  expect(port.lastSynthesizeText).toBe(ACCEPTED_READBACK);
  expect(clips).toEqual([synthClip]);
});

test("AC2 — PTT-down during playback is ignored and not queued", async () => {
  const { player, release } = holdingPlayer();
  const lock = vi.fn();
  const pttEvents: PttCaptureEvent[] = [];
  const backend = new FakeCaptureBackend();
  const ptt = createPttCaptureController({
    onEvent: (event) => pttEvents.push(event),
    backend,
    attachTo: null,
    isSecureContext: true,
  });
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: () => ({ accepted: true, readback: ACCEPTED_READBACK }),
    getSelectedCallsign: () => "DAL123",
    readbackPlayer: player,
    setTransmitLocked: (locked) => {
      lock(locked);
      ptt.setTransmitLocked(locked);
    },
  });

  const pending = loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  await flushUntil(() => player.playing, "playback start");
  expect(lock).toHaveBeenLastCalledWith(true);

  await ptt.handleKeyDown(pttKey());
  expect(pttEvents).toEqual([{ type: "ignored-locked" }]);
  expect(backend.startCalls).toBe(0);

  release();
  await pending;
  ptt.dispose();
  loop.dispose();
});

test("AC3 — lock clears after playback ends so a later PTT can capture", async () => {
  const { player, release } = holdingPlayer();
  const lock = vi.fn();
  const pttEvents: PttCaptureEvent[] = [];
  const backend = new FakeCaptureBackend();
  const ptt = createPttCaptureController({
    onEvent: (event) => pttEvents.push(event),
    backend,
    attachTo: null,
    isSecureContext: true,
  });
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: () => ({ accepted: true, readback: ACCEPTED_READBACK }),
    getSelectedCallsign: () => "DAL123",
    readbackPlayer: player,
    setTransmitLocked: (locked) => {
      lock(locked);
      ptt.setTransmitLocked(locked);
    },
  });

  const pending = loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  await flushUntil(() => player.playing, "playback start");
  expect(player.playing).toBe(true);

  release();
  await pending;
  expect(lock).toHaveBeenLastCalledWith(false);
  expect(loop.inFlight).toBe(false);

  await ptt.handleKeyDown(pttKey());
  expect(pttEvents).toEqual([{ type: "ptt-down" }]);
  expect(backend.startCalls).toBe(1);
  expect(backend.armed).toBe(true);

  ptt.dispose();
  loop.dispose();
});

test("AC4 — synthesize reject after accept keeps intent and returns lock to idle", async () => {
  const port: SpeechPort = {
    id: "fake",
    async transcribe() {
      return { text: "turn left heading two seven zero", confidence: 1, latencyMs: 1 };
    },
    async synthesize() {
      throw new Error("tts down");
    },
  };
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const lock = vi.fn();
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: (command) => {
      dispatched.push(command);
      return { accepted: true, readback: ACCEPTED_READBACK };
    },
    getSelectedCallsign: () => "DAL123",
    setTransmitLocked: lock,
    onStatus: (reason) => statuses.push(reason),
    readbackPlayer: instantPlayer().player,
  });

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dispatched).toHaveLength(1);
  expect(statusCodes(statuses)).toEqual(["tts_failed"]);
  expect(lock).toHaveBeenLastCalledWith(false);
  expect(loop.inFlight).toBe(false);
});

test("AC5 — audio-start fires once per successful play", async () => {
  const clock = { ms: 1000 };
  const starts: number[] = [];
  const inner = instantPlayer(() => clock.ms);
  const player: ReadbackPlayer = {
    ...inner.player,
    async playPcm(clip, hooks) {
      return inner.player.playPcm(clip, {
        onAudioStart: (ms) => {
          starts.push(ms);
          hooks?.onAudioStart?.(ms);
        },
      });
    },
  };
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: () => ({ accepted: true, readback: ACCEPTED_READBACK }),
    getSelectedCallsign: () => "DAL123",
    now: () => clock.ms,
    readbackPlayer: player,
  });

  clock.ms = 1000;
  const pending = loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  clock.ms = 1180;
  await pending;

  expect(starts).toEqual([1180]);
  expect(loop.lastUtteranceMetrics?.pttUpToAudioStartMs).toBe(180);
});

test("web-speech accepted readback uses playBrowser, not the silence clip", async () => {
  const port: SpeechPort = {
    id: "web-speech",
    async transcribe() {
      return { text: "turn left heading two seven zero", confidence: 1, latencyMs: 1 };
    },
    async synthesize() {
      return { sampleRate: 16000, channels: 1, pcm16: new Int16Array(160) };
    },
  };
  const { player, clips, browserTexts } = instantPlayer();
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: () => ({ accepted: true, readback: ACCEPTED_READBACK }),
    getSelectedCallsign: () => "DAL123",
    readbackPlayer: player,
  });

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(browserTexts).toEqual([ACCEPTED_READBACK]);
  expect(clips).toEqual([]);
});

test("T03-08 — generic transcribe throw is stt_failed with no dispatch", async () => {
  const port: SpeechPort = {
    id: "http",
    async transcribe() {
      throw new Error("network");
    },
    async synthesize() {
      return nonEmptyClip();
    },
  };
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    onStatus: (event) => statuses.push(event),
  });

  await expect(
    loop.handlePttEvent({ type: "ptt-up", result: { kind: "clip", clip: nonEmptyClip() } }),
  ).resolves.toBeUndefined();
  expect(dispatched).toEqual([]);
  expect(statusCodes(statuses)).toEqual(["stt_failed"]);
});

test("T03-08 — spoken parse miss does not dispatch and keeps sourceText", async () => {
  const dispatched: Command[] = [];
  const statuses: Array<VoiceLoopStatus | null> = [];
  const misses: Array<{ sourceText: string; error: string }> = [];
  const loop = createVoiceLoop({
    speechPort: fakePort("asdf qwerty please vector"),
    parseCommand,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
    onStatus: (event) => statuses.push(event),
    onParseMiss: (sourceText, error) => {
      misses.push({ sourceText, error });
    },
  });

  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(dispatched).toEqual([]);
  expect(statusCodes(statuses)).toEqual(["parse_miss"]);
  expect(statuses[0]?.sourceText).toBe("asdf qwerty please vector");
  expect(misses).toHaveLength(1);
  expect(misses[0]?.sourceText).toBe("asdf qwerty please vector");
});

test("T03-08 — capture events map to mic/context/capture/ptt codes", async () => {
  const port = fakePort("ignored");
  const statuses: Array<VoiceLoopStatus | null> = [];
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: () => {},
    getSelectedCallsign: () => "DAL123",
    onStatus: (event) => statuses.push(event),
  });

  await loop.handlePttEvent({ type: "permission-denied" });
  await loop.handlePttEvent({ type: "capture-error", reason: "insecure-context" });
  await loop.handlePttEvent({ type: "capture-error", reason: "worklet-failed" });
  await loop.handlePttEvent({ type: "ignored-locked" });

  expect(port.transcribeCalls).toBe(0);
  expect(statusCodes(statuses)).toEqual([
    "mic_denied",
    "insecure_context",
    "capture_failed",
    "ptt_locked",
  ]);
});

test("T03-08 — PTT-down clears status; PTT during playback is ptt_locked and not queued", async () => {
  const { player, release } = holdingPlayer();
  const statuses: Array<VoiceLoopStatus | null> = [];
  const pttEvents: PttCaptureEvent[] = [];
  const backend = new FakeCaptureBackend();
  let loopHandle: ReturnType<typeof createVoiceLoop> | undefined;
  const ptt = createPttCaptureController({
    onEvent: (event) => {
      pttEvents.push(event);
      void loopHandle?.handlePttEvent(event);
    },
    backend,
    attachTo: null,
    isSecureContext: true,
  });
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: () => ({ accepted: true, readback: ACCEPTED_READBACK }),
    getSelectedCallsign: () => "DAL123",
    readbackPlayer: player,
    setTransmitLocked: (locked) => {
      ptt.setTransmitLocked(locked);
    },
    onStatus: (event) => statuses.push(event),
  });
  loopHandle = loop;

  await loop.handlePttEvent({ type: "ptt-down" });
  expect(statusCodes(statuses)).toEqual([null]);

  const pending = loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  await flushUntil(() => player.playing, "playback start");

  await ptt.handleKeyDown(pttKey());
  expect(pttEvents).toEqual([{ type: "ignored-locked" }]);
  expect(backend.startCalls).toBe(0);
  expect(statusCodes(statuses)).toEqual([null, "ptt_locked"]);

  release();
  await pending;
  ptt.dispose();
  loop.dispose();
});
