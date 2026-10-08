# T04-88 VFR destination eligibility and shared-airspace selection

**Phase:** 04 Procedures (satellite traffic remediation)
**Priority:** P0
**Size:** M
**Depends on:** T04-87, T04-71, T04-76
**Blocks:** T04-91
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make every VFR destination selector consume one complete, generic airport
eligibility contract. Valid satellite airports remain selectable even when the
controlled airspace volume is shared or not centered on that airport.

## Context

The current selector checks public use and runway presence but ignores the
runtime `eligible`, `towered`, and `catalogRef` contract and assumes each valid
airport owns a matching controlled-volume center. This can admit excluded
airports and exclude valid generated destinations.

## Research

- **R01:** FAA JO 7110.65 VFR radar-service context:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_6.html
- Trainer delta: destination eligibility is source-backed deterministic trainer
  behavior; the simulator does not model tower coordination or certification.

## Scope

- Add one reusable eligibility predicate/helper based on airport data and
  emitted catalog/runway contracts.
- Use it for ambient VFR destinations, airport-bound traffic, and any later
  destination list exposed by the scenario layer.
- Remove the `centerAirportId === airport.id` ownership assumption from generic
  destination eligibility; retain geometry-based Bravo/airspace protection.
- Add explicit exclusion reasons for diagnostics/tests.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Eligible public/towered airport with runway and catalog | Selectable VFR destination | Navigation uses that airport identity/geometry | None | T04-70/T04-71 destination rule |
| `eligible: false` | Never selected | No destination assignment | No fallback to incomplete metadata | T04-71 |
| Missing tower/public metadata | Excluded | Structured reason retained for diagnostics | Unknown is not treated as `false` or `true` | T04-69 |
| Missing catalog reference or runway | Excluded | No airport-bound navigation | No center-airport substitution | T04-70 |
| Valid airport under shared controlled volume | Selectable if contract passes | Airspace guard uses polygon geometry | Must not require matching center ID | T04-71/T04-76 |
| No eligible destinations | Configured local fallback | No invalid airport state | No crash or silent invalid ID | T04-76 |

## Acceptance criteria

- [ ] One generic eligibility helper is used by all VFR destination selectors.
- [ ] Eligibility requires explicit source-backed public/towered metadata, valid
  runway geometry, catalog reference, and `eligible` status.
- [ ] Shared-airspace airports are not excluded solely by `centerAirportId`.
- [ ] Synthetic parameterized tests cover eligible, excluded, incomplete, and
  shared-airspace cases.
- [ ] Atlanta acceptance verifies destination identity and runway geometry while
  generic tests remain facility-independent.
- [ ] `npm run ci` passes.

## Test plan

- Unit: minimal airport eligibility fixtures and exclusion reasons.
- Integration: VFR population, destination navigation, and no-destination fallback.
- Manual: observe one satellite destination in a KATL session and record the
  scenario/seed; no claim about real-world service is made.

## Suggested files

- `src/scenario/vfrTraffic.ts`
- `src/scenario/regional.ts`
- `src/scenario/test/vfrTraffic.test.ts`
- `tests/integration/vfr-population.test.ts`
- `tests/integration/satellite-traffic-acceptance.test.ts`

## Out of scope

- Class B clearance approval, tower cab behavior, new destination types, or
  facility-specific eligibility branches.
