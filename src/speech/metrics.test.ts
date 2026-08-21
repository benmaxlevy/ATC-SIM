import { expect, test } from "vitest";
import { markPttUp, recordTranscriptLatency } from "./metrics";

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
