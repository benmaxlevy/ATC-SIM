import { expect, test } from "vitest";
import {
  VoiceLatencyTracker,
  markAudioStart,
  markPttUp,
  markTranscript,
  percentile50,
  recordAudioStart,
  recordSttConfidence,
  recordTranscriptLatency,
  snapshot,
} from "./metrics";

test("markPttUp stores t0 with null latencies until transcript", () => {
  const metrics = markPttUp(10);
  expect(metrics).toEqual({
    t0: 10,
    pttUpToTranscriptMs: null,
    pttUpToAudioStartMs: null,
    sttConfidence: null,
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

test("AC3 — odd-length p50 is the middle value after sort", () => {
  expect(percentile50([1, 3, 2])).toBe(2);
});

test("AC5 — even-length p50 is the mean of the two middle values", () => {
  expect(percentile50([1, 2, 3, 4])).toBe(2.5);
  expect(percentile50([])).toBeNull();
  expect(percentile50([9])).toBe(9);
});

test("recordSttConfidence logs ASR score without aliasing on snapshot (T03-15)", () => {
  const metrics = markPttUp(10);
  recordSttConfidence(metrics, 0.5);
  expect(metrics.sttConfidence).toBe(0.5);
  const copy = snapshot(metrics);
  expect(copy.sttConfidence).toBe(0.5);
  metrics.sttConfidence = 0.9;
  expect(copy.sttConfidence).toBe(0.5);
});

test("snapshot copies utterance marks without aliasing", () => {
  const metrics = markPttUp(100);
  markTranscript(metrics, 140);
  markAudioStart(metrics, 180);
  const copy = snapshot(metrics);
  expect(copy).toEqual({
    t0: 100,
    pttUpToTranscriptMs: 40,
    pttUpToAudioStartMs: 80,
    sttConfidence: null,
  });
  expect(copy.pttUpToAudioStartMs).toBeGreaterThanOrEqual(copy.pttUpToTranscriptMs!);
  metrics.pttUpToTranscriptMs = 0;
  expect(copy.pttUpToTranscriptMs).toBe(40);
});

test("VoiceLatencyTracker p50 uses successful audio-start samples only", () => {
  const tracker = new VoiceLatencyTracker("http");
  const miss = markPttUp(0);
  markTranscript(miss, 50);
  tracker.observe(miss);
  expect(tracker.snapshot()).toEqual({
    backendId: "http",
    lastTranscriptMs: 50,
    lastAudioStartMs: null,
    p50AudioStartMs: null,
    sampleCount: 0,
  });

  const first = markPttUp(1000);
  markTranscript(first, 1040);
  markAudioStart(first, 1180);
  tracker.observe(first);
  tracker.observe(first);
  expect(tracker.snapshot().sampleCount).toBe(1);
  expect(tracker.snapshot().p50AudioStartMs).toBe(180);

  const second = markPttUp(2000);
  markTranscript(second, 2010);
  markAudioStart(second, 2100);
  tracker.observe(second);
  expect(tracker.snapshot().sampleCount).toBe(2);
  expect(tracker.snapshot().p50AudioStartMs).toBe(140);
  expect(tracker.snapshot().lastTranscriptMs).toBe(10);
  expect(tracker.snapshot().lastAudioStartMs).toBe(100);
});
