/**
 * Public API for `@speech`.
 *
 * Legal now: `SpeechPort`, `AudioClip`, `Transcript`, `NullSpeechPort`,
 * `SpeechNotAvailableError`. Boot injects `NullSpeechPort` via `createApp`.
 *
 * Later: HTTP / in-tab / browser-vendor ports, capture, radio graph (phase 3).
 * AudioClip is speech-owned. Do not put vendor SDKs here.
 *
 * Import rule: `@speech` may import `@core` only.
 */
export type { AudioClip, SpeechPort, Transcript } from "./types";
export { SpeechNotAvailableError } from "./errors";
export { NullSpeechPort } from "./null-speech-port";
export const SPEECH_PACKAGE = "speech";
