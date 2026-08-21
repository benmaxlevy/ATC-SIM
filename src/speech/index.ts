/**
 * Public API for `@speech`.
 *
 * Legal now: `SpeechPort`, `AudioClip`, `Transcript`, `NullSpeechPort`,
 * `SpeechNotAvailableError`, PTT capture (`createPttCaptureController`).
 * Boot injects `NullSpeechPort` via `createApp`, which also constructs
 * PTT capture (clip only — T03-02 wires transcribe → parse).
 *
 * Later: HTTP / in-tab / browser-vendor ports, radio graph.
 * AudioClip is speech-owned. Do not put vendor SDKs here.
 *
 * Import rule: `@speech` may import `@core` only.
 */
export type { AudioClip, SpeechPort, Transcript } from "./types";
export { SpeechNotAvailableError } from "./errors";
export { NullSpeechPort } from "./null-speech-port";
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
export const SPEECH_PACKAGE = "speech";
