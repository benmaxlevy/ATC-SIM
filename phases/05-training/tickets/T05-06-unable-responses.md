# T05-06 Unable responses

**Phase:** 05 Training
**Priority:** P0
**Size:** M
**Depends on:** T05-05
**Blocks:** T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

When imperfect pilots are enabled, a grammatically valid **impossible speed** produces an `Unable` readback, **no** speed intent change, and a `pilot.unable` event. Phase 1 envelope rejects (`[150, 280]`) stay `command.rejected`.

## Context

`phases/_shared/command-ir.md` validation: speed outside `[150, 280]` already rejects. This ticket adds **pilot refusal** for speeds that are legal in the envelope but impossible given approach mode or already at min/max.

README § Unable is normative. `phases/_shared/glossary.md`: the **Pilot agent** is the only module that changes intent from a `Command` — unable is a validation branch inside the pilot, not a scope key.

Scoring: `speed_incompatible` (−3 phraseology) when reason is `speed_approach` (README). Implement the deduction in `scoreSession` in this ticket if T05-01 did not yet hook `pilot.unable`.

## Scope

- When `imperfect.enabled && unableImpossibleSpeed` (default true whenever imperfect is on):
  - LOC / GS / LANDING and `speedKt > 180` → unable `speed_approach`.
  - `INCREASE` at max envelope → `speed_already_max`.
  - `REDUCE` at min envelope → `speed_already_min`.
- Readback: `{callsign} unable speed {requested}` with FAA digit grouping from T01-08 helpers.
- Do **not** apply speed intent. Other instructions in the same `Command` (heading, altitude): **reject the whole command** (no partial apply) — simpler and testable. Document that v1 is all-or-nothing.
- Event `pilot.unable` with `commandId`, `callsign`, `reason`, requested speed.
- Log: this is **not** `command.accepted`. Prefer: no `command.accepted`; emit `command.rejected` with `reason: "unable_speed"` **in addition** OR only `pilot.unable`. **Normative pick:** `command.rejected` `{ reason: "unable_speed" }` **and** `pilot.unable` so existing reject UX works. Phraseology checker is not run on rejected commands; `scoreSession` deducts `speed_incompatible` from `pilot.unable` reason `speed_approach` only.
- When imperfect is off: 200 kt on GS is allowed (phase 4).
- Vitest for each reason; aircraft `intent.assignedSpeedKt` unchanged.

## Out of scope

- Unable on altitude (“can’t climb that fast”), weather, icing.
- Partial application of multi-instruction commands (whole command fails).
- Changing envelope `[150, 280]`.
- LLM.

## Implementation notes

Place checks in the pilot validator **after** parse and envelope checks, **before** apply.

Approach modes: use phase 4 `intent.lateral.type` (or equivalent). If the field names differ, match T04-05/06.

```ts
| {
    type: "pilot.unable";
    atSimMs: number;
    atWallMs: number;
    commandId: string;
    callsign: string;
    reason: "speed_approach" | "speed_already_max" | "speed_already_min";
    requestedSpeedKt: number;
  }
```

Readback must not say “unable, say again” (that is parse fail). Distinct string contains `unable` and `speed`.

Score hook:

```
if event.pilot.unable && event.reason === "speed_approach" → deduction phraseology -3 code speed_incompatible
```

`speed_already_max/min` are not controller errors (they asked to increase at 280) — **no** score deduct.

## Acceptance criteria

- [ ] **AC1 —** Imperfect off, aircraft on GS, `S210` accepted and assigned speed 210 (Vitest; skip if GS fixture is heavy — then use a fixture that sets lateral `GS` without flying the ILS).
- [ ] **AC2 —** Imperfect on, lateral `GS` or `LOC`, `S210` → unable, assigned speed unchanged, `pilot.unable` reason `speed_approach` (Vitest).
- [ ] **AC3 —** Imperfect on, speed 280, `SPEED INCREASE 280` or equivalent → `speed_already_max` (Vitest).
- [ ] **AC4 —** Envelope `S140` still `command.rejected` (not `pilot.unable`) as in phase 1 (Vitest).
- [ ] **AC5 —** Combined `H270 S210` on GS with imperfect on: **no** heading change (all-or-nothing) (Vitest).
- [ ] **AC6 —** Readback matches `/unable/i` and includes the requested speed in words or digits (Vitest).
- [ ] **AC7 —** `scoreSession` deducts 3 phraseology raw for `speed_approach` (Vitest).

## Test plan

- Unit: `src/pilot/imperfect/unable-speed.test.ts` plus a score-session case.
- Integration: none required.
- Manual: enable imperfect, put someone on ILS (phase 4 script), assign 210 kt, hear/see unable.

## Suggested files

- `src/pilot/imperfect/unable-speed.ts`
- `src/pilot/imperfect/unable-speed.test.ts`
- `src/pilot/apply-command.ts` (or T01-07 module)
- `src/pilot/readback.ts` (unable template)
- `src/train/score/score-session.ts`
- `src/core/events/types.ts`
