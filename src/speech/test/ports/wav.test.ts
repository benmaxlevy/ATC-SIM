import { expect, test } from "vitest";
import type { AudioClip } from "../..";
import { isWav, pcm16ToWav, uint8ToArrayBuffer, wavToAudioClip } from "../../ports/wav";

function clip(pcm16: Int16Array, sampleRate = 16000): AudioClip {
  return { sampleRate, channels: 1, pcm16 };
}

test("pcm16ToWav writes a 44-byte RIFF header plus PCM16 body", () => {
  const samples = new Int16Array([0, 1, -1, 32767, -32768]);
  const wav = pcm16ToWav(clip(samples));
  expect(wav.byteLength).toBe(44 + samples.length * 2);
  expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
  expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
  expect(String.fromCharCode(...wav.subarray(12, 16))).toBe("fmt ");
  expect(String.fromCharCode(...wav.subarray(36, 40))).toBe("data");
  expect(isWav(wav)).toBe(true);

  const view = new DataView(wav.buffer);
  expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
  expect(view.getUint16(20, true)).toBe(1);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint16(34, true)).toBe(16);
  expect(view.getUint32(40, true)).toBe(samples.length * 2);
});

test("wav round-trip keeps PCM16 samples and native sampleRate", () => {
  const samples = new Int16Array([0, 1, -1, 32767, -32768, 42]);
  const encoded = pcm16ToWav(clip(samples, 24000));
  const decoded = wavToAudioClip(encoded);
  expect(decoded.channels).toBe(1);
  expect(decoded.sampleRate).toBe(24000);
  expect(Array.from(decoded.pcm16)).toEqual(Array.from(samples));
});

test("wavToAudioClip keeps 22050 Hz without resampling", () => {
  const encoded = pcm16ToWav(clip(new Int16Array([100, -100]), 22050));
  expect(wavToAudioClip(encoded).sampleRate).toBe(22050);
});

test("isWav rejects non-RIFF bytes", () => {
  expect(isWav(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  expect(isWav(new Uint8Array(0))).toBe(false);
});

test("uint8ToArrayBuffer copies bytes into a standalone ArrayBuffer", () => {
  const src = new Uint8Array([82, 73, 70, 70]);
  const buffer = uint8ToArrayBuffer(src);
  expect(buffer).toBeInstanceOf(ArrayBuffer);
  expect(Array.from(new Uint8Array(buffer))).toEqual([82, 73, 70, 70]);
  src[0] = 0;
  expect(new Uint8Array(buffer)[0]).toBe(82);
});
