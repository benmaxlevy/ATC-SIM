# T04-67 Cancel approach validation and intent breakout

**Phase:** 04 Procedures (seventy-second swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-66
**Blocks:** T04-68
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Apply an accepted `CANCEL_APPROACH` atomically, break the aircraft out of any
active instrument approach, and validate later instructions against the
post-cancellation state.

## Context

`handleRadioCommand` validates the full instruction list before `applyIntent`.
Current altitude validation rejects any altitude instruction while
`clearedApproachId` is set. A command such as `CAPP H270 A50` therefore needs
projected, left-to-right validation without partial aircraft mutation.

Current heading behavior intentionally preserves an approach before localizer
capture. Cancellation must clear the approach first; then the later heading
becomes ordinary vectors.

## Research

- **R01:** FAA JO 7110.65, §4-8-1:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_8.html
- **R03:** FAA AIM, §5-4-5 and §5-4-21:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html
- Official term: **cancel approach clearance**.
- Trainer delta: no obstacle-clearance, IFR-flight-plan, or NAS separation claim;
  this trainer changes existing intent modes only.

## State contract

Valid cancellation requires `clearedApproachId` and lateral mode not `MISSED`
or `LANDING`. `INTERCEPT_LOCALIZER` without an approach clearance is not enough.

On cancellation:

- clear `clearedApproachId`;
- clear `locInterceptApproachId`;
- clear `expectedApproachId`;
- convert `GS` to `ASSIGNED`;
- convert `INTERCEPT_LOC` or `LOC` to `HEADING` on present heading;
- preserve existing route, speed, and non-approach intent fields unless later
  instructions change them;
- do not emit `nav.missed.started`, land, despawn, or mutate flight-plan data.

Later instructions apply in order. A later heading instruction must use normal
heading breakout behavior. A later altitude instruction must validate against
the projected post-cancellation state.

Forbidden same-command lifecycle instructions:

- second `CANCEL_APPROACH`;
- `CLEARED_APPROACH`;
- `INTERCEPT_LOCALIZER`;
- `EXPECT_APPROACH`;
- `GO_AROUND`;
- `IFR_CLEARANCE`.

`NOT_ON_APPROACH` remains the exact rejection reason and readback:
`Unable, not on approach`.

## Command contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Active `GS` + `CAPP` | Accepted | Approach IDs clear; vertical `ASSIGNED`; lateral present-heading `HEADING` | No missed event | R01 §4-8-1; R03 §5-4 |
| Active `INTERCEPT_LOC` + `CAPP H270 A50` | Accepted | Heading 270, altitude 5000, lateral `HEADING` | Altitude must not hit approach rejection | R01 additional instructions |
| Active generic RNAV approach + canonical command | Accepted | Same behavior as ILS | No ILS-specific branch | R01 generic phraseology |
| No `clearedApproachId` + `CAPP` | Rejected | No mutation | `NOT_ON_APPROACH`; `Unable, not on approach` | Existing pilot reject contract |
| `CAPP` while `MISSED` or `LANDING` | Rejected | No mutation | `NOT_ON_APPROACH` | T04-07/T04-12 lifecycle |
| `CAPP H270 CLEARED_APPROACH...` | Rejected | No mutation | `BAD_CLEARANCE` | Approach lifecycle conflict |
| `CAPP C30` then invalid later instruction | Whole command rejected | No cancellation or partial altitude change | Existing exact instruction error | Atomic command rule |

## Scope

- Extend `validateInstructions` with a non-mutating projected command state or
  equivalent ordered validation context.
- Require cancellation first, once, against an active approach.
- Validate later altitude/speed/direct instructions as if cancellation already
  applied, while preserving existing bounds and rejection strings.
- Add `CANCEL_APPROACH` handling in `applyIntent.ts`.
- Keep `setHeadingMode` behavior unchanged for commands without cancellation.
- Add readback/rejection coverage.
- Add synthetic generic approach fixtures; do not add KDEM branches.

## Out of scope

- New lateral or vertical FMS modes.
- Published missed approach execution.
- Tower landing state changes.
- Speed reset policy beyond preserving current non-approach assignments.
- MVA, CA, ATPA, or separation changes.

## Acceptance criteria

- [ ] Cancellation applies only with active approach clearance.
- [ ] Cancellation clears approach guidance and GS without starting missed.
- [ ] No-heading cancellation continues present heading.
- [ ] `CAPP H270 A50` accepts and applies all three ordered effects.
- [ ] Any invalid later instruction rejects atomically.
- [ ] Generic non-ILS approach state behaves identically.
- [ ] Existing heading-before-capture preservation and LOC breakout tests remain green.
- [ ] Exact `NOT_ON_APPROACH` and existing instruction errors remain unchanged.

## Test plan

- Unit: projection/order validation, state clearing, present-heading fallback,
  GS/LOC/INTERCEPT_LOC, generic approach, MISSED/LANDING rejection.
- Integration: `handleRadioText` canonical command and reject readback.
- Repo gate: `npm run ci`.
- Manual: active approach, issue canonical combined command, confirm vector
  flight and altitude change; confirm no missed event.

## Suggested files

- `src/pilot/validate.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/readback.ts`
- `src/pilot/test/validate.test.ts`
- `src/pilot/test/applyIntent.test.ts`
- `src/pilot/test/readback.test.ts`
- `src/ui/command/test/command-line.test.ts`

