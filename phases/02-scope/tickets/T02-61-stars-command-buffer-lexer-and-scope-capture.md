# T02-61 STARS Command Buffer Lexer & Scope Keystroke Capture

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-60
**Blocks:** T02-62, T02-63, T02-64, T02-65, T02-66
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide the unified STARS scope command buffer lexer and keystroke capturing pipeline for scope-focused interactions, accepting standard STARS key prefixes (`*` Multifunction, `+` Track Key, `/` Slew/Drop/PDB, and alphanumeric commands), displaying the live buffer in the Preview Area readout under the SSA, supporting `<Backspace>` editing, `<Esc>` cancellation to idle, and 1.5s `<buffer> INV` rejection flash on unrecognized tokens, with zero leakage into the bottom Radio Command Line (`command-line-input`).

## Context

In real FAA STARS consoles (R07) and vNAS CRC STARS, scope display and track manipulation commands are driven directly from the controller keyboard when the radar scope is focused. The Preview Area displays live typed characters and feedback mnemonics. Scope commands are completely decoupled from pilot radio communications and never produce pilot intent or radio readbacks.

## Research

- **Analog:** CRC STARS Preview Area / Command Reference (docs.virtualnas.net/crc/stars — R07). Key mappings: `<MULTI>` (`*`), `<TRK>` (`+`), `<ENTER>` (`Enter`), `<SLEW>` (`/` or direct canvas click).
- **Glossary:** Preview Area Buffer, Scope Focus, Multifunction Chord (`*`), Track Chord (`+`), Slew/Drop Key (`/`), Rejection Flash (`INV`).
- **Trainer delta:** Pure TypeScript state machine on `PreviewAreaState` and `handleScopeKeyDown`. Radio command line at the bottom (`command-line-input`) remains isolated. Tab continues cycling focus between PPI canvas and Radio input.

## Scope

- Expand `PreviewAreaState` and `parsePreviewCommand` in `src/scope/previewArea.ts` to tokenize multi-character command strings with prefixes (`*`, `+`, `/`, `Enter`).
- Standardize scope-focus keystroke handling in `src/scope/scopeKeys.ts`: when `scopeFocusFromDocument(doc) === "scope"`, alphanumeric and command prefix keys (`*`, `+`, `/`, letters, digits, spaces) buffer into `view.preview.buffer`.
- Format live preview readout under the SSA in `formatPreviewReadout`: display current typed buffer with blinking/fixed cursor representation or active mnemonic.
- Handle `<Backspace>` to remove trailing character (or clear buffer to idle when length reaches 0).
- Handle `<Escape>` to immediately cancel any live buffer or armed command to `idlePreviewArea()`.
- On `<Enter>`, evaluate `commitPreviewCommand(buffer)`: if unrecognized, transition to 1.5s rejection flash `<buffer> INV` via `rejectPreviewArea(state, nowMs)`.
- Ensure radio command line (`#command-line-input`) never receives scope command keys when scope has focus, and radio typing never modifies the preview buffer.

## Out of scope

- Specific execution of system list toggles (owned by T02-62).
- Specific execution of video map toggles (owned by T02-63).
- Scope display adjustments (owned by T02-64).
- Altitude filters / beacon codes (owned by T02-65).
- Target tracking / handoffs / datablock chords (owned by T02-66).

## Acceptance criteria

- [ ] **AC1 —** Typing with scope focus captures `*`, `+`, `/`, alphanumeric characters, and spaces into the Preview Area buffer.
- [ ] **AC2 —** Preview Area renders the live typed buffer text directly below the SSA on Canvas2D.
- [ ] **AC3 —** `<Backspace>` deletes characters from the buffer; `<Escape>` cancels and clears the buffer to idle immediately.
- [ ] **AC4 —** Unrecognized complete commands on `<Enter>` trigger a 1.5-second `<buffer> INV` rejection flash and auto-clear.
- [ ] **AC5 —** `<Tab>` key cleanly toggles keyboard focus between PPI canvas and `#command-line-input` without typing into either buffer.
- [ ] **AC6 —** Automated unit and keyboard routing tests prove key capture, editing, rejection flash, and focus isolation.

## Test plan

- Unit: `src/scope/previewArea.test.ts` (buffer lexer, backspace, escape cancel, invalid command rejection).
- Integration: `src/scope/scopeKeys.test.ts` (scope focus key routing, radio isolation, focus cycling).

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/previewArea.test.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/scopeKeys.test.ts`
- `src/scope/keymap.ts`
