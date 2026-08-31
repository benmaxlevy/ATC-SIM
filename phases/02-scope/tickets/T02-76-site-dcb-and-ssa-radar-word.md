# T02-76 SITE DCB and SSA Radar Word

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-75
**Blocks:** T02-77
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Enable SITE on the MAIN DCB cap, provide FUSED/MULTI/adapted-site choices, and drive SSA’s radar word from live surveillance mode. Preserve the network-health stub while removing the disabled SITE placeholder.

## Context

MAIN currently renders `SITE FUSED` as disabled (`DisplayControlBar.tsx`, id `site-fused`), and tests encode that placeholder. SSA already defaults to `surveillanceMode: "FUSED"` and displays `OK/OK/NA FUSED`; it must now reflect selected display mode while retaining stub network health.

T02-68–72 are reserved for the WX mosaic swarm. This ticket is T02-76.

## Research

- **R07 — CRC / vNAS STARS client:** https://docs.virtualnas.net/crc/stars/; Search: `vNAS CRC STARS SITE button FUSED`. CRC’s SITE button is disabled in its FUSION-only analog.
- **R05 — FOA Handbook, STARS chapter:** https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html; Search: `FAA FOA STARS surveillance display radar sites`. Use for facility/display-data terminology.
- **R01 — FAA JO 7110.65:** https://www.faa.gov/air_traffic/publications/atpubs/atc_html/; Search: `FAA 7110.65 radar display surveillance`. Use for operational radar wording.
- **Trainer delta:** Unlike CRC’s disabled FUSION-only SITE analog, this trainer exposes FUSED, MULTI, and one single-site cap per authored scenario site. Network health remains `OK/OK/NA`; it is not live sensor health.

## Scope

- Enable MAIN SITE cap and retain id `site-fused` or update tests consistently.
- Add submenu choices: FUSED, MULTI, and one cap per adapted site from loaded scenario data.
- Display MAIN text as exactly `SITE FUSED`, `SITE MULTI`, or `SITE <id>`.
- Bind selection to surveillance sampler mode from T02-75.
- Drive SSA `surveillanceMode` and radar word from live selected mode.
- Preserve `OK/OK/NA` network-health stub; do not claim live sensor health.
- Keep MODE FSL disabled.
- Allow PREF to persist SITE display mode only.
- Ensure per-track PTL and TPA remain session/display state and are not persisted in PREF.
- Update tests currently requiring disabled SITE FUSED.

## Out of scope

- Surveillance sampling, report timing, coverage, or paint geometry (T02-75).
- Authoring RadarSite schema/data (T04-45).
- End-to-end site acceptance and backlog completion (T02-77).
- Live sensor health, radar networking, or facility-specific conditionals.
- Enabling MODE FSL or changing unrelated DCB controls.
- WX1–6 / BRITE WX (other swarm).

## Implementation notes

- Derive site caps from loaded scenario/catalog RadarSite rows, not hard-coded facility IDs.
- Use a discriminated mode type shared with sampler and SSA, such as `"FUSED" | "MULTI" | { siteId: string }`, with stable serialization for PREF.
- Handle missing/empty site lists by retaining FUSED and hiding site-specific choices.
- Keep cap labels and SSA radar word synchronized from one selected-mode source to prevent stale display text.
- Persist only SITE mode in the existing display preference payload. Validate a stored site ID against current adapted sites; fall back to FUSED if absent.
- Add a comment citing R07’s disabled SITE analog and this trainer lift.

## Acceptance criteria

- [ ] **AC1 —** MAIN SITE is enabled and opens submenu choices FUSED, MULTI, and each adapted site in scenario data.
- [ ] **AC2 —** MAIN cap text exactly reflects selected mode: `SITE FUSED`, `SITE MULTI`, or `SITE <id>`.
- [ ] **AC3 —** Selecting each choice updates the sampler mode used by ScopeView.
- [ ] **AC4 —** SSA shows `OK/OK/NA` followed by live `FUSED`, `MULTI`, or selected site mode; network health remains stubbed.
- [ ] **AC5 —** MODE FSL remains disabled; PTL per-track and TPA state do not enter PREF.
- [ ] **AC6 —** PREF round-trip preserves valid SITE mode and safely falls back to FUSED for unavailable site IDs.
- [ ] **AC7 —** Automated tests cover enabled cap, dynamic submenu, labels, SSA synchronization, empty sites, persistence, and updated disabled-cap expectations.
- [ ] **AC8 — Research:** UI/code comments cite R07, R05, and the CRC-to-trainer SITE delta.

## Test plan

- **Unit:** DCB mode selection, dynamic site caps, mode serialization, and SSA word tests.
- **Integration:** DisplayControlBar + ScopeView + SSA tests using synthetic RadarSite rows.
- **Manual:** Open SITE submenu, select all modes, verify MAIN and SSA text; verify FSL remains disabled.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/ssa.ts`
- `src/scope/scopeView.ts`
- `src/scope/surveillance.ts`
- `src/scope/dcbPref.ts`
- `src/ui/DisplayControlBar.test.tsx`
- `src/scope/ssa.test.ts`
