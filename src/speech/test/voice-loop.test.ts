import { expect, test, vi } from "vitest";
import { type Command } from "@core";
import { parseCommand } from "@parse";
import { NullSpeechPort, type AudioClip, type SpeechPort, type Transcript } from "../index";
import { createVoiceLoop, type ParseCommandFn, type VoiceLoopStatus } from "../voice-loop";
import type { ReadbackPlayer } from "../playback/readback-player";

function nonEmptyClip(): AudioClip {
  return {
    sampleRate: 16000,
    channels: 1,
    pcm16: new Int16Array(1600),
  };
}

function fakePort(text: string): SpeechPort {
  return {
    id: "fake",
    async transcribe(): Promise<Transcript> {
      return { text, latencyMs: 4 };
    },
    async synthesize(): Promise<AudioClip> {
      return nonEmptyClip();
    },
  };
}

test("spoken heading dispatches voice FLY_HEADING 270 LEFT", async () => {
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
  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0]!.source).toBe("voice");
  expect(dispatched[0]!.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
  ]);
});

test("accepted voice readback unlocks PTT after the utterance finishes", async () => {
  const locks: boolean[] = [];
  const mockPlayer: ReadbackPlayer = {
    playing: false,
    fxEnabled: true,
    warmUp: vi.fn(async () => {}),
    playPcm: vi.fn(async () => ({ ok: true as const })),
    stop: vi.fn(),
    setConnectSource: vi.fn(),
    setFxEnabled: vi.fn(),
  };
  const loop = createVoiceLoop({
    speechPort: fakePort("turn left heading two seven zero"),
    parseCommand,
    dispatchCommand: () => ({ accepted: true, readback: "DAL123 heading 270" }),
    getSelectedCallsign: () => "DAL123",
    readbackPlayer: mockPlayer,
    setTransmitLocked: (locked) => locks.push(locked),
  });

  await loop.handlePttEvent({ type: "ptt-down" });
  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(loop.busy).toBe(false);
  expect(locks.at(-1)).toBe(false);
});

test("empty clip does not transcribe", async () => {
  const parseSpy: ParseCommandFn = vi.fn(parseCommand);
  const statuses: Array<VoiceLoopStatus | null> = [];
  const loop = createVoiceLoop({
    speechPort: fakePort("ignored"),
    parseCommand: parseSpy,
    dispatchCommand: () => {},
    getSelectedCallsign: () => "DAL123",
    onStatus: (reason) => statuses.push(reason),
  });
  await loop.handlePttEvent({ type: "ptt-up", result: { kind: "empty" } });
  expect(parseSpy).not.toHaveBeenCalled();
  expect(statuses[0]?.code).toBe("empty_clip");
});

test("NullSpeechPort transcribe throw does not dispatch", async () => {
  const dispatched: Command[] = [];
  const parseSpy: ParseCommandFn = vi.fn(parseCommand);
  const loop = createVoiceLoop({
    speechPort: new NullSpeechPort(),
    parseCommand: parseSpy,
    dispatchCommand: (command) => {
      dispatched.push(command);
    },
    getSelectedCallsign: () => "DAL123",
  });
  await expect(
    loop.handlePttEvent({ type: "ptt-up", result: { kind: "clip", clip: nonEmptyClip() } }),
  ).resolves.toBeUndefined();
  expect(parseSpy).not.toHaveBeenCalled();
  expect(dispatched).toEqual([]);
});

test("PTT parser receives structured fix vocabulary while STT keeps its id projection", async () => {
  const parseSpy: ParseCommandFn = vi.fn(async (_text, _options) => ({
    ok: false as const,
    error: "PARSE_MISS",
    sourceText: "proceed direct athens",
  }));
  const loop = createVoiceLoop({
    speechPort: fakePort("proceed direct athens"),
    parseCommand: parseSpy,
    dispatchCommand: () => {},
    getSelectedCallsign: () => "DAL123",
    getCatalogFixIds: () => [{ id: "AHN", kind: "NAVAID", aliases: ["Athens"] }],
    getCatalogRouteCandidates: () => [{ id: "AHN", kind: "NAVAID", aliases: ["Athens"] }],
    getSttFixIds: () => ["AHN"],
  });

  await loop.handlePttEvent({ type: "ptt-up", result: { kind: "clip", clip: nonEmptyClip() } });

  expect(parseSpy).toHaveBeenCalledWith(
    "proceed direct athens",
    expect.objectContaining({
      fixes: [{ id: "AHN", kind: "NAVAID", aliases: ["Athens"] }],
      routeCandidates: [{ id: "AHN", kind: "NAVAID", aliases: ["Athens"] }],
    }),
  );
});

test("busy covers TTS synthesis so a second pilot call cannot preempt the visible callup", async () => {
  let resolveSynth!: (clip: AudioClip) => void;
  const synthGate = new Promise<AudioClip>((resolve) => {
    resolveSynth = resolve;
  });
  const port: SpeechPort = {
    id: "fake",
    async transcribe(): Promise<Transcript> {
      return { text: "", latencyMs: 1 };
    },
    synthesize: () => synthGate,
  };
  const mockPlayer: ReadbackPlayer = {
    playing: false,
    fxEnabled: true,
    warmUp: vi.fn(async () => {}),
    playPcm: vi.fn(async () => ({ ok: true as const })),
    stop: vi.fn(),
    setConnectSource: vi.fn(),
    setFxEnabled: vi.fn(),
  };
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: () => {},
    getSelectedCallsign: () => null,
    readbackPlayer: mockPlayer,
  });
  const pending = loop.playReadback(
    "N123, 15 miles north of KPDK, request flight following",
    "N123",
  );
  // Synthesis committed but unresolved: the radio is busy, so pilot queue
  // drains hold instead of replacing the callup text mid-stream.
  expect(loop.busy).toBe(true);
  resolveSynth(nonEmptyClip());
  await pending;
  expect(loop.busy).toBe(false);
});

test("stale TTS stream finishing first does not clear newer callup text", async () => {
  let resolveSynthA!: (clip: AudioClip) => void;
  let resolveSynthB!: (clip: AudioClip) => void;
  const synthA = new Promise<AudioClip>((resolve) => {
    resolveSynthA = resolve;
  });
  const synthB = new Promise<AudioClip>((resolve) => {
    resolveSynthB = resolve;
  });
  let synthCalls = 0;
  const port: SpeechPort = {
    id: "fake",
    async transcribe(): Promise<Transcript> {
      return { text: "", latencyMs: 1 };
    },
    synthesize: () => {
      synthCalls += 1;
      return synthCalls === 1 ? synthA : synthB;
    },
  };
  const statuses: Array<VoiceLoopStatus | null> = [];
  const mockPlayer: ReadbackPlayer = {
    playing: false,
    fxEnabled: true,
    warmUp: vi.fn(async () => {}),
    playPcm: vi.fn(async () => ({ ok: true as const })),
    stop: vi.fn(),
    setConnectSource: vi.fn(),
    setFxEnabled: vi.fn(),
  };
  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    dispatchCommand: () => {},
    getSelectedCallsign: () => null,
    onStatus: (status) => statuses.push(status),
    readbackPlayer: mockPlayer,
  });
  const first = loop.playReadback("N123, 15 miles north of KPDK, request flight following", "N123");
  const second = loop.playReadback("Approach, DAL123, descending via DEMO ONE arrival", "DAL123");
  resolveSynthA(nonEmptyClip());
  await first;
  // Older stream done while newer still synthesizing: line must not clear.
  expect(statuses).not.toContain(null);
  resolveSynthB(nonEmptyClip());
  await second;
  expect(statuses[statuses.length - 1]).toBe(null);
});

test("rejected command with callsign and readback synthesizes and plays unable readback clip", async () => {
  const port = fakePort("slow to one two zero");
  const rejectionClip = nonEmptyClip();
  const synthSpy = vi.spyOn(port, "synthesize").mockResolvedValue(rejectionClip);
  const playPcmSpy = vi.fn(async () => ({ ok: true as const }));
  const mockPlayer: ReadbackPlayer = {
    playing: false,
    fxEnabled: true,
    warmUp: vi.fn(async () => {}),
    playPcm: playPcmSpy,
    stop: vi.fn(),
    setConnectSource: vi.fn(),
    setFxEnabled: vi.fn(),
  };

  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand,
    readbackPlayer: mockPlayer,
    dispatchCommand: () => ({
      accepted: false,
      readback: "DAL123 unable speed 120, minimum is 150",
      command: { callsign: "DAL123" },
    }),
    getSelectedCallsign: () => "DAL123",
  });

  await loop.handlePttEvent({ type: "ptt-down" });
  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(synthSpy).toHaveBeenCalledWith(
    expect.stringContaining("unable speed"),
    expect.any(String),
  );
  expect(playPcmSpy).toHaveBeenCalledWith(rejectionClip, expect.anything());
});
