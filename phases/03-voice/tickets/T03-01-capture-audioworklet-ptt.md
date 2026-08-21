# T03-01 Capture AudioWorklet PTT

**Phase:** 03 Voice
**Priority:** P0
**Size:** L
**Depends on:** none (needs phase 0 boot + a place to attach window listeners; phase 1 command line preferred so focus rules can be tested)
**Blocks:** T03-02, T03-04, T03-05, T03-11
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Holding a configurable PTT key records microphone audio through an AudioWorklet; releasing the key yields a mono PCM16 `AudioClip` (16 kHz). Mic permission failures never throw through the sim tick.

## Context

Client wiring in `phases/_shared/speech-port.md`: key-down starts capture; key-up stops, resamples, later `transcribe`. This ticket **only captures**. It does not call `SpeechPort`, the parser, or TTS.

Barge-in policy is frozen in `phases/03-voice/README.md` §6.3: **ignore PTT while transmit is locked** (readback playing). This ticket exposes the lock; T03-06 will set it.

Glossary: **PTT** = push-to-talk. Capture starts on key-down, ASR on key-up.

## Scope

- AudioWorklet processor that copies input samples while armed.
- `getUserMedia` on first arm (or explicit “enable mic”), with echoCancellation / noiseSuppression / autoGainControl preferred on.
- PTT key-down / key-up on `window` when no text field is focused.
- Default bind: backtick `` ` ``. Bind stored so T03-10 can change it (hard-code default + setter is enough).
- On key-up: resample to **16 kHz mono PCM16** and emit `AudioClip` (`phases/_shared/speech-port.md`).
- `setTransmitLocked(locked: boolean)`: while locked, key-down does **not** start capture and does **not** queue.
- Events or callbacks: `ptt-down`, `ptt-up` (clip | empty), `permission-denied`, `capture-error`, `ignored-locked`.
- Drop clips shorter than ~80 ms as empty (no STT later).
- Secure-context check: if not `isSecureContext`, emit a capture-error; do not call `getUserMedia`.

## Out of scope

- `SpeechPort.transcribe` / any STT.
- Parser, pilot, TTS, radio FX.
- Settings UI (T03-10). Status-line copy can be a callback; polished strings are T03-08.
- Caps Lock as default. Optional bind support may exist as data, not the default.
- Always-on listening or VAD.
- Sidetone / monitoring the mic through speakers.

## Implementation notes

- Keep capture code under `src/speech/capture/` (or the speech package phase 0 chose). Do not import vendor SDKs.
- Worklet URL: Vite `?url` or blob URL — match how the repo loads workers. The processor must run off the main thread.
- Ring buffer or `port.postMessage` of Float32 chunks; main thread concatenates **only while PTT is down**. Do not record the whole session.
- Resampler: document quality (linear is acceptable for v1 STT). Output `Int16Array` little-endian, `channels: 1`, `sampleRate: 16000`.
- Keyboard: `event.code` or `event.key` — pick one, document it, `preventDefault` on the PTT bind when it would otherwise insert a character into a focused **non-field** (e.g. body). When `input`, `textarea`, or `contenteditable` is the target, **do nothing**.
- Repeat keydown events (`event.repeat`) must not restart capture.
- `MediaStream` lifecycle: one stream reused across PTT presses until backend disable / page unload. Stop tracks on dispose so the tab mic indicator clears.
- Tests: extract resample + “empty clip” gating as pure functions for Vitest. Worklet + `getUserMedia` are Manual unless the repo already has a Web Audio test harness.

Suggested types:

```ts
export interface PttCaptureController {
  readonly pttKey: string;
  setPttKey(key: string): void;
  setTransmitLocked(locked: boolean): void;
  dispose(): void;
}
```

`AudioClip` must match `phases/_shared/speech-port.md` (do not invent a second clip type).

## Acceptance criteria

- [ ] **AC1 —** Given mic permission granted, when the user holds PTT and speaks then releases, then the controller emits an `AudioClip` with `channels === 1`, `sampleRate === 16000`, and `pcm16.length` matching duration × 16000 (± resampling slack).
- [ ] **AC2 —** Given a text input is focused, when the user presses the PTT bind, then capture does not start and the character may be typed.
- [ ] **AC3 —** Given `setTransmitLocked(true)`, when the user presses PTT, then no recording starts, no clip is queued, and an ignored-locked signal fires.
- [ ] **AC4 —** Given `getUserMedia` rejects (permission denied), when the user first presses PTT, then the sim tick / RAF loop still runs and a permission-denied signal fires (no uncaught exception).
- [ ] **AC5 —** Given key-down and key-up within < 80 ms and no samples, then the clip is treated as empty (distinct from a real clip).
- [ ] **AC6 —** Automated test exists for resample-to-pcm16 and/or empty-clip gating (happy path). Worklet wiring may be Manual.

## Test plan

- Unit: resample a known sine or ramp at 48 kHz → 16 kHz PCM16 length/range; empty-clip threshold; transmit-lock ignores arming (controller method test with a fake clock / injected key events if feasible).
- Integration: none required beyond existing app boot.
- Manual: Chrome/Edge localhost: grant mic, hold `` ` ``, see tab mic icon; deny mic, confirm app still ticks; focus command line and type backtick; lock transmit and confirm no arm.

## Suggested files

- `src/speech/capture/ptt-controller.ts`
- `src/speech/capture/pcm-worklet.ts` (or `pcm-processor.js` worklet)
- `src/speech/capture/resample.ts`
- `src/speech/capture/resample.test.ts`
- `src/speech/capture/ptt-focus.ts`
