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
): SpeechPort & { transcribeCalls: number; lastClip: AudioClip | null } {
  const port = {
    id: "fake",
    transcribeCalls: 0,
    lastClip: null as AudioClip | null,
    async transcribe(audio: AudioClip): Promise<Transcript> {
      port.transcribeCalls += 1;
      port.lastClip = audio;
      return {
        text,
        confidence: extras.confidence ?? 1,
        latencyMs: extras.latencyMs ?? 4,
      };
    },
    async synthesize(): Promise<AudioClip> {
      return nonEmptyClip();
    },
  };
  return port;
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
  const statuses: VoiceLoopStatus[] = [];
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
  expect(statuses).toEqual(["transcribe-failed"]);
  expect(loop.inFlight).toBe(false);
});

test("AC5 — confidence 0.54 does not parse or dispatch", async () => {
  const parseSpy: ParseCommandFn = vi.fn(parseCommand);
  const dispatched: Command[] = [];
  const statuses: VoiceLoopStatus[] = [];
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
  expect(statuses).toEqual(["low-confidence"]);
});

test("empty clip does not call transcribe", async () => {
  const port = fakePort("ignored");
  const dispatched: Command[] = [];
  const statuses: VoiceLoopStatus[] = [];
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
  expect(statuses).toEqual(["empty-clip"]);
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
  const statuses: VoiceLoopStatus[] = [];
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
  expect(statuses).toEqual(["busy"]);

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
