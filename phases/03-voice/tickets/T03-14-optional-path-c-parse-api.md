# T03-14 Optional Path C parse on speech-api

**Phase:** 03 Voice
**Priority:** P1
**Size:** M
**Depends on:** T03-03, T03-13
**Blocks:** none (T03-10 may add the settings toggle; T03-12 does not require this)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

When local stages miss, the sim may `POST /parse` on **our** `speech-api` and, after a closed-schema check, treat the JSON as `Instruction[]` with `parseStage: "llm_c"`. Default **off**. Phase 3 **exit does not require** a loaded parse model.

## Context

`phases/_shared/parse-pipeline.md` — stage 4, same list for text and voice.

`phases/_shared/non-goals.md` — not an executor, not chat, not the primary parser.

`phases/_shared/speech-port.md` — same origin as STT/TTS; not a `SpeechPort` method; no paid LLM APIs.

T03-13 should already 503/`UNAVAILABLE` `/parse` when `PARSE_MODEL_ID` is unset. This ticket loads a **local** instruct model (GGUF / llama.cpp / equivalent) when that env is set, and wires the injected fetch in `parseCommand`.

## Research

Search: `llama.cpp server GBNF JSON schema`, `constrained decoding instruction JSON`. Prefer a small instruct (1–3B Q4) over a 7B unless GPU is documented in `speech-api/README.md`.

Do not call OpenAI, Groq, Anthropic, or HF Inference.

## Scope

- `speech-api`: when `PARSE_MODEL_ID` is set, `POST /parse` runs local inference with a prompt that may **only** emit the JSON object in `parse-pipeline.md` (`callsignToken` + `instructions` matching Command IR v0). Constrained decoding if the engine supports it.
- `GET /health` includes `parse: "off" | "ready"`.
- Browser: `parsePathC` fetch helper (injectable). `parseCommand(..., { pathC: true })` calls it **only** after typed/A/B miss. Validate union in TypeScript; illegal `type` → miss, do not dispatch.
- Settings (or T03-10 if that ticket lands later): checkbox **Path C (local /parse)** default **false**. Persist. When API `parse` is `off`, leave the box off / show unavailable.
- Timeouts: treat as miss; status line; never throw through the tick.
- Vitest: mock fetch — schema reject, 503, happy `FLY_HEADING`. DOM-free parse tests. Mock-mode API test for JSON shape (`SPEECH_API_MOCK=1`).

## Out of scope

- Replacing Path A. Changing kinematics or pilot validation.
- Shipping GGUF in git. Default-on Path C. Putting the model in the Vite bundle.
- Phraseology **grading** via the model (phase 5 uses `parseStage`).
- Paid endpoints. Chat UI.

## Implementation notes

Prompt must include the frozen `Instruction` union and “output JSON only.” If the model returns prose, `SCHEMA` miss.

`source` on the request is a hint (“keyboard tokens vs ASR English”), not a second schema.

Suggested model env: `PARSE_MODEL_ID` (Hub or local path). Document RAM/VRAM. CPU OK, slow OK — this is salvage only.

## Acceptance criteria

- [ ] **AC1 —** Given `PARSE_MODEL_ID` unset, `POST /parse` returns `ok: false` / `UNAVAILABLE` (or 503) and `/health.parse === "off"`.
- [ ] **AC2 —** Given `pathC: false`, `parseCommand` never fetches (spy) even on `"pizza the runway"`.
- [ ] **AC3 —** Given local miss + `pathC: true` + mock `/parse` returning a legal `FLY_HEADING` 270 LEFT and `callsignToken` null, then `parseStage === "llm_c"` and instructions match (selected callsign still applied by resolver/pilot as today).
- [ ] **AC4 —** Given mock `/parse` with `{ "type": "CHAT" }`, then parse miss, no `Command` dispatch.
- [ ] **AC5 —** Given fetch throw or 503, then miss, no uncaught exception.
- [ ] **AC6 —** Repo grep: `speech-api` parse path does not call `openai.com`, `api.groq.com`, `api-inference.huggingface.co`.
- [ ] **AC7 —** `speech-api/README.md` documents Path C as optional, default off, Hub/local weights, banned vendors.
- [ ] **AC8 — Research:** README states Path C is salvage after A/B, not 7110.65-complete NLU.

## Test plan

- Unit: injected `parsePathC`; schema gate; skipped when `pathC: false`.
- API: mock inference JSON shape.
- Manual: optional — enable Path C, say something A/B miss, confirm salvage **or** skip if no GPU.

## Suggested files

- `speech-api/` parse route + health field
- `src/parse/path-c.ts`
- `src/parse/path-c.test.ts`
- `src/parse/parse-command.ts` (stage 4)
- `src/ui/settings-speech.ts` (toggle)
- `speech-api/README.md`
