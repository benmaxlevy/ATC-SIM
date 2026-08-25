# T04-23 SIDs and departures integration and visual acceptance

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-18, T04-19, T04-20, T04-21, T04-22
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide comprehensive automated end-to-end integration tests and a documented manual visual acceptance test script proving that departures and arrivals operate concurrently on the scope: departures roll off RW27, check in on departure frequency, climb via SID, accept radar vector amendments, initiate handoff to Center via `Shift+H`, and exit airspace cleanly while arrivals sequence onto the STAR, capture ILS 27, and handoff to Tower via `Shift+H` without false alerts or system regressions.

## Context

All previous tickets (T04-18 through T04-22) build out the SID procedure data, FMS climb-via physics, departure lifecycle, randomized generator, smart `Shift+H` handoff (Tower vs Center), and radio telephony. This ticket closes the loop:
- Verifies that mixed traffic scenarios (`arrivals + departures`) run stably at 60 FPS.
- Verifies that `Shift+H` contextually hands off to Tower (when arrival is on final) or to Center (when departure is climbing outbound).
- Verifies that departure datablocks and flight strips render correct altitude, climb cues, and CID/type fields.
- Verifies that radar vectors (`H090`, `C100`) work seamlessly on departures.
- Provides regression safety for all existing Phase 0–4 features (DCB controls, STAR arrivals, ILS approaches, Conflict Alerts, MSAW).

See `phases/04-procedures/README.md`, `phases/02-scope/tickets/T02-21-tcw-visual-acceptance.md`, `tests/integration/`.

## Scope

- Integration test suite (`tests/integration/departures-and-sids.test.ts`):
  - Scenario setup with 4 STAR arrivals and 2 RW27 departures.
  - Stepping world through full simulation lifecycle:
    - Departures spawn off RW27, climb via DEM1 SID, check in via radio.
    - Controller issues vector `H360` and higher climb `C120` to a departure; aircraft turns and climbs to assigned altitude.
    - Controller selects an arrival on final, presses `Shift+H` -> hands off to Tower (sets `LANDING` mode).
    - Controller selects a climbing departure, presses `Shift+H` -> hands off to Center (`handoff.center` logged).
    - Departures cleanly despawn after crossing boundary.
    - Arrivals continue along DEM1 STAR, capture ILS 27, and land without interference.
    - Conflict alert (CA) and MSAW function properly and do not generate false alarms on standard departure climb profiles.
- Scope datablocks & flight strips verification:
  - Departures show correct CID / aircraft type / assigned altitude on datablock line 2 & 3.
  - Outbound flight strips reflect departure runway, filed altitude, and assigned SID.
  - Video map slot 7 toggles the DEM1 SID video map on the PPI display.
- Manual test script for Chrome Windows / desktop browser session:
  - Step-by-step verification instructions (`npm run dev -- ?departures=auto`).
  - Expected visual indicators for rolling departures, climb vectors, `Shift+H` handoffs (Tower vs Center), radio readbacks, and airspace handoffs.
- Full repository test pass: `npm test` and `npm run ci` exit 0.

## Out of scope

- Phase 5 scoring and evaluation.
- Multi-tower or surface ground radar displays.

## Acceptance criteria

- [ ] **AC1 —** Automated integration test verifies a complete mixed session (arrivals + departures): departures spawn, check in on radio, fly SID legs, accept vector commands, hand off via `Shift+H`, and exit airspace at boundary.
- [ ] **AC2 —** Standard departure climb profiles on DEM1 SID do not trigger false MSAW alerts over terrain or false CA against properly spaced arrivals.
- [ ] **AC3 —** `Shift+H` on a selected arrival on final executes Tower handoff; `Shift+H` on a selected climbing departure executes Center handoff.
- [ ] **AC4 —** Issuing radar vectors (`H090`) to a departure immediately transitions lateral mode to `HEADING` while maintaining assigned climb.
- [ ] **AC5 —** Video map 7 correctly renders the DEM1 SID route lines on the PPI scope when toggled via DCB MAPS or keyboard shortcut.
- [ ] **AC6 —** Manual acceptance script documented with reproducible steps.
- [ ] **AC7 —** `npm test` and `npm run ci` pass cleanly with zero diagnostics.

## Test plan

- Integration: `tests/integration/departures-and-sids.test.ts`
- Automated: Full repository suite (`npm test`, `npm run ci`).
- Manual: Browser test with `?departures=auto` observing simultaneous arrivals and departures with `Shift+H` handoffs.

## Suggested files

- `tests/integration/departures-and-sids.test.ts`
- `src/scope/renderScope.test.ts`
- `src/ui/FlightStrips.test.ts`
- `README.md` (Update query parameter documentation for `?departures=`)
