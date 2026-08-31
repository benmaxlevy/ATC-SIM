# T02-75 Surveillance Display Sampler

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T04-45
**Blocks:** T02-76, T02-77
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Separate 20 Hz simulation truth from sampled surveillance display data. FUSED, MULTI, and single-site modes display only the last report pose, apply site coverage, and paint site-specific surveillance marks.

## Context

Radar reports arrive periodically; display symbols must not follow world/FMS/CA/MSAW truth between reports. T04-45 supplies `RadarSite` types with `id`, `name`, `kind` (`asr` or `airport`), `xNm`, `yNm`, `rangeNm`, and `periodMs`.

T02-68–72 are reserved for the WX mosaic swarm. This ticket is T02-75.

## Research

- **R07 — CRC / vNAS STARS client:** https://docs.virtualnas.net/crc/stars/; Search: `vNAS CRC STARS SITE FUSION radar display`. Use for surveillance display mode and target display feel.
- **R05 — FOA Handbook, STARS chapter:** https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html; Search: `FAA FOA STARS display data radar coverage Mode C`. Use for display-data policy terms.
- **R01 — FAA JO 7110.65:** https://www.faa.gov/air_traffic/publications/atpubs/atc_html/; Search: `FAA JO 7110.65 radar identification display surveillance`. Use for radar/display operational terminology.
- **Trainer delta:** FUSED updates every 1000 ms; single-site and MULTI use adapted `periodMs` (current airport/ASR fixtures use 4800 ms), have no 30-second coast, and use frozen paint marks defined below.

## Scope

- Add a testable sampler with modes `FUSED`, `MULTI`, and `{ siteId }`.
- Keep World, FMS, CA, and MSAW truth at 20 Hz; expose display targets from last site report only.
- Use 1000 ms report periods for FUSED.
- Use selected site `periodMs` for single-site mode; in MULTI, select nearest covering site and use that site's period.
- Suppress painting when a target is outside selected single-site coverage or outside the union of all sites in MULTI/FUSED.
- Do not coast targets for 30 seconds or otherwise paint stale out-of-coverage targets.
- Record history dots on report arrival, not on a fixed five-second timer; retain `HISTORY_MAX_DOTS` cap of five.
- Feed last report pose to PPI symbol, datablock, PTL, and ATPA cones.
- Paint FUSED with existing blue circle puck (`TARGET_PUCK_BG`).
- Paint MULTI with a thick blue rectangle centered on glyph and perpendicular to PTL ground-track heading.
- Paint single-site/other site with no blue block and a thin green slash aimed from target report toward antenna coordinates; slash length is approximately symbol length.
- Keep history dots unchanged and default boot mode FUSED.
- Treat empty `radarSites` as implicit FUSED without crashing.

## Out of scope

- RadarSite schema or authored facility data (T04-45).
- SITE DCB submenu and SSA wiring (T02-76).
- Radar-site integration/acceptance fixtures (T02-77).
- Live sensor health, aural ATPA, weather, or vendor/network services.
- Changing 20 Hz world, FMS, CA, or MSAW simulation truth.

## Implementation notes

- Inject a clock or scheduler so report timing tests use a fake clock.
- Store report pose, report timestamp, and source site per aircraft. Never substitute current world pose for display rendering.
- Coverage uses horizontal distance in NM against `rangeNm`; selected single-site means that site only. MULTI/FUSED union means any site covers.
- MULTI nearest selection must consider covering sites only; define stable tie-breaking by catalog order or site ID.
- Compute MULTI rectangle orientation from ground track heading, perpendicular to PTL, not from leader direction. Compute single-site slash vector from target report position to site antenna.
- Reuse `HISTORY_MAX_DOTS` and existing history data structures where possible.
- Add a comment citing R07/R05 and the frozen trainer paint delta.

## Acceptance criteria

- [ ] **AC1 —** Default mode is FUSED; empty site data behaves as implicit FUSED without a crash.
- [ ] **AC2 —** FUSED reports at 1000 ms and all display consumers use last report pose.
- [ ] **AC3 —** Single-site and MULTI sampling use selected/nearest covering site `periodMs`; no report is painted outside required coverage.
- [ ] **AC4 —** MULTI selects nearest covering site and paints the thick blue rectangle perpendicular to PTL ground-track heading.
- [ ] **AC5 —** Single-site/other site paints a thin green slash aimed at site antenna, with no blue rectangle.
- [ ] **AC6 —** FUSED retains existing blue circle puck; history records on report and never exceeds five dots.
- [ ] **AC7 —** World/FMS/CA/MSAW remain 20 Hz truth and no 30-second coast is introduced.
- [ ] **AC8 —** Automated fake-clock tests cover periods, coverage, nearest-site selection, report pose, history timing, and paint geometry.
- [ ] **AC9 — Research:** Code comment names R07/R05 analogs and frozen trainer delta; user-facing strings use surveillance/range/site terminology.

## Test plan

- **Unit:** new `src/scope/surveillance.test.ts` with synthetic sites and fake clock.
- **Integration:** history call site, target symbol, PTL/datablock/ATPA consumers, and render tests.
- **Manual:** Visual checks for FUSED, MULTI, and single-site marks at covered/out-of-coverage positions.

## Suggested files

- `src/scope/surveillance.ts`
- `src/scope/surveillance.test.ts`
- `src/scope/targetSymbol.ts`
- `src/scope/renderScope.ts`
- `src/scope/history.ts`
- `src/scope/scopeView.ts`
