# T04-53 Profile-driven kinematics and FMS turns

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-52
**Blocks:** T04-54
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Every `stepWorld` aircraft moves toward intent using its resolved profile and
regime; the same dynamic turn constraint drives physical heading changes and
FMS fly-by/localizer lead calculations.

## Context

`stepAircraft` currently applies global rate-one turn, 1800 fpm, and 1 kt/s.
`turnRadiusNm`, fly-by prediction, and localizer lead capture read the same
global turn rate. Divergence would make an FMS predict a turn different from
the aircraft actually flies.

## Scope

- Resolve profile/regime inside the generic world tick and pass `KinematicLimits`
  to `stepAircraft` without storing duplicate mutable profiles on aircraft.
- Convert `maxBankDeg` and current simulated speed into a bounded rate of turn;
  preserve LEFT/RIGHT/SHORTEST direction, magnetic command surface, true ENU
  displacement, deterministic tick behavior, and exact target capture.
- Apply resolved climb/descent and acceleration/deceleration limits toward
  assigned/FMS targets. Do not force speed to profile bands; validation and
  commanded-target policy remain explicit.
- Thread the same resolved turn rate through generic turn-radius, fly-by, and
  localizer lead/cross-track calculations.
- Thread vertical caps through GS intercept/following without changing
  LOC-first/from-below semantics or geometric GS truth.
- Retire direct production use of global constants only after all relevant
  kinematics/FMS consumers use resolved values. Keep compatibility exports only
  where needed for DEFAULT_PROFILE or external API migration.

## Out of scope

- Profile-aware CA/ATPA/MSAW predictions; retain documented conservative alert
  behavior for a later ticket.
- New phase state, engine/mass/fuel/flap simulation, weather/crab, parser,
  pilot validation bounds, scenario branches, or UI.

## Acceptance criteria

- [ ] **AC1 — Profile motion:** Two synthetic profiles with different bank,
  vertical, acceleration, and deceleration limits produce different deterministic
  heading/altitude/speed trajectories under identical intent.
- [ ] **AC2 — Default compatibility:** Unspecified/unknown aircraft retain the
  legacy 3 deg/s, 1800 fpm, and 1 kt/s trajectories.
- [ ] **AC3 — Shared turn truth:** For a synthetic profile/speed, physical
  turn rate, `turnRadiusNm`, fly-by start, and LOC lead prediction use the same
  derived constraint.
- [ ] **AC4 — FMS regression:** Parameterized DIRECT/PROCEDURE fly-by, LOC
  lead capture, GS from below, missed climb, landing/despawn, and magnetic
  variation tests remain green with default and nondefault profiles.
- [ ] **AC5 — Genericity:** No condition branches on aircraft type, airport,
  runway, procedure/fix id, scenario, or callsign outside registry lookup.
- [ ] **AC6 — Determinism:** Equivalent simulated time split into 20 Hz steps
  produces stable target capture and no overshoot caused by profile selection.

## Test plan

- **Unit:** Bank-to-rate conversion, profile-limited vertical/longitudinal
  movement, dynamic radius/lead helpers.
- **Integration:** Synthetic world vectors through `stepWorld`; retained
  procedure/approach acceptance for profile and default paths.
- **Manual:** Optional KDEM/KATL approach observation; no visual pass required.

## Suggested files

- `src/core/kinematics.ts`
- `src/core/world.ts`
- `src/core/nav/geometry.ts`
- `src/core/fms/lateral.ts`
- `src/core/fms/vertical.ts`
- `src/core/test/kinematics.test.ts`
- `src/core/fms/test/`
