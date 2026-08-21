/**
 * Public API for `@speech`.
 *
 * Legal now: `SPEECH_PACKAGE` so barrel imports resolve.
 *
 * Later: SpeechPort, NullSpeechPort (T00-07), capture, radio graph (phase 3).
 * AudioClip is speech-owned. Do not put vendor SDKs here.
 *
 * Import rule: `@speech` may import `@core` only.
 */
export const SPEECH_PACKAGE = "speech";
