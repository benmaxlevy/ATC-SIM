# T04-05 Vector to intercept localizer

**Phase:** 04 Procedures
**Priority:** P0
**Size:** L
**Depends on:** T04-01, T04-03
**Blocks:** T04-06, T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`EXPECT_APPROACH` arms scratchpad only. A **7110.65 ILS clearance** — heading + maintain altitude until established + cleared ILS 27 — compiles to one `Command` and the aircraft **does those three things**. Bare `CLEARED_APPROACH ILS27` still starts a localizer intercept from the current heading. Phase 1 no-op of `APP` is gone.

## Context

IR already has `EXPECT_APPROACH` and `CLEARED_APPROACH` (`phases/_shared/command-ir.md`). Parser table already maps `APP ILS27`. Pilot agent is the only intent mutator. Phase 2 drew a loc feather — capture is now kinematics.

Heading cancels intercept (README state machine): vectors are headings; `APP` arms intercept from that heading.

Do **not** sense the loc with heading. Use position vs the loc axis so T04-11 wind cannot break this.

## Research

Read **R01** radar arrivals / vector to intercept / ILS clearances.

- Open: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/ — search `vector`, `intercept`, `cleared ILS`.
- Search: `7110.65 vector to intercept localizer` and `7110.65 cleared ILS approach` and `maintain until established on the localizer`
- Canonical clearance (must parse **and** fly): *turn right heading (xxx), maintain (altitude) until established, cleared ILS approach runway 27*
- Also accept: *until established on the localizer*; *cleared ILS runway two seven approach* (phase 3 already has this short form)
- Readbacks: `turn right heading two four zero, maintain two thousand until established, cleared i l s runway two seven approach` — not “lock ILS” or “autoland.”
- **Vector** = heading instruction; **until established** = hold assigned altitude until loc capture; intercept is FMS after `CLEARED_APPROACH`.

## Scope

- Parser typed: `EXP ILS27` → `EXPECT_APPROACH`. `APP ILS27` already mapped; approachId `ILS27`. Same-line `R240 A20 APP ILS27` (or `H240 A20 APP ILS27`) → heading + `ALTITUDE` with `untilEstablished: true` + `CLEARED_APPROACH`. Patch `phases/_shared/command-ir.md` **and** the TypeScript `Instruction` union in the same PR if `untilEstablished` is not already on `ALTITUDE`.
- Parser Path A: extend spoken grammar (do not edit phase 3 *tickets*; you **may** extend `src/parse/spoken/grammar.ts`). Required fixtures:
  - `turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven`
  - `turn right heading two four zero maintain two thousand until established on the localizer cleared ils runway two seven approach`
  - Instruction order: `FLY_HEADING RIGHT 240`, `ALTITUDE MAINTAIN 2000 untilEstablished`, `CLEARED_APPROACH ILS27`
- Pilot:
  - Unknown approachId → reject.
  - `EXPECT_APPROACH` → `expectedApproachId`, readback expect ILS runway two seven, **no** lateral change.
  - `CLEARED_APPROACH` → `clearedApproachId`, `lateral = INTERCEPT_LOC`. If the same Command includes a heading, that heading **is** the intercept heading. Else keep current assigned heading.
  - Altitude in that Command (or already assigned) is **held until loc capture**. Do not capture GS in this ticket (T04-06). `untilEstablished` is the readback flag; kinematics always hold assigned alt until established once `APP` is armed.
- Readback: include `until established` when the altitude instruction has `untilEstablished`. Combined ILS uses comma join, callsign once. Prefer `turn right heading …` when `turn` is `RIGHT`/`LEFT` (not only “heading two four zero”).
- Geometry: loc axis from catalog (threshold, course 270, length 18 NM, ±2.5°). Signed deviation helper + capture predicate.
- `stepWorld`: `INTERCEPT_LOC` flies assigned heading until capture, then `lateral = LOC` and commanded **track** 270 (heading 270 if wind 0).
- Capture hysteresis: once `LOC`, stay until a heading instruction, `|deviation| > 2.5°` for > 5 s, or missed/land.
- Event `nav.loc.captured`.
- Datablock/strip scratchpad shows `EXP ILS27` / `ILS27` if phase 2 scratchpad exists; if not, store on intent for T04-12.
- Tests: north of loc, heading 240, `APP ILS27`, eventually `|yNm|` small and heading ~270; `EXP` does not turn; `H090` after arm cancels.

## Out of scope

- Glidepath (stay at assigned altitude).
- Missed, tower, CA, wind.
- Auto-tune or “join at FAF” without intercept heading.
- RNAV.

## Implementation notes

Loc axis (KDEM): threshold `(tx, ty)`, inbound course `270`. Inbound unit vector ≈ `(-1, 0)`. Along-track from threshold (positive *in front* of rwy 27, east) ≈ `x - tx`. Cross-track north-positive ≈ `y - ty`.

Angular deviation (deg): `atan2(crossTrackNm, alongTrackNm) * 180/π` when along-track `> 0.5 NM`. Document sign: **positive deviation = north of course**.

Capture when all of:

1. `0.5 NM < alongTrack < lengthNm` (in front of threshold, inside loc)
2. intercept heading within 45° of inbound **or** already `|δ| < 0.5°`
3. `|δ| < 0.5°` **or** `|crossTrack| < 0.15 NM`

After capture, commanded course = loc inbound. Use ground-track error to set heading (wind-ready): heading = desired track (270) for now; T04-11 adds crab.

Breakout: any `FLY_HEADING` / `TURN` / `PRESENT_HEADING` → `HEADING`, clear `clearedApproachId` or leave it but not capturing — **clear clearedApproachId** so they must `APP` again.

Do not capture behind the threshold (along-track ≤ 0) except landing ticket.

If `APP` while already `DIRECT FI27` on the loc axis, still use INTERCEPT_LOC; capture should be immediate if already on course.

## Acceptance criteria

- [ ] **AC1 —** Given `DAL123 EXP ILS27`, when accepted, then `expectedApproachId === "ILS27"`, lateral mode unchanged, no `nav.loc.captured`.
- [ ] **AC2 —** Given aircraft at `(12, 4)` heading 240 assigned, altitude 4000, when `DAL123 APP ILS27` is accepted, then `lateral.type === "INTERCEPT_LOC"` and heading remains 240 until capture.
- [ ] **AC2b —** Given aircraft at `(12, 4)` heading 090, when Path A (or typed `R240 A20 APP ILS27`) accepts *turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven*, then instructions are heading 240 RIGHT + maintain 2000 `untilEstablished` + `CLEARED_APPROACH ILS27`, readback contains `until established` and `cleared i l s`, assigned heading 240, assigned alt 2000, `INTERCEPT_LOC`. Until `nav.loc.captured`, Mode C stays ~2000 (does not start GS).
- [ ] **AC3 —** Given AC2 setup, when stepped long enough (cap 8 sim minutes), then `nav.loc.captured` fires once, `lateral.type === "LOC"`, `|yNm| < 0.3`, and heading within 10° of 270 (wind 0).
- [ ] **AC4 —** Given INTERCEPT_LOC or LOC, when `H090` accepted, then lateral is HEADING 090 and loc is not recaptured without a new `APP`.
- [ ] **AC5 —** Given `APP ILS99`, when issued, then rejected; no intercept.
- [ ] **AC6 —** Automated tests for AC1–AC5 and AC2b. DOM-free. Any phase 1 test that asserted APP no-op is updated. Path A fixture for the combined ILS clearance is required.

## Test plan

- Unit: deviation sign, capture true/false table (on course, too far north, behind threshold, outside 18 NM).
- Integration: World intercept from `(12, 4)` / 240; EXP no-op lateral; heading cancel; unknown approach.
- Manual: phase 2 feather visible; issue the **full** ILS clearance on a 30° intercept; target turns, holds alt, then turns inbound.

## Suggested files

- `src/core/nav/localizer.ts`
- `src/core/nav/localizer.test.ts`
- `src/core/fms/lateral.ts` (extend)
- `src/parse/` (`EXP`)
- `src/pilot/` (EXPECT / CLEARED)
- `src/pilot/approach.test.ts`
