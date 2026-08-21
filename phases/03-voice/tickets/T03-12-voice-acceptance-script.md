# T03-12 Phase 3 voice acceptance script

**Phase:** 03 Voice
**Priority:** P0
**Size:** M
**Depends on:** T03-01, T03-02, T03-03, T03-05, T03-06, T03-08, T03-09, T03-10 (T03-04 and T03-07 preferred; T03-11 must not block)
**Blocks:** none (phase 3 exit)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A repeatable acceptance script (automated where honest, manual where audio/mic/network are required) proves the voice loop against the phase README exit checklist. Web Speech quality and whisper-wasm are **not** fail criteria. http p50 audio-start is **measured**.

## Context

Phase README §13 exit checklist. Architecture quality bar: hosted STT PTT-up → readback audio start **< 1.5 s p50** on broadband. Shared speech-port: log both latency numbers.

This ticket **writes the script and any small test harness**. It does not add features. If a prior ticket’s AC is red, fix that ticket — do not weaken this script.

## Scope

- Add `phases/03-voice/ACCEPTANCE.md` **or** `src/speech/ACCEPTANCE.md` — prefer **`phases/03-voice/ACCEPTANCE.md`** (still this phase folder).
- Script sections below (numbered). Each step maps to an exit item **E1–E14**.
- Automated: keep/confirm Vitest for grammar fixtures (T03-03), voice-loop fake port (T03-02), http mocks (T03-05), metrics p50 (T03-09), default backend (T03-10). A single `npm test` / `pnpm test` path that includes these.
- Manual script for mic, http URLs, radio FX listen, barge-in ignore, overlay.
- Record table: browser, adapter, n utterances, p50 transcript ms, p50 audio-start ms, pass/fail notes.
- Explicit **skip** lines: Web Speech accuracy; T03-11.

## Out of scope

- Fine-tuning, LLM, always-on, paid vendor STT/TTS.
- New SpeechPort features.
- Phase 4/5 scoring.
- Failing the phase because Web Speech heard “heading to heaven.”
- Editing `_shared/` or other phases.

## Implementation notes

Write the acceptance doc as a checklist a human or agent can run in one sitting (~20 minutes with http configured).

### Manual script (include verbatim in ACCEPTANCE.md)

**Setup.** Phase 1 scenario with `DAL123` (or documented callsign) airborne. Command line works. **T03-13 `speech-api` running** on `127.0.0.1:8090`. Overlay on. Backend `http`. Headphones recommended (echoCancellation on).

1. **Typed regression (E13).** Type the equivalent of turn left heading 270. Aircraft turns. Text `source` remains text (log).
2. **Mic grant (E1).** PTT `` ` ``; browser permission allow; tab mic icon. Release; non-empty clip path (no crash).
3. **Mic deny (E1, E7).** Revoke permission, PTT; status microphone blocked; aircraft still moves on typed command; no exception in console from the tick.
4. **Phrase 1 (E2, E3, E5).** Select `DAL123` or speak the callsign. PTT: *“Delta one two three descend and maintain three thousand.”* Expect descend intent 3000 ft, readback audio, `Command.source === "voice"` in log.
5. **Phrase 2 (E2, E3).** PTT: *“turn left heading two seven zero.”* Expect heading 270 left turn (with selection if callsign omitted).
6. **Busy PTT (E5).** During readback, hold PTT and speak; **no** new command; radio-busy status; after audio ends, PTT works.
7. **Low confidence / parse (E7).** Whisper nonsense or set threshold to `1.0` temporarily; expect say-again; no intent change. Reset threshold to 0.55.
8. **Radio FX (E6).** Hear filtered voice + light noise on http PCM. Toggle dry if settings exist.
9. **Metrics (E8, E10).** Overlay shows last transcript ms and audio-start ms. Perform **≥ 7** good http utterances. Record p50 audio-start. Target `< 1500`. If ≥ 1500, write the number and suspected bottleneck (STT, TTS, or play resume) — still mark E10 as “measured.”
10. **Backend switch (E9).** Switch to `web-speech` if available; one PTT; may be wrong words — **pass if no crash**. Switch to `null`; PTT shows backend unavailable. Switch back to `http`.
11. **Web Speech quality (E11).** Do not fail the run on wrong transcript.
12. **whisper-wasm (E12).** Skip unless present.
13. **Non-goals (E14).** Confirm no OpenAI/Deepgram/HF Inference call in the voice path; no always-on recognition before PTT (DevTools / mic icon idle). `speech-api` is local.

### Automated script

- Command to run unit tests for `src/parse/spoken`, `voice-loop`, `http-speech-port`, `metrics`, `factory`.
- Grammar fixtures must include the two 7110.65-shaped strings from T03-03.

## Acceptance criteria

- [x] **AC1 —** `phases/03-voice/ACCEPTANCE.md` exists and lists steps 1–13 mapped to E1–E14.
- [x] **AC2 —** Automated grammar tests for the two required spoken utterances still pass.
- [x] **AC3 —** The doc states Web Speech quality is not a fail and whisper-wasm is optional.
- [x] **AC4 —** The doc includes a p50 results table (blank OK until filled) for http audio-start.
- [ ] **AC5 —** Manual: at least one http happy-path utterance produced voice `Command` + audio (agent or human records pass/fail in the table when they run it). If URLs are absent in this environment, the script says **BLOCKED on http config** rather than silently skipping E4/E10.
- [x] **AC6 —** Automated test exists for the grammar happy path (already T03-03; this ticket confirms it is in the default test run).

## Test plan

- Unit: whatever the repo already runs; do not delete spoken fixtures.
- Integration: none required beyond mocks.
- Manual: execute ACCEPTANCE.md; fill the metrics table.

## Suggested files

- `phases/03-voice/ACCEPTANCE.md`
- (no production app code unless a test glob needs a pointer)

## Notes

AC1 / AC3 / AC4: `phases/03-voice/ACCEPTANCE.md` — verbatim steps 1–13 mapped to E1–E14, skip lines for Web Speech quality and T03-11 whisper-wasm, Path C off is not a fail, blank p50 table.

AC2 / AC6: T03-03 fixtures still in default `npm test` (`src/parse/spoken/grammar.test.ts`, `src/parse/parse.test.ts`). This ticket adds `src/speech/voiceAcceptance.test.ts` so the two 7110.65-shaped strings are asserted in the default glob.

AC5 leftover: live http happy-path not run. This worktree probed `127.0.0.1:8090`: TCP LISTEN but `GET /health` timed out (0 bytes). ACCEPTANCE.md records **BLOCKED on http config** for E4/E10 rather than a fake p50. Re-run steps 4–10 when speech-api `/health` returns JSON.
