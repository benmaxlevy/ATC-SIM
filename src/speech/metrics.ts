/**
 * Wall-clock PTT utterance timing (`glossary.md`: sim time is the wrong clock).
 * Overlay display is T03-09. Audio-start is the source start (or speechSynthesis
 * onstart), not Bluetooth/hardware delay.
 */

export interface VoiceUtteranceMetrics {
  /** PTT key-up (`performance.now()` or injected `now`). */
  t0: number;
  /** PTT-up → `transcribe` / live STT resolve. null if STT never finished. */
  pttUpToTranscriptMs: number | null;
  /** PTT-up → first audible readback start. null if TTS never started. */
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

/** First successful play start only. Later calls are ignored. */
export function recordAudioStart(metrics: VoiceUtteranceMetrics, nowMs: number): void {
  if (metrics.pttUpToAudioStartMs !== null) {
    return;
  }
  metrics.pttUpToAudioStartMs = Math.max(0, nowMs - metrics.t0);
}
