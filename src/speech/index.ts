/**
 * Public API for `@speech`.
 *
 * Legal now: `SpeechPort`, `AudioClip`, `Transcript`, `NullSpeechPort`,
 * `SpeechNotAvailableError`, PTT capture (`createPttCaptureController`),
 * voice-loop coordinator (`createVoiceLoop`). Boot injects `NullSpeechPort`
 * via `createApp`, which wires PTT → transcribe → parseCommand → pilot.
 *
 * Later: HTTP / in-tab / browser-vendor ports, radio graph.
 * AudioClip is speech-owned. Do not put vendor SDKs here.
 *
 * Import rule: `@speech` may import `@core` only. `parseCommand` is injected.
 */
export type { AudioClip, SpeechPort, Transcript } from "./types";
export { SpeechNotAvailableError } from "./errors";
export { NullSpeechPort } from "./null-speech-port";
export { HttpSpeechPort } from "./ports/http-speech-port";
export { DEFAULT_PTT_KEY, createPttCaptureController } from "./capture/ptt-controller";
export type {
  CaptureBackend,
  PttCaptureController,
  PttCaptureEvent,
  PttCaptureOptions,
  PttKeyEvent,
  PttUpResult,
} from "./capture/ptt-controller";
export { EMPTY_CLIP_MS } from "./capture/clip-gate";
export { TARGET_SAMPLE_RATE } from "./capture/resample";
export { isTextFieldTarget } from "./capture/ptt-focus";
export { DEFAULT_CONFIDENCE_THRESHOLD, createVoiceLoop } from "./voice-loop";
export type {
  DispatchCommandFn,
  ParseCommandFn,
  VoiceLoop,
  VoiceLoopOptions,
  VoiceLoopStatus,
  VoiceParseResult,
} from "./voice-loop";
export { markPttUp, recordTranscriptLatency } from "./metrics";
export type { VoiceUtteranceMetrics } from "./metrics";
export { WebSpeechPort, speakBrowser } from "./ports/web-speech-port";
export const SPEECH_PACKAGE = "speech";
