/**
 * Public entrypoint for parse/STT trace telemetry and collector transport.
 */

export type {
  SessionTrace,
  StageAttemptStatus,
  StageAttemptTrace,
  TraceBatchPayload,
  TraceCollectorOptions,
  UtteranceTrace,
  UtteranceTraceEntry,
} from "./types";

export {
  DEFAULT_APP_VERSION,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_FLUSH_TIMEOUT_MS,
  DEFAULT_MAX_QUEUE_SIZE,
  DEFAULT_TRACE_URL,
  TRACE_STORAGE_KEY,
  TraceCollector,
  getTraceCollector,
  setTraceCollector,
} from "./collector";
