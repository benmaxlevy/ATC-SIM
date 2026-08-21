# T03-14 Optional Path C parse on speech-api

**Phase:** 03 Voice
**Priority:** P1
**Size:** L
**Depends on:** T03-03, T03-13
**Blocks:** none (T03-15 can land first; Path C salvage only helps after the confidence gate is gone)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

When local stages miss, the sim may `POST /parse` on **our** `speech-api` and, after a closed-schema check, treat the JSON as `Instruction[]` with `parseStage: "llm_c"`. Default **off**. Phase 3 **exit does not require** a loaded parse model.

## Context

`phases/_shared/parse-pipeline.md` — stage 4, same list for text and voice.

`phases/_shared/non-goals.md` — not an executor, not chat, not the primary parser.

`phases/_shared/speech-port.md` — same origin as STT/TTS; not a `SpeechPort` method; no paid LLM APIs.

T03-13 should already 503/`UNAVAILABLE` `/parse` when `PARSE_MODEL_ID` is unset. This ticket loads a **local** instruct model (GGUF / llama.cpp / equivalent) when that env is set, and wires the injected fetch in `parseCommand`.

**T03-15** ([T03-15-parse-despite-low-stt-confidence.md](T03-15-parse-despite-low-stt-confidence.md)) removes the voice-loop `confidence < 0.55` early return so noisy STT can reach this pipeline. This ticket does **not** implement that gate removal. Path C still runs **only after typed/A/B miss** — never override a successful local hit, even if STT confidence is low.

T03-10’s settings test that asserts **no Path C copy** is **owned by this ticket** (rewrite it here; do not spawn a new ticket).

## Research

Search: `llama.cpp server GBNF JSON schema`, `constrained decoding instruction JSON`. Prefer a small instruct (1–3B Q4) over a 7B unless GPU is documented in `speech-api/README.md`.

Do not call OpenAI, Groq, Anthropic, or HF Inference.

**Default model (name it; do not wait on a 7B):** Hub GGUF **Qwen2.5-1.5B-Instruct Q4_K_M** (~1–2B instruct). Suggested env:

`PARSE_MODEL_ID=Qwen/Qwen2.5-1.5B-Instruct-GGUF` with quant file `qwen2.5-1.5b-instruct-q4_k_m.gguf` (or the equivalent file the Hub repo actually ships).

RAM/VRAM: weights ~1.0–1.2 GB; plan **~2 GB RAM**. **CPU OK, slow OK** — salvage only. VRAM not required. **Not** a 7B default.

## Scope

- `speech-api`: when `PARSE_MODEL_ID` is set, `POST /parse` runs local inference with a prompt that may **only** emit the JSON object in `parse-pipeline.md` (`callsignToken` + `instructions` matching Command IR v0). Constrained decoding if the engine supports it.
- Engine lives in **`speech-api/`** (llama.cpp / `llama-cpp-python`). **Not** the Vite bundle. No GGUF in git. Hub = **weight download once**.
- `GET /health` includes `parse: "off" | "ready"`. `"ready"` only after the local GGUF is loaded.
- Browser: `parsePathC` fetch helper (injectable). `parseCommand(..., { pathC: true })` calls it **only after typed/A/B miss**. Validate union in TypeScript (`src/parse/path-c.ts`); illegal `type` → miss, do not dispatch.
- Settings: checkbox **Path C (local /parse)**; default **false** until `/health.parse === "ready"` (do not wait on a 7B on the happy path). Persist. When API `parse` is `off`, leave the box off / show unavailable.
- Request body stays `{ text, source, schemaVersion }` only. **Do not** add n-best or confidence to the schema unless a later ticket needs it.
- Timeouts: treat as miss; status line; never throw through the tick.
- Vitest: mock fetch — schema reject, 503, happy `FLY_HEADING`. DOM-free parse tests. Mock-mode API test for JSON shape (`SPEECH_API_MOCK=1`).
- Rewrite T03-10 `settings UI omits … Path C` (`src/ui/settings-speech.test.ts`) so this ticket owns the checkbox (present, default false, disabled until health ready). Keep the “no vendor signup” half of that test.

## Out of scope

- Replacing Path A. Changing kinematics or pilot validation.
- Shipping GGUF in git. Default-on Path C. Putting the model in the Vite bundle.
- Phraseology **grading** via the model (phase 5 uses `parseStage`).
- Paid endpoints. Chat UI.
- n-best lists, confidence on `/parse`, or sending STT scores to the model.
- Removing the voice-loop confidence gate (T03-15).
- A 7B (Gemma-class or otherwise) as the default `PARSE_MODEL_ID`.

## Implementation notes

Prompt must include the frozen `Instruction` union (`phases/_shared/command-ir.md`) and “output JSON only.” If the model returns prose, `SCHEMA` miss. Browser schema-checks in `src/parse/path-c.ts`; illegal `type` (e.g. `CHAT`) → miss, no dispatch.

`source` on the request is a hint (“keyboard tokens vs ASR English”), not a second schema.

Suggested model env: `PARSE_MODEL_ID` (Hub or local path). Document RAM/VRAM. CPU OK, slow OK — this is salvage only.

Trigger remains **only after typed/A/B miss**. LLM must **not** override a successful typed/A/B hit.

Timeout / network / 503 → miss; never throw through the tick. Engine in `speech-api`, not the Vite bundle; grep-ban paid LLM hosts (AC6).

`src/parse` stays DOM-free: inject `parsePathC` fetch. Speech never constructs `Instruction` objects except via `parseCommand` + schema check.

## Acceptance criteria

- [x] **AC1 —** Given `PARSE_MODEL_ID` unset, `POST /parse` returns `ok: false` / `UNAVAILABLE` (or 503) and `/health.parse === "off"`.
- [x] **AC2 —** Given `pathC: false`, `parseCommand` never fetches (spy) even on `"pizza the runway"`.
- [x] **AC3 —** Given local miss + `pathC: true` + mock `/parse` returning a legal `FLY_HEADING` 270 LEFT and `callsignToken` null, then `parseStage === "llm_c"` and instructions match (selected callsign still applied by resolver/pilot as today).
- [x] **AC4 —** Given mock `/parse` with `{ "type": "CHAT" }`, then parse miss, no `Command` dispatch.
- [x] **AC5 —** Given fetch throw or 503, then miss, no uncaught exception.
- [x] **AC6 —** Repo grep: `speech-api` parse path does not call `openai.com`, `api.groq.com`, `api-inference.huggingface.co`.
- [x] **AC7 —** `speech-api/README.md` documents Path C as optional, default off, Hub/local weights, banned vendors.
- [x] **AC8 — Research:** README states Path C is salvage after A/B, not 7110.65-complete NLU.
- [x] **AC9 —** Default `PARSE_MODEL_ID` is a **1–2B instruct GGUF** (Qwen2.5-1.5B-Instruct Q4_K_M or equivalent). README names that id, ~2 GB RAM, CPU OK/slow OK. Default is **not** a 7B.
- [x] **AC10 —** Settings checkbox label is **Path C (local /parse)**. Default **false**. Control stays off / unavailable until `/health.parse === "ready"`. T03-10’s “no Path C in settings” assertion is rewritten here.
- [x] **AC11 —** `POST /parse` JSON is only `{ "text", "source", "schemaVersion" }`. No n-best, no confidence field on the request or required response schema.
- [x] **AC12 —** Given a `/parse` timeout, then parse miss, no uncaught exception through the tick (same as AC5 network/503).
- [x] **AC13 —** Given typed or Path A/B **hit**, `parsePathC` is **not** fetched even when `pathC: true` (miss-only trigger).

## Test plan

- Unit: injected `parsePathC`; schema gate; skipped when `pathC: false`; skipped on local hit; timeout → miss.
- API: mock inference JSON shape; `PARSE_MODEL_ID` unset → UNAVAILABLE; grep-ban paid hosts.
- Settings: checkbox present; default false; disabled until `parse === "ready"`.
- Manual: optional — enable Path C, say something A/B miss, confirm salvage **or** skip if no GPU.

## Suggested files

- `speech-api/` parse route + health field + llama.cpp / `llama-cpp-python` engine
- `speech-api/README.md` (default `PARSE_MODEL_ID`, RAM/VRAM, CPU OK)
- `src/parse/path-c.ts`
- `src/parse/path-c.test.ts`
- `src/parse/parse-command.ts` (stage 4)
- `src/ui/settings-speech.ts` (toggle **Path C (local /parse)**)
- `src/ui/settings-speech.test.ts` (own the former T03-10 omit-Path-C test)
