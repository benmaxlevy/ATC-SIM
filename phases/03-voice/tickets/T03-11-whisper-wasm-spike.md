# T03-11 Optional whisper-wasm spike

**Phase:** 03 Voice
**Priority:** P2
**Size:** L
**Depends on:** T03-01
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets. **Defer by default. Not required to exit phase 3.**

## Goal

Spike a `SpeechPort` with `id: "whisper-wasm"` that transcribes a PTT clip **in-tab** on desktop Chrome/Edge. Prove it loads, transcribes a fixture clip, and can be selected if present. It must not become the default path or a phase-exit gate.

## Context

`phases/_shared/speech-port.md`: `whisper-wasm` is phase 3 **optional**; must not be required to pass phase 3. `phases/_shared/non-goals.md`: no fine-tuning Whisper in this repo; no shipping a 500 MB+ ATC-medium model as the **default** path.

This is a spike: time-box it. A documented fail (too large, too slow, thread deadlock) is a valid ticket outcome if captured in a short `SPIKE.md` **inside this ticket’s suggested files under `src/speech/ports/whisper-wasm/`** — still do not edit other phases.

## Scope

- Evaluate one in-browser Whisper (or compatible) WASM/ONNX runtime that can accept PCM16 16 kHz mono.
- `WhisperWasmPort.transcribe(clip)` → `Transcript`. `synthesize` may throw “not implemented” or delegate — **STT-only is OK**; TTS stays http/web-speech.
- Desktop Chrome/Edge only; if Safari/Firefox fail, feature-detect and error softly.
- Lazy-load the model on first transcribe or on backend select; show status “loading model.”
- Use a **small** multilingual/base/tiny model if any is bundled or fetched. Document size. Do **not** set this port as `pickDefaultBackend` output.
- Do not add a first-class Workers AI port.

If the spike is deferred: leave the factory unaware of the id, and skip files. That is an acceptable close-out when the user skips this ticket.

## Out of scope

- Fine-tuning, LoRA, ATC-medium 500 MB default.
- Replacing http as quality default.
- LLM rescoring.
- Always-on listen.
- Phase exit checklist items.

## Implementation notes

- Keep the runtime import **inside** `src/speech/ports/whisper-wasm/` so Vite can code-split. Core/parse/pilot must not import it.
- Worker thread recommended so the sim tick does not freeze; if the first cut blocks main thread for > 100 ms, note it in SPIKE.md and stop — do not “fix” with a training pipeline.
- Memory: fail clearly if WASM instantiate fails.
- Tests: mock the runtime; do not download a model in CI.

## Acceptance criteria

- [ ] **AC1 —** If implemented: `id === "whisper-wasm"` and a mocked runtime returns text from `transcribe`.
- [ ] **AC2 —** Factory / settings do not select this port as default even if the module exists.
- [ ] **AC3 —** If implemented: missing WebAssembly or failed load → typed error, no tick crash.
- [ ] **AC4 —** If **deferred**: no default-backend change, and phase 3 exit docs still treat this id as optional. (Closing the ticket as deferred with a one-line comment in factory is enough when the user asked to skip.)
- [ ] **AC5 —** Automated test exists for the mocked transcribe path **or** (if deferred) no failing test references a missing module.

## Test plan

- Unit: mock WASM backend; default picker never returns `whisper-wasm`.
- Integration: none in CI.
- Manual (only if spike proceeds): Chrome, select backend, 2 s PTT, note `ptt_up_to_transcript_ms`. Record in SPIKE.md.

## Suggested files

- `src/speech/ports/whisper-wasm/whisper-wasm-port.ts`
- `src/speech/ports/whisper-wasm/whisper-wasm-port.test.ts`
- `src/speech/ports/whisper-wasm/SPIKE.md`
