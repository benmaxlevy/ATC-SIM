/**
 * Wall-clock PTT utterance timing (`glossary.md`: sim time is the wrong clock).
 * Overlay display is T03-09; this ticket only marks t0 and transcript latency.
 * Audio-start stays null until T03-06 playback.
 */

export interface VoiceUtteranceMetrics {
  /** PTT key-up (`performance.now()` or injected `now`). */
  t0: number;
  /** PTT-up → `transcribe` / live STT resolve. null if STT never finished. */
  pttUpToTranscriptMs: number | null;
  /** PTT-up → first audible readback. null until T03-06. */
  pttUpToAudioStartMs: number | null;
}

export function markPttUp(nowMs: number): VoiceUtteranceMetrics {
  return {
    t0: nowMs,
    pttUpToTranscriptMs: null,
    pttUpToAudioStartMs: null,
  };
}

export function recordTranscriptLatency(metrics: VoiceUtteranceMetrics, nowMs: number): void {
  metrics.pttUpToTranscriptMs = Math.max(0, nowMs - metrics.t0);
}
