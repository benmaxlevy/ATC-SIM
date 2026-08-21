# T04-11 Constant wind optional

**Phase:** 04 Procedures
**Priority:** P1
**Size:** S
**Depends on:** phase 1 kinematics (loc/GS should already use position; T04-05/T04-06 preferred first)
**Blocks:** none (not required for phase exit)
**Launch:** Implement this ticket only. Do not start downstream tickets. Skip entirely if exiting phase 4 without wind.

## Goal

Optional **constant** wind vector on the world. Aircraft heading is still the aerodynamic heading; **ground track and GS** include wind. Localizer tracking continues to use position, so intercept still works with a crab.

## Context

Glossary: speed is IAS treated as TAS in v1; “No wind until phase 4.” Non-goals: no weather mosaic. Phase 2 datablock ground speed should become true GS here if it was TAS.

This ticket is **P1 / exit-optional**.

## Scope

- `World.wind?: { fromDeg: number; speedKt: number }` (meteorological **from**). `undefined` or `speedKt === 0` = no wind.
- Scenario JSON optional `wind`. Settings or scenario only — no ATIS.
- Kinematics: air vector from heading + TAS; wind vector **to** = `fromDeg + 180`; ground = air + wind. Position integrates ground velocity.
- Turn/climb unchanged (still in the air mass).
- Datablock GS = ground speed. Predicted track line (phase 2) should use ground velocity if it used heading×TAS before.
- Test: heading 270, TAS 200, wind from 270 at 20 kt → GS ≈ 180, track 270. Wind from 360 at 20, heading 270, TAS 200 → track south of 270 (positive or negative y drift) — assert sign documented.
- One intercept regression: T04-05 geometry with wind from 360/15 still captures loc (cross-track → 0), heading **not** required to be 270.

## Out of scope

- Gusts, shear, wind layers, gusty finals, weather mosaic.
- Runway tailwind limits, ATIS, METAR parse.
- IAS ≠ TAS / density altitude.

## Implementation notes

```
toDeg = normalize(fromDeg + 180)
windX = speedKt * sin(toRad) / 3600  // NM/s, +x east
windY = speedKt * cos(toRad) / 3600
```

Match `courseDeg` trig convention from T04-03.

If T04-05 commanded heading = 270 on loc, **change** loc track-hold to: commanded heading = `desiredTrack + crab` where crab = track error from wind triangle (asin / atan2). Minimum: iterate heading so that ground track ≈ 270. Document the method.

Do not fail CA lookahead; it already uses ground velocity — once wind exists, CA gets it for free.

## Acceptance criteria

- [ ] **AC1 —** Given wind undefined, kinematics match pre-ticket (within 1e-6 NM/step on a heading-only fixture).
- [ ] **AC2 —** Given heading 270, TAS 200, wind from 270 at 20, when stepped, then GS is within 2 kt of 180 and `|y|` drift is ~0.
- [ ] **AC3 —** Given a loc-captured aircraft with crosswind (from 360 at 15 kt), when stepped 2 sim minutes, then `|crossTrack| < 0.25 NM` (tracks the loc, not the heading).
- [ ] **AC4 —** Automated tests AC1–AC3. DOM-free. Scenario with `wind` loads without throwing.

## Test plan

- Unit: wind triangle; crab on loc.
- Integration: stepWorld with wind; datablock GS if testable from World.
- Manual: set wind, fly loc, confirm crab on PPI heading vs track.

## Suggested files

- `src/core/wind.ts`
- `src/core/wind.test.ts`
- `src/core/` kinematics integration
- `src/scenario/` optional wind field
- `src/ui/` optional settings (skip if scenario-only)
