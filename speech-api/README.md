# speech-api

Local HTTP STT/TTS for ATC-SIM. **Weights download once** from [Hugging Face Hub](https://huggingface.co/models) (or another public weight repo) into `speech-api/.cache/`. **Every utterance is inferred in this process** on CPU or GPU we control.

This is **not** Hugging Face Inference API / Inference Endpoints. The Vite app talks only to this service (`VITE_STT_URL` / `VITE_TTS_URL`, default `http://127.0.0.1:8090/...`).

## Banned (do not point this service at these)

Paid or metered STT/TTS/LLM APIs, including: OpenAI, Deepgram, AssemblyAI, Groq, Together, Fireworks, ElevenLabs, Google Cloud Speech, Azure Speech, Amazon Transcribe/Polly, Hugging Face Inference API / Endpoints, Cloudflare Workers AI. Chrome Web Speech is a browser prototype in the sim, not this process.

## Endpoints

| Method | Path | In | Out |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ "ok": true, "sttModel": "<hub id>", "ttsVoice": "<id>", "parse": "off" \| "ready" }` |
| `POST` | `/stt` | body `audio/wav` (pcm16le mono, 16 kHz preferred) | `{ "text": string, "confidence": number }` |
| `POST` | `/tts` | JSON `{ "text", "voiceId" }` | `audio/wav` (mono PCM) |
| `POST` | `/parse` | JSON `{ "text", "source", "schemaVersion": "command-ir-v0" }` | `{ "ok": false, "error": "UNAVAILABLE" }` **503** until T03-14 |

`confidence`: if faster-whisper has no score, the API returns `1.0`.

CORS allows the Vite origin (`http://localhost:5173` and `http://127.0.0.1:5173`). Extra origins: comma-separated `CORS_ORIGINS`.

Default bind: **`127.0.0.1:8090`**. Path C (`PARSE_MODEL_ID`) is **off**. This ticket stubs `/parse` as `UNAVAILABLE` even if that env is set; loading a parse model is T03-14.

Do not log raw audio. A public Hub model does not need a token. Gated models: `HF_TOKEN` on **this machine only**, never in the browser.

## Install (Python 3.11+)

```text
cd speech-api
python -m venv .venv
```

Windows:

```text
.venv\Scripts\activate
pip install -r requirements.txt
```

macOS / Linux:

```text
source .venv/bin/activate
pip install -r requirements.txt
```

## First-run weight download

The first `uvicorn` start (or `python download_weights.py`) downloads:

- STT: `STT_MODEL_ID` (default `Systran/faster-whisper-small.en`, faster-whisper / CTranslate2)
- TTS: `TTS_VOICE` (default `en_US-lessac-medium`) plus a roster of Piper medium voices (`TTS_VOICES`) so each callsign can get a distinct speaker

Files land under `speech-api/.cache/` (gitignored). Later starts reuse the cache. No per-utterance Hub call.

```text
python download_weights.py
```

CPU is the default if CUDA is missing **or unusable**. A GPU driver is not enough: CTranslate2 needs the **CUDA 12 runtime** (`cublas64_12.dll` on Windows). If that DLL is missing, STT logs a warning and runs on CPU instead of 500-ing the first `/stt`. Force CPU: `STT_DEVICE=cpu`. TTS uses ONNX Runtime CUDA only when `CUDAExecutionProvider` is actually installed.

CPU p50 is slower; the voice-loop target of PTT-up → audio-start **p50 < 1.5 s** is measured against this service on localhost/LAN (T03-12). Prefer a working CUDA 12 install or keep `base.en` (not `small.en` / `medium`) if CPU-only.

Public Hub models do **not** need `HF_TOKEN`. An unauthenticated Hub warning on first download is expected.

## Run

```text
python -m uvicorn app:app --host 127.0.0.1 --port 8090
```

Or `python app.py` (reads `HOST` / `PORT`).

Docker (binds `0.0.0.0:8090` inside the container; still loopback on the host unless you publish):

```text
docker build -t atc-speech-api .
docker run --rm -p 127.0.0.1:8090:8090 -v speech-api-cache:/app/.cache atc-speech-api
```

## Environment

| Env | Default | Meaning |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8090` | Bind port |
| `STT_MODEL_ID` | `Systran/faster-whisper-small.en` | Hub id or faster-whisper alias (`base.en`, `small.en`, `medium.en`) |
| `TTS_VOICE` | `en_US-lessac-medium` | Fallback Piper voice id on `rhasspy/piper-voices` |
| `TTS_VOICES` | lessac, amy, ryan, joe, kristin, kusal (medium) | Comma-separated Piper ids preloaded at startup |
| `PARSE_MODEL_ID` | unset | Reserved for T03-14. Unset → `/health.parse` is `"off"` and `POST /parse` is `UNAVAILABLE` |
| `SPEECH_API_MOCK` | unset | `1` / `true` — no Hub, fake STT/TTS for CI |
| `SPEECH_API_CACHE` | `speech-api/.cache` | Weight cache root |
| `STT_DEVICE` | auto (`cuda` only if GPU **and** CUDA 12 cublas load; else `cpu`) | `cpu` or `cuda` |
| `STT_COMPUTE_TYPE` | `float16` (cuda) / `int8` (cpu) | CTranslate2 compute type |
| `HF_TOKEN` | unset | Local-only, gated Hub models |
| `CORS_ORIGINS` | (empty) | Extra allowed origins, comma-separated |

## Mock mode (CI)

```text
set SPEECH_API_MOCK=1
pip install -r requirements-ci.txt
pytest
```

`POST /stt` returns a fixed English string; `POST /tts` returns a short generated tone WAV. No Hub access.

## Manual check

With the API up (mock or real):

```text
curl -s http://127.0.0.1:8090/health
curl -s -X POST http://127.0.0.1:8090/parse -H "Content-Type: application/json" -d "{\"text\":\"hi\",\"source\":\"voice\",\"schemaVersion\":\"command-ir-v0\"}"
```

STT (1 s of silence is enough for the JSON shape; real speech needs a spoken clip):

```text
curl -s -X POST http://127.0.0.1:8090/stt -H "Content-Type: audio/wav" --data-binary @clip.wav
```

TTS:

```text
curl -s -X POST http://127.0.0.1:8090/tts -H "Content-Type: application/json" -d "{\"text\":\"heading two seven zero\",\"voiceId\":\"en_US-lessac-medium\"}" -o readback.wav
```

Play `readback.wav` locally. The Vite sim still boots with `NullSpeechPort` if this process is down; typed commands keep working.
