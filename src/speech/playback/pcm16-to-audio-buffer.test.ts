import { expect, test } from "vitest";
import { PCM16_SCALE, pcm16ToFloat32 } from "./pcm16-to-audio-buffer";

test("pcm16ToFloat32 maps 32767 and -32768 onto the unit interval (AC6)", () => {
  const pcm16 = new Int16Array([32767, -32768, 0, 16384]);
  const floats = pcm16ToFloat32(pcm16);
  expect(floats).toBeInstanceOf(Float32Array);
  expect(floats.length).toBe(4);
  expect(floats[0]).toBeCloseTo(32767 / PCM16_SCALE, 7);
  expect(floats[1]).toBe(-1);
  expect(floats[2]).toBe(0);
  expect(floats[3]).toBeCloseTo(0.5, 5);
});

test("empty pcm16 yields an empty float buffer", () => {
  expect(pcm16ToFloat32(new Int16Array(0))).toEqual(new Float32Array(0));
});
