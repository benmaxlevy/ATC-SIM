# T02-171 One flight-plan modal and `*FP` command

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-170  
**Blocks:** T02-172  
**Merge target:** `feature/nas-flightplan-modal`  
**Launch:** Implement this ticket only.

## Mission

Open one accessible local flight-plan modal with `*FP <ACID> Enter`. The same
dialog creates a missing plan or amends an existing exact ACID. It calls the
atomic catalog-backed draft service and has no pilot behavior.

## Research

- Supplied `full_manual.pdf`, Appendix D Table D-1 p. D-2 and §5.6.17 pp.
  5-167–5-173: MULTI FUNC / Preview and flight-plan amendment analogs.
- `src/scope/previewArea.ts`, `previewParse.ts`, and `scopeKeys.ts`: Preview
  owns buffer grammar and key routing; `src/ui/shell.tsx` owns React overlays.
- `src/ui/controls/session-setup.tsx`: native accessible dialog precedent.

**Trainer delta:** literal `*FP` and this one browser modal are new ATC-SIM
syntax. It is not an FAA/STARS command claim.

## Exact routing and lifecycle

`*` is an always-on Preview prefix when no native modal/input control owns the
key. It is captured before the radio line in both radio and scope focus.

```text
*FP <ACID> Enter
```

`*FP` is one token: no space is allowed between `*` and `FP`. The required
ACID follows after one or more spaces. ASCII case folds to uppercase and
internal whitespace collapses.

`* F`, `*F`, and existing `*F ...` behavior remain altitude-filter grammar;
they never open the modal. Existing `*TV`, `*P`, `*B`, F6, F9, F7 and radio
tokens retain their current routes. While the modal is open, it owns keyboard
focus; Escape is Cancel and must not reach Preview/filter/radio handlers.

Parser result is a UI-only `openFlightPlanModal { acid }` action. Scope may
request the UI opening through a callback/interface but never imports React.
The UI creates a new draft for no exact non-deleted ACID, otherwise opens an
amendment draft. Save calls T02-170; Cancel/Escape discards the draft and
restores previous focus.

The modal contains all T02-170 supported fields, including route text. Inline
field errors remain visible and focus moves to the first invalid control. It
must carry `role="dialog"`, `aria-modal="true"`, programmatic label,
initial focus, Tab/Shift+Tab containment, labeled controls, Save and Cancel.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `*FP AAL123 Enter`, plan exists | Open amendment dialog | Draft only | — | manual Preview/modify refs |
| `*FP AAL123 Enter`, no plan | Open create dialog with ACID | Draft only | — | manual creation refs |
| `*FP Enter` / `*FP ! Enter` | No dialog | None | `ILL ACID` Preview rejection | trainer grammar |
| Save valid resolved route | Dialog closes and projections refresh | Only FlightPlan changes | — | T02-170 |
| Save invalid route | Dialog remains open | No plan mutation | inline exact error | T02-170 |
| Cancel/Escape | Dialog closes | No plan mutation, focus restored | no Preview/radio fallthrough | accessibility manual |
| `* F`, `*F`, F6, F9, `*TV` | Existing command behavior | No modal | modifier/prefix regression | existing tickets |

## Scope

- Add only `*FP` parsing/action in `src/scope/previewParse.ts`; keep
  `previewArea.ts` idle/entry/armed ownership and do not split `scopeKeys.ts`.
- Wire the UI-open callback through scope integration without React imports in
  scope modules.
- Add `src/ui/controls/FlightPlanModal.tsx` and scoped styles; integrate it in
  `src/ui/shell.tsx`.
- Use T02-170 exclusively for catalog validation and persistence. Do not
  duplicate validation in React.
- Update `src/ui/overlays/ScopeHelpOverlay.tsx` and `docs/USER.md` with exact
  syntax, route grammar link/summary, and metadata-only boundary.

## Acceptance criteria

- [ ] `*FP AAL123 Enter` opens exactly one modal from radio and scope focus,
  without entering the radio parser.
- [ ] Existing ACID edits and absent ACID creates use the same dialog.
- [ ] Modal Save is atomic through T02-170; Cancel/Escape is a strict no-op.
- [ ] All controls are keyboard/screen-reader reachable and modal focus does
  not leak into PPI, Preview, filters, or command line.
- [ ] `*F` filter, `*TV`, F6, F9, and radio command paths remain green.
- [ ] Modal action never changes aircraft, intent, kinematics, Command IR,
  readback, association, or reported squawk.

## Tests

- `src/scope/test/previewParse.test.ts` and `scopeKeys.test.ts`: both focus
  modes; exact token/space/case/incomplete errors; prefix collisions and radio
  isolation.
- `src/ui/controls/test/flight-plan-modal.test.tsx`: create/edit modes,
  errors, Save, Cancel/Escape, focus trap/restoration, labels.
- Extend shell integration only for callback/open/refresh plumbing.
- Run focused tests and `npm run ci`.

## Non-goals

- Separate F/V/A modal families; target-click deletion; replacement of F6/F9
  or `*M`; route guidance, clearance/pilot behavior, Command IR, speech,
  network, extra facility data, or a NAS compatibility claim.

## Handoff

Worker reports changed paths, commits, focused tests, `npm run ci`, manual
source result, and exactly `READY TO MERGE` or `BLOCKED`.
