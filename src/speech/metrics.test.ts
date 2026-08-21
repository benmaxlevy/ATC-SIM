import { expect, test } from "vitest";
import { markPttUp, recordAudioStart, recordTranscriptLatency } from "./metrics";

test("markPttUp stores t0 with null latencies until transcript", () => {
  const metrics = markPttUp(10);
  expect(metrics).toEqual({
    t0: 10,
    pttUpToTranscriptMs: null,
    pttUpToAudioStartMs: null,
  });
  recordTranscriptLatency(metrics, 55);
  expect(metrics.pttUpToTranscriptMs).toBe(45);
  expect(metrics.pttUpToAudioStartMs).toBeNull();
});

test("recordAudioStart writes ptt_up_to_audio_start_ms once (AC5)", () => {
  const metrics = markPttUp(1000);
  recordAudioStart(metrics, 1420);
  expect(metrics.pttUpToAudioStartMs).toBe(420);
  recordAudioStart(metrics, 1500);
  expect(metrics.pttUpToAudioStartMs).toBe(420);
});
