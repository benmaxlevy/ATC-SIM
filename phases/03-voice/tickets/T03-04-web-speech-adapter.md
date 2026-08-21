# T03-04 Web Speech adapter

**Phase:** 03 Voice
**Priority:** P1
**Size:** M
**Depends on:** T03-01
**Blocks:** T03-10, T03-12 (prototype path)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A `SpeechPort` with `id: "web-speech"` uses the browser `SpeechRecognition` / `webkitSpeechRecognition` during PTT and `speechSynthesis` for TTS. It is a **prototype**. Recognition quality must not be treated as a phase-exit gate.

## Context

`phases/_shared/speech-port.md` lists `web-speech` for phase 3, prototype quality. The interface is clip-based `transcribe(audio)`, but the Web Speech API **does not consume PCM**. Phase README §5.1 allows optional `beginUtterance` / `endUtterance`; clip adapters no-op them.

`speechSynthesis` is a **black box** — T03-07 radio FX will not apply on this path. That is accepted for the prototype.

**Warning:** Chrome/Edge `SpeechRecognition` typically sends audio to **Google**. That is a third-party cloud recognizer. It is **not** our speech-api and must **not** be the default. Settings must label it `Browser (may send audio to vendor)` or similar.

Do not import vendor SDKs outside `src/speech/`.

## Scope

- `WebSpeechPort` implements `SpeechPort` (`id === "web-speech"`).
- `beginUtterance()`: start recognition (lang `en-US`), continuous/interim as needed, **no** always-on listen outside PTT.
- PTT-up: stop recognition; resolve `Transcript` with `text`, `confidence` (from `SpeechRecognitionAlternative.confidence` when present, else document fallback e.g. `0.8` if text non-empty, `0` if empty), `latencyMs` (recognition start → result).
- `transcribe(clip)`: if live recognition already produced a result for this utterance, return it and **may ignore** `clip`. If someone calls `transcribe` without `beginUtterance`, either start a one-shot (poor UX — avoid) or reject with a caught error the coordinator understands. Preferred: coordinator always calls begin on PTT-down when `beginUtterance` exists.
- `synthesize(text, voiceId)`: `speechSynthesis.speak`. Because the port must return `AudioClip`, return a **silence clip** of duration 0 or a tiny buffer **and** trigger speak as a side effect **or** return silence and let T03-06 detect `id === "web-speech"` and call a `speakViaBrowser(text)` helper exported from this module. Pick one; document it. Preferred: **do not side-effect inside `synthesize`**. Export `speakBrowser(text, voiceId)` and return silence PCM; T03-06 branches. That keeps `synthesize` honest (PCM for FX) and avoids double-speak.
- Feature detect: if `SpeechRecognition` missing, construct but `transcribe`/`begin` fail with a typed error the loop catches.
- `interimResults`: do not parse interim; only final `result.isFinal`.
- Stop / abort recognition on `dispose` and when switching away (T03-10).

## Out of scope

- Radio FX on `speechSynthesis` (impossible).
- http adapter (T03-05).
- Improving accuracy with grammars from a cloud vendor.
- Always-on listen, punctuation, diarization.
- Making this the quality default.
- Fine-tuning anything.

## Implementation notes

- Prefix: `window.SpeechRecognition || window.webkitSpeechRecognition`.
- Chrome/Edge desktop: works in secure context. Firefox: often missing — fail soft.
- `maxAlternatives = 1` for v1.
- Do not set a huge `SpeechGrammarList` unless it is trivial; it is poorly supported.
- Recognition `abort()` on PTT lock / dispose so the mic indicator clears.
- Silence `AudioClip` helper: `sampleRate: 16000`, `pcm16` length 0 or 160 samples of zeros.
- Tests: mock the Recognition constructor (inject factory) to resolve a fake final event. Do not require a real mic in CI.

Coordinator change (minimal, if T03-02 already landed): call `beginUtterance?.()` on PTT-down. If T03-02 is not done, export the port only and note the hook in comments — but T03-02 is a dependency of the loop; this ticket depends on T03-01 only, so **do not** rewrite the whole loop. Add `beginUtterance` to the port; T03-02’s coordinator sketch already includes the optional call — implement the method here and wire it if the loop exists.

## Acceptance criteria

- [ ] **AC1 —** Given a mocked SpeechRecognition that fires a final result `"turn left heading two seven zero"` with confidence `0.9`, when `beginUtterance` then `transcribe`/`endUtterance` run, then `Transcript.text` matches, `confidence === 0.9`, and `id === "web-speech"`.
- [ ] **AC2 —** Given the API is missing, when `beginUtterance` or `transcribe` is called, then the promise rejects or returns a failure that the voice loop can catch (no throw through the tick if the loop is wired).
- [ ] **AC3 —** Given `synthesize`, then it returns an `AudioClip` (possibly silence) and does not throw. Browser speak, if any, is documented and not duplicated with T03-06.
- [ ] **AC4 —** Recognition is not running before PTT-down / `beginUtterance` (no always-on listen).
- [ ] **AC5 —** Automated test exists for the mocked happy path (AC1).

## Test plan

- Unit: mock recognition factory; final result; missing API; dispose aborts.
- Integration: none in CI.
- Manual: Chrome localhost, backend `web-speech`, hold PTT, speak example 2; expect a transcript in the status/log. Inaccuracy is OK. Confirm Firefox shows a clear failure, not a crash.

## Suggested files

- `src/speech/ports/web-speech-port.ts`
- `src/speech/ports/web-speech-port.test.ts`
- `src/speech/ports/browser-tts.ts` (optional helper for T03-06)
