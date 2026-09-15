# T04-68 Cancel approach acceptance and documentation

**Phase:** 04 Procedures (seventy-second swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-67
**Blocks:** None (swarm stop)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Prove typed, spoken, ILS, and generic approach cancellation end to end. Document
the command, state transition, readback, and trainer limits.

## Context

The feature is complete only when a controller can issue the requested command
and observe the aircraft leave approach guidance. Parser tests alone cannot prove
that `GS`, `LOC`, or `INTERCEPT_LOC` no longer control the aircraft.

## Research

- **R01:** FAA JO 7110.65, §4-8-1:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_8.html
- **R03:** FAA AIM, §5-4-5 and §5-4-21:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html
- Manual review must record the official phrase “Cancel Approach Clearance”
  and distinguish it from “going around” / published missed approach.
- Trainer delta: ATC-SIM changes local simulated intent; it does not model IFR
  cancellation, obstacle clearance, or certified approach monitoring.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| ILS `GS` + spoken canonical command | Accepted; aircraft vectors away | GS cleared; heading 270; altitude 5000 | No `nav.missed.started` | R01 §4-8-1 |
| ILS `INTERCEPT_LOC` + `CAPP H270 A50` | Accepted; aircraft no longer captures LOC | Lateral `HEADING`; altitude 5000 | No re-capture without new APP | R01 §4-8-1 |
| Generic RNAV `CLEARED_APPROACH` + same command | Same breakout | No ILS-specific behavior | Generic approach ID preserved only in event history, not intent | R01 generic phraseology |
| `CAPP` alone | Accepted | Present heading, assigned vertical | No missed/landing transition | R01 “additional instructions as necessary” |
| Typed and PTT versions | Same IR/runtime result | Channel only changes `source`/`parseStage` | Path C may not invent cancellation | Shared parse pipeline |
| `CAPP` without active approach | Rejected | Aircraft unchanged | `Unable, not on approach` | Existing reject contract |

## Scope

- Add one DOM-free integration/acceptance test covering ILS GS breakout,
  pre-capture breakout, generic approach breakout, cancellation alone, and
  atomic rejection.
- Reuse synthetic minimal approach fixtures. Do not assert production map counts,
  KDEM geometry, or facility-specific ordering for generic behavior.
- Update `phases/04-procedures/README.md` with typed and spoken syntax, exact
  readback, ordering, state effects, and trainer delta.
- Update `_shared/command-ir.md` and `_shared/parse-pipeline.md` only if T04-66
  leaves required contract details incomplete.
- Inspect command-line/help surfaces. If no command reference lists radio tokens,
  record “no help surface exists” rather than adding unrelated UI.
- Add manual evidence checklist to test comments or ticket handoff.

## Out of scope

- New UI command mode or Preview Area syntax.
- New approach catalog data.
- Published missed approach, tower landing, or IFR flight-plan cancellation.
- New speech provider or cloud fallback.

## Acceptance criteria

- [ ] One acceptance test proves GS breakout and no missed event.
- [ ] One acceptance test proves pre-capture and generic non-ILS breakout.
- [ ] Cancellation alone uses present heading and assigned vertical mode.
- [ ] Typed/spoken command paths produce equivalent runtime state.
- [ ] Rejected cancellation leaves complete intent unchanged.
- [ ] README and shared docs state exact forms, ordering, errors, readback, and trainer delta.
- [ ] No undocumented help surface or scope command change remains.
- [ ] `npm run ci` passes.
- [ ] `cd speech-api && SPEECH_API_MOCK=1 pytest` passes.

## Test plan

- Integration: `src/core/fms/test/approach.test.ts` or one new focused acceptance
  file, using synthetic approach fixtures.
- Command path: `src/ui/command/test/command-line.test.ts` or pilot integration
  seam for accepted/rejected readbacks.
- Manual: issue `cancel approach clearance, fly heading 270, maintain 5000`
  while aircraft is on GS; verify heading, altitude, no GS continuation, no
  missed event, and no landing/despawn.
- Manual review: record R01 §4-8-1 and R03 §5-4 citations in handoff.

## Suggested files

- `src/core/fms/test/approach.test.ts`
- `src/ui/command/test/command-line.test.ts`
- `phases/04-procedures/README.md`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`

