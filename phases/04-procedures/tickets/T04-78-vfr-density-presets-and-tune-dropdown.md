# T04-78 VFR density presets and tune dropdown

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-77
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later phase or swarm.

## Goal

Session setup offers one `VFR density` preset (Off / Light / Moderate / Busy)
plus a collapsible tune dropdown exposing the exact numbers. Movement mix is
fixed and hidden. Zone UI is gone with T04-77.

## Context

The current VFR panel exposes 4 population numbers, 3 zone weights, 3 movement
percentages, and 4 request numbers: 14 inputs before Seed. Presets cover real
trainer workloads; exact numbers stay reachable one disclosure click away. The
dropdown mirrors the native `<details><summary>` subsection pattern in
`src/ui/overlays/ScopeHelpOverlay.tsx` (`scope-help-section`).

## Research

- **T04-72/T04-76 contracts:** request cap pacing (`3_600_000 / cap`),
  exclusive initial categories, sum ≤ 100 rule. Presets must obey them.
- **T04-76 defaults (= Moderate):** initial 4, target 4, entries 6/hr, max 8,
  cap 6/hr, following 30%, pickup 20%, cancel 25%.
- Trainer delta: fixed movement mix 60/20/20 (airport-bound folds to local
  when the scenario has no eligible destinations).

## Scope

- Add `VFR_DENSITY_PRESETS` (Off/Light/Moderate/Busy) mapping to exact
  population + request numbers:
  - Off: everything disabled (no VFR keys persisted).
  - Light: initial 2, target 2, entries 3/hr, max 4, cap 3/hr, FF 20%,
    pickup 10%, cancel 10%.
  - Moderate: initial 4, target 4, entries 6/hr, max 8, cap 6/hr, FF 30%,
    pickup 20%, cancel 25%.
  - Busy: initial 6, target 8, entries 12/hr, max 12, cap 10/hr, FF 40%,
    pickup 30%, cancel 25%.
- Density `<select>` applies a preset. Editing any tuned number flips the
  select to `Custom`. Persisted storage keeps full numbers; presets are a
  UI mapping, never stored.
- Tune dropdown: one `<details>` disclosing numeric inputs for initial,
  target, entries/hr, max, cap/hr, following %, pickup %, cancel %.
  Same interaction shape as help subsections; accessible labels kept.
- Delete the Named zone weights fieldset and `updateZoneWeight`.
- Delete the Movement mix fieldset; apply fixed 60/20/20 (airport-bound 0
  with local 80 when no eligible destinations, preserving the T04-71
  no-eligible-destination rule).
- Keep Seed, validation strings, legacy-load VFR-disabled, `traffic=N`
  precedence, capability gating, and `@scope`-only DCB behavior.
- Update `docs/USER.md` controls section and `phases/04-procedures/README.md`
  addendum for presets + fixed mix. No history deletion.

## Out of scope

- Spawner, avoidance, missions, request scheduling, speech, Command IR.
- New presets, per-mission controls, live mid-session editing.
- Restyling session setup beyond the tune disclosure.

## Implementation notes

- Preset application must reuse upstream validation and exact error strings.
  Invalid tune edits block Apply exactly as today.
- `Custom` is display-only state derived from numbers differing from all
  presets; it is never persisted as a density value.
- Off writes no `vfrTraffic`/`vfrRequests` keys (matches legacy-disabled load).

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Select Moderate | Numbers fill with T04-76 defaults | Draft only until Apply | Invalid stored values fall back per shared policy | Preset unit test |
| Edit entries/hr after preset | Select flips to Custom, value kept | Full numbers persist round-trip | Out-of-range blocks Apply with exact error | Tune unit test |
| Select Off, Apply | Session starts with zero VFR state | No VFR keys persisted | Pending-request state absent, not error | Legacy-disabled test |
| Busy on scenario without eligible destinations | Airport-bound folds to local | No validation throw | Explicit fold covered by test | Eligibility test |
| Legacy stored session | Loads, VFR disabled | IFR settings retained | Malformed new fields use shared fallback | Persistence test |

## Acceptance criteria

- [ ] Preset select covers Off/Light/Moderate/Busy + derived Custom.
- [ ] Tune dropdown exposes all 8 numbers with labels and validation.
- [ ] No zone or movement-mix inputs remain in session setup.
- [ ] Round-trip, legacy load, and capability gating unchanged.
- [ ] **Manual:** KATL both runway configs on Moderate with one
  following/pickup/cancellation/satellite arrival; record scenario/seed.
- [ ] `npm run ci` passes.

## Test plan

- Unit: preset mapping, Custom derivation, Off key-strip, fold rule,
  round-trip, legacy fallback (`src/scenario/test/sessionSetup.test.ts`,
  `src/ui/controls/test/session-setup.test.tsx`).
- Integration: extend `tests/integration/satellite-traffic-acceptance.test.ts`
  only if preset paths need it; no new facility-specific suites.
- Manual: both KATL configs, Bravo spot check, unavailable-speech honesty.

## Suggested files

- `src/scenario/sessionSetup.ts`
- `src/ui/controls/session-setup.tsx`
- `src/ui/controls/test/session-setup.test.tsx`
- `src/scenario/test/sessionSetup.test.ts`
- `docs/USER.md`
- `phases/04-procedures/README.md`

## Test and handoff requirements

Focused tests then `npm run ci`. Speech mock pytest only if speech paths
change (they must not). Never skip hooks. Stage explicit owned paths only.
Worker implements exactly this ticket on
`ticket/T04-78-vfr-density-presets-and-tune-dropdown`, progressive gated
commits, never merges/spawns/pushes, returns exactly `READY TO MERGE` or
`BLOCKED`.
