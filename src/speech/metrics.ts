import type { TranscriptMetadata } from "./types";

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
  /** Measurable STT facts; never used to gate parsing. */
  sttMetadata: TranscriptMetadata | null;
}

export type VoiceLatencyStage = "stt" | "parse" | "tts";

export interface LatencyPercentiles {
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface VoiceStageLatencySnapshot {
  cold: LatencyPercentiles;
  warm: LatencyPercentiles;
}

export type VoiceStageLatencyStats = Record<VoiceLatencyStage, VoiceStageLatencySnapshot>;

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
    sttMetadata: null,
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

/** Log ASR score. Does not skip parse (T03-15). */
export function recordTranscriptMetadata(
  metrics: VoiceUtteranceMetrics,
  metadata: TranscriptMetadata | undefined,
): void {
  metrics.sttMetadata = metadata ?? null;
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

/** Inclusive nearest-rank p95; null means no completed samples. */
export function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index]!;
}

function emptyPercentiles(): LatencyPercentiles {
  return { sampleCount: 0, p50Ms: null, p95Ms: null };
}

function summarize(values: readonly number[]): LatencyPercentiles {
  return {
    sampleCount: values.length,
    p50Ms: percentile50(values),
    p95Ms: percentile95(values),
  };
}

/** Immutable copy of one utterance’s coordinator metrics (not adapter `latencyMs`). */
export function snapshot(metrics: VoiceUtteranceMetrics): VoiceUtteranceMetrics {
  return {
    t0: metrics.t0,
    pttUpToTranscriptMs: metrics.pttUpToTranscriptMs,
    pttUpToAudioStartMs: metrics.pttUpToAudioStartMs,
    sttMetadata: metrics.sttMetadata,
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
  private readonly stageSamples: Record<VoiceLatencyStage, { cold: number[]; warm: number[] }> = {
    stt: { cold: [], warm: [] },
    parse: { cold: [], warm: [] },
    tts: { cold: [], warm: [] },
  };
  private readonly stageSeen = new Set<VoiceLatencyStage>();

  constructor(backendId: string) {
    this.backendId = backendId;
  }

  setBackendId(backendId: string): void {
    if (backendId !== this.backendId) {
      this.stageSeen.clear();
      for (const stage of ["stt", "parse", "tts"] as const) {
        this.stageSamples[stage].cold.length = 0;
        this.stageSamples[stage].warm.length = 0;
      }
    }
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

  /** Record one completed local stage. The first sample per stage is cold. */
  recordStage(stage: VoiceLatencyStage, latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      return;
    }
    const bucket = this.stageSeen.has(stage) ? "warm" : "cold";
    this.stageSeen.add(stage);
    this.stageSamples[stage][bucket].push(Math.max(0, latencyMs));
  }

  stageSnapshot(): VoiceStageLatencyStats {
    const stages = {} as VoiceStageLatencyStats;
    for (const stage of ["stt", "parse", "tts"] as const) {
      stages[stage] = {
        cold: this.stageSamples[stage].cold.length
          ? summarize(this.stageSamples[stage].cold)
          : emptyPercentiles(),
        warm: this.stageSamples[stage].warm.length
          ? summarize(this.stageSamples[stage].warm)
          : emptyPercentiles(),
      };
    }
    return stages;
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
