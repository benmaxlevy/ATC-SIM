# T04-16 Inbound handoff state (spawn pending)

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-14 (default STAR pack exists)
**Blocks:** T04-17
**Launch:** Implement this ticket only. Do not start T04-17 UI or phase 5.

## Goal

Default STAR arrivals spawn as **not yours**: pending **inbound handoff** from a transferring sector. Radio commands that change intent are **rejected** until the track is owned. Authored demos (`kdem-ils27`) and the `?traffic=N` downwind bench stay commandable without a handoff.

## Context

T02-08 F3 is a **color stub** (unowned green FDB → owned white FDB). Radio already works on unowned tracks, so the student never has to take the airplane. Human ask: spawn untracked, **accept**, then they are yours.

CRC STARS analog (R07 `docs.virtualnas.net/crc/stars`): inbound handoff — datablock shows HO; **slew/click accepts**; owned FDB is **white**, other-TCP / unowned FDB is **green**. Trainer delta: one approach position; transferring sector is the literal id `C` (ARTCC analog), not a second networked TCP. Not NAS.

**Color judgement (frozen):** keep existing `PALETTE` grammar. Pending inbound stays `unowned` (green). Accept (T04-17) sets `owned` (white). Do **not** invert to “owned = green” (that would fight CRC and T02-08 tests). Human said “become green”; CRC owned-by-you is white. We follow CRC.

## Research

Cite **R07** CRC STARS “Accepting a Handoff” (slew the track). Cite **R01** 7110.65 radar identification / handoff (what *real* handoff means). Search: `CRC STARS accept handoff slew`, `7110.65 radar handoff`.

Code comment: analog CRC inbound HO + slew accept; trainer delta = spawn-pending from `C`, no second facility, no pointout.

## Scope

- Extend track/world (not Command IR) with inbound handoff state, e.g.

  ```ts
  type TrackHandoff =
    | { kind: "none" }
    | { kind: "inbound"; fromSectorId: string }; // default "C"
  ```

  Store on `ScopeTrack` and/or a `World` map keyed by aircraft id. Scope is allowed to own HO state if World stays kinematics-only — pick one and test it. Prefer **World** (or a small `handoff` module next to spawn) so radio can reject without importing scope.
- `createWorldFromScenario` / `createWorldForSession`:
  - `spawnPolicy === "star-inbound"`: each arrival gets `handoff.kind === "inbound"`, `fromSectorId === "C"`, `ownership === "unowned"`.
  - `spawnPolicy === "authored"` (`kdem-ils27`, downwind fixture): `handoff.kind === "none"`. Leave ownership as today (unowned color stub; radio still works).
  - `?traffic=N` downwind replacement: `handoff.kind === "none"`.
- Radio apply (`handleRadioText` / validate): if the resolved aircraft has **inbound pending**, reject with a stable reason (e.g. `handoff-pending`). No intent change. Log `command.rejected`. Do **not** invent a new Instruction type.
- Export a pure `isRadioCommandAllowed(handoff)` / `assertHandoffOwned` helper. Tests call it without Canvas.
- Session event (same PR as the union):

  ```ts
  | { type: "handoff.inbound.offered"; atSimMs: number; atWallMs: number; callsign: string; fromSectorId: string }
  ```

  Emit once per aircraft at spawn (not every tick). Comment: scope action later; not a Command.
- Do **not** implement click-to-accept here (T04-17). You may add `acceptInboundHandoff(world, aircraftId)` as a **pure helper** used by tests (sets owned + clears inbound + logs `handoff.inbound.accepted`) so T04-17 is UI wiring. If you add `handoff.inbound.accepted` in this ticket, include it in the union test.
- F3 INIT CNTL may still paint owned **without** clearing inbound — **wrong**. If F3 runs on a pending inbound track, treat it as accept (call the same helper) **or** leave F3 as color-only and let T04-17 own accept. Prefer: F3 on pending inbound **accepts** (CRC INIT CNTL / take track). Test it.
- Production spawn/handoff source: no `"NEMAX"` / `"DEM1"` branch.

## Out of scope

- Click/slew UI, flashing FDB, help-overlay line (T04-17).
- Pointout, redirect, refuse/recall HO, interfacility triangle, second TCP (T05-09).
- Tower Shift+H stub (already T04-12).
- CA 3 NM circles (CRC STARS CA is `CA` text + tone, **not** a halo; do not add).
- Phase 5 scoring. Command IR handoff instruction. Paid speech.

## Acceptance criteria

- [ ] **AC1 —** Given `loadKdem()` seed 1, when the default world is created, then all six arrivals have `handoff.kind === "inbound"`, `fromSectorId === "C"`, `ownership === "unowned"`.
- [ ] **AC2 —** Given that world, when `handleRadioText(..., "DAL123 H270")` runs **before** accept, then rejected (`handoff-pending` or documented reason), heading unchanged, `command.rejected` logged, no `command.accepted`.
- [ ] **AC3 —** Given `acceptInboundHandoff` (or F3-as-accept) on DAL123, when `handleRadioText(..., "DAL123 H270")` runs, then accepted, heading intent changes, FMS cancelled as today.
- [ ] **AC4 —** Given `loadKdemIls27()`, when created, then DAL123 and AAL45 have `handoff.kind === "none"` and `DAL123 H270` still applies (T04-12 script).
- [ ] **AC5 —** Given `createWorldForSession(loadKdem(), 30, 1)`, then 30 downwind aircraft have `handoff.kind === "none"`.
- [ ] **AC6 —** Spawn emits one `handoff.inbound.offered` per STAR-inbound arrival. Accept emits `handoff.inbound.accepted` (if helper lives here).
- [ ] **AC7 —** Automated tests for AC1–AC6. DOM-free for the helper/radio gate.
- [ ] **AC8 — Research:** comment cites CRC slew-accept + 7110.65 radar HO analog; trainer delta = spawn-pending from `C`, owned FDB stays white.

## Test plan

- Unit: helper allow/deny; spawn flags per policy.
- Integration: default kdem reject then accept then heading; ils27 still commands; traffic=30 none.
- Manual: none required (T04-17).

## Suggested files

- `src/core/handoff.ts` / `handoff.test.ts` (or `src/scenario/handoff.ts`)
- `src/core/events/types.ts` (+ existing union test)
- `src/scenario/spawn.ts` / `spawn.test.ts`
- `src/pilot/handleRadioText.ts` / validate
- `src/scope/ownership.ts` (F3 = accept if inbound pending)
- `tests/integration/heading-command.test.ts` (must stay on downwind fixture)
