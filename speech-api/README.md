# speech-api

Local HTTP STT/TTS and mandatory Path C `/parse` for ATC-SIM. **Weights download once** from [Hugging Face Hub](https://huggingface.co/models) (or another public weight repo) into `speech-api/.cache/`. **Every utterance (and every `/parse`) is inferred in this process** on CPU or GPU we control.

This is **not** Hugging Face Inference API / Inference Endpoints. The Vite app talks only to this service (`VITE_STT_URL` / `VITE_TTS_URL` / `POST /parse`, default `http://127.0.0.1:8090/...`).

## Banned (do not point this service at these)

Paid or metered STT/TTS/LLM APIs, including: OpenAI, Deepgram, AssemblyAI, Groq, Together, Fireworks, ElevenLabs, Google Cloud Speech, Azure Speech, Amazon Transcribe/Polly, Hugging Face Inference API / Endpoints, Cloudflare Workers AI, Anthropic. Chrome Web Speech is a browser prototype in the sim, not this process. Path C must not call `openai.com`, `api.groq.com`, or `api-inference.huggingface.co`.

## Endpoints

| Method | Path | In | Out |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ "ok": true, "sttModel": "<hub id>", "ttsVoice": "<id>", "parse": "off" \| "ready" }` |
| `POST` | `/stt` | body `audio/wav` (pcm16le mono, 16 kHz preferred). Optional `X-ATC-Fixes` and `X-ATC-Procedures` headers ground Qwen transcription in catalog spellings. | `{ "text": string, "confidence": number }` |
| `POST` | `/tts` | JSON `{ "text", "voiceId" }` | `audio/wav` (mono PCM) |
| `POST` | `/parse` | JSON `{ "text", "source", "schemaVersion": "command-ir-v0", "context"? }` — no n-best, no confidence. Optional `context: { callsigns, selectedCallsign, fixes }` is live-strip + catalog prompt grounding. | `{ "ok": true, "callsignToken", "instructions" }` or `{ "ok": false, "error": "UNAVAILABLE" \| "PARSE_MISS" \| "SCHEMA" }` (200 or 503). Never 500-with-stack. |

`confidence`: Qwen does not expose a calibrated confidence score; the API returns `1.0`. Command parsing remains responsible for rejecting invalid input.

CORS allows the Vite origin (`http://localhost:5173` and `http://127.0.0.1:5173`). Extra origins: comma-separated `CORS_ORIGINS`.

Default bind: **`127.0.0.1:8090`**. Path C is mandatory: an absent or empty `PARSE_MODEL_ID` selects the default local model. If llama.cpp or weights cannot load, `/health.parse` reports `"off"` and `POST /parse` fails soft with `UNAVAILABLE` (503).

Do not log raw audio. A public Hub model does not need a token. Gated models: `HF_TOKEN` on **this machine only**, never in the browser.

## Path C (mandatory local `/parse`)

Path C is **salvage after typed / Path A / Path B miss**, not 7110.65-complete NLU, not the primary parser, and not a chat UI. The browser schema-checks `Instruction` against Command IR v0; illegal `type` (e.g. `CHAT`) is a miss. The LLM must not override a successful local hit.

Path C remains salvage after deterministic parsing misses. `/health.parse` becomes `"ready"` after local weights load.

**Default model:** Hub GGUF **Qwen3-4B-Instruct-2507 Q4_K_M**.

```text
PARSE_MODEL_ID=MaziyarPanahi/Qwen3-4B-Instruct-2507-GGUF
PARSE_GGUF_FILE=Qwen3-4B-Instruct-2507.Q4_K_M.gguf
```

Same pair is in `.env.example`. Both variables are optional because absent or empty values use these defaults.

Q4_K_M weights are several GB; **CPU OK, slow OK** — salvage only. VRAM not required. CUDA: Path C auto-offloads all layers when `llama-cpp-python` was built with GGML CUDA **and** CUDA 12 `cublas` loads (same DLL path fix as STT). Force CPU: `PARSE_N_GPU_LAYERS=0`. Partial offload: set a positive layer count.

**Custom GGUF Models:** You can drop in any local `.gguf` model file on disk by setting `PARSE_MODEL_ID=/path/to/model.gguf`. Use an **instruct-tuned** model compatible with llama.cpp so it reliably follows system prompt instructions and GBNF JSON grammar constraints.

`llama-cpp-python` runs inference **in this process**. Hugging Face Hub is a **one-time weight download**. Do not point `/parse` at OpenAI, Groq, Anthropic, or HF Inference.

Constrained decoding uses `parse_grammar.gbnf` (JSON matching Command IR v0) when llama.cpp accepts it. Prose from the model is a `SCHEMA` miss.

**Roster + catalog grounding (not a vector DB):** the sim may send `context.callsigns` (on-frequency ICAO), `context.selectedCallsign`, and `context.fixes` (facility catalog ids). Those go in the **user** turn as `onFrequency=` / `fixes=` so the static system prompt stays cacheable. The model must pick an ICAO from the roster (e.g. ASR `giblet 204` → `SWA204`) and a listed fix spelling (e.g. ASR `C-Max` → `SEMAX`). Do not send kinematics — Path C is not an executor. The browser also snaps a unique flight-number suffix onto the roster, and a unique noisy `fixId` onto the catalog, when the model still returns junk.

## Install (Python 3.11+)

Qwen ASR requires Python 3.10+ through its `accelerate` dependency. An existing Python 3.9 virtual environment cannot install this service; recreate it with Python 3.11 or newer.

```text
cd speech-api
py -3.11 -m venv .venv
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

- STT: `STT_MODEL_ID` (default `Qwen/Qwen3-ASR-1.7B`, official `qwen-asr` Transformers backend)
- TTS: `TTS_VOICE` (default `en_US-lessac-medium`) plus a roster of Piper medium voices (`TTS_VOICES`) so each callsign can get a distinct speaker
- Path C: `MaziyarPanahi/Qwen3-4B-Instruct-2507-GGUF` file `Qwen3-4B-Instruct-2507.Q4_K_M.gguf`

Files land under `speech-api/.cache/` (gitignored). Later starts reuse the cache. No per-utterance Hub call.

```text
python download_weights.py
```

Qwen uses CUDA only when the installed PyTorch build exposes it. `torch.cuda.is_available()` false, a CPU-only PyTorch build, or a CUDA load failure selects CPU instead of failing the first `/stt`. Force CPU: `STT_DEVICE=cpu`. On Windows, install a CUDA-enabled PyTorch wheel appropriate to your NVIDIA driver before installing the remaining requirements. TTS uses ONNX Runtime CUDA only when `CUDAExecutionProvider` is actually installed.

CPU inference is supported but can be slow with Qwen3-ASR-1.7B. The voice-loop target of PTT-up → audio-start **p50 < 1.5 s** is measured against this service on localhost/LAN (T03-12).

Public Hub models do **not** need `HF_TOKEN`. An unauthenticated Hub warning on first download is expected.

## Run

```text
python -m uvicorn app:app --host 127.0.0.1 --port 8090
```

Or `python app.py` (reads `HOST` / `PORT`).

Copy `.env.example` to `.env` to keep local flags on disk. `Settings.load()` reads `speech-api/.env` first; variables already in the process environment win. The example shows mandatory Path C's `MaziyarPanahi/Qwen3-4B-Instruct-2507-GGUF` Q4_K_M default. Leave `PARSE_MODEL_ID` absent or empty to use that default.

Docker (binds `0.0.0.0:8090` inside the container; still loopback on the host unless you publish):

```text
docker build -t atc-speech-api .
docker run --rm -p 127.0.0.1:8090:8090 -v speech-api-cache:/app/.cache atc-speech-api
```

## Environment

Copy `.env.example` → `.env` (gitignored) or export the same names in the shell. Docker: `--env-file .env` (the image does not copy `.env`).

| Env | Default | Meaning |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8090` | Bind port |
| `STT_MODEL_ID` | `Qwen/Qwen3-ASR-1.7B` | Qwen3 ASR checkpoint loaded by `qwen-asr` |
| `TTS_VOICE` | `en_US-lessac-medium` | Fallback Piper voice id on `rhasspy/piper-voices` |
| `TTS_VOICES` | lessac, amy, ryan, joe, kristin, kusal (medium) | Comma-separated Piper ids preloaded at startup |
| `PARSE_MODEL_ID` | `MaziyarPanahi/Qwen3-4B-Instruct-2507-GGUF` | Hub id or local `.gguf` path. Absent or empty selects this default. Actual load failures return `UNAVAILABLE`, never an uncaught API error. |
| `PARSE_GGUF_FILE` | `Qwen3-4B-Instruct-2507.Q4_K_M.gguf` | Quant file inside the Hub repo (CPU OK / slow OK) |
| `PARSE_N_GPU_LAYERS` | auto (`-1` if CUDA llama works, else `0`) | llama.cpp GPU layers. Unset = all layers on CUDA, CPU otherwise. `0` = CPU. `-1` = all layers |
| `PARSE_CTX` | `2048` | llama.cpp context |
| `PARSE_N_THREADS` | (engine default) | llama.cpp CPU threads |
| `SPEECH_API_MOCK` | unset | `1` / `true` — no Hub, fake STT/TTS for CI |
| `SPEECH_API_CACHE` | `speech-api/.cache` | Weight cache root |
| `STT_DEVICE` | auto (`cuda` when PyTorch CUDA is available; else `cpu`) | `cpu` or `cuda` |
| `HF_TOKEN` | unset | Local-only, gated Hub models |
| `CORS_ORIGINS` | (empty) | Extra allowed origins, comma-separated |

## Mock mode (CI)

```text
set SPEECH_API_MOCK=1
pip install -r requirements-ci.txt
pytest
```

`POST /stt` returns a fixed English string; `POST /tts` returns a short generated tone WAV. No Hub access.

With absent, empty, or custom `PARSE_MODEL_ID` and `SPEECH_API_MOCK=1`, `/health.parse` is `"ready"` and `POST /parse` returns the documented JSON shape (`FLY_HEADING` 270 `LEFT`, `callsignToken` null) without downloading weights. Text containing `[SCHEMA]` or starting with `CHAT` returns `{ "ok": false, "error": "SCHEMA" }`.

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
