# T02-205 Minimum-Separation Input and Selection

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** T02-204; shipped T02-51–54 preview and T02-75–77 surveillance\
**Blocks:** T02-206\
**Merge target:** `feature/minimum-separation-graphics`\
**Launch:** Implement this ticket only. Stop before T02-206.

## Mission

Wire the approved dedicated `Del` key to the logical `<MIN>` function with
PPI/scope focus. Implement manual-backed two-track selection and clear with
explicit focus isolation, exact errors, and no ordinary track-click effects.
T02-206 completes painting and integrated acceptance.

## Research and authority

Authoritative source: Raytheon TI 6191.409, Full STARS FSL TCW/TDW Operator's
Manual, Final Revision 30, 20 August 2019, at
`/home/ben/Documents/stars refs/full_manual.pdf`.

- **§6.4 p. 6-17, PDF 547:** keyboard-only `<MIN>`, click first track, click
  second track; `<MIN><ENTER>` clears; same-track error `DUP TRK`; first
  track no longer displayed error `ILL TRK`; both tracks must be on-screen
  when selected. DSF/DSA mode error is `CMD NOT AVAIL`.
- **§2.14 pp. 2-85–87:** Preview Area command entry/readout conventions.
- **Appendix D, Tables D-2/D-3, pp. D-3–4, PDF 943–944:** RPO keyboard `?`
  represents MIN; Delete is CLEAR/editing there. Do not claim `Del` is the
  manual keyboard mapping.
- **R07:** <https://docs.virtualnas.net/crc/stars/#tools> and its STARS Keys
  table map MIN to End. ATC-SIM preserves End centering and `?` Help.
- **Repository:** `scopeKeys.ts` owns focus routing; `previewArea.ts` owns
  entry/armed/readout lifecycle; `previewParse.ts` owns buffer grammar;
  `ppi.ts` owns click dispatch. Existing symbol picking uses live truth;
  MIN picking must instead match the sampled positions actually painted.

The user explicitly approved **dedicated Del, scope focus only**. Prediction
and atomic state behavior are defined in T02-204. Manual absence of a command
argument grammar does not authorize invented callsign, beacon, fix, altitude,
distance, or time forms.

## Exact entry, focus, modifiers, and precedence

1. Activation requires `event.key === "Delete"`, dedicated keyboard code
   `Delete` when a code is supplied, no Shift/Ctrl/Alt/Meta modifier, and
   scope focus. Test events with no code may match by key. Reject the keypad
   `NumpadDecimal` code as a MIN alias, including when its key is Delete.
2. Native editable inputs/contenteditable, radio text, modal controls, and
   Help search retain Delete editing. Do not add Delete to the always-on
   radio-key list. Modified Delete remains available to its existing host.
3. One activation starts/restarts pending MIN and paints the mnemonic `MIN`,
   never literal `Del` or `Delete`. Starting MIN cancels competing Preview/
   stars/filter/placement targeting entry. An armed DCB spinner is cancelled
   with its existing rollback behavior, not committed. Keep the previous
   active pair. Do not globally disable DCB controls or close unrelated menus.
4. During pending MIN, scope Enter/NumpadEnter clears active and pending
   state. Escape cancels pending state and leaves the active pair. Backspace
   must not remove the function mnemonic or become a radio edit. No optional
   arguments or fields exist; extra printable input, including digits,
   callsigns, spaces, or reversed textual forms, aborts pending with `FORMAT`
   and preserves the previous valid pair. This error extension and partial
   Enter behavior are explicit trainer choices, not §6.4 error claims.
5. Pending MIN has precedence over ordinary target selection, handoff
   acceptance, pointout acknowledgement, datablock toggling, list actions,
   and empty-scope deselection on left click. Intercept before those effects
   and before recording MIN clicks as the End-centering last-click point.
   Native modal/Help interactions still own their controls.
6. Starting a different scope targeting/text-entry command cancels pending
   MIN first, then routes that command normally. Camera pan/range changes
   may occur without cancelling MIN, so revalidate first-track visibility
   at second selection. Radio focus cancels pending MIN without changing
   active pair; ordinary radio editing/submission resumes. DCB input that
   takes over targeting or numeric entry must not leave a hidden MIN arm.
7. Do not bind Shift+End, bare End, `?`, F2, typed `MIN`, `*MIN`, or a DCB
   button as alternate activators. Bare End and Help remain unchanged.

## Displayed-target selection and actions

Only select a living aircraft with a finite last surveillance report whose
displayed symbol lies inside the current rectangular PPI. Altitude-filtered
datablocks do not disqualify a still-visible symbol. A visibly rendered
datablock for an eligible on-screen target may also select that target using
current rendered hit geometry; never synthesize a hidden datablock hit.

Use read-only report-backed hit testing. Preserve datablock-first precedence
and nearest-hit ordering; an unresolved equal-priority/equal-distance tie
rejects `ILL TRK` as a documented trainer extension. Do not guess from array
order, selected aircraft, callsign, or a beacon shared by two aircraft.
Eligibility and click positions must follow report pose, not live truth.

Logical action payloads contain only MIN phase and selected aircraft ID(s).
First valid click records the first ID and waits for second. Empty PPI/list
space clicks do not advance the phase, clear selection, change maps/lists,
or emit an error. A valid second click rechecks both reports and on-screen
visibility before atomically replacing the active pair. Same ID returns
`DUP TRK`; a disappeared/off-screen first target returns `ILL TRK`. These
errors end pending entry and retain any still-valid old active pair. They
appear as exact Preview rejection strings using existing brief-error timing;
never substitute generic `INV` or a radio unable/readback.

Allowed mutations are MIN state and MIN Preview/error state, plus cancellation
of competing transient scope controls explicitly named above. MIN clicks may
not change `World.selectedAircraftId`, plan records/association, ownership,
handoffs, pointouts, datablock mode, last centering click, pilot intent,
position/speed/altitude, alert state/inhibits, or radio text.

## Acceptance Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Scope `Del`, click displayed A, click displayed B | One active distinct pair | MIN IDs only; Preview completes | No ordinary click effects | §6.4 p. 6-17; approved Del mapping |
| Scope `Del`, Enter; repeat while empty | Clear active/pending state | No World changes | Harmless empty clear | §6.4 p. 6-17 |
| `Del`, click A, Enter | Clear all | No partial pair | Explicit partial-entry trainer choice | §6.4 clear form; trainer extension |
| `Del` only; or `Del`, click A; empty click; wait | Remain in pending phase | Active pair unchanged | No timeout, fallback, or list mutation | §6.4 two selections; approved incomplete-entry choice |
| `Del`, click A, click A | Abort pending; show `DUP TRK` | Previous valid pair retained | No duplicate pair | §6.4 exact error; approved atomic recovery |
| First A vanishes/loses report/pans off-screen before B | Abort pending; show `ILL TRK` on attempted second selection | Previous valid pair retained | Never use stale/live-truth A | §6.4 both displayed requirement |
| Equal-priority overlapping A/B hit or malformed report | Abort pending; show `ILL TRK` | No aircraft selection | No array-order guess | Explicit trainer extension of invalid-track handling |
| `Del`, then `AAL123`, digits, space, or other printable argument | Abort pending; show `FORMAT` | Previous valid pair retained | No optional fields or callsign form | No argument form in §6.4; trainer error extension |
| `Del`, Escape; `Del` while already pending | Cancel / restart pending | Active pair retained | No accidental clear | Approved recovery choice; Appendix D Esc convention |
| Dedicated Del in radio/modal/Help editor | Native forward delete | No MIN activation | Preserve text/selection editing | Approved scope-only delta; focus contract |
| Ctrl/Alt/Shift/Meta+Delete or keypad Decimal/Delete | Existing routing | No MIN activation | Preserve modifiers and numeric keypad | Approved dedicated-key delta |
| MIN click on pending inbound target or list-overlay space | MIN selection only, or miss | No handoff acceptance, map/list mutation, or World selection | Explicit targeting precedence | §6.4 measurement tool; repository scope boundary |
| Another targeting command / radio focus / DCB entry | Cancel pending, route new owner normally | Active pair retained | No competing invisible arm | Approved focus/cancellation choice |
| End, `?`, F2, normal radio heading | Existing behavior | No alternate MIN binding | No shortcut regression | Repository keymap; approved Del choice |

## Scope, files, and user surfaces

- `src/scope/scopeKeys.ts`: focused Del predicate and MIN routing; do not split
  the module or alter unrelated always-on keys.
- `src/scope/previewArea.ts`: MIN entry/armed/readout and rejection lifecycle.
- `src/scope/previewParse.ts`: any required MIN preview action variants only;
  no radio parser, bare textual MIN command, or general grammar expansion.
- `src/scope/ppi.ts`, `src/scope/pick.ts`: MIN-only report-aware selection
  before side-effecting ordinary click paths; preserve existing pickers.
- `src/scope/scopeView.ts` and existing scope control-entry helpers such as
  `src/scope/dcb/dcbMenu.ts`: only cancellation hooks necessary for the
  competing-entry contract. Do not alter DCB layout or preferences.
- `src/scope/keymap.ts`: actual scope-focus binding and MIN command-reference
  row, registered in Help navigation/search. Readout/Help says minimum
  separation, not a new warning or separation guarantee.
- `docs/USER.md`: document Del/click/click, Del/Enter, Escape, focus isolation,
  errors, and the trainer binding delta. T02-206 finishes graphics/delta docs.
- Begin the sole feature file
  `src/scope/test/minimumSeparation.integration.test.ts`; T02-206 extends it.

If the input surface is callable before T02-206 supplies paint, extend the
existing **Pairwise minimum-separation graphics** subsection in
`phases/LATER-IMPLEMENTATION-BACKLOG.md` in this implementation change to state
that input/model exist but graphics are pending. Do not duplicate the section.

## Acceptance criteria and tests

- [ ] **AC1 — Automated:** All positive/clear/incomplete/malformed/error rows
  route through scope only with the exact mnemonic and rejection strings.
- [ ] **AC2 — Automated:** Dedicated-key, modifier, radio, editable, Help,
  modal, DCB-entry, and keypad conflicts preserve their named owners.
- [ ] **AC3 — Automated:** Clicks target report-backed symbols/visible
  datablocks, including sampled-versus-live pose divergence. Duplicate,
  ambiguous, lost-first, off-screen-first, and empty-list clicks follow table.
- [ ] **AC4 — Automated:** Snapshot assertions prove MIN clicks do not change
  the forbidden World/plan/track state or last centering click.
- [ ] **AC5 — Automated/inspection:** Help registry/search and `docs/USER.md`
  expose the implemented forms; no alternate MIN activation or DCB button.
- [ ] **AC6 — Manual-source review:** §6.4 forms/errors and Appendix D mapping
  are checked; Del, error extensions, and recovery rules are explicit deltas.
- [ ] **AC7 — Gate:** Focused feature tests and `npm run ci` pass.

Use synthetic report/track fixtures; reuse `src/scope/test/mockCanvas.ts` when
painted datablock hit geometry is needed. Keep feature scenarios in the one
integration file, not a new pile of duplicated picker/keymap units.

## Non-goals, manual review, and handoff

No aircraft control, radio/speech grammar, external sensor protocol, new
DSF/DSA mode, ownership eligibility, RBL, MCI/MSAW, persisted pairs, or
unrelated deletion/flight-plan workflow. `CMD NOT AVAIL` is cited for the
manual's DSF/DSA restriction, not invented for normal trainer use; no such
mode exists here. FSL presentation latch is not DSF/DSA.

Review §6.4 p. 6-17, §2.14 pp. 2-85–87, and Appendix D Tables D-2/D-3
pp. D-3–4 against every table row. Distinguish proven routing from manual
browser checks still deferred to T02-206. Return exactly `READY TO MERGE` or
`BLOCKED`, followed by commit, AC/test evidence, source-review result, and
leftovers. Never merge, push, start T02-206, or spawn another agent.
