# T04-47 Lead-turn localizer capture and tracking

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-46
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

An aircraft cleared for an ILS begins its rate-limited turn before passing the
localizer centerline, captures once, and converges onto inbound without S-turning
or remaining parallel off-course.

## Context

`INTERCEPT_LOC` flies the assigned vector until centerline capture, then `LOC`
commands only runway course. With 3-deg/s turn rate, an aircraft continues
through centerline while turning. `LOC` has no cross-track correction and may
remain offset or later re-arm after breakout. T04-46 supplies generic envelope
geometry.

## Research

- **R01 -- FAA final approach course interception:** https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_9.html
  Search: `FAA JO 7110.65 final approach course interception 30 degrees`.
- **FAA AIM 1-1-9 -- Instrument Landing System:** https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html

**Official terms:** final approach course interception; localizer; established.
JO 7110.65 limits final-course intercept angles to 30 deg at 2 NM or more, or
20 deg closer in. The trainer predicts its own fixed-rate turn after an approved
controller vector; it is not an autopilot or certified separation model.

## Scope

- Replace centerline-only transition behavior with generic predictive lead-turn
  geometry using speed, current heading, loc axis, and `TURN_RATE_DEG_PER_S`.
- Keep assigned vector until calculated lead turn. Then command bounded LOC
  guidance that converges cross-track error using the T04-46 envelope.
- Make LOC tracking use bounded cross-track correction until stable; do not
  command bare inbound heading at every offset position.
- Preserve `INTERCEPT_LOC`, `LOC`, and one `nav.loc.captured` event; heading
  cancels/requires new APP; LOC-only remains at assigned altitude; APP remains
  LOC-first and GS-from-below.
- Rework breakout/re-arm to represent true inability to retain LOC, never normal
  rate-limited capture.
- Use synthetic parameterized worlds and reciprocal axes. KDEM can prove catalog
  wiring once; reusable tests must not encode KDEM geometry/ids/counts/order.
- Amend Phase 4 README, superseding T04-05 centerline-only command behavior.

## Out of scope

- Signal schema/envelope dimensions; T04-46 owns them.
- Wind/crab, RNAV, missed redesign, autopilot modes, display needles,
  controller advisories, parser/readback work, or a facility branch.
- Heading snaps at capture; they hide the defect and violate rate-limited physics.

## Implementation notes

Keep predictive math pure and call it through `applyLateralFms`; do not change
`stepAircraft` turn physics. Bound correction/intercept commands so a controller
approved 20/30-deg vector remains plausible. Use signed cross-track, not a
KDEM compass-side assumption. State transition/event emission must be deterministic
at `SIM_DT_S`.

## Acceptance criteria

- [ ] **AC1 -- Lead turn:** Parameterize a generic 18-NM LOC axis with initial
  along-track 12 NM and target-intercept along-track 6 NM. For each side, set
  cross-track to `plus-or-minus 6 * tan(20 or 30 deg)` and heading to the
  corresponding inbound plus/minus intercept angle at 180/250/300 kt. Before
  3 NM along-track or 6 sim minutes, each run begins inbound turn before the
  cross-track sign can change, then captures.
- [ ] **AC2 -- Capture/track:** Every AC1 run emits exactly one
  `nav.loc.captured`, reaches `LOC`, never changes cross-track sign from arm
  through 3 NM along-track, reaches absolute cross-track error at or below
  0.05 NM, has no re-arm, and after lead turn has heading error monotonically
  nonincreasing to within 2 deg of inbound. This is the automated no-fly-through
  and no-S-turn rule.
- [ ] **AC3 -- Reciprocal/data-driven:** The same parameterized test passes for
  reciprocal axes and catalog-loaded ILS 27/09 without airport/runway/fix-id or
  north/south branch.
- [ ] **AC4 -- Command semantics:** Heading after arm cancels capture; new APP
  required. `INTERCEPT_LOCALIZER` stays LOC-only. APP preserves LOC-before-GS
  and from-below capture.
- [ ] **AC5 -- No snap:** Tests observe rate-limited heading changes; no code
  directly assigns inbound heading to hide overshoot.
- [ ] **AC6 -- Regression:** DIRECT/PROCEDURE joins, landing, missed approach,
  and event consumers retain documented behavior.
- [ ] **AC7 -- Research:** Geometry comment cites JO 7110.65 5-9-2 and states
  trainer delta.

## Test plan

- **Unit:** Lead-distance and bounded correction helpers, signed/reciprocal axes.
- **Integration:** Parameterized `stepWorld` vectors for all AC1 cases.
- **Manual:** Full ILS clearance in KDEM ILS 27/09; automated tests remain authority.

## Suggested files

- `src/core/fms/lateral.ts`
- `src/core/nav/localizer.ts`
- `src/core/kinematics.ts`
- `src/core/fms/test/lateral.test.ts`
- `src/core/fms/test/approach.test.ts`
- `src/core/nav/test/localizer.test.ts`
- `phases/04-procedures/README.md`
