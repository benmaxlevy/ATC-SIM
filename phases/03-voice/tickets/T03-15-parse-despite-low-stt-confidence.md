# T03-15 Parse despite low STT confidence

**Phase:** 03 Voice
**Priority:** P1
**Size:** S
**Depends on:** T03-02, T03-08
**Blocks:** none (can land **before** T03-14 GGUF; Path C salvage only helps after this gate is gone)
**Launch:** Implement this ticket only. Do not start T03-14 or downstream tickets.

## Goal

The voice loop **always** calls `parseCommand` after a successful STT transcript. A parseable utterance dispatches even when `transcript.confidence` is below 0.55. Empty clips and STT HTTP failures still reject. Garbage still `parse_miss`. T03-08’s “do not call parse on low confidence” is **superseded**.

## Context

T03-08 (and T03-02 AC5) early-return in `src/speech/voice-loop.ts` when `transcript.confidence < threshold` (default **0.55**). That never lets noisy-but-parseable ASR reach typed / Path A / Path B — so optional Path C (`parse-pipeline.md` stage 4, T03-14) cannot salvage a miss either.

`phases/_shared/parse-pipeline.md` — one `parseCommand` for text and voice. First local hit wins. Path C is **only after** typed/A/B miss.

`phases/_shared/speech-port.md` — keep `Transcript.confidence` on the type. **Do not** reopen the SpeechPort interface or patch `_shared/`. The coordinator no longer treats low confidence as a parse skip.

`phases/_shared/non-goals.md` — this ticket is **not** Path C, not an LLM, not “did you mean.”

Can land **before** the GGUF. Does not implement `/parse`.

## Research

- **R01** JO 7110.65 radio communications — official term **SAY AGAIN** is for an unreadable transmission. Search: `FAA JO 7110.65 say again radio communications`.
- **R02** PCG — **SAY AGAIN**. Search: `FAA Pilot Controller Glossary SAY AGAIN`.
- **Trainer delta:** STT `confidence` is an ASR score, not “unreadable radio.” A parseable transcript must compile through `parseCommand`. Status **must not** be “Say again” **solely** because confidence is low. Empty clip / STT HTTP fail still reject (T03-08 copy). Parse miss stays “Unable to parse.”
- Cite analog + trainer delta in a code comment on the removed gate: `// R01 SAY AGAIN is unreadable radio; T03-15 does not skip parse on low ASR confidence.`

## Scope

- Remove the `transcript.confidence < threshold` early return in `src/speech/voice-loop.ts`. After STT resolves with text, **always** `await parseCommand(...)`.
- Empty clip (`result.kind === "empty"`) still **does not** call `transcribe` / parse; status `empty_clip`.
- STT HTTP fail / thrown `transcribe` still **does not** parse; status `stt_failed` / `voice_backend_unavailable` as today.
- Keep logging `transcript.confidence` on the utterance metrics / session event (accepted **and** `parse_miss`). Optional status is **not** “Say again” solely for low confidence. Do not emit `low_confidence` as the reason a parseable command was dropped.
- Rewrite T03-08 tests that require confidence `0.5` to never move the aircraft:
  - `src/app/create-app.test.ts` — `T03-08 AC1 — confidence 0.5 does not move the aircraft and logs low_confidence`
  - `src/speech/voice-loop.test.ts` — `AC1 — confidence 0.5 does not parse or dispatch (T03-08)` and `AC5 — confidence 0.54 does not parse or dispatch` (T03-02 leftover)
- New assertions: a **parseable** low-conf transcript (`turn left heading two seven zero` at `0.5`) **must** dispatch and move the aircraft; **garbage** (`pizza the runway` at `0.5`) still `parse_miss`, no dispatch.
- Settings: keep the confidence slider as **informational / future use**, or hide it. Wiring `setConfidenceThreshold` **must not** restore the parse gate.
- **Explicitly supersede T03-08** “Low confidence: do not call parse or pilot” and AC1 “Given `confidence < 0.55`, then no `Command` is dispatched.” Mic / STT / parse-miss / TTS status UX from T03-08 still stands.

## Out of scope

- Path C / `POST /parse` / GGUF (T03-14).
- Reopening `_shared/speech-port.md` JSDoc, Command IR, or parser tokens.
- Restoring a confidence gate “behind a flag.”
- LLM “did you mean,” chat, n-best.
- Rewriting T03-12 ACCEPTANCE.md step 7 (stale “set threshold to 1.0 → say-again”); leave a one-line comment if you touch nearby tests, but do not expand this ticket into T03-12.
- Paid STT/TTS/LLM.

## Implementation notes

Coordinator after this ticket (illustrative):

```ts
const transcript = await port.transcribe(clip);
// log confidence on metrics / session; do not early-return on threshold
const parsed = await parseCommand(transcript.text, { source: "voice", selectedCallsign, pathC });
```

- `DEFAULT_CONFIDENCE_THRESHOLD = 0.55` may remain as a named constant for the slider / logs. It must **not** skip `parseCommand`.
- `low_confidence` may stay in `VOICE_ERROR_CODES` unused, or be removed if nothing else emits it. Do not keep a status path that says “Say again” **only** because `confidence < 0.55`.
- First success still wins: typed → A → B. Low STT confidence must **not** skip A/B in favor of Path C. Path C (when T03-14 lands) is still miss-only.
- Never throw through the sim tick.

## Acceptance criteria

- [ ] **AC1 —** Given a fake SpeechPort transcript `turn left heading two seven zero` with `confidence === 0.5` and a selected track, when PTT-up fires with a non-empty clip, then `parseCommand` is called and a `Command` is dispatched (`source: "voice"`, `FLY_HEADING` 270 LEFT). The aircraft intent changes.
- [ ] **AC2 —** Given the same setup with transcript `"pizza the runway"` and `confidence === 0.5`, then `parseCommand` is called, status is `parse_miss` (unable to parse), no `Command` dispatch, aircraft unchanged.
- [ ] **AC3 —** Given an empty clip, then no `transcribe` / no `parseCommand`; status `empty_clip`; aircraft unchanged.
- [ ] **AC4 —** Given `transcribe` throw / STT HTTP fail, then no `parseCommand`; status radio/backend failure; aircraft unchanged; no uncaught exception in the tick.
- [ ] **AC5 —** There is **no** remaining `if (transcript.confidence < …) return` in `src/speech/voice-loop.ts`. Tests that required `0.5` to never move the aircraft are rewritten (AC1/AC2), not deleted without replacement.
- [ ] **AC6 —** `transcript.confidence` is still logged on utterance metrics or the session event when STT returns a transcript. Status is **not** “Say again” solely for low confidence.
- [ ] **AC7 —** Settings confidence slider remains informational (or is hidden). Changing the slider does not restore a parse skip. Automated test exists for AC1.
- [ ] **AC8 — Research:** A code comment at the former gate cites R01 SAY AGAIN + trainer delta (ASR score ≠ unreadable radio). User-facing parse-miss copy stays glossary “Unable to parse,” not a new synonym.

## Test plan

- Unit: `src/speech/voice-loop.test.ts` — parseable 0.5 dispatches; garbage 0.5 → `parse_miss`; empty clip and STT throw unchanged; spy proves `parseCommand` runs on low conf.
- Integration: `src/app/create-app.test.ts` — rewrite T03-08 AC1 so 0.5 on a heading utterance **moves** the aircraft; add garbage 0.5 → no movement + `parse_miss`.
- Manual: none required. Optional: speak a clear heading with a backend that reports low confidence and confirm the turn.

## Suggested files

- `src/speech/voice-loop.ts` (remove confidence early return; log confidence)
- `src/speech/voice-loop.test.ts` (rewrite T03-08 / T03-02 AC5)
- `src/app/create-app.test.ts` (rewrite T03-08 AC1)
- `src/ui/settings-speech.tsx` (slider informational or hidden; do not restore the gate)
- `src/speech/metrics.ts` or session log (confidence field if not already present)
