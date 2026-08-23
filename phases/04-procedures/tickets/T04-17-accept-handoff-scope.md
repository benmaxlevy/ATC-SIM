# T04-17 Accept inbound handoff (scope)

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-16
**Blocks:** none
**Launch:** Implement this ticket only. Do not start phase 5 or CA halos.

## Goal

The student **accepts** a pending inbound handoff the CRC way: **slew/click the track**. Position/FDB become **owned (white)**. Help overlay documents it. STAR check-ins wait until the track is owned.

## Context

T04-16 puts default STAR arrivals in `handoff.kind === "inbound"` and rejects radio until accept. This ticket is the glass: CRC STARS “To accept the handoff, simply slew the track.” Datablock turns **white**; position symbol becomes yours.

Existing click selects (T01-11 / T02). **Judgement:** first click on a **pending inbound** track **accepts** (and selects). Further clicks keep today’s select / FDB toggle behavior. Not a Command. Not a readback.

**Check-in:** real TRACON checks in **after** you take the HO. T04-15 currently fires 3–8 s after spawn. Change drain: if inbound pending, **do not** speak/log `radio.checkin`; keep the due time; fire on the first drain after accept (even if due is in the past). Heading-cancel-before-due skip still applies.

## Research

R07 CRC STARS — Accepting a Handoff (slew). R07 datablocks: owned **white**, other-TCP **green**. Search: `CRC STARS accept handoff`, `CRC STARS datablock owned white`.

CA 3 NM **circles:** CRC STARS STCA paints blinking **`CA`** in the datablock + tone, **not** a 3 NM halo. 3 NM circles in CRC are **TPA J-rings** (manual `*J`) or **ERAM DRI** (QP, 5 NM / gapped 3 NM) — different system, not CA. **Do not draw CA circles.**

Comment: analog CRC slew-accept; trainer delta = click = accept+select; owned white (not human-said green).

## Scope

- Click/slew handler: if track `handoff.kind === "inbound"`, call `acceptInboundHandoff` then select. If `kind === "none"`, keep current select-only.
- After accept: `ownership === "owned"` (white FDB/leader via existing `trackPaintColor`). Clear inbound. Event `handoff.inbound.accepted`.
- Pending inbound visual (pick one, test it):
  - FDB first line or scratchpad-like field shows `C` / `HO` (transferring sector), **or**
  - FDB blinks on a 1 s sim cadence until accepted.
  - Do not use CA red/yellow. Do not invert PALETTE.
- Keyboard overlay / F1 help: one line, e.g. `CLICK accept inbound handoff (CRC slew analog)`. Not NAS.
- Check-in queue: pending inbound → skip fire; after accept, fire if due ≤ now and still PROCEDURE+VIA. No second check-in. Still no `Math.random`.
- Null SpeechPort: status line + event still after accept.
- `kdem-ils27` / `?traffic=N`: no inbound HO, click remains select-only, check-in (ils27 VIA) still uses T04-15 timing (already owned-or-none so unchanged).
- Typed `DAL123 H270` after accept still turns and **cancels** FMS.

## Out of scope

- Pointout, reject HO (`UN`), redirect, range-ring-center accept command, HO tone (P2).
- Second TCP / F6 (T05-09). Tower Shift+H.
- CA/MSAW geometry change. **No 3 NM CA halo.**
- Phase 5 scoring of `handoff.inbound.*` (emit only).

## Acceptance criteria

- [ ] **AC1 —** Given default `loadKdem()` world, when the student clicks DAL123’s target/FDB, then inbound clears, `ownership === "owned"`, `trackPaintColor` is `PALETTE.owned` (white), `handoff.inbound.accepted` logged once.
- [ ] **AC2 —** Given pending inbound, when radio `DAL123 H270` is issued after that click, then accepted and aircraft turns. Before the click, still rejected (T04-16).
- [ ] **AC3 —** Given pending inbound, when check-in due elapses **before** accept, then no `radio.checkin` / no TTS. After accept, one check-in fires (status line + event). Heading before due still skips.
- [ ] **AC4 —** Given ils27, when clicking DAL123, then select only (no extra `handoff.inbound.accepted` unless you no-op). T04-12 commands still work without a prior click.
- [ ] **AC5 —** Help overlay contains an accept-handoff line. `src/parse` and `src/scope` still do not emit check-in text as a Command.
- [ ] **AC6 —** Automated tests for AC1–AC4 (jsdom click or extracted click handler). No Canvas pixel assert required.
- [ ] **AC7 — Research:** comment cites CRC slew-accept + owned white; notes CA halo **not** drawn because CRC STARS CA is text, not a 3 NM circle.

## Test plan

- Unit: click handler accept vs select; check-in hold-until-owned.
- Integration: default pack click → owned → heading; ils27 unchanged.
- Manual leftover: `npm run dev` — green FDBs with HO cue, click one → white, then `DAL123 H270`.

## Suggested files

- `src/scope/` click / pick / renderScope (HO cue)
- `src/scope/keymap.ts` / help overlay copy
- `src/pilot/checkinQueue.ts` / `checkinQueue.test.ts`
- `src/app/create-app.ts` / `create-app.test.ts`
- `src/core/handoff.ts` (consume T04-16 helper)
