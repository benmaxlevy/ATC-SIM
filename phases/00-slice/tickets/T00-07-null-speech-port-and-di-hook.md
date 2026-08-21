# T00-07 Null SpeechPort and DI hook

**Phase:** 00 Slice
**Priority:** P0
**Size:** M
**Depends on:** T00-03
**Blocks:** T00-10
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`SpeechPort` types match `phases/_shared/speech-port.md`. `NullSpeechPort` (`id: "null"`) lets the app boot: `transcribe` throws, `synthesize` returns silence. Boot wires speech through a DI hook, not a global singleton import of a vendor SDK.

## Context

Speech is an **adapter**. The sim, parser, and Pilot agent must compile and run with a `NullSpeechPort`. Do not import vendor SDKs outside `src/speech/` (none in this phase at all).

Implementations order: `null` is phase 0. `text-only` is not a SpeechPort (command line bypasses speech). `web-speech` / `http` / `whisper-wasm` are phase 3.

Failures must not throw through a sim tick later; `transcribe` on null **does** throw if called — that is correct, because phase 0 must not call it. Boot must not call `transcribe`.

## Scope

- `src/speech/types.ts` — `SpeechPort`, `AudioClip`, `Transcript` exactly as the shared file.
- `src/speech/null-speech-port.ts` — `NullSpeechPort` class.
- `src/speech/errors.ts` — `SpeechNotAvailableError extends Error` with `name = "SpeechNotAvailableError"`.
- `src/app/create-app.ts` (or `src/ui/create-app.ts`) — `AppDeps` + `createApp`. Prefer `src/app/create-app.ts` so `@ui` stays presentational; if you put it in `src/ui`, still export from a single `createApp` function.
- Re-export port types from `@speech`.
- Vitest: null port behavior; `createApp` requires `deps.speech`.
- `src/main.tsx` calls `createApp({ speech: new NullSpeechPort() })` then mounts React (or `createApp` mounts). **Do not** call `transcribe` at boot.
- No `getUserMedia`, no Web Audio graph, no `webkitSpeechRecognition`.

## Out of scope

- PTT capture, AudioWorklet, resampling.
- Playing synthesized audio.
- Confidence threshold 0.55 handling (phase 3).
- HTTP/env STT URLs.
- Making `transcribe` resolve with empty text so “it doesn’t throw” — the shared contract says the null impl’s `transcribe` **throws**.

## Implementation notes

### Interface (must match shared)

```ts
export interface SpeechPort {
  readonly id: string;
  transcribe(audio: AudioClip): Promise<Transcript>;
  synthesize(text: string, voiceId: string): Promise<AudioClip>;
}

export interface AudioClip {
  sampleRate: number;
  channels: 1;
  pcm16: Int16Array;
}

export interface Transcript {
  text: string;
  confidence: number;
  latencyMs: number;
}
```

### `NullSpeechPort`

- `readonly id = "null"`.
- `transcribe`: `throw new SpeechNotAvailableError("NullSpeechPort cannot transcribe")` (sync throw is OK; returning a rejected promise is also OK — pick **sync throw** and test with `expect(() => void port.transcribe(clip)).toThrow(...)` **or** `await expect(port.transcribe(clip)).rejects`. If the interface is `Promise<Transcript>`, prefer `return Promise.reject(new SpeechNotAvailableError(...))` so callers can always `await`. **Freeze: `transcribe` returns a rejected promise** with `SpeechNotAvailableError`.
- `synthesize`: ignore `text`/`voiceId`; return `{ sampleRate: 16000, channels: 1, pcm16: new Int16Array(1600) }` (100 ms of zeros). Do not allocate huge buffers.

### DI hook

```ts
export interface AppDeps {
  speech: SpeechPort;
}

export interface AppHandles {
  speech: SpeechPort;
  /** Reserved: T00-08/T00-10 will attach a SessionLog. Optional in this ticket. */
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) throw new Error("createApp requires deps.speech");
  return { speech: deps.speech };
}
```

T00-10 will expand `createApp` to mount the shell and attach `SessionLog`. In this ticket, `main.tsx` must use `createApp({ speech: new NullSpeechPort() })` so the hook is live. You may keep mounting `App` as today.

Do **not** export a default `speechPort = new NullSpeechPort()` that UI deep-imports; always inject.

## Acceptance criteria

- [ ] **AC1 —** `SpeechPort`, `AudioClip`, and `Transcript` field names match `_shared/speech-port.md` (`channels` literal `1`, `pcm16: Int16Array`).
- [ ] **AC2 —** `new NullSpeechPort().id === "null"` (Vitest).
- [ ] **AC3 —** `await nullPort.transcribe(clip)` rejects with `SpeechNotAvailableError` (Vitest).
- [ ] **AC4 —** `await nullPort.synthesize("ignored", "voice")` resolves to mono PCM16 at 16000 Hz, length > 0, all samples `0` (Vitest).
- [ ] **AC5 —** `createApp` returns the same `speech` instance it was given (Vitest).
- [ ] **AC6 —** `src/main.tsx` (or the boot file) constructs `NullSpeechPort` and passes it into `createApp`. No other `SpeechPort` impl exists.
- [ ] **AC7 —** Grep: no `openai`, `deepgram`, `whisper`, `SpeechRecognition` imports in the repo `src/` (Vitest or documented grep during implementation).
- [ ] **AC8 —** Boot path does not call `transcribe` or `synthesize`. **Manual** (no console errors on load after T00-10; this ticket: `main.tsx` has no such calls).

## Test plan

- Unit: `src/speech/null-speech-port.test.ts`, `src/app/create-app.test.ts`.
- Integration: none.
- Manual: none required until T00-10; confirm `main.tsx` wiring by reading the file.

## Suggested files

- `src/speech/types.ts`
- `src/speech/errors.ts`
- `src/speech/null-speech-port.ts`
- `src/speech/null-speech-port.test.ts`
- `src/speech/index.ts`
- `src/app/create-app.ts`
- `src/app/create-app.test.ts`
- `src/main.tsx`
