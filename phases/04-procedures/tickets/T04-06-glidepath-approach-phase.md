# T04-06 Glidepath and approach phase

**Phase:** 04 Procedures
**Priority:** P0
**Size:** L
**Depends on:** T04-05
**Blocks:** T04-07, T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

After localizer capture (**established**), the aircraft intercepts the **3° glidepath from below** and descends on it (approach phase). Assigned altitude is honored **until loc established**, then until GS intercept from below. **Do not capture GS before loc.** No autoland flare yet.

## Context

ILS 27 catalog fields: `gsAngleDeg`, `tchFt`, `fafDistanceNm`, `gsInterceptAltFt`, `daFt`. Typical flow matches the ILS clearance: *maintain 2000 until established, cleared ILS 27* → intercept loc at 2000, capture GS near 6 NM. “Until established” is loc capture (T04-05); this ticket is GS **after** that.

Kinematics already climb/descend at ~1500–2000 fpm (phase 1). GS at 160 kt / 3° is ~850 fpm — existing VS is enough; you may cap VS to follow GS rather than slam 2000 fpm through it.

Glossary: altitude feet MSL. Field elev 0.

## Research

Read **R01** ILS / glidepath / approach clearances (phraseology and when GS is expected).

- Search: `7110.65 ILS glide path intercept` and `cleared ILS approach maintain until established`
- Do not invent “autoland.” After GS capture, descend **on the glidepath**. Readbacks stay 7110.65 from phase 1/3.

## Scope

## Scope

- Pure `gsAltitudeFt(distToThresholdNm, loc params)` matching README: `tchFt + tan(gsAngle) * distNm * 6076.12` (+ field elev).
- After `lateral === LOC` (**established**), evaluate GS capture **from below**. Never evaluate GS capture in `INTERCEPT_LOC` / `HEADING`.
- On capture: `vertical = GS`, event `nav.gs.captured`, follow `gsAltitudeFt` at current distance (lead slightly if needed to avoid porpoise).
- Do not capture from above (`alt > gsAlt + 50` at first opportunity → stay ASSIGNED).
- Do not climb on GS. If more than 150 ft above GS after capture, drop to ASSIGNED at current assigned (or last assigned 2000) — tested.
- Speed: leave assigned speed unchanged (no auto 160 kt).
- Stop GS at DA logic **belongs to T04-07**; this ticket may fly GS through DA in tests if missed is not wired — **do not despawn**. A test can stop before 200 ft.
- Inhibit nothing here except do not follow GS when not on LOC.

## Out of scope

- Missed approach, tower handoff, flare, ground roll.
- Localizer-only approaches as a separate type.
- Auto-speed, config, radio altimeter.
- MSAW inhibit (T04-10 will key off `vertical === GS`).

## Implementation notes

Distance to threshold: planar distance to `(thresholdXNm, thresholdYNm)`, or along-track if `|crossTrack|` is small. Use along-track when on LOC so GS is consistent with loc.

Capture when:

- `lateral` is `LOC`
- along-track between `0.5 NM` and `10 NM` (do not capture at 18 NM)
- `alt + 50 >= gsAlt` is **not** the from-below test — require previous tick `alt < gsAlt - 20` **or** current `gsAlt - 200 <= alt <= gsAlt + 50` after having been below
- assigned altitude may be *above* GS at 18 NM; aircraft levels at 2000; GS comes down to meet them

Once on GS, target alt each tick = `gsAltitudeFt(alongTrack)`. Climb rate toward that target using existing vs, **clamped** so you do not balloon. Prefer setting a desired VS from geometry:

```
vsFpm = -tan(gsAngle) * gsKt * 6076.12 / 60
```

(`gsKt` = ground speed). Wind-ready.

Heading cancel (already T04-05) also clears `vertical` GS → ASSIGNED.

## Acceptance criteria

- [ ] **AC1 —** Unit: `gsAltitudeFt(6)` is within 50 ft of `gsInterceptAltFt` (2000) given TCH 50 and 3°.
- [ ] **AC2 —** Given loc captured, alt 2000, ~8 NM (still below GS), when stepped, then `nav.gs.captured` occurs near 6 NM (±1 NM) and altitude then tracks GS within 150 ft down to 1000 ft.
- [ ] **AC2c —** Given `INTERCEPT_LOC` (not yet captured), alt 2000, ~8 NM, when stepped 20 s, then `nav.gs.captured` does **not** fire.
- [ ] **AC3 —** Given loc captured, alt 4000 at 6 NM (above GS), when stepped 30 s, then `vertical` is not `GS` and `nav.gs.captured` does not fire.
- [ ] **AC4 —** Given GS captured, when `H360` accepted, then GS mode clears and the aircraft does not keep descending on the 3° path solely due to GS (it may still descend to assigned).
- [ ] **AC5 —** Automated tests for AC1–AC4 and AC2c. DOM-free.

## Test plan

- Unit: GS height table at 10 / 6 / 3 / 1 NM.
- Integration: intercept (reuse T04-05 fixture) + maintain 2000 → GS capture → descend; above-GS refusal; heading breakout.
- Manual: on loc at 2000, watch Mode C start down ~6 NM.

## Suggested files

- `src/core/nav/glidepath.ts`
- `src/core/nav/glidepath.test.ts`
- `src/core/fms/vertical.ts` (extend)
- `src/core/fms/approach.test.ts`
