# T04-03 Lateral FMS: direct and fly-by

**Phase:** 04 Procedures
**Priority:** P0
**Size:** L
**Depends on:** T04-02
**Blocks:** T04-04, T04-05, T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`DIRECT` to a named catalog fix changes intent and the aircraft tracks that fix with a **fly-by** turn. Parser token `DCT`. Heading instructions cancel DIRECT. STAR legs can be sequenced as successive directs internally, but **descend-via vertical** is T04-04; this ticket may sequence STAR laterals only if needed for a unit test — prefer a `lateral: DIRECT` plus a `lateral: PROCEDURE` walker that uses the same fly-by helper.

## Context

Phase 1 kinematics: bank-limited / ~3°/s turn toward assigned heading (`T01-03`). Phase 1 pilot applies heading/altitude/speed only. `DIRECT` is already on the IR and must no longer no-op.

See `phases/_shared/command-ir.md` (DIRECT, validation, readbacks), `phases/_shared/architecture.md` (`stepWorld`, pilot owns intent), `phases/04-procedures/README.md` (fly-by radius, heading cancels procedure).

## Scope

- Parser: `DCT <FIX>` → `{ type: "DIRECT", fixId }` (callsign rules unchanged).
- Pilot: unknown fix → `command.rejected`, no intent change, error readback. Known fix → `command.accepted`, readback `{callsign} direct {FIX}`, `lateral = DIRECT`.
- Kinematics: while `DIRECT`, commanded heading is course-to-fix (true). Fly-by: start turn using documented radius so the aircraft does not have to overfly the fix if a **next course** exists; for a lone DIRECT with no next leg, fly **to** the fix (fly-over / sequence when distance `< 0.3 NM` or abeam) then `lateral = HEADING` at **present heading**.
- STAR lateral (minimum): a helper `advanceStarLeg` / mode `PROCEDURE { starId, toFixIndex }` that fly-bys each STAR fix then, on last fix, emits `nav.star.vectors` and `HEADING` present heading. Spawn-on-STAR can wait for T04-12; expose the helper and unit-test it with a fake aircraft.
- `FLY_HEADING` / `TURN_DEGREES` / `PRESENT_HEADING` clear `DIRECT` / `PROCEDURE`.
- Events: `nav.direct.sequenced` with fixId.
- Tests: from a known point, `DCT ALPHA` reduces distance to ALPHA; unknown fix rejected; heading cancels.

## Out of scope

- Altitude constraints, descend via, CROSS instruction.
- Localizer / GS / missed.
- Wind (assume 0; use ground position anyway).
- CIFP.
- Auto-spawn on STAR (T04-12).

## Implementation notes

Course to fix: `atan2(dx, dy)` in the phase 0 convention (document: if +x east +y north, heading true `atan2(x, y)` in degrees, normalized `[0, 360)`). Share one `courseDeg(from, to)` helper; T04-05 will reuse it.

Turn radius: use the same turn-rate constant as T01-03.

```
ω_rad_s = turnRateDegPerS * π / 180
R_nm = (tasKt / 3600) / ω_rad_s
```

Fly-by start distance for course change `θ` (radians, absolute, min 1°): `d = R * tan(θ/2)` with a floor (e.g. 0.2 NM) and a cap (e.g. 4 NM). Lone DIRECT: no next course → sequence at `dist < max(0.3, 2 * dt * tas / 3600)` to avoid orbiting.

Do not use LNAV roll steering more complex than “command heading = course to fix until fly-by, then command heading = next course.”

Parser: `D` is still descend. `DCT` only. Fix token `[A-Z]{2,5}` after uppercase.

Pilot remains the only intent mutator. `stepWorld` reads `lateral` and writes position/heading.

Readback: spell fix as letters if not a known word; `ALPHA` can be spoken “ALPHA” as a single word (it is a phonetic letter). Keep it deterministic.

## Acceptance criteria

- [ ] **AC1 —** Given DAL123 10 NM east of ALPHA, when the parser+pilot accept `DAL123 DCT ALPHA`, then within 1 sim second `lateral.type === "DIRECT"` and `fixId === "ALPHA"`.
- [ ] **AC2 —** Given that DIRECT, when `stepWorld` runs 5 sim minutes at 1x (or equivalent steps), then distance to ALPHA decreases monotonically until sequenced (allow fly-by cutoff), and `nav.direct.sequenced` fires once.
- [ ] **AC3 —** Given `DAL123 DCT NOPE`, when issued, then `command.rejected`, no lateral change, readback indicates unknown fix.
- [ ] **AC4 —** Given an aircraft DIRECT ALPHA, when `H090` is accepted, then lateral is `HEADING` 090 and the aircraft does not keep tracking ALPHA.
- [ ] **AC5 —** Given DEMO ONE legs, when the PROCEDURE helper is stepped from a point near ALPHA, then ALPHA then BRAVO then CHARLIE sequence via fly-by and the last transition is `HEADING` with `nav.star.vectors`.
- [ ] **AC6 —** Automated tests for AC1–AC5 (AC1–AC4 integration or unit with World fixture; AC5 unit). DOM-free.

## Test plan

- Unit: `courseDeg`, fly-by distance, STAR walker.
- Integration: parse `DCT` → pilot → `stepWorld` moves toward fix; reject unknown; heading cancels.
- Manual: optional — click DAL123, type `DCT ALPHA`, watch the target on the PPI.

## Suggested files

- `src/core/nav/geometry.ts`
- `src/core/fms/lateral.ts`
- `src/core/fms/lateral.test.ts`
- `src/parse/` (DCT token)
- `src/pilot/` (DIRECT apply + reject)
- `src/parse/direct.test.ts`
- `src/pilot/direct.test.ts`
