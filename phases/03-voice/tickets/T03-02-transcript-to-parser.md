# T03-02 Transcript to parser plumbing

**Phase:** 03 Voice
**Priority:** P0
**Size:** M
**Depends on:** T03-01, T03-03
**Blocks:** T03-06, T03-08, T03-09, T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

On PTT-up, the active `SpeechPort.transcribe` result is parsed with `source: "voice"` and handed to the **existing** pilot apply path. A heading or altitude spoken per T03-03 moves the same aircraft as the equivalent typed command.

## Context

`phases/_shared/speech-port.md`: transcript text goes to the **same parser** as the command line. `phases/_shared/command-ir.md`: `Command.source` is `"text" | "voice"`; the parser does not otherwise fork the pilot.

Phase README §3: coordinator lives in speech (or UI shell) but **must not** construct `Instruction` objects. T03-03 supplies path A (and B fallback). This ticket wires capture → port → parse → pilot.

Until T03-04/T03-05 land, use a **test double / injectable** `SpeechPort` (and `NullSpeechPort` in production default). Do not stub a fake parser.

## Scope

- `VoiceLoop` (name flexible) that:
  1. Subscribes to T03-01 `ptt-down` / `ptt-up`.
  2. On down: optional `speechPort.beginUtterance?.()`.
  3. On up: if empty clip, stop (T03-08 will own copy); else `await speechPort.transcribe(clip)` (or live `endUtterance` if the port used live STT).
  4. If `transcript.confidence < threshold` (default 0.55), do not parse (hook for T03-08).
  5. `parseCommand(transcript.text, { source: "voice", selectedCallsign })` — exact API should match phase 1; add `source` if missing.
  6. On parse success, call the **same** `applyCommand` / pilot entry as the command line.
- Set `Command.source` to `"voice"` and `Command.sourceText` to `transcript.text` (raw ASR, not only normalized).
- Enforce one in-flight `transcribe` per session (`speech-port.md`).
- Emit/session-log `command.accepted` / `command.rejected` as phase 0/1 already do; include source.
- Catch transcribe throws (null port) and do not kill the tick.
- Mark `t0` on PTT-up for metrics (store on the utterance even if T03-09 overlay is later).

## Out of scope

- Spoken grammar implementation (T03-03) — consume it.
- Web Speech / HTTP adapters (T03-04, T03-05) — inject a fake port in tests.
- TTS playback, radio FX, overlay UI, settings page.
- Changing pilot validation or kinematics.
- Barge-in / queueing.

## Implementation notes

- `src/parse` must remain DOM-free. The coordinator may live in `src/speech/voice-loop.ts` and call parse + a `dispatchCommand(command)` injected from the app shell.
- Typed path must keep `source: "text"`. Add a regression test that typing `H270` still yields `"text"`.
- Selected track: pass the same selection the command line uses when the utterance has no callsign.
- Do not call `transcribe` on empty clips.
- Threshold: named constant `DEFAULT_CONFIDENCE_THRESHOLD = 0.55`, overridable for T03-10.
- If phase 1 parse entry cannot accept `source`, extend it with a default of `"text"` so old callers stay valid.

Coordinator sketch (illustrative):

```ts
async function onPttUp(clip: AudioClip, t0: number): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const transcript = await port.transcribe(clip);
    // record t_transcript
    if (transcript.confidence < threshold) { /* reject hook */ return; }
    const command = parseCommand(transcript.text, { source: "voice", selectedCallsign });
    dispatchCommand(command);
  } catch (err) { /* status hook; never rethrow into tick */ }
  finally { inFlight = false; }
}
```

## Acceptance criteria

- [ ] **AC1 —** Given a fake SpeechPort that returns text `turn left heading two seven zero` with confidence 1 and a selected track `DAL123`, when PTT-up fires with a non-empty clip, then a `Command` is dispatched with `source === "voice"`, `callsign === "DAL123"`, and `FLY_HEADING 270 LEFT`.
- [ ] **AC2 —** Given the same setup as the typed command `DAL123 L270` (or equivalent phase 1 tokens), then the aircraft intent/heading change matches the voice path (same pilot apply).
- [ ] **AC3 —** Given `Command` from the command line, then `source === "text"` still.
- [ ] **AC4 —** Given `NullSpeechPort.transcribe` throws, when PTT-up runs, then no uncaught exception reaches the tick and no `Command` is dispatched.
- [ ] **AC5 —** Given confidence `0.54` with threshold `0.55`, then parse and pilot are not invoked.
- [ ] **AC6 —** Automated test exists for the happy path (fake port + parse + dispatch). DOM-free preferred.

## Test plan

- Unit: voice-loop with fake `SpeechPort`, fake dispatch, T03-03 parser; confidence gate; throw catch; source flags.
- Integration: optional — boot app, inject fake port, simulate ptt-up if the controller allows injection.
- Manual: defer full mic+STT to T03-12; this ticket can be verified with a fake port in the shell if useful.

## Suggested files

- `src/speech/voice-loop.ts`
- `src/speech/voice-loop.test.ts`
- `src/speech/metrics.ts` (t0 helper only is enough)
- Phase 1 parse entry (touch only to thread `source`)
