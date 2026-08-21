import { expect, test } from "vitest";
import { EMPTY_CLIP_MS, isEmptyPttCapture } from "./clip-gate";
import {
  TARGET_SAMPLE_RATE,
  float32ToPcm16,
  floatToPcm16Sample,
  resampleFloat32,
  resampleToMonoPcm16,
} from "./resample";

function sine(length: number, freqHz: number, sampleRate: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * amplitude;
  }
  return out;
}

test("TARGET_SAMPLE_RATE is 16 kHz for STT clips", () => {
  expect(TARGET_SAMPLE_RATE).toBe(16000);
});

test("48 kHz one-second sine resamples to 16000 PCM16 samples (AC1, AC6)", () => {
  const inputRate = 48000;
  const input = sine(inputRate, 440, inputRate);
  const pcm16 = resampleToMonoPcm16(input, inputRate);
  expect(pcm16).toBeInstanceOf(Int16Array);
  expect(pcm16.length).toBe(TARGET_SAMPLE_RATE);
  expect(Math.min(...pcm16)).toBeGreaterThanOrEqual(-32768);
  expect(Math.max(...pcm16)).toBeLessThanOrEqual(32767);
  expect(pcm16.some((s) => s !== 0)).toBe(true);
});

test("48 kHz ramp length matches duration × 16000 (± 1 sample slack)", () => {
  const inputRate = 48000;
  const durationS = 0.25;
  const input = new Float32Array(Math.round(inputRate * durationS));
  for (let i = 0; i < input.length; i += 1) {
    input[i] = (i / (input.length - 1)) * 0.9 - 0.45;
  }
  const pcm16 = resampleToMonoPcm16(input, inputRate);
  const expected = Math.round(durationS * TARGET_SAMPLE_RATE);
  expect(Math.abs(pcm16.length - expected)).toBeLessThanOrEqual(1);
});

test("same-rate float converts to PCM16 without changing length", () => {
  const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const pcm16 = resampleToMonoPcm16(input, TARGET_SAMPLE_RATE);
  expect(pcm16.length).toBe(5);
  expect(pcm16[1]).toBe(floatToPcm16Sample(0.5));
  expect(pcm16[4]).toBe(-32768);
});

test("empty or invalid input yields empty PCM16", () => {
  expect(resampleToMonoPcm16(new Float32Array(0), 48000).length).toBe(0);
  expect(resampleFloat32(new Float32Array(8), 0, 16000).length).toBe(0);
  expect(float32ToPcm16(new Float32Array(0)).length).toBe(0);
});

test("PCM16 clamps out-of-range floats", () => {
  expect(floatToPcm16Sample(2)).toBe(32767);
  expect(floatToPcm16Sample(-2)).toBe(-32768);
});

test("empty-clip gate: < 80 ms and no samples is empty (AC5, AC6)", () => {
  expect(isEmptyPttCapture({ durationMs: 50, sampleCount: 0, sampleRate: 48000 })).toBe(true);
  expect(
    isEmptyPttCapture({ durationMs: EMPTY_CLIP_MS - 1, sampleCount: 0, sampleRate: 48000 }),
  ).toBe(true);
});

test("empty-clip gate: usable audio above threshold is not empty", () => {
  expect(
    isEmptyPttCapture({
      durationMs: 200,
      sampleCount: 4800,
      sampleRate: 48000,
    }),
  ).toBe(false);
});

test("empty-clip gate: samples with audio duration under 80 ms is empty", () => {
  expect(
    isEmptyPttCapture({
      durationMs: 500,
      sampleCount: 100,
      sampleRate: 48000,
    }),
  ).toBe(true);
});
