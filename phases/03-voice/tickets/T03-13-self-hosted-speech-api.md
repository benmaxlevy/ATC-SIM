# T03-13 Self-hosted speech API (HF weights)

**Phase:** 03 Voice
**Priority:** P0
**Size:** L
**Depends on:** none (contract only; client is T03-05)
**Blocks:** T03-05, T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A **local** HTTP service in this repo transcribes PTT WAV and synthesizes readback WAV using **models we host**. Weights may be **downloaded once** from Hugging Face Hub (or another public weight repo). Every utterance is inferred **on our process** — CPU or GPU we control. No metered third-party STT/TTS.

## Context

`phases/_shared/speech-port.md` (self-hosted freeze). `phases/_shared/non-goals.md` bans paid speech APIs. The Vite app never talks to OpenAI, Deepgram, Groq, HF Inference API, etc.

T03-05 is only the browser `HttpSpeechPort`. This ticket is the server that port points at (`VITE_STT_URL` / `VITE_TTS_URL`, default `http://127.0.0.1:8090`).

## Research

Search: `faster-whisper huggingface hub local server` and `piper tts local http`. Prefer small English Whisper (`small.en` / `base.en`) for v1 latency; an ATC-finetuned **open** weight is allowed if the license permits redistribution/cache.

Do not call `api-inference.huggingface.co` or Inference Endpoints from this service.

## Scope

- Add `speech-api/` (Python 3.11+ suggested):
  - `POST /stt` — body `audio/wav` (pcm16le mono, 16 kHz preferred) → JSON `{ "text": string, "confidence": number }`.
  - `POST /tts` — JSON `{ "text": string, "voiceId": string }` → `audio/wav` (mono PCM).
  - `GET /health` → `{ "ok": true, "sttModel": "<hub id>", "ttsVoice": "<id>" }`.
- STT: faster-whisper, whisper.cpp, or `transformers` pipeline — **local** `model_id` from Hub, cached under `speech-api/.cache/` (gitignored).
- TTS: Piper (or equivalent local neural TTS). Same process or a sibling module; still **our** HTTP.
- CORS: allow Vite origin (`http://localhost:5173` and `127.0.0.1`).
- README in `speech-api/README.md`: install, first-run weight download, `uvicorn` (or Docker) command, env `STT_MODEL_ID`, `TTS_VOICE`, `HOST`, `PORT`.
- CI: contract tests with a **tiny fixture WAV** may mock the model; at least one test asserts JSON shape without hitting the Hub. Optional: skip GPU tests in CI.

## Out of scope

- Fine-tuning. Bundling multi-hundred-MB weights **in git**.
- Hugging Face Inference API, OpenAI, Deepgram, Groq, ElevenLabs, Workers AI.
- Changing the Vite sim tick. Browser client (T03-05).
- Streaming WebSocket STT (clip POST is enough for PTT).

## Implementation notes

Default bind `127.0.0.1:8090`. If CUDA is missing, run CPU and document slower p50.

`confidence`: if the engine has no score, return `1.0`.

Do not log raw audio. Do not require an HF **token** for public models; if a gated model is used, token is **local env only**, never in the browser.

## Acceptance criteria

- [ ] **AC1 —** `GET /health` returns `ok: true` when the process is up (manual or integration).
- [ ] **AC2 —** `POST /stt` with a short fixture WAV returns JSON with a `text` string (real model **or** documented mock mode `SPEECH_API_MOCK=1` for CI).
- [ ] **AC3 —** `POST /tts` returns a non-empty WAV (`audio/wav` or documented pcm16).
- [ ] **AC4 —** `speech-api/README.md` states weights are Hub **downloads**, inference is local, and lists banned vendor APIs.
- [ ] **AC5 —** Repo grep: `speech-api` source does not call `openai.com`, `deepgram.com`, `api-inference.huggingface.co`, `groq.com`.
- [ ] **AC6 —** `.gitignore` includes the model cache directory.

## Test plan

- Unit: JSON schema; mock STT/TTS in `SPEECH_API_MOCK=1`.
- Manual: start API, curl a 1 s WAV, confirm text; curl TTS, play WAV.

## Suggested files

- `speech-api/README.md`
- `speech-api/app.py` (or `main.py`)
- `speech-api/requirements.txt`
- `speech-api/tests/test_contract.py`
- `.gitignore` (cache)
