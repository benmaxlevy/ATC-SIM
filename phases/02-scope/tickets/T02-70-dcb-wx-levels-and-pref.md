# T02-70 DCB WX Levels and PREF

**Phase:** 02 Scope (WX mosaic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-69 WX VIP Paint Under Tracks
**Blocks:** T02-72
**Launch:** Implement this ticket only after T02-69 is merged.

## Goal

Enable MAIN WX1–WX6 as session latches that control the six weather VIP levels, then persist those levels in PREF v3 without routing DCB clicks through the Command IR.

## Context

This is the Twenty-first swarm: live IEM N0Q → VIP 1–6, display only. T02-68 owns the IEM client, decoded masks, `ScopeView.wxLevels`, and `vipAtNm`; T02-69 paints enabled VIP masks beneath tracks. This ticket adds the DCB control path while preserving the existing full-height MAIN layout and live-bar rendering.

`DCB_PREF_SCHEMA_VERSION` is currently `2` in `src/scope/dcbPref.ts`. Bump it to `3`. Existing v2 slots must continue loading with all six WX levels off when no saved `wxLevels` field exists. Persist six booleans without changing unrelated preference data.

MAIN WX1–WX6 are currently `kind: "disabled"` in `MAIN_DCB_LAYOUT` columns 9–14 of `src/ui/DisplayControlBar.tsx`. Enable them as latches writing the same `view.wxLevels` bitmask consumed by weather paint. `renderPhysicalMain` remains the live-bar path. Do not restyle MAIN into the T02-58 half-height 2×3 layout or add AVL.

Clicks must update scope display state only. They must never create, enqueue, or mutate Command IR. Radio input remains isolated: `DAL123 H270` still turns.

## Research

- Existing `MAIN_DCB_LAYOUT`, `renderPhysicalMain`, and DCB latch handling in `src/ui/DisplayControlBar.tsx`.
- `ScopeView.wxLevels` and T02-69 weather paint/cache contract.
- `src/scope/dcbPref.ts`, `dcbPref.test.ts`, and `atpaFidelity.integration.test.ts` schema/version fixtures.
- Existing DCB command-isolation tests and `DAL123 H270` radio-line behavior.
- T02-58 layout history; preserve current MAIN WX1–6 placement and full-height geometry.

## Scope

- Enable MAIN WX1–WX6 as six independent latches in columns 9–14.
- Map each latch to one `view.wxLevels` entry using the existing six-level bitmask/state contract.
- Keep WX levels off by default for new views and for legacy v2 preference slots.
- Bump `DCB_PREF_SCHEMA_VERSION` from `2` to `3`.
- Serialize and deserialize `wxLevels` in PREF v3.
- Load v2 preferences successfully, defaulting missing WX levels to six false values.
- Preserve unrelated preference values and existing save/load behavior.
- Add tests proving latch state, six-level mapping, default-off state, v2 compatibility, v3 round-trip, and no Command IR mutation.
- Update version expectations in `src/scope/dcbPref.test.ts` and `src/scope/atpaFidelity.integration.test.ts` from `2` to `3`.

## Out of scope

- Preview `*WX` or `* WX` parsing; T02-71 owns it.
- BRITE WX/WXC controls; T02-72 owns them.
- WXC contours, BKC, SSA WX/WX HIST, AVL 2×3 restyle, wind, METAR, or pilot deviation.
- Any radio-line WX command or Command IR representation.
- Changing `renderPhysicalMain` or converting MAIN to a half-height 2×3/AVL layout.
- OSM, facility-specific branches, or `if (icao === "KDEM")`.
- Changing weather fetch, decode, VIP binning, or render ordering.

## Implementation notes

- Use the existing DCB state/latch path; do not synthesize a keyboard command to implement a click.
- Keep one source of truth for six WX booleans or its equivalent bitmask. DCB, weather paint, and PREF must agree on level indices.
- Treat absent v2 `wxLevels` as all false. Reject malformed values safely without mutating valid loaded preferences.
- Keep preference migration generic by schema version, not facility or scenario ID.
- Preserve BRITE WX/WXC disabled state until T02-72.
- Keep radio command handling independent; test `DAL123 H270` still reaches heading behavior after DCB interaction.

## Acceptance criteria

- [ ] **AC1 —** MAIN WX1–WX6 render in existing columns 9–14 and act as independent latches through `renderPhysicalMain`.
- [ ] **AC2 —** Each latch writes the corresponding `view.wxLevels` entry/bit, and weather paint consumes the same state.
- [ ] **AC3 —** New views start with all six WX levels off; loading a v2 PREF slot with no WX field also produces six false values.
- [ ] **AC4 —** `DCB_PREF_SCHEMA_VERSION` is `3`; v3 PREF round-trips all six WX levels while preserving unrelated preferences.
- [ ] **AC5 —** DCB WX clicks never create or mutate Command IR; radio `DAL123 H270` still turns.
- [ ] **AC6 —** MAIN layout remains full-height; no T02-58 2×3/AVL restyle is introduced.
- [ ] **AC7 —** Acceptance tests amend existing “WX must be disabled” expectations to “WX must latch” while retaining OSM bans and BKC-disabled expectations.
- [ ] **AC8 —** Typecheck, lint, formatting, and test suite pass.

## Test plan

- Unit: DCB WX latch mapping, default-off state, malformed/legacy preference migration, and v3 round-trip.
- Integration: DCB click followed by weather-state assertion; verify no Command IR mutation and `DAL123 H270` heading behavior.
- UI acceptance: MAIN columns 9–14, full-height layout, `renderPhysicalMain`, BKC/WXC still disabled where applicable.
- Regression: `npm run ci`.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/dcbPref.ts`
- `src/scope/dcbPref.test.ts`
- `src/scope/atpaFidelity.integration.test.ts`
- `src/ui/DisplayControlBar.test.ts`
- `src/ui/dcbAddendumAcceptance.test.ts`
- `src/ui/tcwVisualAcceptance.test.ts`
- `src/ui/dcbPhysicalReplicaAcceptance.test.ts`
- Relevant ScopeView/DCB integration tests
