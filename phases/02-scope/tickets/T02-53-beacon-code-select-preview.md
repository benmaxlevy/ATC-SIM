# T02-53 Beacon code select from Preview Area

**Phase:** 02 Scope (Preview Area addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-51
**Blocks:** T02-54
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Give the operator CRC Table 30 **beacon code select** through the T02-51 Preview Area buffer. The paint path already exists: `view.beaconSelectCodes` makes unassociated targets whose squawk matches the list render □ (T02-34 / `targetSymbol`). There is no operator entry today — tests poke the array. Wire these preview commands:

| Entry | Action |
| --- | --- |
| Scope-focus `B` then two digits | Toggle a beacon **CODE BLOCK** (any squawk starting with those two digits) |
| Scope-focus `B` then four digits | Toggle a **discrete** code |
| `B` + Enter with incomplete digits | Invalid `INV` |

Toggle means add if absent, remove if present. This is a **display filter**, not a per-track action: it does not require a slewed track.

Radio-focused `B` stays a literal character (never always-on). Do not steal callsign typing.

## Context

This is the Fifteenth Swarm (STARS Preview Area). T02-51 ships the Preview Area command buffer and `parsePreviewCommand` extension table. T02-52 owns F3 INIT CNTL / F4 TERM CNTL. This ticket adds only Table 30 `B(##)` / `B(####)`.

Frozen product law for this swarm:

- **Preview Area is not the radio command line.** Radio stays `DAL123 H270` → Command IR. Scope commands never emit Command, readback, or intent.
- No `window.prompt` and no extra HTML `<input>`. Reuse the T02-51 buffer (same command-then-slew grammar as T02-49 for other preview actions). Esc cancels. Invalid commit shows a brief `INV` flash.
- Reject unknown CRC commands. Do not parse-and-no-op.
- Skip **all** pointout commands this swarm (`UN`, `**`, `(ID)*`, initiate/recall PO). Leave existing click/`UN`/`**` radio-buffer behavior untouched.
- `*` TPA/ATPA chords stay T02-49. F7 stays PTL ALL (not MULTIFUNC). F1 stays beaconator hold. F3/F4 stay T02-52.

If T02-51's backlog subsection **STARS preview area — commands not parsed** listed beacon select as unparsed, this ticket updates that subsection in the same change: `B##` / `B####` are now parsed; `BE` / `BI` and assign-code (`M ####`) remain later. Do not delete other backlog rows.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — Command Reference, Table 30 Beacon Codes, plus Tracking Aircraft / LDB prose on the square position symbol.

- Search: `CRC STARS command reference beacon code select B## B####`
- **Terms:** beacon code select, CODE BLOCK, discrete code, Preview Area. Not Command IR, not readback, not NAS assign-code.
- Comment: `B##` / `B####` are scope display filters; `DAL123 H270` remains the radio path. F1 beaconator already covers hold-all reported-code readout.

## Scope

- Extend T02-51 `parsePreviewCommand` with beacon-select actions. Do **not** rewrite the preview state machine.
  - Discriminated results stay `{ kind: "incomplete" }` / `{ kind: "invalid", reason }` / `{ kind: "action", action }`.
  - New actions: toggle CODE BLOCK (two-digit string) and toggle discrete code (four-digit string).
- Entry surface:
  - `B` with the PPI focused begins preview entry. Subsequent digits append. Enter commits, Esc cancels, Backspace edits.
  - Because `B45` is a live prefix of `B4501`, do **not** auto-commit at two digits. Enter after exactly two digits commits the block. Four digits may auto-commit (no further digit is legal). Enter with 0, 1, or 3 digits is `invalid` (`INV`), not a silent no-op.
  - Non-digit after `B` (other than Enter / Esc / Backspace) is `invalid`, not a parse-and-no-op.
- Dispatch mutates `view.beaconSelectCodes`: add the token if absent, remove it if present. Store `"45"` for a block and `"4501"` for a discrete code. Matching: a two-character entry matches any squawk that **starts with** those digits; a four-character entry matches that squawk exactly. Both may coexist in the array.
- Does not require a slewed track. Empty PPI click does not apply or consume a `B` command.
- Radio-focused `B` is a literal character and opens nothing. `B` is **scope-focus only** (never always-on).
- `targetSymbol` / render still own □ vs `*`. Touch `targetSymbol.ts` only if the current exact `includes(squawk)` matcher cannot honor two-digit prefix blocks; do not restyle the square.

## Out of scope

- Any Command IR, readback, intent, or radio effect.
- `BE` / `BI` LDB beacon-code inhibit.
- `B` + slew to show reported/assigned codes on an associated track (F1 beaconator already covers hold-all readout).
- Assigning a code to a flight plan (`M ####` / `M(####)`).
- F3 / F4 grammar (T02-52). Pointouts. MULTIFUNC. SSA CODES line paint (still not a live SSA field).
- Rewriting the T02-51 state machine or the T02-49 `*` chord parser.

## Implementation notes

Keep the new parse rows in the T02-51 table so they become table-driven tests. Prefix ambiguity is the same class as T02-49 `*D` vs `*DE`: a two-digit buffer is a complete block **and** a live prefix of a discrete code, so only Enter (or a fourth digit) decides.

`B` must not fight `*` chords, F3/F4 preview mnemonics, or DCB Esc. Precedence stays T02-51: live preview > live `*` chord > DCB when the preview buffer is the live `B…` entry.

Do not import `@pilot` or the radio parser from `@scope`.

## Acceptance criteria

- [ ] **AC1 —** Scope-focus `B45` (two digits, then Enter) toggles CODE BLOCK `"45"` on `view.beaconSelectCodes`; any unassociated squawk starting with `45` renders □ via `targetSymbol`. A second `B45` removes the block and those targets return to `*`.
- [ ] **AC2 —** Scope-focus `B4501` toggles discrete `"4501"`; a matching unassociated target renders □; a second `B4501` removes it. `B4500` does not toggle `"4501"`.
- [ ] **AC3 —** `B` + Enter with incomplete digits (bare `B`, one digit, or three digits) is `INV`; the select list is unchanged. Unknown/non-digit follow-ons reject, not parse-and-no-op.
- [ ] **AC4 —** Radio-focused `B` is not consumed as a preview command (literal character; callsign typing still works). `B` is not always-on.
- [ ] **AC5 —** No Command IR from any `B` sequence. `DAL123 H270` still turns. `*J` still works. F1 stays beaconator; F7 stays PTL ALL; F3/F4 stay T02-52.
- [ ] **AC6 — Research:** module comment cites R07 Table 30, states `B##` / `B####` are display-only filters, and records that `BE`/`BI` and assign-code remain deferred. Backlog subsection updated (`B##`/`B####` parsed; `BE`/`BI` and `M ####` still later) without deleting other rows.

## Test plan

- Unit: extend the T02-51 `parsePreviewCommand` table — `B45`, `B4501`, incomplete Enter, toggle twice, radio `B` not parsed as scope.
- Unit / render: `targetSymbol` or `renderScope` with `beaconSelectCodes` after a toggle (block prefix and discrete). Unmatched unassociated stays `*`.
- Unit: `scopeKeys` routing — `B` opens preview only when scope-focused; radio `B` returns false / is not consumed.
- Regression: T02-51 preview machine tests, T02-49 `*` chords, existing F3/F4 tests (T02-52) stay green.
- `npm test`.

## Suggested files

- `src/scope/previewArea.ts`
- `src/scope/previewArea.test.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/scopeView.ts`
- `src/scope/targetSymbol.ts` (read-only unless prefix matching is required)
- `src/scope/targetSymbol.test.ts` / `src/scope/renderScope.test.ts`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
