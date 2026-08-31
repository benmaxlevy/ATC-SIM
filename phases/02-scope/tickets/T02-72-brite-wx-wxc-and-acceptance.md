# T02-72 BRITE WX/WXC and WX Mosaic Acceptance

**Phase:** 02 Scope (WX mosaic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-70 DCB WX Levels and PREF, T02-71 Preview `*WX` Commands
**Blocks:** None
**Launch:** Implement this ticket only after T02-70 and T02-71 are merged.

## Goal

Enable BRITE WX and WXC controls for the shipped display-only WX mosaic, paint VIP fills and band contours with their stored intensity settings, then close the addendum with cross-layer acceptance coverage and documentation.

## Context

This is the Twenty-first swarm: live IEM N0Q → VIP 1–6, display only. T02-68 fetches and bins IEM N0Q; T02-69 paints VIP masks beneath tracks; T02-70 adds DCB WX latches/PREF v3; T02-71 adds scope-preview `*WX` commands. This ticket wires BRITE controls into that completed path.

`src/scope/palette.ts` currently lists `wx`, `wxc`, and `bkc` in `BRITE_DISABLED_CHANNELS`. The BRITE grid in `DisplayControlBar` currently shows WX/WXC/BKC with `disabled: true` and `staticVal: "100"`. Move only `wx` and `wxc` to `BRITE_PAINT_CHANNELS`, remove their static values, and route changes through existing `applyBrite`/`stepBriteChannel`. Leave BKC disabled and stored no-op.

WX fills use VIP masks. WXC strokes VIP band contours, tinted by `brite.wxc`. Weather remains display-only. No SSA WX/WX HIST, BKC, AVL 2×3 restyle, wind, METAR, or pilot deviation through `vipAtNm`.

## Research

- `src/scope/palette.ts` channel registries and `applyBrite`.
- `src/ui/DisplayControlBar.tsx` BRITE grid, `stepBriteChannel`, and `renderPhysicalMain`.
- T02-69 weather-layer cache, paint ordering, VIP masks, and trainer fill contract.
- T02-70 `view.wxLevels`/PREF v3 and T02-71 preview command contract.
- Existing DCB, preview, BRITE, paint, OSM, and scope acceptance tests.
- Current documentation in `phases/02-scope/README.md`, `phases/LATER-IMPLEMENTATION-BACKLOG.md`, and `phases/_shared/non-goals.md`.

## Scope

- Move `wx` and `wxc` from `BRITE_DISABLED_CHANNELS` to `BRITE_PAINT_CHANNELS`.
- Remove `staticVal` for WX and WXC; wire both controls to `stepBriteChannel`.
- Apply `brite.wx` to WX VIP fill intensity through existing BRITE behavior.
- Paint WXC VIP band contours using `brite.wxc`.
- Keep `bkc` disabled, static/stored as existing no-op behavior.
- Add combined acceptance coverage for DCB WX, preview `*WX`, BRITE WX/WXC, cached paint, display-only behavior, and default levels off.
- Retain OSM/openstreetmap bans and no-facility-id-branch checks.
- Update `phases/02-scope/README.md`:
  - Add T02-68–72 addendum table marked “Shipped after this ticket”.
  - Update “Weather mosaic | Phase 4+” row.
  - Change DCB checklist text from “still no weather mosaic” to “WX VIP mosaic shipped; BKC/HIST/deviate still later.”
- Update `phases/LATER-IMPLEMENTATION-BACKLOG.md`:
  - Remove item 5 (`* WX` commands) from deferred preview list.
  - Update DCB disabled-chrome wording: WX cells are live; VOL/MODE/SITE remain disabled.
  - Add leftover subsection covering SSA WX HIST, BKC, AVL badge, and pilot deviate via `vipAtNm`.
- Update `phases/_shared/non-goals.md` only as needed to confirm T02-69's weather-mosaic lift; do not re-forbid shipped mosaic behavior.

## Out of scope

- BKC enablement or paint.
- SSA WX/WX HIST, weather history, wind, METAR, or pilot deviation.
- AVL 2×3/half-height layout changes.
- Radio-line WX or Command IR.
- IEM fetch/decode/VIP binning, DCB/PREF schema, or preview parser changes except acceptance wiring.
- OSM, facility-specific branches, or `if (icao === "KDEM")`.
- Network access in CI or invented visual passes.

## Implementation notes

- Keep channel registration data-driven; no facility or scenario branch.
- Use stored BRITE values and existing `applyBrite` semantics. WX/WXC must no longer be rendered as static 100 controls.
- Preserve all-off default: six `wxLevels` false means no WX/WXC paint.
- Keep WXC contour generation cached with weather geometry; no decode, fetch, JSON parse, or geometry rebuild per frame.
- Keep paint order maps → weather → tracks.
- Amend existing tests that assert WX is disabled so they assert WX/WXC latch/paint behavior. Keep BKC-disabled assertions and OSM bans.
- Manual leftover is Chrome KATL live IEM walk. If no visual operator is available, record skip with reason. Do not invent a visual pass.

## Acceptance criteria

- [ ] **AC1 —** BRITE WX and WXC are paint channels, have no static value, and step through `stepBriteChannel`/`applyBrite`.
- [ ] **AC2 —** BRITE WX changes VIP fill intensity; BRITE WXC changes VIP contour tint/intensity.
- [ ] **AC3 —** BKC remains disabled and stored no-op.
- [ ] **AC4 —** DCB WX latches, preview `*WX` actions, and BRITE controls operate on one display-only weather path with default WX levels off.
- [ ] **AC5 —** WX paint remains cached and ordered maps → weather → tracks; no per-frame fetch/decode/JSON parse/geometry rebuild.
- [ ] **AC6 —** Acceptance tests cover DCB, preview, BRITE, VIP fill/contour paint, invalid/no-mutation behavior, default-off state, and no Command IR mutation.
- [ ] **AC7 —** OSM/openstreetmap bans remain; no facility-id branch or per-facility VIP bins are introduced.
- [ ] **AC8 —** README, backlog, and non-goal documentation accurately describe shipped WX VIP mosaic and remaining SSA WX HIST/BKC/AVL/deviate work.
- [ ] **AC9 —** Manual KATL live-IEM walk is performed or skipped with an explicit reason; no visual pass is invented.
- [ ] **AC10 —** `npm test` and full CI checks pass.

## Test plan

- Unit: BRITE channel registration, stepping, `applyBrite`, WX fill intensity, and WXC contour tint.
- Integration: DCB latch → `wxLevels` → preview equivalence → BRITE state → cached weather paint.
- Acceptance: amend `DisplayControlBar.test.ts`, `dcbAddendumAcceptance.test.ts`, `tcwVisualAcceptance.test.ts`, and `dcbPhysicalReplicaAcceptance.test.ts`; retain OSM guards.
- Documentation: verify README addendum, backlog removal/update, and non-goal wording.
- Regression: `npm run ci` / `npm test` per repository gate.
- Manual: Chrome KATL live IEM walk, or skip with reason if no visual operator.

## Suggested files

- `src/scope/palette.ts`
- `src/ui/DisplayControlBar.tsx`
- Weather layer established by T02-68/T02-69
- `src/ui/DisplayControlBar.test.ts`
- `src/ui/dcbAddendumAcceptance.test.ts`
- `src/ui/tcwVisualAcceptance.test.ts`
- `src/ui/dcbPhysicalReplicaAcceptance.test.ts`
- `phases/02-scope/README.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
- `phases/_shared/non-goals.md`
