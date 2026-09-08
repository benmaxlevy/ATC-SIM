# T04-46 ILS signal-envelope geometry

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-05, T04-06
**Blocks:** T04-47
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Every catalog ILS has data-driven localizer and glidepath full-scale envelopes.
The simulator uses those envelopes instead of KDEM-specific or fixed capture/loss
windows.

## Context

T04-05 currently captures lateral guidance with fixed `0.5 deg` / `0.15 NM`
thresholds. T04-06 captures and drops glidepath with fixed feet thresholds.
Those values do not represent the localizer's 700-ft full-scale width at the
runway threshold or the glidepath's 1.4-deg total beam. T04-47 consumes this
ticket's pure geometry for rate-limited lateral capture.

## Research

- **R01 -- FAA radar arrivals / ILS handling:** https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_9.html
- **FAA AIM 1-1-9 -- Instrument Landing System:** https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html
  Search: `FAA AIM localizer 700 feet glide path 1.4 degrees`.

**Official terms:** localizer course full-scale width; glidepath beam; glidepath
angle. The FAA AIM specifies 700 ft full-scale localizer width at the runway
threshold and a 1.4-deg total glidepath beam. The trainer models normalized
guidance envelopes, not radio propagation, interference, false lobes, or a
certified ILS receiver.

## Scope

- Extend generic approach schema, catalog loader, narrow core catalog, and
  `LocAxis` / `GsParams` with canonical per-approach full-scale data:
  `locFullScaleHalfWidthFtAtThreshold` (default 350 ft) and
  `gsBeamFullWidthDeg` (default 1.4 deg).
- Preserve existing `beamHalfWidthDeg` as compatible angular/catalog data. Do
  not reinterpret it as threshold width or use video-map feather art as nav
  geometry.
- Add pure localizer envelope helpers. Define the canonical trainer function in
  NM as `halfWidthNm = 350 / FT_PER_NM + max(0, alongTrackNm) * tan(beamHalfWidthDeg)`.
  `beamHalfWidthDeg` remains the per-approach angular widening slope; default
  is 2.5 deg. The helper is reciprocal-course safe and exposes full-scale and
  normalized-error results.
- Add pure glidepath angular-deviation helpers around catalog centerline angle
  (normally 3.0 deg), with default full-scale limits plus/minus 0.7 deg.
- Replace fixed localizer capture eligibility and fixed GS capture/loss feet
  windows with normalized envelope policy: capture at absolute normalized
  error at or below `0.25`; retain LOC until it exceeds `1.0` for 5 s; capture
  GS only from below at absolute normalized vertical error at or below `0.25`;
  drop GS only when more than `1.0` full-scale above. Preserve no LOC capture
  behind threshold, LOC before GS, altitude hold until LOC, and no GS for
  `INTERCEPT_LOCALIZER` alone.
- Author explicit full-scale fields for KDEM ILS 27 and ILS 09 as ordinary
  catalog data. A second airport with this shape must use the same defaults.
- Amend the Phase 4 README post-exit contract, superseding hard windows.

## Out of scope

- Lead turn, lateral cross-track steering, and fly-through repair; T04-47 owns them.
- Wind, antenna siting, raw ILS modulation, false courses, autoland, flare,
  radio instruments, display needles, or a new Command IR type.
- Runway-specific capture constants or airport switches.

## Implementation notes

Keep calculations in local NM/feet geometry and DOM-free. The 350-ft half-width
is full-scale at threshold, not a constant-width corridor. The specified
threshold-anchored widening function is a trainer envelope, not a claim that
the LOC antenna is at threshold. The glidepath is an angular envelope around
`gsAngleDeg`, not a fixed altitude band. Keep normalized capture policy separate
from envelope math so T04-47 can use the same contract for lead prediction.

## Acceptance criteria

- [ ] **AC1 -- Schema:** Omitted values normalize to 350 ft and 1.4 deg with
  no KDEM/default-airport condition.
- [ ] **AC2 -- LOC geometry:** Generic reciprocal-course tests prove 350-ft
  half-width at threshold, widening with range, signed cross-track, and no
  valid front-course envelope behind threshold.
- [ ] **AC3 -- GS geometry:** A 3.0-deg centerline has 2.3-deg and 3.7-deg
  full-scale edges; a non-3-deg catalog angle shifts both correctly.
- [ ] **AC4 -- FMS policy:** LOC/GS capture and GS loss consume normalized
  envelope geometry: capture at 0.25 full scale, LOC retains to 1.0 for 5 s,
  GS captures from below at 0.25, and drops only above 1.0. The old fixed
  `0.15 NM`, `0.5 deg`, `120 ft`, `50 ft`, and `150 ft` thresholds are gone.
- [ ] **AC5 -- Data contract:** KDEM ILS 27 and ILS 09 load the same explicit
  fields; a synthetic second airport proves no facility branch.
- [ ] **AC6 -- Research:** Geometry comments cite FAA AIM 1-1-9 and state the
  non-certified trainer delta.
- [ ] **AC7 -- Automated:** DOM-free unit and focused approach tests pass.

## Test plan

- **Unit:** Localizer full-scale width by range/reciprocal axis; GS edges;
  defaults and catalog parsing.
- **Integration:** Synthetic world proves LOC-before-GS and from-below capture.
- **Manual:** None. T04-47 owns visible intercept behavior.

## Suggested files

- `src/scenario/procedures/types.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/core/world.ts`
- `src/core/nav/localizer.ts`
- `src/core/nav/glidepath.ts`
- `src/core/fms/vertical.ts`
- `src/core/nav/test/localizer.test.ts`
- `src/core/nav/test/glidepath.test.ts`
- `src/core/fms/test/approach.test.ts`
- `src/scenario/data/*/procedures.json`
- `phases/04-procedures/README.md`
