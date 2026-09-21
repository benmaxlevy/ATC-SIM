/**
 * Caller-side in-memory trace collector and asynchronous transport.
 * Buffers parser and STT telemetry in a bounded FIFO queue and flushes
 * to speech-api's SQLite trace sink without blocking or throwing.
 */

import type {
  SessionTrace,
  StageAttemptTrace,
  TraceBatchPayload,
  TraceCollectorOptions,
  UtteranceTrace,
  UtteranceTraceEntry,
} from "./types";

export const DEFAULT_TRACE_URL = "http://127.0.0.1:8090/debug/traces";
export const DEFAULT_MAX_QUEUE_SIZE = 100;
export const DEFAULT_FLUSH_INTERVAL_MS = 2000;
export const DEFAULT_FLUSH_TIMEOUT_MS = 3000;
export const DEFAULT_APP_VERSION = "0.1.0";
export const TRACE_STORAGE_KEY = "atc_parse_traces";

function isTraceStorageEnabled(): boolean {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      return localStorage.getItem(TRACE_STORAGE_KEY) === "1";
    }
    if (
      typeof window !== "undefined" &&
      window.localStorage &&
      typeof window.localStorage.getItem === "function"
    ) {
      return window.localStorage.getItem(TRACE_STORAGE_KEY) === "1";
    }
  } catch {
    // Storage access blocked or unavailable
  }
  return false;
}

function getEnvVar(name: string): string | undefined {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    if (meta?.env?.[name] !== undefined) {
      return meta.env[name];
    }
  } catch {
    // Ignore
  }
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    return g.process?.env?.[name];
  } catch {
    // Ignore
  }
  return undefined;
}

function isTraceEnvEnabled(): boolean {
  return getEnvVar("VITE_ENABLE_PARSE_TRACES") === "1";
}

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveEndpoint(url?: string): string {
  if (url && url.trim().length > 0) {
    return url.trim();
  }
  const envUrl = getEnvVar("VITE_TRACE_URL");
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim();
  }
  return DEFAULT_TRACE_URL;
}

export class TraceCollector {
  private explicitEnabled?: boolean;
  readonly endpointUrl: string;
  readonly maxQueueSize: number;
  readonly flushIntervalMs: number;
  readonly flushTimeoutMs: number;
  private readonly fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  private session: SessionTrace;
  private queue: UtteranceTraceEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightFlush: Promise<boolean> | null = null;

  constructor(options: TraceCollectorOptions = {}) {
    this.explicitEnabled = options.enabled;
    this.endpointUrl = resolveEndpoint(options.endpointUrl);
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.flushTimeoutMs = options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
    this.fetchFn =
      options.fetch ??
      (globalThis.fetch
        ? globalThis.fetch.bind(globalThis)
        : async () => new Response("{}", { status: 503 }));

    this.session = {
      sessionId: options.sessionId ?? options.session?.sessionId ?? generateSessionId(),
      startedAt: options.startedAt ?? options.session?.startedAt ?? new Date().toISOString(),
      appVersion: options.appVersion ?? options.session?.appVersion ?? DEFAULT_APP_VERSION,
    };
  }

  /**
   * Returns true if trace collection is currently enabled.
   * Order of precedence:
   * 1. Programmatic explicit override (if set via options.enabled or setEnabled)
   * 2. localStorage item "atc_parse_traces" === "1"
   * 3. Environment variable VITE_ENABLE_PARSE_TRACES === "1"
   * Default is false.
   */
  isEnabled(): boolean {
    if (this.explicitEnabled !== undefined) {
      return this.explicitEnabled;
    }
    return isTraceStorageEnabled() || isTraceEnvEnabled();
  }

  enable(): void {
    this.explicitEnabled = true;
  }

  disable(): void {
    this.explicitEnabled = false;
  }

  setEnabled(enabled?: boolean): void {
    this.explicitEnabled = enabled;
  }

  getSession(): Readonly<SessionTrace> {
    return { ...this.session };
  }

  setSession(session: Partial<SessionTrace>): void {
    this.session = {
      ...this.session,
      ...session,
    };
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  getQueue(): readonly UtteranceTraceEntry[] {
    return [...this.queue];
  }

  /**
   * Enqueues an utterance trace and optional stage attempts.
   * If trace collection is disabled, this is a zero-allocation no-op.
   * Bounded to maxQueueSize (FIFO eviction drops oldest entry on overflow).
   */
  recordUtteranceTrace(
    entryOrUtterance: UtteranceTraceEntry | UtteranceTrace,
    stageAttempts?: StageAttemptTrace[],
  ): void {
    if (!this.isEnabled()) {
      return;
    }

    if (this.maxQueueSize <= 0) {
      return;
    }

    let entry: UtteranceTraceEntry;
    if ("utterance" in entryOrUtterance) {
      const u = entryOrUtterance.utterance;
      entry = {
        utterance: {
          utteranceId: u.utteranceId,
          sessionId: u.sessionId ?? this.session.sessionId,
          source: u.source,
          sttJson: u.sttJson,
          finalStage: u.finalStage,
          finalStatus: u.finalStatus,
          createdAt: u.createdAt,
        },
        stageAttempts: entryOrUtterance.stageAttempts ? [...entryOrUtterance.stageAttempts] : [],
      };
    } else {
      entry = {
        utterance: {
          utteranceId: entryOrUtterance.utteranceId,
          sessionId: entryOrUtterance.sessionId ?? this.session.sessionId,
          source: entryOrUtterance.source,
          sttJson: entryOrUtterance.sttJson,
          finalStage: entryOrUtterance.finalStage,
          finalStatus: entryOrUtterance.finalStatus,
          createdAt: entryOrUtterance.createdAt,
        },
        stageAttempts: stageAttempts ? [...stageAttempts] : [],
      };
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push(entry);

    this.scheduleAutoFlush();
  }

  /**
   * Alias for recordUtteranceTrace.
   */
  record(
    entryOrUtterance: UtteranceTraceEntry | UtteranceTrace,
    stageAttempts?: StageAttemptTrace[],
  ): void {
    this.recordUtteranceTrace(entryOrUtterance, stageAttempts);
  }

  private scheduleAutoFlush(): void {
    if (this.flushIntervalMs <= 0 || this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  /**
   * Asynchronously flushes all enqueued traces in a single batch POST.
   * Safe against concurrent calls: serializes executions and never duplicates items.
   * Fail-safe: Catches network / HTTP errors, drops failed batch, and never throws into caller.
   */
  async flush(): Promise<boolean> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.inFlightFlush) {
      try {
        await this.inFlightFlush;
      } catch {
        // Safe absorption
      }
    }

    if (this.queue.length === 0) {
      return false;
    }

    const batch = this.queue.splice(0, this.queue.length);
    const flushPromise = this.sendBatch(batch);
    this.inFlightFlush = flushPromise;

    try {
      return await flushPromise;
    } finally {
      if (this.inFlightFlush === flushPromise) {
        this.inFlightFlush = null;
      }
    }
  }

  private async sendBatch(batch: UtteranceTraceEntry[]): Promise<boolean> {
    if (batch.length === 0) {
      return false;
    }

    const payload: TraceBatchPayload = {
      session: this.session,
      utterances: batch,
    };

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      controller && this.flushTimeoutMs > 0
        ? setTimeout(() => controller.abort(), this.flushTimeoutMs)
        : null;

    try {
      const res = await this.fetchFn(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (!res.ok) {
        console.debug?.(`TraceCollector: flush returned HTTP ${res.status}`);
        return false;
      }

      return true;
    } catch (err) {
      console.debug?.("TraceCollector: flush network error", err);
      return false;
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Resets queue contents and cancels any pending auto-flush timer.
   */
  reset(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.queue = [];
  }

  /**
   * Destroys the collector, cancelling timers and clearing queues.
   */
  destroy(): void {
    this.reset();
  }
}

let globalCollector: TraceCollector | null = null;

export function getTraceCollector(): TraceCollector {
  if (!globalCollector) {
    globalCollector = new TraceCollector();
  }
  return globalCollector;
}

export function setTraceCollector(collector: TraceCollector | null): void {
  globalCollector = collector;
}
