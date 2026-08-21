# Phase 3 agent prompt

Copy this entire file into a new agent. The agent implements **Phase 3 (Voice loop)** of ATC-SIM only.

---

You are implementing Phase 3 of ATC-SIM: PTT capture → SpeechPort STT → **the same Command IR as typed text** → existing pilot agent → SpeechPort TTS → Web Audio radio FX.

You write **application code** for this phase. You do **not** edit other phase folders, `phases/_shared/`, or `phases/README.md`. You do **not** start Phase 4/5 work.

## Read first (mandatory)

1. `phases/_shared/glossary.md`
2. `phases/_shared/references.md` — **R01/R03** for spoken 7110.65; do not use ICAO Doc 4444 as the v1 grammar (**R10** is contrast only).
3. `phases/_shared/parse-pipeline.md`
4. `phases/_shared/architecture.md`
5. `phases/_shared/command-ir.md`
6. `phases/_shared/speech-port.md`
7. `phases/_shared/non-goals.md`
8. `phases/_shared/ticket-template.md`
9. `phases/03-voice/README.md` — **source of truth for this phase**
10. The single ticket you are on (see order below)

If a ticket and `phases/03-voice/README.md` disagree, follow the README and then fix the ticket. If the README and `_shared/` disagree, **`_shared/` wins** — do not “fix” shared contracts unless the user explicitly asks.

## Frozen decisions (do not reopen)

- Speech is a **swappable `SpeechPort`**. Sim/parser/pilot compile and run with `NullSpeechPort`.
- Voice and text **compile to `Command` via the same stage list** (`parse-pipeline.md`). `source` is the channel; `parseStage` is which compiler won.
- **Order:** normalize → typed tokenizer → Path A → Path B → optional Path C. Typed English in the command line is tokenizer miss then A. Path C is T03-14, default off, **not** required to exit.
- **http** (`HttpSpeechPort` → **our** `speech-api`) is the quality default. **web-speech** is opt-in prototype (browser vendor cloud — not default). **whisper-wasm** is optional and **must not** be required to exit.
- **No barge-in:** ignore PTT while a readback is playing (do not queue).
- PTT default key is backtick `` ` ``, configurable. Do not default Caps Lock.
- Failures (mic deny, timeout, low confidence) → status/readback line. **Never throw through the sim tick.**
- Log **PTT-up → transcript** and **PTT-up → audio-start**. Target **< 1.5 s** p50 against **localhost speech-api**. **Do not fail the phase on Web Speech quality.**
- Do not import vendor SDKs. **No paid STT/TTS APIs.** Hugging Face Hub = weight download only (T03-13).
- No always-on listen, no Whisper fine-tune in this repo, no 500 MB model in the Vite bundle. No paid LLM APIs. Path C only via local `/parse` when T03-14 is implemented.

## Ticket order (one at a time)

Implement only the current ticket. Stop when its acceptance criteria are checked. Do not start downstream tickets in the same session unless the user names them.

1. `tickets/T03-01-capture-audioworklet-ptt.md` — P0
2. `tickets/T03-03-spoken-phraseology-grammar.md` — P0 (can follow or parallel 01; no mic needed)
3. `tickets/T03-02-transcript-to-parser.md` — P0
4. `tickets/T03-08-low-confidence-error-ux.md` — P0
5. `tickets/T03-04-web-speech-adapter.md` — P1, **opt-in, skip if short on time**
6. `tickets/T03-13-self-hosted-speech-api.md` — P0
7. `tickets/T03-05-http-stt-tts-adapter.md` — P0
8. `tickets/T03-06-readback-tts-playback.md` — P0
9. `tickets/T03-07-radio-fx-graph.md` — P1
10. `tickets/T03-09-latency-metrics-overlay.md` — P1
11. `tickets/T03-10-settings-speech-backend.md` — P1
12. `tickets/T03-11-whisper-wasm-spike.md` — **P2, skip unless asked**
13. `tickets/T03-14-optional-path-c-parse-api.md` — **P1, skip unless asked** (not required to exit)
14. `tickets/T03-12-voice-acceptance-script.md` — P0 (script + run what CI can run)

Do not implement T03-11 or T03-14 unless the user explicitly asks. Phase exit does not need them.

## Engineering constraints

- TypeScript strict. Vitest. `src/parse` and `src/core` / `src/pilot` stay **DOM-free**.
- Match existing folder layout from phase 0. Suggested speech/parse/ui paths are in the phase README §11.
- Reuse phase 1 `parseCommand` / `applyCommand` (names may differ). Do not duplicate the pilot or kinematics.
- `AudioClip`: `sampleRate`, `channels: 1`, `pcm16: Int16Array`. Prefer 16 kHz for STT.
- `Transcript.confidence` below threshold (default **0.55**) → reject before parse.
- Web Speech cannot consume a PCM clip: optional `beginUtterance` / `endUtterance` on the port is allowed; clip adapters no-op it. Document in code comments.
- `speechSynthesis` is a black box — no radio FX on that path. http PCM goes through the FX graph.
- When a text field is focused, do not treat the PTT bind as transmit.
- Keep the typed command line working (tokens and, after T03-03, English via Path A). Phase 1 tests must still pass.

## Stop conditions

- After each ticket: ACs checked, tests listed in the ticket exist, no unrelated refactors.
- After T03-12: phase README **Phase exit** checklist is your report card. Mark what you verified. If speech-api p50 ≥ 1.5 s, record the number; do not hide it.
- If phase 1 is not actually present in the repo, stop and say so — do not invent a typed parser.

## Out of scope

Fine-tuning models, always-on listen, replacing Path A with a model, **paid STT/TTS/LLM vendors**, barge-in, queueing PTT, phase 2 scope features, phase 4 instruction types, editing `_shared/` or other `phases/NN-*` folders.
