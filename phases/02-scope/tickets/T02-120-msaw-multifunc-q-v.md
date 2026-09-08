# T02-120 — MSAW MULTI FUNC Q/V Controller Controls

**Phase:** 02 Scope — STARS CA/MSAW controller controls
**Priority:** P0
**Size:** L
**Depends on:** T02-119
**Blocks:** none
**Launch:** Implement this ticket only. Stop after acceptance.

## Goal

Implement the normal-controller MSAW controls `MULTI FUNC Q` and `MULTI FUNC
V` as distinct, correctly-lived actions; neither is an alert acknowledgement
nor the altitude-filter command `*LA`.

## Context

The trainer evaluates MSAW and renders `LA`, acknowledgement, and `*`
scaffolding, but has no operator path that sets MSAW inhibition. TI 6191.409
distinguishes a current-alert-only inhibit (`Q`) from persistent per-track
MSAW processing toggle (`V`). The prior Scope implementation must not map the
user's requested `*Q` / `*V` shorthand to literal Preview `*Q` / `*V` aliases:
the authentic input is the `<MULTI FUNC>` functional key followed by `Q` or
`V`, then slew/click.

## Research

- TI 6191.409 Rev. 30 §7.14, printed p. 7-25: `<MULTI FUNC> Q` plus owned
  alerting track slew/click silences/removes the current MSAW indication;
  later MSAW re-enables after the current alert clears.
- TI 6191.409 Rev. 30 §7.15, printed p. 7-26: `<MULTI FUNC> V` plus owned
  track slew/click toggles MSAW processing for that track and shows/removes
  the ACID `*` inhibit mark.
- R01, R02, R05, and R07 from `phases/_shared/references.md`; trainer delta:
  ScopeView-local state simulates controller/system behavior and is never
  represented as certified MSAW.

## Scope

- Add a minimal generic `<MULTI FUNC>` input path for this ticket's `Q` and
  `V` chord plus slew/click target selection. Do not add unrelated F7 grammar.
- Model current-alert-only MSAW inhibit separately from persistent per-track
  MSAW processing inhibit. `Q` must clear automatically with that alert;
  `V` remains until toggled off or the existing lifecycle cleanup applies.
- Gate MSAW alert presentation and tone consistently for each inhibit type;
  preserve `LA` detection, acknowledgement, and existing automatic approach
  inhibits.
- Enforce existing owned-track and valid-alert constraints, with deterministic
  error feedback and no mutation on invalid/frozen/unowned selection.
- Update `docs/USER.md`, the applicable Phase 2 README command/checklist
  wording, and the relevant existing backlog subsection without overwriting
  unrelated user changes.
- Add synthetic tests for state lifetime, re-alert behavior, glyph/list/tone,
  command parsing, click selection, and invalid selection.

## Out of scope

- Supervisor §8.3 `V GI/GE/MI/ME`, approach-monitor controls, MCI, `CA M`,
  MCI lists, CA behavior, literal Preview `*Q` / `*V` aliases, and all other
  `<MULTI FUNC>` commands.
- MSAW geometry/threshold changes, new facilities, Command IR, speech, or
  external services.

## Implementation notes

- Keep parser grammar in `previewParse.ts`; keep armed slew/click execution in
  `previewArea.ts`; do not expand thin orchestrator responsibilities.
- Use explicit state names that differentiate current-alert suppression from
  persistent MSAW disable. Do not overload `msawAcknowledged` or altitude
  filtering.
- State/lifecycle code must be generic by track/alert identity, never KDEM
  specific. Clear stale state when a track is dropped, handed off, or its
  relevant alert is gone.
- Preserve `*LA<floor><ceiling>` strictly as altitude-filter grammar.

## Acceptance criteria

- [ ] **AC1 —** `<MULTI FUNC> Q` then valid owned active-MSAW track
  slew/click suppresses only that current alert's MSAW presentation/tone and
  shows the documented ACID `*`; a future alert after clear is active again.
- [ ] **AC2 —** `<MULTI FUNC> V` then valid owned track slew/click toggles
  persistent MSAW processing and ACID `*`; toggling it back restores alerting
  when terrain criteria persist.
- [ ] **AC3 —** `Q` and `V` are not acknowledgements; empty-preview click
  acknowledgement remains a separate behavior, and `*LA` remains altitude
  filter only.
- [ ] **AC4 —** Invalid, unowned, frozen, or non-alerting selections leave
  state unchanged and expose deterministic scope error feedback.
- [ ] **AC5 —** Synthetic parser, lifecycle, list/datablock, and audio tests
  cover Q/V, clear/re-alert, drop/handoff cleanup, and concurrent CA/MSAW.
- [ ] **AC6 — Research:** code comments cite the TI 6191.409 analog and
  trainer-only delta; docs say the implementation is not certified MSAW.

## Test plan

- Unit: chord parser; state transitions/lifetime; invalid-selection guards.
- Integration: MSAW evaluator plus presentation/tone and concurrent CA.
- Manual: `kdem-ca`/MVA scenario walk of Q current-alert clear/re-alert and V
  toggle; verify ACID `*` and no literal `*Q` / `*V` Preview alias.

## Suggested files

- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/trackDisplay.ts`
- `src/core/alerts/msaw.ts`
- `src/core/world.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/systemLists.ts`
- `src/scope/test/previewParse.test.ts`
- `src/scope/test/previewArea.test.ts`
- `src/core/alerts/msaw.test.ts`
- `docs/USER.md`
- `phases/02-scope/README.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
