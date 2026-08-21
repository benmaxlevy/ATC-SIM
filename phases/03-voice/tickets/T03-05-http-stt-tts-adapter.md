# T03-05 HTTP STT/TTS adapter

**Phase:** 03 Voice
**Priority:** P0
**Size:** L
**Depends on:** T03-01, T03-13
**Blocks:** T03-06 (PCM path), T03-10, T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A `SpeechPort` with `id: "http"` POSTs the PTT `AudioClip` to **our** `speech-api` STT URL and POSTs readback text to **our** TTS URL. This is the **quality default**. No vendor SDK. No paid cloud ASR.

## Context

`phases/_shared/speech-port.md`: self-hosted freeze. T03-13 defines `speech-api` (`POST /stt`, `POST /tts`). This ticket is **only the browser adapter**.

`phases/_shared/non-goals.md`: no metered STT/TTS. Default URLs: `http://127.0.0.1:8090/stt` and `http://127.0.0.1:8090/tts`.

Quality target (T03-09 / T03-12): PTT-up → audio-start p50 **< 1.5 s** against **localhost/LAN speech-api**. This ticket fills `Transcript.latencyMs`; it does not own the overlay.

## Research

Contract matches T03-13. Do not “helpfully” point env at OpenAI/Deepgram/HF Inference.

## Scope

- `HttpSpeechPort` implements `SpeechPort`.
- Config: STT URL, TTS URL, optional `Authorization` (or custom header name + value), STT/TTS timeouts (suggest 8 s each), `voiceId` default.
- `transcribe(clip)`:
  - Build WAV (pcm16le mono) **or** raw body with `Content-Type: application/octet-stream` plus `X-Sample-Rate: 16000` — pick WAV as default (widely accepted); document the choice.
  - `POST`, `AbortController` on timeout.
  - Parse JSON `{ text: string, confidence?: number }`. Missing confidence → `1.0`.
  - `latencyMs` = wait time inside the adapter (`performance.now()` around fetch).
- `synthesize(text, voiceId)`:
  - `POST` JSON `{ text, voiceId }` (or query — document).
  - Accept `audio/wav` or raw pcm16 + sample-rate header; decode to `AudioClip`.
- Errors: HTTP 4xx/5xx, network, abort, empty body → reject the promise with a typed `SpeechPortError` (the loop catches; T03-08 copy).
- Do not log secrets (Authorization header) to the session log.
- Env keys: `VITE_STT_URL` (default `http://127.0.0.1:8090/stt`), `VITE_TTS_URL` (default `http://127.0.0.1:8090/tts`). Optional `VITE_SPEECH_TOKEN` **only** if we add a local shared-secret to speech-api — never an OpenAI/Deepgram key. Document in a comment at the port.
- CORS: speech-api (T03-13) must allow the app origin. Do not proxy through a vendor.
- Tests: `fetch` mock — happy STT JSON, missing confidence, 500, timeout abort, WAV round-trip helper. **No live vendor network in CI.**
- `beginUtterance` / `endUtterance`: no-ops or omit (clip-only).

## Out of scope

- Web Speech (T03-04).
- whisper-wasm (T03-11).
- Radio FX (T03-07) — return **dry** PCM.
- Choosing or bundling a **paid** cloud vendor; shipping vendor API keys in the repo.
- Hugging Face Inference API, OpenAI, Deepgram, Groq, ElevenLabs, Workers AI.
- Implementing `speech-api/` (T03-13).
- Fine-tuning models; LLM rewrite of transcripts.
- Retry storms (one attempt per utterance; no auto-retry).
- Multipart formats beyond one documented body type.

## Implementation notes

- Keep all fetch/WAV code in `src/speech/ports/`. A tiny `pcm16ToWav(clip)` helper is unit-testable (RIFF header, 16-bit, mono).
- WAV parse on the TTS response: handle 16-bit PCM; if the server returns 24 kHz or 22.05 kHz, **keep that `sampleRate` on the clip** (do not resample here unless playback requires it — T03-06/T03-07 can decode via `AudioContext.decodeAudioData` if you return WAV bytes instead). Prefer: decode WAV → `AudioClip` with native sampleRate so the radio graph uses `AudioBuffer` at that rate.
- Concurrent `transcribe`: the port may assume the coordinator serializes; still guard with an in-flight flag and reject a second call.
- CORS: document that the STT/TTS origin must allow the app origin. Do not proxy through a sim-tick server.
- Tests: `fetch` mock — happy STT JSON, missing confidence, 500, timeout abort, WAV round-trip helper.

Minimal WAV: 44-byte header + pcm16 body. Fixture: a few samples.

## Acceptance criteria

- [ ] **AC1 —** Given a mock fetch that returns `{ "text": "turn left heading two seven zero", "confidence": 0.92 }`, when `transcribe` is called with a small clip, then `Transcript.text`, `confidence === 0.92`, `latencyMs >= 0`, and `id === "http"`.
- [ ] **AC2 —** Given missing `confidence` in JSON, then `Transcript.confidence === 1.0`.
- [ ] **AC3 —** Given mock TTS returning a valid mono PCM WAV, then `synthesize` returns `channels === 1` and non-empty `pcm16` (or an AudioClip T03-06 can play).
- [ ] **AC4 —** Given STT HTTP 500, then `transcribe` rejects with a typed error (no unhandled rejection if the test awaits).
- [ ] **AC5 —** Authorization values are not included in thrown Error messages or default `console` of the happy path tests.
- [ ] **AC6 —** Automated test exists for AC1 (happy path).
- [ ] **AC7 —** Default STT/TTS URLs target `127.0.0.1:8090`. Source comments state they are **our** speech-api, not a vendor.
- [ ] **AC8 —** Client module does not import or fetch OpenAI, Deepgram, Groq, or `api-inference.huggingface.co`.

## Test plan

- Unit: pcm16ToWav header; STT mock; TTS mock; error paths; in-flight guard.
- Integration: none in CI (no real network).
- Manual: run T03-13 `speech-api`, PTT a 1 s clip; confirm transcript and a WAV comes back. Latency recorded in T03-12.

## Suggested files

- `src/speech/ports/http-speech-port.ts`
- `src/speech/ports/http-speech-port.test.ts`
- `src/speech/ports/wav.ts`
- `src/speech/ports/wav.test.ts`
- `src/speech/speech-port-error.ts`
