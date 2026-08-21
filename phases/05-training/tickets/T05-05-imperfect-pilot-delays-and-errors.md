# T05-05 Imperfect pilot delays and errors

**Phase:** 05 Training
**Priority:** P0
**Size:** L
**Depends on:** none (phase 1 pilot + phase 3 playback if voice)
**Blocks:** T05-06, T05-11
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Trainer can opt into **imperfect pilots** (off by default): success readbacks delay 2–8 s of sim time, and an occasional **wrong altitude digit** that the aircraft actually flies. Seeded RNG so replay can match.

## Context

Phase 1 pilot applies intent immediately and shows a template readback. Phase 3 plays TTS with **no barge-in**. This ticket inserts a delay **after** a successful validate/apply (for *correct* readbacks) and **before** the readback string hits the UI / `SpeechPort.synthesize`.

README frozen decisions: default OFF; delay is sim time; wrong altitude mutates **intent + readback**; log `pilot.readback.incorrect`; IDENT/SAY and rejects are not delayed.

`phases/_shared/speech-port.md`: do not bury delay inside `transcribe`. Coordinator waits on a sim-time gate.

`phases/_shared/non-goals.md`: this is not an LLM personality. Tables + RNG only.

## Scope

- `ImperfectPilotSettings` on session/world (defaults: `enabled: false`).
- Seeded PRNG (`mulberry32` or equivalent) stored on the session; **no** `Math.random()`.
- Delay queue: on `command.accepted` with a success readback, if enabled, sample delay in `[2000, 8000]` ms sim, quantize to 50 ms, emit `pilot.readback.queued`, apply **correct** intent immediately, hold the readback string until `simTimeMs` reaches due time, then emit `pilot.readback.started` and deliver text/TTS, then `pilot.readback.completed` when playback ends (text-only: completed same tick or next).
- Wrong altitude: if enabled, command has exactly one `ALTITUDE`, roll `< wrongAltitudeProbability` (default **0.08**), mutate one digit per README, readback uses spoken altitude, **assigned altitude = spoken**, log incorrect event with `issuedFt`, `spokenFt`, `flownFt` (flown = spoken at apply time).
- When `enabled === false`: bit-identical to phase 4 timing (immediate readback); tests compare.
- Wire a **minimal** toggle in UI or a query/debug flag if settings panel is T05-11 — a `window`/`settings` stub `imperfectPilots: boolean` is enough so T05-11 can replace it. Prefer a checkbox in existing settings if phase 3 already has a settings page.
- Vitest: delay fires at sampled sim time using `stepWorld` / clock; altitude mutation in range; seed reproducibility; default off.

## Out of scope

- Unable speed (T05-06).
- Replay file format (T05-07) — events must still be logged so replay can consume them later.
- LLM mis-hear models, random heading errors, stuck mic.
- Delaying `command.rejected` error readbacks.
- Changing CA.

## Implementation notes

### RNG

```ts
export function mulberry32(seed: number): () => number {
  // uint32 state; return [0, 1)
}
```

Document draw order when both delay and altitude apply: **(1)** delay sample **(2)** altitude Bernoulli **(3)** digit place / direction. Tests freeze `seed = 1` and snapshot the first three draws.

Session seed: generate once at `session.started` (from a passed-in `seed` in tests; in UI `crypto.getRandomValues` or `Date.now() % 2^32` is OK for live, but **store it** on World/settings).

### Delay queue vs pause

Queue is sim-time based. If the sim is paused, due times do not advance (phase 1 pause already stops `stepWorld`). On 2x, delay is still 2–8 s **sim**, so wall time halves — correct.

### Voice coordinator

If T03-06 plays TTS immediately today, change the coordinator: `scheduleReadback({ text, commandId, dueSimMs })`. PTT lock: start lock at `started` (audio), not at queue time — so the controller *can* talk during the silent delay (and T05-01 may deduct `radio_stepped_on`). That is intentional hearback training.

### Altitude mutation

Prefer thousands-digit ±1 if result stays in `[1000, 18000]` and ≠ issued; else try hundreds digit. Always multiple of 100. Never no-op.

Example: issued 3000 → 2000 or 4000.

Readback templates (T01-08) already speak altitudes; pass **spoken** feet into the formatter.

### Events (extend `SessionEvent`)

```ts
| { type: "pilot.readback.queued"; atSimMs: number; atWallMs: number; commandId: string; delaySimMs: number }
| { type: "pilot.readback.started"; atSimMs: number; atWallMs: number; commandId: string; callsign: string }
| { type: "pilot.readback.completed"; atSimMs: number; atWallMs: number; commandId: string }
| { type: "pilot.readback.incorrect"; atSimMs: number; atWallMs: number; commandId: string; callsign: string;
    field: "altitude"; issuedFt: number; spokenFt: number; flownFt: number }
```

## Acceptance criteria

- [ ] **AC1 —** Default settings: `enabled === false`; `handleRadioText` / voice path still shows readback on the same sim tick as accept (Vitest).
- [ ] **AC2 —** `enabled: true`, fixed seed: delay is an integer in `[2000, 8000]` and a multiple of 50 (Vitest, many samples or the first sample).
- [ ] **AC3 —** After accept, assigned heading/altitude (correct path) is applied **before** the delayed readback is delivered (Vitest).
- [ ] **AC4 —** Readback string is not visible / TTS not invoked until `simTimeMs >= queuedDue` (Vitest; mock synthesize).
- [ ] **AC5 —** Forced altitude error (probability 1 in test settings): `spokenFt !== issuedFt`, intent altitude equals `spokenFt`, event `pilot.readback.incorrect` present (Vitest).
- [ ] **AC6 —** Same seed + same commands → same delays and same spoken altitudes (Vitest).
- [ ] **AC7 —** `command.rejected` still immediate; no queued event (Vitest).
- [ ] **AC8 —** `Math.random` is not used in `src/pilot/imperfect/` (grep AC).

## Test plan

- Unit: `delay-queue.test.ts`, `altitude-error.test.ts`, `rng.test.ts`.
- Integration: accept `DAL123 D30` with error forced → aircraft assigned 2000 or 4000 not 3000.
- Manual: enable flag, issue altitude, confirm 2–8 s wait then readback (if settings stub is clickable).

## Suggested files

- `src/pilot/imperfect/rng.ts`
- `src/pilot/imperfect/delay-queue.ts`
- `src/pilot/imperfect/altitude-error.ts`
- `src/pilot/imperfect/settings.ts`
- `src/core/events/types.ts`
- `src/speech/voice-loop.ts` (schedule gate)
- `src/ui/settings-speech.ts` or stub checkbox
