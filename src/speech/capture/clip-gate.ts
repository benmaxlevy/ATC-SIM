/** Clips shorter than this are empty — do not send to STT later (T03-08). */
export const EMPTY_CLIP_MS = 80;

/**
 * True when a PTT hold has no usable audio: no samples, wall time under
 * {@link EMPTY_CLIP_MS}, or captured audio duration under that threshold.
 */
export function isEmptyPttCapture(options: {
  durationMs: number;
  sampleCount: number;
  sampleRate: number;
}): boolean {
  if (options.sampleCount <= 0) {
    return true;
  }
  if (options.durationMs < EMPTY_CLIP_MS) {
    return true;
  }
  if (options.sampleRate <= 0) {
    return true;
  }
  const audioMs = (options.sampleCount / options.sampleRate) * 1000;
  return audioMs < EMPTY_CLIP_MS;
}
