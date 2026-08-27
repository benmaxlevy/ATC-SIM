# T02-49 STARS TPA / ATPA slew-chord parser

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P1
**Size:** M
**Depends on:** none (base branch)
**Blocks:** T02-48
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Give the scope the CRC STARS `*` command chords that drive TPA and ATPA, entered on the PPI and resolved against the slewed track:

| Chord | Action |
| --- | --- |
| `*J(#.#)` | J-ring on the slewed track, radius 1–30 NM |
| `*J` | remove that track's J-ring |
| `**J` | remove every J-ring |
| `*P(#.#)` | TPA cone on the slewed track, length 1–30 NM |
| `*P` | remove that track's cone |
| `**P` | remove every cone |
| `*D+` / `*D+E` / `*D+I` | toggle / enable / inhibit the TPA size readout |
| `*AE` / `*AI` | enable / inhibit ATPA warning and alert cones |
| `*BE` / `*BI` | enable / inhibit the ATPA monitor cone |
| `*DE` / `*DI` | enable / inhibit the in-trail distance readout |

This ticket delivers the **parser and the entry surface**. The state each action mutates arrives with T02-45 to T02-48; until then unimplemented actions are parsed, returned, and safely ignored.

## Context

The scope already has a chord grammar: `F` then hundreds for the altitude filter and `L` then 1–9 for leader direction, driven by `beginScopeChord` / `isScopeChordLive` in `src/scope/keymap.ts` with an entry buffer and an on-scope prompt in `src/scope/altitudeFilter.ts`. Reuse that shape. Do not invent a second input model, do not use `window.prompt`, and do not add an HTML `<input>` — the same rule that governs PREF SAVE AS.

`phases/LATER-IMPLEMENTATION-BACKLOG.md` records the `*J` chord and a full `<MULTI FUNC>` parser as deferred. This ticket closes the `*` half only; the F7 `<MULTI FUNC>` inhibit commands stay deferred.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — Command Reference, "TPA/ATPA" table (Table 36).

- Search: `CRC STARS command reference TPA ATPA *J *P`
- **Terms:** slew, preview area, J-ring, cone. Not Command IR, not readback.
- Comment: chords are scope display actions; `DAL123 H270` remains the radio path.

## Scope

- New pure module `src/scope/starsChord.ts`:
  - `parseStarsChord(buffer: string): StarsChordResult` returning a discriminated union — `{ kind: "incomplete" }`, `{ kind: "invalid", reason }`, or `{ kind: "action", action: StarsChordAction }`.
  - `StarsChordAction` covers every row of the table above, carrying `radiusNm` / `lengthNm` where present and a `target: "slewed" | "all"` discriminator for the `**` forms.
  - Radius and length accept whole numbers and one decimal, range **1–30 NM** inclusive; out of range is `invalid`, not clamped.
- Entry surface, following the `FIL` prompt grammar:
  - `*` with the PPI focused begins a chord. Subsequent characters append. Enter commits, Esc cancels, Backspace edits.
  - The live buffer renders on the PPI in SSA/preview green, next to the existing filter prompt, so the operator sees what they typed. An invalid commit shows a brief rejection and clears.
  - Chord entry must not steal the radio command line: `*` when the command line is focused is a normal character.
- Dispatch: `applyStarsChordAction(view, world, action)` in the scope layer maps an action to scope state. Actions whose state does not exist yet return `"unsupported"` without throwing, and T02-45 to T02-48 fill them in.
- Slew resolution reuses the existing selection: the chord applies to the currently selected track. No new hit-testing.

## Out of scope

- Any Command IR, readback, intent, or radio effect.
- The F7 `<MULTI FUNC>` inhibit commands (`M`, `C`, `Y`) — still backlog.
- Non-TPA `*` commands from the reference: RBL (`*T`), airport info, `.dot` commands.
- Drawing rings or cones. T02-48 owns the geometry these chords enable.

## Implementation notes

Keep `parseStarsChord` a pure string function so the table above becomes a table-driven test. Prefix ambiguity matters: `*D` is a live prefix of both `*D+` and `*DE`, so a bare `*D` commit is `invalid`, not a silent no-op, and `*DE` must not be parsed as `*D` plus stray input.

`**J` and `*J` differ only by the second `*`; parse the `**` prefix first so the single-target form cannot swallow it.

## Acceptance criteria

- [ ] **AC1 —** Every row of the chord table parses to its documented action, with `*J3`, `*J2.5`, `*P10`, and `*P0.5` covered; `0.5` and `31` are `invalid` because the range is 1–30.
- [ ] **AC2 —** `**J` and `**P` parse as `target: "all"`, and `*J` / `*P` as `target: "slewed"`; neither form is mistaken for the other.
- [ ] **AC3 —** A bare `*D` commit is `invalid`, while `*D+`, `*D+E`, `*D+I`, `*DE`, and `*DI` each parse to their own action.
- [ ] **AC4 —** `*` with the PPI focused opens the chord buffer and renders it on the PPI; Esc cancels leaving no state; `*` typed while the radio command line is focused inserts a literal `*` and opens nothing.
- [ ] **AC5 —** No Command IR is produced by any chord. `DAL123 H270` still turns the aircraft, and the existing `F` filter and `L` leader chords still work.
- [ ] **AC6 — Research:** module comment cites R07 Table 36, states chords are display-only, and records that `<MULTI FUNC>` inhibit commands remain deferred.

## Test plan

- Unit: `src/scope/starsChord.test.ts` — table-driven over every chord, boundary radii, prefix ambiguity.
- Unit: extend `src/scope/scopeKeys.test.ts` — chord opens only when scope-focused, Esc cancels, no Command emitted.
- Integration: existing `scopeKeys.routing.test.ts` stays green.
- `npm test`.

## Suggested files

- `src/scope/starsChord.ts` (new)
- `src/scope/starsChord.test.ts` (new)
- `src/scope/keymap.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/renderScope.ts`
- `src/scope/scopeView.ts`
