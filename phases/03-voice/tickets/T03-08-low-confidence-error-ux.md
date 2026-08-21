# T03-08 Low confidence and error UX

**Phase:** 03 Voice
**Priority:** P0
**Size:** M
**Depends on:** T03-02
**Blocks:** T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

**Superseded (partial):** [T03-15](T03-15-parse-despite-low-stt-confidence.md) removes the voice-loop `confidence < threshold` early return. **AC1** (“do not call parse on low confidence”) is no longer the product rule. Mic / STT / parse-miss / TTS status UX in this ticket still stands.

## Goal

Mic, STT, confidence, parse, and TTS failures show in the readback/status line (and session log). None of them throw through the sim tick. Low confidence never moves an aircraft.

## Context

`phases/_shared/speech-port.md` non-negotiables: failures surface in the readback/status line, never throw through the sim tick. Confidence below threshold (default **0.55**) → reject, ask for repeat.

Phase README §8 is the table to implement. Pilot rejects (ambiguous callsign, etc.) already have phase 1 copy — reuse them.

## Scope

- Status line (or the same place phase 1 shows readbacks/errors) for:
  - Microphone blocked / permission denied
  - Voice needs HTTPS or localhost
  - Mic capture failed
  - No audio (empty clip)
  - Voice backend unavailable (`null` / throw)
  - Radio failed / say again (STT timeout, HTTP error, network)
  - Say again (low confidence) — include confidence if useful, e.g. `(0.41)`
  - Unable to parse (A and B miss) — do not dump a stack
  - Readback audio failed (intent already applied)
  - Radio busy / standby (PTT ignored while locked) — brief, non-modal
- Map T03-01 signals + voice-loop catches onto these strings. Keep copy **short** (STARS-like status, not a tutorial paragraph).
- Session event log: reason codes (`mic_denied`, `low_confidence`, `parse_miss`, `stt_failed`, `tts_failed`, `ptt_locked`, …) plus `sourceText` when any.
- Low confidence: **do not** call parse or pilot.
- No `alert()`, no `window.confirm`, no thrown error in `requestAnimationFrame` / `stepWorld`.
- Threshold still default 0.55; settings wiring can wait for T03-10 if a setter already exists on the loop.

## Out of scope

- Overlay latency numbers (T03-09).
- Redesigning the whole UI chrome or datablocks.
- Auto-retry STT.
- LLM “did you mean”.
- Speaking the error over TTS unless the existing pilot error readback already would (pilot rejects only). Mic/STT errors are **text status**, not fake pilot voices.

## Implementation notes

- Centralize copy in `src/ui/voice-status.ts` or `src/speech/voice-errors.ts` so tickets do not scatter strings.
- If the status line is React, pass a `voiceStatus: string | null` from the shell; do not subscribe inside `src/parse`.
- Clear status on next PTT-down or after a successful readback.
- Tests: given fake port confidence 0.5, dispatch is not called and status code is `low_confidence`. Given parse miss, no dispatch. Given transcribe throw, no dispatch.

## Acceptance criteria

- [ ] **AC1 —** Given `confidence < 0.55`, then no `Command` is dispatched, status indicates say-again / low confidence, and the aircraft intent is unchanged.
- [ ] **AC2 —** Given permission-denied from capture, then status indicates microphone blocked and the tick still runs.
- [ ] **AC3 —** Given STT failure / thrown transcribe, then status indicates radio/backend failure, no dispatch.
- [ ] **AC4 —** Given spoken parse miss, then status indicates unable to parse; `sourceText` is logged.
- [ ] **AC5 —** Given PTT while locked, then a radio-busy/standby status appears and no clip is queued.
- [ ] **AC6 —** Automated test exists for AC1 (happy-path-adjacent: the primary reject path).

## Test plan

- Unit: voice-loop + status mapper; each reason code; confidence boundary `0.55` fails, `0.55` exactly — **treat as reject if `<` only** so `0.55` **passes** (document: reject when `confidence < threshold`).
- Integration: none required.
- Manual: deny mic; tap PTT with silence; garbled speech; talk during readback.

## Suggested files

- `src/ui/voice-status.ts`
- `src/speech/voice-error-codes.ts`
- `src/speech/voice-loop.ts` (wire)
- `src/speech/voice-loop.test.ts` (extend)
