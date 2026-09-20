/**
 * Diagnostic trace types for parse pipeline and STT observability.
 * All traces originate caller-side (JS/TS) and are flushed asynchronously
 * to speech-api's SQLite trace sink (/debug/traces).
 */

export type StageAttemptStatus = "hit" | "miss" | "rejected" | "skipped";

export interface ParseTraceSttContext {
  text?: string;
  latencyMs?: number;
  audioDurationMs?: number;
  model?: string;
  metadata?: unknown;
  [key: string]: unknown;
}

export interface ParseTraceContext {
  utteranceId?: string;
  source?: string;
  sessionId?: string;
  stt?: ParseTraceSttContext | Record<string, unknown> | null;
  sttJson?: string | Record<string, unknown> | unknown[] | null;
}

export interface SessionTrace {
  sessionId: string;
  startedAt: string;
  appVersion: string;
}

export interface UtteranceTrace {
  utteranceId: string;
  sessionId?: string;
  source: string;
  sttJson?: string | Record<string, unknown> | unknown[] | null;
  finalStage?: string | null;
  finalStatus: string;
  createdAt: string;
}

export interface StageAttemptTrace {
  stage: string;
  status: StageAttemptStatus;
  reason?: string | null;
  elapsedMs: number;
  resultJson?: string | Record<string, unknown> | unknown[] | null;
}

export interface UtteranceTraceEntry {
  utterance: UtteranceTrace;
  stageAttempts: StageAttemptTrace[];
}

export interface TraceBatchPayload {
  session: SessionTrace;
  utterances: UtteranceTraceEntry[];
}

export interface TraceCollectorOptions {
  /**
   * Explicitly enable or disable trace collection.
   * If omitted, falls back to localStorage("atc_parse_traces") === "1"
   * or VITE_ENABLE_PARSE_TRACES === "1". Disabled by default.
   */
  enabled?: boolean;

  /**
   * Endpoint for batch trace ingestion.
   * Default: http://127.0.0.1:8090/debug/traces
   */
  endpointUrl?: string;

  /**
   * Max FIFO queue capacity before dropping oldest entries.
   * Default: 100.
   */
  maxQueueSize?: number;

  /**
   * Interval (ms) for debounced or periodic auto-flush.
   * Set <= 0 to disable auto-flush (explicit flush only).
   * Default: 2000 ms.
   */
  flushIntervalMs?: number;

  /**
   * Network request timeout in milliseconds.
   * Default: 3000 ms.
   */
  flushTimeoutMs?: number;

  /**
   * Injectable fetch function (defaults to globalThis.fetch).
   */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  /**
   * Overrides for session metadata.
   */
  session?: Partial<SessionTrace>;
  sessionId?: string;
  startedAt?: string;
  appVersion?: string;
}
