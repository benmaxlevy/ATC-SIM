import { expect, test } from "vitest";
import { SpeechNotAvailableError } from "./errors";
import { NullSpeechPort } from "./null-speech-port";
import type { AudioClip, Transcript } from "./types";

function silentClip(): AudioClip {
  return {
    sampleRate: 16000,
    channels: 1,
    pcm16: new Int16Array(1600),
  };
}

test("NullSpeechPort id is null", () => {
  expect(new NullSpeechPort().id).toBe("null");
});

test("transcribe rejects with SpeechNotAvailableError", async () => {
  const port = new NullSpeechPort();
  await expect(port.transcribe(silentClip())).rejects.toBeInstanceOf(
    SpeechNotAvailableError,
  );
  await expect(port.transcribe(silentClip())).rejects.toThrow(
    "NullSpeechPort cannot transcribe",
  );
});

test("synthesize returns 16 kHz mono PCM16 silence", async () => {
  const port = new NullSpeechPort();
  const clip = await port.synthesize("ignored", "voice");
  expect(clip.sampleRate).toBe(16000);
  expect(clip.channels).toBe(1);
  expect(clip.pcm16).toBeInstanceOf(Int16Array);
  expect(clip.pcm16.length).toBeGreaterThan(0);
  expect(clip.pcm16.every((sample) => sample === 0)).toBe(true);
});

test("AudioClip and Transcript field names match the SpeechPort contract", () => {
  const clip: AudioClip = silentClip();
  const transcript: Transcript = {
    text: "",
    confidence: 0,
    latencyMs: 0,
  };
  expect(clip.channels).toBe(1);
  expect(clip.pcm16).toBeInstanceOf(Int16Array);
  expect(transcript).toEqual({ text: "", confidence: 0, latencyMs: 0 });
});
