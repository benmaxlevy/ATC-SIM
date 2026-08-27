# T05-14 Session setup airport and configuration selectors

**Phase:** 05 Training
**Priority:** P0
**Size:** M
**Depends on:** T04-28, T05-13
**Blocks:** T04-30
**Launch:** Implement this ticket only.

## Goal

Enhance the Session Setup modal with two separate, accessible selectors: an **Airport selector** (e.g. `KDEM — Demo Field`) and an **Airport Configuration selector** (e.g. `West Flow (RWY 27)`, `East Flow (RWY 09)`), derived dynamically from validated playable scenario inventory.

## Context

T05-13 introduced the Session setup modal with a single scenario selector. As multiple runway configurations and operational flows are introduced, controllers expect to choose the airport first, followed by the active operational configuration (runway flow/approaches).

`.cursor/rules/extensible-features.mdc` requires data-driven extensibility: neither the airport list nor the configuration list may be hardcoded. They are derived from `listPlayableScenarios()` inventory metadata.

## Scope

- In `src/scenario/sessionSetup.ts` & `src/scenario/playableScenarios.ts`:
  - Enhance `PlayableScenario` metadata with `airportName` (or `airportLabel`), `configLabel` (e.g. `"West Flow (RWY 27)"`, `"East Flow (RWY 09)"`), and `activeRunwayId`.
  - Add helper functions:
    - `listPlayableAirports()`: returns unique list of `{ airportIcao, airportLabel, defaultScenarioId }`.
    - `listConfigurationsForAirport(airportIcao)`: returns scenario configurations available for the specified airport.
- In `src/ui/session-setup.tsx`:
  - Replace the single scenario `<select>` with two separate, accessible dropdowns:
    1. **Airport**: `<select>` populated from `listPlayableAirports()`.
    2. **Configuration**: `<select>` populated from `listConfigurationsForAirport(selectedAirportIcao)`.
  - Selecting an airport updates the available configurations and defaults to the airport's default configuration.
  - Selecting a configuration updates the draft `scenarioId`.
  - If a scenario does not support departures, the departure rate control is disabled with an explanatory note.
- URL Query Precedence & Persistence:
  - Preserves compatibility with `?scenario=<id>` (e.g. `?scenario=kdem-09`).
  - Draft state persists across page reloads in `atc-sim.session.v1`.
  - Apply confirmation warning restarts the session cleanly into the newly selected airport and configuration.

## Out of scope

- Changing airport/configuration live mid-simulation without restarting.
- NAS/STARS DCB PREF changes.

## Acceptance criteria

- [ ] **AC1 —** Session setup renders two separate dropdowns: "Airport" and "Configuration".
- [ ] **AC2 —** Airport and configuration options derive dynamically from inventory metadata without hardcoded options in UI code.
- [ ] **AC3 —** Selecting a different airport updates the configuration dropdown to list that airport's configurations.
- [ ] **AC4 —** Selecting "East Flow (RWY 09)" sets the draft scenario to `kdem-09` and applying restarts World with East Flow parameters.
- [ ] **AC5 —** Draft settings persist across reloads in `atc-sim.session.v1`.
- [ ] **AC6 —** Keyboard navigation, accessibility labels, and focus management work cleanly.
- [ ] **AC7 —** Automated tests cover AC1–AC6.

## Suggested files

- `src/scenario/playableScenarios.ts`
- `src/scenario/playableScenarios.test.ts`
- `src/scenario/sessionSetup.ts`
- `src/scenario/sessionSetup.test.ts`
- `src/ui/session-setup.tsx`
- `src/ui/session-setup.test.tsx`
