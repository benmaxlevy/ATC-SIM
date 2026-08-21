/**
 * Linear resample of mono float PCM to 16 kHz Int16.
 *
 * Quality: linear interpolation is acceptable for v1 STT (`phases/03-voice` T03-01).
 * Output is little-endian host `Int16Array` (browsers are LE), `channels: 1`.
 */

export const TARGET_SAMPLE_RATE = 16000;

/** Convert one float sample in [-1, 1] to PCM16. */
export function floatToPcm16Sample(sample: number): number {
  const clipped = Math.max(-1, Math.min(1, sample));
  if (clipped < 0) {
    return Math.round(clipped * 32768);
  }
  return Math.round(clipped * 32767);
}

/** Linear resample. Same-rate input is copied (not aliased). */
export function resampleFloat32(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (input.length === 0 || fromRate <= 0 || toRate <= 0) {
    return new Float32Array(0);
  }
  if (fromRate === toRate) {
    return input.slice();
  }
  const durationS = input.length / fromRate;
  const outLen = Math.max(1, Math.round(durationS * toRate));
  const output = new Float32Array(outLen);
  const ratio = fromRate / toRate;
  const last = input.length - 1;
  for (let i = 0; i < outLen; i += 1) {
    const srcIndex = i * ratio;
    const i0 = Math.min(Math.floor(srcIndex), last);
    const i1 = Math.min(i0 + 1, last);
    const frac = srcIndex - i0;
    output[i] = input[i0]! * (1 - frac) + input[i1]! * frac;
  }
  return output;
}

export function float32ToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    out[i] = floatToPcm16Sample(input[i]!);
  }
  return out;
}

/**
 * Resample mono floats to 16 kHz PCM16.
 * `pcm16.length` matches duration × 16000 (± rounding slack).
 */
export function resampleToMonoPcm16(input: Float32Array, inputSampleRate: number): Int16Array {
  const resampled = resampleFloat32(input, inputSampleRate, TARGET_SAMPLE_RATE);
  return float32ToPcm16(resampled);
}
