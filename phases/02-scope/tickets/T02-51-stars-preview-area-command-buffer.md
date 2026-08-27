# T02-51 STARS Preview Area command buffer

**Phase:** 02 Scope (Preview Area addendum)
**Priority:** P0
**Size:** M
**Depends on:** none (base feature/stars-preview-area)
**Blocks:** T02-52, T02-53
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Ship the Preview Area command buffer (CRC analog of the area under the SSA) as **infrastructure**. No F3 / F4 behavior change yet — existing `applyInitiateTrackToSelection` / `applyDropTrackToSelection` tests must stay green.

The buffer is the typed-command surface CRC paints under the SSA. It is not the radio command line.

## Context

CRC STARS puts textual scope commands in the **Preview Area**, defaulted just below the SSA (R07 Preview Area; Command Reference). This trainer already has three on-PPI entry grammars: `FIL` altitude hundreds, `L1`–`L9` leader direction, and T02-49 `*` TPA/ATPA chords. None of those is the Preview Area. F3 / F4 today apply immediately to the selected track (`applyInitiateTrackToSelection` / `applyDropTrackToSelection` in `src/scope/trackDisplay.ts`) with no mnemonic under the SSA.

This ticket adds the machine, the readout, Esc cancel, and the backlog hole list. T02-52 fills INIT CNTL / TERM CNTL. T02-53 fills beacon. Do not steal F3 / F4 in this ticket.

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

Read **R07** `docs.virtualnas.net/crc/stars` — Preview Area, Tracking Aircraft, Command Reference (keys Table 18, tracking-targets Table 19).

- Search: `CRC STARS preview area INIT CNTL TERM CNTL command reference`
- **Terms:** preview area, SSA, INIT CNTL, TERM CNTL, FLID, slew. Not Command IR, not readback.
- Comment: the preview buffer is a scope display action surface; `DAL123 H270` remains the radio path.

## Scope

- New pure module `src/scope/previewArea.ts` (this name everywhere — parser, state helpers, tests, `ScopeView` field types).
- State on `ScopeView`:
  - `phase`: `idle` | `entry` | `armed`
  - live buffer string
  - CRC mnemonic readout (e.g. `INIT CNTL`)
  - optional FLID / ACID typed after a function key
  - `lastKeyAtMs`
  - rejection flash (`… INV`, same brief timeout as T02-49)
  - armed action discriminator — **generic**, not F3-specific. T02-52 fills INIT / TERM; T02-53 fills beacon. Export a `PreviewArmedAction` union that later tickets extend without rewriting the machine.
- `parsePreviewCommand(buffer: string): PreviewCommandResult` returning `{ kind: "incomplete" }`, `{ kind: "invalid", reason }`, or `{ kind: "action", action }`. T02-51 may only parse a **live prefix**, **Esc**, or **empty**. Leave an extension table (fixed-prefix map or equivalent) so T02-52 / T02-53 add actions without replacing the state machine. A buffer that is not a known live prefix and not empty is `invalid`, not a silent no-op.
- Entry: always-on F-keys are wired in T02-52. T02-51 must still **render** whatever is in the buffer / armed state (tests inject `entry` / `armed`). Esc on a live preview cancels.
  - Esc precedence: **live preview > live `*` chord > DCB**. A live preview Esc must not also cancel a `*` chord or close a DCB submenu in the same key. When preview is idle, existing `*` / DCB Esc order is unchanged.
- `drawChordHint` paints the preview readout when present, in SSA/preview green under the SSA (`PALETTE.ssa` / list BRITE, same as `*` chords). A live `*` chord hint still **wins** if a `*` chord is live (`formatStarsChordReadout` non-null paints first; preview does not replace it).
- Radio command line: F3 / F4 already `preventDefault` in `src/ui/command-line.tsx` — do not type function keys into radio. Do not add a second HTML `<input>`. Do not use `window.prompt`.
- **Same commit:** add a subsection under **Scope and display** in `phases/LATER-IMPLEMENTATION-BACKLOG.md` titled **STARS preview area — commands not parsed**. Do not duplicate the existing **Manual Inhibit Commands and Safety Inhibit Glyphs** (`<MULTI FUNC>`) subsection; extend it with a pointer to this new subsection.

  **Visible now (after this ticket):** `FIL` altitude chord, `L1`–`L9` leader, T02-49 `*` Table 36 TPA/ATPA chords, and this Preview Area buffer (readout + machine; F3 / F4 actions still the current selected-track stubs until T02-52).

  **Deliberately unparsed** CRC tables / commands — list them as later work, **not** as stubs this trainer accepts:

  - `TERM CNTL ALL`
  - typed TCP / `Δ` handoffs and recall
  - **all** pointouts (`UN` / `**` stay radio + click; do not add preview PO)
  - quicklook `Q`
  - scratchpad `Y` / `+` undo
  - per-track PTL `R`
  - per-track Mode C / MULTIFUNC `M` `C` `Y` (point at the existing MULTIFUNC subsection)
  - assigned / filed alt `MΔ` / `++`
  - beacon LDB `BE` / `BI`
  - leader-by-TCP / `L11` global typed
  - relocate preview / lists
  - typed range 6–256 and 1/3 NM steps
  - typed map ID
  - WX overlays
  - dual assoc / unassoc `FC`
  - TAB / VFR / COAST / CA / SIGN-ON / TOWER / CRDA lists
  - RBL `*T` / min-sep / `.find` `.center` `.rings`
  - GI / ATIS `S` type-in
  - FP dump `D`
  - consolidation
  - coordination
  - TDM
  - CRDA Table 26
  - CA `K` / force SPC
  - highlight remains middle-click (T02-37)

  **Constraints later work must keep:** never Command IR; `*` chords remain T02-49; radio line unchanged; reject unknown rather than no-op; data-first catalog; self-hosted speech.

## Out of scope

- F3 / F4 grammar change (still selected-track initiate / drop). T02-52 owns that.
- Beacon `B` (T02-53).
- Pointouts (`UN`, `**`, `(ID)*`, initiate / recall PO).
- Help overlay rewrite (KEY_BINDINGS copy for F3 / F4 is T02-52).
- Command IR, readback, or intent.
- `TERM CNTL ALL`, NAS associate, MULTIFUNC, relocating the preview area.

## Implementation notes

Keep `parsePreviewCommand` a pure string function so the extension table is table-driven. T02-51's table is only “empty / live prefix / else invalid.” Do not special-case F3 in the discriminator.

Wire Esc on `handleScopeKeyDown` when preview `phase` is `entry` or `armed` **before** `*` chord Esc and before `handleDcbEscape`. Do not change F3 / F4 branches in `src/scope/scopeKeys.ts` in this ticket.

`createScopeView` initializes preview state to idle / empty / no armed action / no rejection. Injected `entry` / `armed` must round-trip through `drawChordHint` without throwing.

Reuse the T02-49 INV flash shape (`buffer + " INV"`, auto-clear on the existing chord timeout). Invalid is visible; it is not a parse-and-no-op.

## Acceptance criteria

- [ ] **AC1 —** `ScopeView` holds preview `idle` | `entry` | `armed`, live buffer, CRC mnemonic readout, optional FLID / ACID, `lastKeyAtMs`, rejection flash, and a generic `PreviewArmedAction` discriminator. `parsePreviewCommand` returns `incomplete` | `invalid` | `action`; T02-51 only accepts empty / live prefix, and unknown complete input is `invalid` (not a silent no-op). The extension table is the place T02-52 / T02-53 add actions.
- [ ] **AC2 —** Injected `entry` / `armed` state paints the CRC mnemonic (and buffer / FLID when present) in SSA/preview green under the SSA via `drawChordHint`. F3's mnemonic is `INIT CNTL` when tests put that string on the readout — never the literal `"F3"`.
- [ ] **AC3 —** Esc on a live preview cancels to idle, clears buffer / armed / mnemonic, and does not also cancel a live `*` chord or a DCB submenu. Precedence is live preview > live `*` chord > DCB.
- [ ] **AC4 —** A live `*` chord still paints (`*J3`, armed `*J`, `*D INV`); preview readout does not replace it while `formatStarsChordReadout` is non-null.
- [ ] **AC5 —** F3 / F4 behavior is unchanged: selected unowned → owned / owned → unowned via `applyInitiateTrackToSelection` / `applyDropTrackToSelection`; no selection remains a no-op (no arm). Existing ownership / `scopeKeys` F3 tests stay green.
- [ ] **AC6 —** No Command IR, readback, or intent from the preview buffer. `DAL123 H270` still turns. Function keys still `preventDefault` on the radio line and do not insert into that `<input>`. No `window.prompt`, no new HTML `<input>`.
- [ ] **AC7 —** `phases/LATER-IMPLEMENTATION-BACKLOG.md` has **STARS preview area — commands not parsed** under Scope and display, listing the visible surfaces and the unparsed CRC commands above, pointing at MULTIFUNC rather than duplicating it, and recording highlight as middle-click (T02-37). Constraints: never Command IR; `*` chords remain T02-49; radio unchanged; reject unknown; data-first catalog; self-hosted speech.
- [ ] **AC8 — Research:** `previewArea.ts` module comment cites R07 Preview Area + Command Reference, states the buffer is display-only (not the radio line), and records that INIT / TERM actions arrive in T02-52 and beacon in T02-53.

## Test plan

- Unit: `src/scope/previewArea.test.ts` — idle/entry/armed, parse empty / prefix / invalid, Esc cancel, INV flash, format readout (`INIT CNTL` not `"F3"`).
- Unit: extend `src/scope/scopeKeys.test.ts` — Esc on injected live preview cancels preview first; existing F3 / F4 always-on tests still green.
- Unit: `drawChordHint` / render — injected preview paints; live `*` chord still wins.
- Regression: existing `starsChord` tests and `scopeKeys` F3 tests stay green.
- `npm test`.

## Suggested files

- `src/scope/previewArea.ts` (new)
- `src/scope/previewArea.test.ts` (new)
- `src/scope/scopeView.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/renderScope.ts`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
