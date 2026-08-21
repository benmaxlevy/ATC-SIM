/**
 * Wall-clock PTT utterance timing (`glossary.md`: sim time is the wrong clock).
 * Overlay display is T03-09. Audio-start is the source start (or speechSynthesis
 * onstart), not Bluetooth/hardware delay.
 *
 * p50 is an inclusive median: odd length → middle value after sort; even length →
 * average of the two central values. Empty input → null (need n≥1 to display).
 */

export interface VoiceUtteranceMetrics {
  /** PTT key-up (`performance.now()` or injected `now`). */
  t0: number;
  /** PTT-up → `transcribe` / live STT resolve. null if STT never finished. */
  pttUpToTranscriptMs: number | null;
  /** PTT-up → first audible readback start. null if TTS never started. */
  pttUpToAudioStartMs: number | null;
}

/** Last utterance + session p50 of successful audio-start samples. */
export interface VoiceSessionSnapshot {
  backendId: string;
  lastTranscriptMs: number | null;
  lastAudioStartMs: number | null;
  /** Median of successful `ptt_up_to_audio_start_ms` this session. null if n=0. */
  p50AudioStartMs: number | null;
  sampleCount: number;
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

/** Ticket T03-09 name for {@link recordTranscriptLatency}. */
export const markTranscript = recordTranscriptLatency;

/** Ticket T03-09 name for {@link recordAudioStart}. */
export const markAudioStart = recordAudioStart;

/**
 * Inclusive median. Odd `[1,3,2]` → `2`. Even `[1,2,3,4]` → `2.5` (mean of
 * the two middle values after ascending sort). Empty → `null`.
 */
export function percentile50(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid]! + sorted[mid + 1]!) / 2;
}

/** Immutable copy of one utterance’s coordinator metrics (not adapter `latencyMs`). */
export function snapshot(metrics: VoiceUtteranceMetrics): VoiceUtteranceMetrics {
  return {
    t0: metrics.t0,
    pttUpToTranscriptMs: metrics.pttUpToTranscriptMs,
    pttUpToAudioStartMs: metrics.pttUpToAudioStartMs,
  };
}

/**
 * Session accumulator for the overlay: last marks + p50 of successful
 * audio-start samples. Does not log PTT keys or PCM.
 */
export class VoiceLatencyTracker {
  private backendId: string;
  private last: VoiceUtteranceMetrics | null = null;
  private readonly audioStartSamples: number[] = [];
  private readonly recordedAudioStartT0 = new Set<number>();

  constructor(backendId: string) {
    this.backendId = backendId;
  }

  setBackendId(backendId: string): void {
    this.backendId = backendId;
  }

  observe(metrics: VoiceUtteranceMetrics): void {
    this.last = snapshot(metrics);
    const audioMs = metrics.pttUpToAudioStartMs;
    if (audioMs === null || !Number.isFinite(audioMs) || audioMs < 0) {
      return;
    }
    if (this.recordedAudioStartT0.has(metrics.t0)) {
      return;
    }
    this.recordedAudioStartT0.add(metrics.t0);
    this.audioStartSamples.push(audioMs);
  }

  snapshot(): VoiceSessionSnapshot {
    return {
      backendId: this.backendId,
      lastTranscriptMs: this.last?.pttUpToTranscriptMs ?? null,
      lastAudioStartMs: this.last?.pttUpToAudioStartMs ?? null,
      p50AudioStartMs: percentile50(this.audioStartSamples),
      sampleCount: this.audioStartSamples.length,
    };
  }
}
