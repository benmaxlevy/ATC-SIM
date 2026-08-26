# T04-20 Departure spawning and handoff lifecycle

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-18, T04-19, T04-16
**Blocks:** T04-21, T04-23
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Departure aircraft spawn realistically climbing off active runways, initialize with armed SID procedure routing / climb-via intent, follow the TRACON departure handoff lifecycle, and support smart handoff initiation with **`Shift+H`** (automatically detecting whether the handoff targets **Tower** for arrivals on final or **Enroute Center** for climbing outbound departures).

## Context

Arrivals spawn at outermost STAR entry fixes pending inbound handoff from sector `C` (T04-14, T04-16). Departures have a complementary lifecycle:
1. **Departure Rollout / Airborne Spawn:** Aircraft appears climbing out from the active departure runway (e.g. RW27 departure end, altitude 500–1000 ft MSL, climbing at ~2000 fpm, speed 160–200 kt, heading runway heading 270°).
2. **Initial Intent:** Lateral mode `PROCEDURE` with SID route armed (e.g. `DEM1` via runway 27 transition), vertical mode `VIA_SID` climbing to initial assigned altitude (e.g. 5,000 ft or filed cruise altitude 10,000–14,000 ft).
3. **Local Control (Tower) Handoff:** In CRC STARS TRACON operations, rolling departures are automatically acquired or transferred from Tower (`TWR` / `LC`) to Departure Control. On radar acquisition, datablock is owned (`white` FDB) or offered pending initial contact.
4. **Smart `Shift+H` Handoff Action:**
   - Pressing **`Shift+H`** on a selected track evaluates context:
     - **To Tower (`TWR`):** If the aircraft is an inbound arrival established on LOC/GS within the approach gate (T04-12 `isTowerHandoffEligible`), initiates/completes Tower handoff (sets `LANDING` mode, changes datablock ownership color to tower).
     - **To Center (`CTR` / `Z`):** If the aircraft is a climbing departure or outbound flight approaching the TRACON boundary / climbing through exit altitude (e.g. `isCenterHandoffEligible`), initiates outbound handoff to Enroute Center (logs `handoff.outbound.initiated` / `handoff.center`, paints outbound handoff cue/color).
5. **Airspace Exit / Enroute Despawn:** When a departure exits TRACON airspace (e.g. `distanceNm > 28 NM` from airport ARP and at or above boundary altitude, or past exit fix `NORMA`/`OCTTA`), the aircraft completes its outbound flight, transfers communications, and despawns cleanly (`nav.departed`).

See `src/core/ownership.ts`, `src/core/fms/landing.ts`, `src/scope/keymap.ts`, `src/scope/scopeKeys.ts`, `src/scenario/spawn.ts`, `src/core/events/session-log.ts`.

## Research

- **R01** JO 7110.65 — Chapter 3 Section 9 (Departure Procedures and Separation), Chapter 5 Section 8 (Radar Departures), Chapter 5 Section 4 (Transfer of Radar Identification).
- **R07** CRC STARS / vSTARS — Handoff initiation to adjacent ARTCC / Enroute Center sectors vs Local Control / Tower.

**Official term:** Radar Departure, Tower Handoff, Center Handoff, Rolling Boundary, Airspace Exit Gate, Outbound Handoff.

**Trainer delta:** Single shortcut `Shift+H` acts as a unified "Initiate Handoff" action that auto-detects Tower vs Center based on flight phase (established arrival vs climbing departure).

## Scope

- Spawning geometry helper `departureSpawnPose(catalog, runwayId, sidId, transitionId, assignedAltFt)`:
  - Position: runway threshold + departure roll offset along runway centerline (~0.8 NM past threshold).
  - Initial state: altitude 700 ft MSL (climbing), speed 180 kt, heading = runway heading.
  - Armed intent: `lateral: { type: "PROCEDURE", sidId, ... }`, `vertical: { type: "VIA_SID", ... }`, `assignedAltitudeFt`.
- Extend ownership / handoff model in `src/core/ownership.ts` and `src/core/handoff.ts`:
  - `offerDepartureHandoff(world, ac)`: sets initial departure state from `TWR`.
  - `isCenterHandoffEligible(ac, world)`: true when aircraft is a departure/outbound climbing toward boundary (e.g. altitude >= 5,000 ft or distance from ARP >= 12 NM or climbing on SID, not on approach).
  - `initiateCenterHandoff(ac, ctx)`: logs `handoff.center` / `handoff.outbound.initiated`, marks track as handed off to Center (`toSectorId: "C"` / `"Z"`).
- Unify scope handoff shortcut in `src/scope/ownership.ts`, `src/scope/keymap.ts`, and `src/scope/scopeKeys.ts`:
  - `applyHandoffToSelection(tracks, world)` replaces `applyTowerHandoffToSelection`:
    - Checks `isTowerHandoffEligible(ac, world)` -> performs tower handoff (`acceptTowerHandoff`).
    - Checks `isCenterHandoffEligible(ac, world)` -> performs center handoff (`initiateCenterHandoff`).
    - Returns `{ applied: boolean, target: "tower" | "center" | null, hint: string | null }`.
  - Update `KEY_BINDINGS` help overlay text for `Shift+H`: `"Initiate handoff: Tower (if on approach) or Center (if climbing outbound)"`.
- Airspace boundary & departure completion detector in `src/core/world.ts`:
  - When departure aircraft exceeds TRACON range (`distanceNm(ac, ARP) >= 28` NM) or crosses exit gate at or above boundary altitude, trigger `nav.departed` event and cleanly remove from active world aircraft.
- Log session events: `handoff.departure.spawned`, `handoff.center`, `handoff.outbound.completed`, `nav.departed`.
- Unit tests for departure spawn pose calculation, `Shift+H` auto-detection of Tower vs Center handoff, and clean despawn at airspace boundary.

## Out of scope

- Stream randomization / configurable rate generator (T04-21).
- Spoken departure check-in phraseology (T04-22).
- Ground taxi / runway lineup simulation (no ground radar scope).

## Acceptance criteria

- [ ] **AC1 —** `departureSpawnPose(catalog, "27", "DEM1", "NORMA", 10000)` produces an aircraft pose along RW27 centerline, heading 270°, altitude 700 ft, speed 180 kt, with SID route correctly initialized.
- [ ] **AC2 —** Given a selected arrival on LOC/GS inside 5 NM, pressing **`Shift+H`** initiates a handoff to **Tower** (sets `LANDING` mode and paints tower color).
- [ ] **AC3 —** Given a selected climbing departure (altitude >= 5000 ft or enroute outbound), pressing **`Shift+H`** initiates a handoff to **Center** (`handoff.center` logged, outbound handoff state set).
- [ ] **AC4 —** When departure flies past the TRACON boundary (>28 NM), it is gracefully despawned and `nav.departed` session event is logged.
- [ ] **AC5 —** F1 Keymap help overlay documents `Shift+H` as the unified handoff shortcut for Tower/Center.
- [ ] **AC6 —** Automated tests for AC1–AC5 pass. `npm test` exit 0.

## Test plan

- Unit: `departureSpawnPose` geometry; `isCenterHandoffEligible` vs `isTowerHandoffEligible`; `applyHandoffToSelection` dispatching to Tower or Center; boundary exit detection.
- Integration: Stepping world with a departure and arrival, verifying `Shift+H` on each executes the correct handoff.
- Manual: Browser session with `Shift+H` on arrival on final (Tower) vs climbing departure (Center).

## Suggested files

- `src/scenario/departureSpawn.ts`
- `src/scenario/departureSpawn.test.ts`
- `src/core/ownership.ts`
- `src/core/ownership.test.ts`
- `src/core/handoff.ts`
- `src/core/handoff.test.ts`
- `src/scope/ownership.ts`
- `src/scope/ownership.test.ts`
- `src/scope/keymap.ts`
- `src/scope/scopeKeys.ts`
- `src/core/world.ts`
- `src/core/events/session-log.ts`
