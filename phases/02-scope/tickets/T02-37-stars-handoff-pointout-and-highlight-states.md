# T02-37 STARS handoff blinking states, pointout indicators, and cyan track highlight

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-08, T02-34, T02-36, T04-16, T04-17
**Blocks:** T02-38
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align handoff animations, pointout indicators, and track highlight styling with STARS CRC:
- **Inbound Handoff**: FDB **blinks white** on the receiving controller's screen. Slew/click accepts handoff, turning the datablock **solid white** and updating the position symbol to the receiving controller's sector ID.
- **Outbound Accepted Handoff**: When accepted, the target's position symbol updates to the receiving controller's ID, and the datablock **blinks white for 5 seconds** on the sender's display. Clicking stops blinking; clicking again turns datablock green; clicking a third time collapses FDB to PDB.
- **Pointouts (`PO`)**:
  - Outgoing pointout: Displays `CALLSIGN PO <TCP>` on Line 1.
  - Incoming pointout: Renders a **blinking Yellow FDB** (`#FFFF00`) with `PO` on Line 1.
  - Accepting pointout: Slew/click stops blinking and removes `PO`, leaving datablock in solid yellow until clicked back to green.
  - Rejecting pointout: Typing `UN` + click rejects, displaying a flashing `UN` on sender's display.
  - Converting pointout: Entering `**` + click accepts the pointout as a handoff (transfers track ownership).
- **Track Highlighting**: Middle-clicking a target toggles **Cyan highlight** (`#00FFFF`) on the datablock, replacing the non-standard yellow selection bounding box.

## Context

In our current implementation, inbound handoffs are marked with a static `DAL123 HO` cue in green, and selection uses an artificial yellow bounding box. STARS CRC uses white blinking for handoff transfers, yellow blinking for pointouts, and cyan highlighting for targeted tracks.

## Research

Read **docs.virtualnas.net/crc/stars** (Handoffs, Point Outs, Highlighting a Data Block).
- Search: `STARS handoff blinking white pointout PO UN cyan highlight middle click`
- **Terms:** **inbound handoff**, **outbound handoff**, **point out**, **PO**, **UN**, **highlighted data block**.
- Comment: Inbound handoffs blink white; accepted outbound handoffs flash white for 5s; pointouts show yellow PO; middle click toggles cyan highlight.

## Scope

- Implement handoff visual state machine in `ownership.ts` / `renderScope.ts`:
  - Inbound pending: Blinking white FDB at ~1 Hz (e.g. 500ms on / 500ms off) or pulsing white.
  - Outbound accepted: Flash white for 5 seconds ($5000\text{ ms}$) on sender's scope, then transitions to steady on click.
- Implement Pointout state machine in `handoff.ts` / `ownership.ts`:
  - `pointout.incoming`: Blinking yellow FDB with `PO` tag.
  - `pointout.accepted`: Solid yellow FDB.
  - `pointout.rejected`: Flashing `UN` tag on sender display.
- Replace yellow selection box with standard STARS **Cyan highlight** (`PALETTE.highlight = "#00FFFF"`) triggered via middle-click or selection toggle.
- Slew/click interactions:
  - Click pending inbound handoff $\rightarrow$ accept handoff (solid white FDB + owning sector symbol).
  - Click incoming pointout $\rightarrow$ accept pointout (solid yellow FDB).
  - Click accepted pointout $\rightarrow$ revert to standard green.

## Out of scope

- Multi-user network synchronization across separate browser clients.
- Automated inter-facility coordination list window integration.

## Implementation notes

- Modify `src/scope/ownership.ts`, `src/scope/renderScope.ts`, `src/scope/palette.ts`, `src/scope/scopeKeys.ts`, `src/core/handoff.ts`.
- Add test coverage in `src/scope/ownership.test.ts`, `src/scope/renderScope.test.ts`, `src/core/handoff.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** Inbound handoff displays as a blinking white FDB; slewing/clicking accepts and turns it solid white.
- [ ] **AC2 —** Outbound accepted handoff flashes white for 5 seconds before settling.
- [ ] **AC3 —** Incoming pointout displays as a blinking yellow FDB with `PO` tag on Line 1.
- [ ] **AC4 —** Slewing/clicking an incoming pointout accepts it into a solid yellow FDB.
- [ ] **AC5 —** Middle-click or highlight action renders datablock in cyan (`#00FFFF`).
- [ ] **AC6 —** Automated tests verify timing, color transitions, and click state transitions.

## Test plan

- Unit tests for handoff and pointout animation states based on `simTimeMs`.
- Unit tests for click handling on pending handoffs, pointouts, and cyan highlighting.
- Visual inspection on PPI verifying clean blinking cadence and color fidelity.

## Suggested files

- `src/scope/ownership.ts`
- `src/scope/ownership.test.ts`
- `src/scope/palette.ts`
- `src/scope/renderScope.ts`
- `src/core/handoff.ts`
- `src/core/handoff.test.ts`
