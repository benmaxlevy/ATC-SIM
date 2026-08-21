/**
 * pcm16 → float32 for Web Audio buffers. Radio FX (T03-07) consume the
 * AudioBufferSource built from this conversion; this module stays graph-free.
 */

import type { AudioClip } from "../types";

/** Int16 full-scale used by Web Audio. `-32768 / 32768 === -1`. */
export const PCM16_SCALE = 32768;

export function pcm16ToFloat32(pcm16: Int16Array): Float32Array {
  const out = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i += 1) {
    out[i] = pcm16[i]! / PCM16_SCALE;
  }
  return out;
}

/**
 * Copy a mono {@link AudioClip} into an `AudioBuffer` (channel 0).
 * Caller creates the buffer so tests can skip a real AudioContext.
 */
export function copyClipToAudioBuffer(buffer: AudioBuffer, clip: AudioClip): void {
  const floats = pcm16ToFloat32(clip.pcm16);
  const channel = buffer.getChannelData(0);
  const n = Math.min(channel.length, floats.length);
  channel.set(floats.subarray(0, n));
}

export function createAudioBufferFromClip(ctx: AudioContext, clip: AudioClip): AudioBuffer {
  const length = Math.max(1, clip.pcm16.length);
  const sampleRate = clip.sampleRate > 0 ? clip.sampleRate : 16000;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  copyClipToAudioBuffer(buffer, clip);
  return buffer;
}
