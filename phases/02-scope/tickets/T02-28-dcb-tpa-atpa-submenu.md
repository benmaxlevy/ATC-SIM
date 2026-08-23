# T02-28 DCB TPA / ATPA submenu (trainer subset)

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-25
**Blocks:** T02-30
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

AUX **TPA/ATPA** opens a real submenu: **TPA** J-rings (mileage circles) work. **ATPA** cells exist as a **thin stub** (toggles/state only, or disabled). No pairing engine, no 3 NM CA halo (T04-09 CA stays datablock text).

## Context

T04-16/17 notes: CRC 3 NM circles are **TPA J-rings** (`*J`) or ERAM DRI, **not** STARS CA. This ticket is the J-ring display path. We do not have ATPA in-trail pairing; do not fake an FAA ATPA algorithm.

T02-25 may have shipped a DONE-only stub opener — replace it.

## Research

Read **R07** TPA / J-ring / ATPA (CRC). T04-09 CA lite (no halo).

- Search: `STARS TPA J-ring ATPA DCB CRC`
- **Terms:** **TPA**, **J-ring**, **ATPA**. Not CA circle, TCAS, proximity bubble.
- Comment: analog CRC TPA rings; ATPA is trainer stub; CA remains text (T04-09).

## Scope

- Submenu from AUX: replace stub.
  - **TPA** — toggle draw of a range circle about the **selected** track (if none selected: all **owned** tracks, or none — pick one, test it). Frozen radii **2 / 3 / 5 / 10** NM spinner (include 3 NM). Stroke uses TLS/tools color, not CA red.
  - **TPA MI** (or mileage cell) — spinner for that radius.
  - **ATPA** — one master toggle that may draw **nothing** yet, **or** a disabled cell labeled ATPA. Optional extra disabled cells: CONES, MONITOR, ALERT. Store booleans for PREF later; do not compute in-trail pairs, do not flash cones.
  - **DONE**
- Geometry: circle in world NM via existing camera `nmToScreen`; clip like range rings. Not a sprite.
- Do **not** change T04-09 CA (no 3 NM circle on conflict). TPA 3 NM is controller-selected, always display-only.
- Clicks never emit Command IR. Scope-only state on `ScopeView` / track display, not `Aircraft.intent`.

## Out of scope

- Real ATPA (approach sequence, cones, aural). ERAM DRI. CA halos. `*J` keyboard chord unless you have spare time and F1 — not required (DCB is enough).

## Implementation notes

```ts
tpa: { on: boolean; radiusNm: 2 | 3 | 5 | 10; /* target: "selected" | "owned" */ }
atpa: { on: boolean } // stub
```

Pure `tpaRingPoints` or reuse map-ring circle helper at track position.

## Acceptance criteria

- [ ] **AC1 —** TPA on + selected track draws a circle of the chosen radius (unit: 3 NM at known x/y → screen radius matches camera scale).
- [ ] **AC2 —** Radius spinner 2/3/5/10 changes that radius. Default documented (suggest 5 NM off).
- [ ] **AC3 —** ATPA is disabled **or** a no-op toggle with no pairing / no cones painted (test: no extra stroke when ATPA on if stub).
- [ ] **AC4 —** CA lite still has **no** automatic 3 NM halo (existing T04-09 tests stay).
- [ ] **AC5 —** No Command IR. `DAL123 H270` still works.
- [ ] **AC6 — Research:** TPA/J-ring comments; CA is not a circle.

## Test plan

- Unit: ring radius in NM vs camera; stub ATPA paints nothing.
- Integration: AUX submenu markup; CA tests still green.
- Manual: none required (T02-30).

## Suggested files

- `src/scope/tpa.ts` (new)
- `src/scope/tpa.test.ts`
- `src/scope/renderScope.ts`
- `src/scope/scopeView.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/scope/dcbFunctions.ts`
