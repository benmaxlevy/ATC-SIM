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

test("voice-loop forwards traceContext with STT latency, duration, metadata to parseCommand", async () => {
  const port: SpeechPort = {
    id: "fake-stt",
    async transcribe(): Promise<Transcript> {
      return {
        text: "turn left heading 270",
        latencyMs: 98,
        metadata: {
          model: "whisper-test",
          audioDurationMs: 800,
          inferenceLatencyMs: 90,
        },
      };
    },
    async synthesize(): Promise<AudioClip> {
      return nonEmptyClip();
    },
  };

  const parseSpy: ParseCommandFn = vi.fn(async () => ({
    ok: true as const,
    callsignToken: "DAL123",
    instructions: [{ type: "FLY_HEADING" as const, headingDeg: 270, turn: "LEFT" as const }],
    sourceText: "turn left heading 270",
  }));

  const loop = createVoiceLoop({
    speechPort: port,
    parseCommand: parseSpy,
    dispatchCommand: () => ({ accepted: true, readback: "Turning left 270" }),
    getSelectedCallsign: () => "DAL123",
  });

  await loop.handlePttEvent({ type: "ptt-down" });
  await loop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: nonEmptyClip() },
  });

  expect(parseSpy).toHaveBeenCalledOnce();
  const callOpts = vi.mocked(parseSpy).mock.calls[0]![1];
  expect(callOpts.traceContext).toBeDefined();
  expect(callOpts.traceContext?.source).toBe("voice");
  expect(callOpts.traceContext?.utteranceId).toBeDefined();
  expect(callOpts.traceContext?.stt).toMatchObject({
    text: "turn left heading 270",
    latencyMs: 98,
    model: "whisper-test",
    audioDurationMs: expect.any(Number),
    metadata: {
      model: "whisper-test",
      audioDurationMs: 800,
      inferenceLatencyMs: 90,
    },
  });
});
