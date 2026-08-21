# T03-10 Settings speech backend switch

**Phase:** 03 Voice
**Priority:** P1
**Size:** S
**Depends on:** T03-05
**Blocks:** T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The user can switch SpeechPort backend (`null` | `http`, plus `web-speech` and `whisper-wasm` only if those tickets shipped), rebind PTT, and see whether **our** speech-api URLs are configured — without crashing boot when the API is down.

## Context

`phases/_shared/speech-port.md`. Default **`http`** when STT+TTS URLs are set (defaults point at `127.0.0.1:8090`). If URLs missing **or** user has not opted into web-speech, use **`null`** (typed commands still work). **Do not** default to `web-speech` (third-party browser cloud).

PTT key configurable. Confidence threshold default 0.55. Radio FX bypass and overlay toggle may live here.

Do not hot-swap mid-`transcribe`. Tear down live recognition and do not leak `MediaStream`.

## Scope

- Settings controls (reuse phase 0/2 settings page if it exists; else a simple panel):
  - Backend select
  - PTT bind (capture next key, or a dropdown of `` ` ``, Caps Lock, Tab, `ControlLeft`, `KeyZ` — at least backtick + one alternative)
  - Confidence threshold (number 0–1, default 0.55)
  - Read-only http STT/TTS “configured / missing” if URLs come from env
  - Optional: `voiceId` text field
  - Optional: Path C checkbox (default off). If T03-14 has not landed, omit or disable the control.
  - Optional: FX on/off, overlay on/off
- Persist binds/threshold/backend id in whatever pref storage phase 0 used.
- On backend change: `dispose` old port, construct new, abort Web Speech, `inFlight` must be false (ignore click if busy; status “wait”).
- Missing `VITE_STT_URL` / TTS: selecting `http` shows an error on the settings row and falls back to `null` or leaves previous port — **do not** crash Vite boot.
- Default selection algorithm documented in UI helper and unit-tested.

## Out of scope

- Vendor account signup UI; Deepgram/OpenAI keys.
- Storing API tokens in `localStorage` unless phase 0 already has a secret pattern — prefer env for tokens.
- Implementing whisper-wasm (only show the option if the module exists).
- Scope keybinding editor for CRC keys.

## Implementation notes

- Factory: `createSpeechPort(id, deps): SpeechPort` in `src/speech/ports/factory.ts`.
- If `whisper-wasm` is not in the bundle, omit the option.
- PTT bind: `ptt-controller.setPttKey`.
- Tests: default backend when URLs present / URLs cleared; factory returns correct `id`; dispose called on switch (mock). **Never** auto-pick web-speech.

## Acceptance criteria

- [x] **AC1 —** Given STT and TTS URLs present (including defaults to `127.0.0.1:8090`), then default backend id is `http`.
- [x] **AC2 —** Given URLs explicitly cleared, then default is `null` and the UI shows voice disabled / use typed commands. `web-speech` is opt-in only, never the automatic default.
- [x] **AC3 —** Given the user selects another backend while idle, then subsequent `transcribe`/`synthesize` go to the new `id`.
- [x] **AC4 —** Given a busy utterance, then backend change is refused or deferred (no overlapping transcribe).
- [x] **AC5 —** Changing PTT bind makes the new key arm capture and the old key does not (when not in a text field).
- [x] **AC6 —** Automated test exists for the default-backend helper (happy path).
- [x] **AC7 —** Settings copy for web-speech warns it may send audio to the browser vendor. No Deepgram/OpenAI signup UI.

## Test plan

- Unit: `pickDefaultBackend({ sttUrl, ttsUrl })` — http vs null; webSpeech flag must not auto-select.
- Integration: none.
- Manual: switch null → web-speech → http; reload persistence; rebind PTT; confirm command line still types when focused.

## Suggested files

- `src/speech/ports/factory.ts`
- `src/speech/ports/factory.test.ts`
- `src/ui/settings-speech.ts`
- `src/speech/capture/ptt-controller.ts` (setter already from T03-01)
