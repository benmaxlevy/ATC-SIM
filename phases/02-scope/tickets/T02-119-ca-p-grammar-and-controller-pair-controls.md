# T02-119 — CA P Grammar and Controller Pair Controls

**Phase:** 02 Scope — STARS CA/MSAW controller controls
**Priority:** P0
**Size:** M
**Depends on:** T02-118
**Blocks:** T02-120
**Launch:** Implement this ticket only. Do not start T02-120.

## Goal

Make `CA P` the only explicit pair command, with state-dependent inhibit/enable
behavior, and add the controller-owned-pairs controls `CA C`, `CA C E`, and
`CA C I`.

## Context

T02-114 and T02-118 implemented the pair model but retained invented `CA E`.
TI 6191.409 uses `CA P` for both pair inhibit (§7.11) and pair re-enable
(§7.12). Section 7.13 gives a controller, not supervisor, control over all
qualifying pairs owned by the entering TCP. Scope state must remain separate
from radio Command IR and aircraft intent.

## Research

- TI 6191.409 Rev. 30 §§7.11–7.13, printed pp. 7-21–7-24: `CA P` is the
  pair inhibit and re-enable operation; `CA C E` / `CA C I` force enable /
  inhibit for qualifying pairs owned by the entering TCP. The external PDF is
  the controlling command reference.
- R05 (FOA STARS terms) and R07 (CRC keyboard feel), from
  `phases/_shared/references.md`; trainer delta: this remains a local,
  single-player ScopeView model, not NAS system-wide automation.

## Scope

- Replace the explicit `CA E` grammar/action with state-dependent `CA P`:
  the selected pair enters `caInhibitedPairs` when absent and leaves it when
  present, for typed IDs and all supported slew-selection paths.
- Reject `CA E` after the migration; do not retain it as a compatibility alias.
- Parse and execute `CA C`, `CA C E`, and `CA C I` on Enter. Bare `CA C`
  toggles the qualifying owned-pair setting; `E` clears, and `I` adds, pair
  inhibition for every qualifying pair with both tracks owned by the entering
  controller.
- Add focused synthetic tests for pair toggle, typed/slew paths, `CA E`
  rejection, and controller-wide enable/inhibit isolation.
- Update `docs/USER.md` and the applicable Phase 2 README command/checklist
  wording that currently names `CA E`.

## Out of scope

- Supervisor §8.1 CA global enable/inhibit, ownership/network adaptation, CA
  detection thresholds, audio redesign, MCI, MSAW, Command IR, and speech.

## Implementation notes

- Keep `previewParse.ts` grammar-only and `previewArea.ts` click/armed state
  orchestration-only. Reuse generic pair-key and ownership walkers; never
  special-case facility/track IDs.
- Bare `CA C` toggles this controller-wide owned-pair setting; `CA C E|I`
  force the target state. They affect only pairs whose two members meet the
  existing local owned-track definition and never mutate per-track `CA K`.
- Preserve pair isolation: changing `(A,B)` cannot suppress `(A,C)`.
- Add the analog/trainer-delta source comment where controller-wide semantics
  are introduced.

## Acceptance criteria

- [ ] **AC1 —** `CA P` inhibits an uninhibited selected pair and re-enables an
  inhibited selected pair, through typed IDs and supported slew selection.
- [ ] **AC2 —** `CA E` is rejected and cannot change any pair state.
- [ ] **AC3 —** `CA C I Enter` inhibits every qualifying owned pair and does
  not alter a pair with an unowned member or any `CA K` track inhibit.
- [ ] **AC4 —** `CA C E Enter` re-enables every qualifying owned pair while
  retaining other/nonqualifying pair states.
- [ ] **AC5 —** Bare `CA C Enter` toggles the qualifying owned-pair setting
  and does not alter nonqualifying pairs or `CA K` track state.
- [ ] **AC6 —** Parser, interaction, and presentation regression tests cover
  AC1–AC5 using synthetic tracks; existing CA behavior stays green.
- [ ] **AC7 — Research:** code comment names the TI 6191.409 analog and the
  local-trainer delta.

## Test plan

- Unit: parser accepted/rejected forms; generic owned-pair walker; pair state.
- Integration: typed and slew CA selection, list/datablock/tone restoration.
- Manual: `kdem-ca` controller walk for `CA P`, `CA C`, `CA C I`, and `CA C E`.

## Suggested files

- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/test/previewParse.test.ts`
- `src/scope/test/previewArea.test.ts`
- `src/scope/test/systemLists.operational.test.ts`
- `docs/USER.md`
- `phases/02-scope/README.md`
