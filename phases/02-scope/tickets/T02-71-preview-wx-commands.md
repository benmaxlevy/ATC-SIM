# T02-71 Preview `*WX` Commands

**Phase:** 02 Scope (WX mosaic addendum)
**Priority:** P0
**Size:** S
**Depends on:** T02-69 WX VIP Paint Under Tracks
**Blocks:** T02-72
**Launch:** Implement this ticket only after T02-69 is merged.

## Goal

Add scope-preview commands for toggling WX VIP levels 1–6, enabling all levels, or disabling all levels. Keep commands scope-only, display-only, and outside Command IR.

## Context

This is the Twenty-first swarm: live IEM N0Q → VIP 1–6, display only. T02-68 supplies decoded VIP masks and `ScopeView.wxLevels`; T02-69 paints enabled levels beneath tracks. T02-70 supplies DCB latches and PREF v3. Preview commands must write the same six-level bitmask as DCB, so either control surface produces identical weather display state.

`src/scope/previewArea.ts` uses `parsePreviewCommand`, where unknown commands are `INV`. Add explicit `*WX` and `* WX` actions without changing generic unknown-command behavior. Incomplete `*WX` is `incomplete`, not `INV`; malformed level/all-off input is `INV` and must not mutate state.

Preview remains separate from radio input and Command IR. `DAL123 H270` still turns. No weather command should affect aircraft, world, or pilot deviation.

## Research

- `src/scope/previewArea.ts` and `parsePreviewCommand` action/status conventions.
- Existing preview-area command execution and state mutation tests.
- Existing STARS command tests, including `src/scope/previewArea.test.ts` and `src/ui/starsCommandsAcceptance.test.ts`.
- T02-68/T02-69 `ScopeView.wxLevels` and weather paint state contract.
- Command-line focus isolation between scope preview and radio input.

## Scope

- Parse `*WX 1` through `*WX 6` and spaced forms `* WX 1` through `* WX 6` as level toggles.
- Parse `*WX ALL` and `* WX ALL` as all-six-on.
- Parse `*WX OFF` and `* WX OFF` as all-six-off.
- Apply each valid action to the same `view.wxLevels` bitmask used by DCB and weather paint.
- Return incomplete status for bare/incomplete `*WX` input.
- Return `INV` for garbage such as `*WX 7` and `*WX FOO`, with no state mutation.
- Add focused preview and STARS command test rows for valid, incomplete, invalid, mutation, and scope/radio-isolation behavior.

## Out of scope

- DCB WX latches or PREF persistence; T02-70 owns them.
- BRITE WX/WXC; T02-72 owns them.
- SSA WX HIST, radio-line WX, BKC, AVL 2×3 restyle, wind, METAR, or pilot deviation.
- Command IR additions or radio command parsing.
- Weather fetch, decode, VIP binning, rendering, or OSM.
- Facility-specific behavior or `if (icao === "KDEM")`.

## Implementation notes

- Match existing parser result shapes and buffer handling. Do not prefix-match unrelated commands.
- Normalize optional spacing only for the explicit `*WX` forms; preserve existing command precedence and unknown-command rejection.
- Toggle exactly one indexed boolean for levels 1–6. `ALL` and `OFF` replace all six values atomically.
- Validate action before mutation. Invalid input leaves prior `wxLevels` unchanged.
- Keep parser behavior generic and data/state driven. No airport, scenario, or VIP-break branches.
- Add tests for both compact and spaced spellings, including exact incomplete and invalid outcomes.

## Acceptance criteria

- [ ] **AC1 —** `*WX 1` … `*WX 6` and `* WX 1` … `* WX 6` toggle corresponding WX levels.
- [ ] **AC2 —** `*WX ALL` / `* WX ALL` turns all six levels on; `*WX OFF` / `* WX OFF` turns all six levels off.
- [ ] **AC3 —** Bare/incomplete `*WX` returns incomplete status, not `INV`.
- [ ] **AC4 —** `*WX 7` and `*WX FOO` return `INV` and leave `view.wxLevels` unchanged.
- [ ] **AC5 —** Preview actions use same WX bitmask/state as DCB and weather paint, with no Command IR mutation.
- [ ] **AC6 —** Radio `DAL123 H270` remains isolated and still turns; no radio-line WX path is added.
- [ ] **AC7 —** Tests cover compact/spaced forms, toggles, ALL/OFF, incomplete input, invalid no-mutation behavior, and focus isolation.
- [ ] **AC8 —** Typecheck, lint, formatting, and test suite pass.

## Test plan

- Unit: `parsePreviewCommand` valid, incomplete, invalid, spacing, and precedence cases.
- Integration: apply preview actions to `view.wxLevels`, verify weather paint sees same state and invalid input does not mutate.
- UI acceptance: extend preview/STARS command rows while preserving radio command-line isolation.
- Regression: `npm run ci`.

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/previewArea.test.ts`
- `src/scope/starsCommands.integration.test.ts` (if existing command integration owns these rows)
- `src/ui/starsCommandsAcceptance.test.ts`
- Relevant ScopeView/weather-state tests
