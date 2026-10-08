# T04-90 Visual approach validation and guidance fail-closed

**Phase:** 04 Procedures (satellite traffic remediation)
**Priority:** P0
**Size:** M
**Depends on:** T04-81, T04-82, T04-87
**Blocks:** T04-91
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Ensure visual clearances use only a known runway at the aircraft’s resolved
arrival airport. Unknown or unavailable geometry must reject before intent
mutation; no fallback runway may point at scenario origin.

## Context

The audit found that validation can accept a visual runway when destination data
is absent and application can synthesize threshold `(0,0)` geometry. T04-81/T04-82
already define arrival-airport-first resolution and the `CLEARED_VISUAL` contract;
this ticket makes validation and application enforce that same resolver.

## Research

- **R01:** FAA JO 7110.65 §7-4 visual approach:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_4.html
- **R03:** AIM visual approach guidance:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html
- Trainer delta: straight-in visual guidance and touchdown are simplified trainer
  behavior; visual approaches have no instrument missed-approach segment.

## Scope

- Make `validate.ts` require an exact runway at the resolved arrival airport.
- Make `applyIntent.ts` consume the same resolved `RegionalRunwayGeometry` or
  center-catalog geometry and fail if it is unavailable.
- Remove origin/number-derived runway fallback.
- Preserve valid center/satellite visuals, ILS behavior, `GO_AROUND`,
  `CANCEL_APPROACH`, touchdown, and MSAW inhibition.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Valid runway at resolved destination | `CLEARED_VISUAL` accepted | Exact threshold/heading geometry applied | None | JO 7110.65 §7-4-3 |
| Unknown runway | Rejected | World and intent unchanged | Existing `RUNWAY`/`UNKNOWN_APPROACH` error | T04-82 |
| Destination has no runway data | Rejected | No `VISUAL_FINAL` intent | Must not fall through to `{ ok: true }` | Audit regression |
| Runway belongs to another airport | Rejected | No cross-airport geometry | Arrival resolver identity mismatch | T04-81 |
| Apply-time geometry missing | Rejected/fails closed | No synthetic coordinates | Never use `(0,0)` fallback | Audit regression |
| Cancel or go around from visual final | Existing lifecycle transition | Visual mode exits atomically | Invalid lifecycle remains rejected | T04-82 |

## Acceptance criteria

- [ ] Validation rejects unknown, missing, and cross-airport runways.
- [ ] Application has no synthetic `(0,0)` runway fallback.
- [ ] Validation and application use one arrival-airport runway resolver.
- [ ] Tests cover valid center/satellite visuals, absent runway data, unknown
  runway, cross-airport runway, and apply-time missing geometry.
- [ ] Existing ILS and VFR auto-land behavior remains green.
- [ ] `npm run ci` and speech mock pytest pass if speech files change.

## Test plan

- Unit: `validate` and `applyIntent` fail-closed matrix with synthetic airports.
- Integration: satellite visual clearance through touchdown and invalid-runway
  rejection; preserve ILS regression coverage.
- Manual: observe one valid satellite visual and one rejected invalid runway;
  record trainer-only visual approach behavior.

## Suggested files

- `src/pilot/validate.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/test/validate.test.ts`
- `src/pilot/test/applyIntent.test.ts`
- `src/core/nav/approachContext.ts`
- `tests/integration/satellite-traffic-acceptance.test.ts`

## Out of scope

- New visual phraseology, RNAV/VOR/NDB execution, circling approaches, or tower
  cab behavior.
