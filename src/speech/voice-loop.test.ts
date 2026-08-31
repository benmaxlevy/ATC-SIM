import { expect, test, vi } from "vitest";
import { type Command } from "@core";
import { parseCommand } from "@parse";
import { NullSpeechPort, type AudioClip, type SpeechPort, type Transcript } from "./index";
import { createVoiceLoop, type ParseCommandFn, type VoiceLoopStatus } from "./voice-loop";

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
      return { text, confidence: 1, latencyMs: 4 };
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
