# T02-52 INIT CNTL / TERM CNTL command-then-slew

**Phase:** 02 Scope (Preview Area addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-51
**Blocks:** T02-54
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

CRC Tracking Aircraft grammar for INIT CNTL / TERM CNTL on the T02-51 Preview Area buffer: command-then-slew, implied selected-track apply, and FLID + Enter, without turning F3 into NAS associate or F4 into `TERM CNTL ALL`.

## Context

R07 Tracking Aircraft: F3 **INIT CNTL**, type aircraft ID, slew; F4 **TERM CNTL** then slew, **or** F4 + callsign / beacon + Enter. Command Reference Table 19: `<INIT CNTL><FLID><SLEW>`, `<TERM CNTL><SLEW>`, `<TERM CNTL><FLID><ENTER>`. `<TERM CNTL>ALL<ENTER>` is out of scope.

Today F3 / F4 always-on apply only to `selectedTrackId` (`applyInitiateTrackToSelection` / `applyDropTrackToSelection`). T02-51 shipped the buffer and readout; this ticket wires the F-keys into that machine and reuses T02-49's arm-then-slew click path.

Trainer F3 remains a color / ownership stub (unowned green FDB → owned white FDB). F4 remains trainer drop (owned → unowned). Pending inbound + INIT CNTL still `acceptInboundHandoff`. Not NAS associate. Not terminate-all.

**Product law (frozen for this swarm):**

- Preview Area is **not** the radio command line. Radio stays `DAL123 H270` → Command IR. Scope commands never emit Command, readback, or intent.
- Reuse T02-49 command-then-slew: arm on the PPI, next target click applies, do not use `window.prompt` or a new HTML `<input>`. Esc cancels. Invalid commit shows a brief `INV` flash.
- Paint CRC mnemonics in SSA/preview green under the SSA (extend `drawChordHint` in `src/scope/renderScope.ts` around line 995). F3 shows `INIT CNTL`, not the string `"F3"`.
- Reject unknown CRC commands. Do not parse-and-no-op.
- **Skip all pointout commands this swarm** (`UN`, `**`, `(ID)*`, initiate/recall PO). Leave existing click / `UN` / `**` radio-buffer behavior untouched.
- F7 stays PTL ALL (not MULTIFUNC). F1 stays beaconator hold. `*` TPA/ATPA chords stay T02-49.
- No new hit-testing; reuse `pickAircraftAt` / `selectedTrackId`.
- Trainer F3 is still a color/ownership stub (not NAS associate). F4 is still trainer drop. Pending inbound + INIT CNTL still `acceptInboundHandoff`.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — Tracking Aircraft prose, Preview Area, Command Reference Table 18 (F3 = INIT CNTL, F4 = TERM CNTL) and Table 19 (tracking targets). Mirror T02-49 `starsChordArmed` + `src/scope/ppi.ts` / `src/scope/ppi.test.ts` `*J` arm tests.

- Search: `CRC STARS INIT CNTL TERM CNTL FLID slew tracking aircraft`
- **Terms:** INIT CNTL, TERM CNTL, FLID, AID, slew, preview area. Not Command IR, not NAS associate.
- Callsign rules: same as `resolveCallsign` in `src/pilot/handleRadioText.ts` (full callsign or numeric tail via `numericTail`) **plus** unique 4-digit squawk. Implement `resolveScopeFlid` in `src/scope` (or core). Do **not** import the radio parser or `@pilot` from `@scope`.

## Scope

**INIT CNTL (F3), always-on:**

1. Preview shows `INIT CNTL` (not `"F3"`).
2. **Command-then-slew:** F3 with no slewed track **arms**; next target click applies `applyInitiateTrack` to **that** track (pending inbound still `acceptInboundHandoff`). Like `starsChordArmed`: armed slew must not also run the normal click-accept path as a **second** effect, unless INIT CNTL on a pending inbound is exactly the accept+own — **one click**, same as current F3-on-selected-pending-inbound. Empty PPI click does **not** consume the arm.
3. **Implied form (keep current tests):** F3 while a track is already selected applies immediately to that selection (today's `applyInitiateTrackToSelection`). Preview may flash `INIT CNTL` then clear.
4. **F3 + ACID + Enter:** resolve FLID without slew. ACID = full callsign or numeric tail (same rules as `resolveCallsign`) **plus** unique 4-digit squawk. Unknown or ambiguous → `INV`, no apply. CRC also allows F3, type aircraft ID, then **slew** (`<INIT CNTL><FLID><SLEW>`); typed ACID then target click applies to the **clicked** track after resolving (or `INV` if the typed FLID does not uniquely match that track / any track).
5. Backspace edits typed ACID. Esc cancels armed INIT.

**TERM CNTL (F4), always-on:**

1. Preview shows `TERM CNTL` (not `"F4"`).
2. No selection → arm; next target click drops **that** track (`applyDropTrack`). Empty PPI click does not consume the arm. Armed slew must not also run a second click effect.
3. Selection → implied drop now (`applyDropTrackToSelection`). Preview may flash `TERM CNTL` then clear.
4. F4 + FLID + Enter drops that aircraft (`resolveScopeFlid`). Unknown / ambiguous → `INV`, no apply.
5. Do **not** implement `TERM CNTL ALL`.
6. Esc cancels armed TERM. Backspace edits typed ACID.

**Shared:**

- Update `KEY_BINDINGS` in `src/scope/keymap.ts` for F3 / F4 `action` (and `crcAnalog` if needed) to describe command-then-slew + FLID Enter. The help overlay renders that array — do not duplicate rows in JSX.
- Extend T02-51 `parsePreviewCommand` / `PreviewArmedAction` with INIT / TERM actions. Do not rewrite the state machine.
- PPI: mirror `src/scope/ppi.ts` `starsChordArmed` handling — `pickAircraftAt`, apply, clear arm, return. No new hit-testing.
- Radio: F3 / F4 already `preventDefault` in `src/ui/command-line.tsx` so Chrome find does not open and the keys do not type into radio. Keep that. Do not change `submitCommand`.

## Out of scope

- `TERM CNTL ALL`.
- Pointouts (`UN`, `**`, `(ID)*`, initiate / recall PO).
- Beacon `B` (T02-53).
- MULTIFUNC / F7 (F7 stays PTL ALL).
- NAS associate / beacon pairing / second facility.
- Changing radio `submitCommand` or Command IR.
- Help overlay rewrite beyond `KEY_BINDINGS` copy.
- Relocating the preview area.

## Implementation notes

Factor apply-to-id helpers if `applyInitiateTrackToSelection` / `applyDropTrackToSelection` stay as the implied-selected path: armed slew must target the **clicked** id, not whatever was previously selected. Pending inbound INIT is accept+own on that id via `acceptInboundHandoff` then `applyInitiateTrack` — one click.

`resolveScopeFlid` lives under `src/scope` (prefer `previewArea.ts` or a sibling). Duplicate full-callsign / numeric-tail matching (`FULL_CALLSIGN` / `SUFFIX_CALLSIGN` / `numericTail` semantics) plus unique 4-digit `squawk`. Do not import `@pilot` or the radio parser from `@scope`. A token that matches more than one aircraft (two tails, two squawks, or tail vs squawk) is ambiguous → `INV`.

Arm discriminator is `PreviewArmedAction` variants such as `{ type: "initCntl" }` / `{ type: "termCntl" }`, not F3-specific field names on `ScopeView`.

`TERM CNTL ALL` typed after F4 is `invalid` (INV flash), not a drop-all and not a no-op.

## Acceptance criteria

- [ ] **AC1 —** F3 paints `INIT CNTL` (not `"F3"`) in SSA/preview green under the SSA; F4 paints `TERM CNTL`. A live `*` chord still wins the hint if it is live.
- [ ] **AC2 —** F3 with no selection arms; the next target click owns **that** track (`applyInitiateTrack`), not a previously selected one; a second click does not re-apply; empty PPI click leaves the arm waiting. Armed INIT slew on a pending inbound is one click: `acceptInboundHandoff` + own (not a second normal click-accept).
- [ ] **AC3 —** F3 while a track is already selected still applies immediately (`applyInitiateTrackToSelection`); existing implied-select tests stay green. Preview may flash `INIT CNTL` then clear.
- [ ] **AC4 —** F3 + ACID + Enter resolves via `resolveScopeFlid` (full callsign, numeric tail, or unique 4-digit squawk) and initiates that aircraft with no slew. Unknown or ambiguous → brief `INV`, no apply. Typed ACID then slew follows `<INIT CNTL><FLID><SLEW>`. `@scope` does not import `@pilot`.
- [ ] **AC5 —** F4 pair: no selection arms, slew drops the clicked track; selection implies drop now; F4 + FLID + Enter drops the resolved aircraft. `TERM CNTL ALL` is invalid (INV), not drop-all. Esc cancels armed INIT / TERM; Backspace edits typed ACID.
- [ ] **AC6 —** Pending inbound F3 still accepts (`acceptInboundHandoff`) on implied-select and on armed slew of that inbound. `ownership.test.ts` stays green. Trainer F3 remains color/ownership stub (not NAS associate); F4 remains trainer drop.
- [ ] **AC7 —** No Command IR, readback, or intent from INIT / TERM. `DAL123 H270` still turns. Pointout click / `UN` / `**` radio-buffer behavior is untouched. F7 is still PTL ALL; `*` chords still T02-49.
- [ ] **AC8 —** F3 is initiate track, not Chrome find (`preventDefault` on always-on F3, including when radio is focused). `KEY_BINDINGS` F3 / F4 `action` text describes command-then-slew + FLID Enter; the help overlay still maps that array.

## Test plan

- Unit: `src/scope/previewArea.test.ts` — INIT / TERM parse, mnemonic, FLID Enter, INV, Esc, Backspace, `TERM CNTL ALL` invalid.
- Unit: `src/scope/scopeKeys.test.ts` — F3 / F4 arm vs implied, preventDefault, no Command, radio `DAL123 H270` still turns, F3 not typed into the command line.
- Unit: PPI armed path in `src/scope/ppi.test.ts` (mirror `*J` arm tests) — click applies to the hit track; miss leaves arm; pending inbound INIT is one accept+own click.
- Regression: `src/scope/ownership.test.ts` stays green; existing `starsChord` / F3 implied-select tests stay green.
- `npm test`.

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/previewArea.test.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/ppi.ts`
- `src/scope/ppi.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/keymap.ts`
- `src/scope/scopeKeys.test.ts`
- `src/scope/ownership.test.ts`
