# T02-54 Preview Area integration and acceptance

**Phase:** 02 Scope (Preview Area addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-52, T02-53
**Blocks:** none
**Launch:** Implement this ticket only. Adds no features.

## Goal

End-to-end gate for T02-51–53. Prove the player-visible loop and zero regressions:

- F3 → preview shows **INIT CNTL** → click an unowned arrival → owned white FDB.
- F3 `DAL123` Enter owns that callsign with nothing selected.
- F4 slew drops.
- `B4500` then an unassociated 4500 paints □.
- Radio `DAL123 H270` still turns.
- `*J3` still arms/slews.

This ticket adds **no features**. It is the fifteenth-swarm gate.

## Context

This is the capstone integration ticket for the Fifteenth Swarm (T02-51–54). T02-51 ships the Preview Area buffer; T02-52 wires INIT CNTL / TERM CNTL command-then-slew plus FLID Enter; T02-53 wires Table 30 `B##` / `B####` beacon select. This ticket proves they work together on a real `World` + `ScopeView` without stealing the radio line or T02-49 `*` chords.

Frozen product law from this swarm is the acceptance bar, not a suggestion:

- **Preview Area is not the radio command line.** Radio stays `DAL123 H270` → Command IR. F3 / F4 / `B` never emit Command, readback, or intent.
- No `window.prompt` and no extra HTML `<input>`. Invalid commit shows brief `INV`. Reject unknown — no parse-and-no-op.
- Skip **all** pointouts this swarm. Existing click / `UN` / `**` radio-buffer behavior is untouched.
- `*` TPA/ATPA chords stay T02-49. F7 stays PTL ALL (not MULTIFUNC). F1 stays beaconator hold.
- Trainer F3 is still color/ownership stub (not NAS associate). F4 is still trainer drop. Pending inbound + INIT CNTL still accepts the handoff.
- KEY_BINDINGS / help overlay are already updated by T02-52; this ticket **verifies** overlay text includes INIT CNTL command-then-slew. Do not rewrite the overlay from scratch.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — Preview Area, Tracking Aircraft (INIT CNTL / TERM CNTL), Command Reference Table 30.

- Review every acceptance criterion on T02-51, T02-52, and T02-53 (do not invent extra preview commands).
- Verify full suite execution: `npm test`, `npm run build`, and `npm run ci`.

## Scope

- Create `src/scope/previewArea.integration.test.ts` (or `previewFidelity.integration.test.ts`). It drives a real `World` + `ScopeView` through `handleScopeKeyDown` and `handlePpiLeftClick` and asserts:
  1. **F3 slew.** F3 with nothing selected paints INIT CNTL in the preview readout; clicking an unowned arrival owns that track (white FDB). Empty PPI click does not consume the arm.
  2. **F3 FLID Enter.** F3 then `DAL123` then Enter owns that callsign with `selectedTrackId` empty. Unknown/ambiguous FLID is `INV`, no apply.
  3. **F4.** F4 arms TERM CNTL; slew drops that track. Implied select-then-F4 still drops the selection (T02-52).
  4. **Beacon select.** Scope-focus `B4500` toggles discrete `4500`; an unassociated squawk 4500 paints □; unmatched unassociated stays `*`. A second `B4500` removes it.
  5. **Radio coexistence.** With radio focus, `DAL123 H270` still turns (existing heading-command path). Preview keys produce **zero** `command.accepted`.
  6. **`*` chord coexistence.** `*J3` still arms and slews a J-ring (existing `starsChord` / `ppi` `*J` arm tests). Live `*` hint still wins over idle preview.
- Explicit regression sweep — all stay green:
  - `src/scope/ownership.test.ts`;
  - `src/scope/starsChord.test.ts` and `src/scope/ppi.test.ts` (`*J` arm);
  - `tests/integration/heading-command.test.ts`;
  - `src/scope/scopeKeys.routing.test.ts`;
  - `src/scope/atpaFidelity.integration.test.ts`.
- Do **not** rewrite `src/scope/starsFidelity.integration.test.ts`. That suite stays the T02-38 gate; new Preview Area coverage lives in the new integration file.
- Documentation:
  - `phases/02-scope/README.md` gains a **"Preview Area addendum (T02-51–54)"** section with the ticket table and a phase checklist in the same style as the TPA / ATPA table around line 594. Leave prior addendum boxes unchanged. Add a Launching-an-agent step for this addendum.
  - Do **not** rewrite `phases/SWARM-STATUS.md` here unless the captain asks; STATUS is captain-owned at swarm end.
- Verify help overlay / `KEY_BINDINGS`: action text for F3 includes INIT CNTL command-then-slew (T02-52 already wrote the rows; assert they are present). Optional `keymap.test.ts` assertion.
- Verify `npm test`, `npm run build`, and `npm run ci` are all clean.

## Out of scope

- New commands of any kind.
- Pointouts (`UN`, `**`, initiate/recall PO).
- MULTIFUNC. TERM CNTL ALL. Scratchpad `Y`. Highlight keyboard (stays middle-click, T02-37).
- `BE` / `BI`, assign-code `M ####`, SSA CODES line, NAS associate.
- Rewriting T02-51–53 behavior or the T02-49 `*` parser.

## Implementation notes

- New test file plus README (and maybe one `keymap.test.ts` assertion). Reuse T02-51 preview state, T02-52 INIT/TERM + `resolveScopeFlid`, T02-53 `beaconSelectCodes` toggle, T02-49 `*J3` dispatch, T02-08/T02-52 ownership helpers. Do not re-derive ownership in the test harness.
- Drive keys with `handleScopeKeyDown` and clicks with `handlePpiLeftClick` the way `ppi.test.ts` drives `*J` arm. Assert preview readout strings (`INIT CNTL`, `TERM CNTL`, `B4500` / `INV`) and track paint/ownership — not canvas pixel dumps unless a mock-canvas symbol check is the cheapest □ proof.
- README table uses the shipped T02-51–53 titles. Checklist items must match what those tickets actually promised (buffer + INV, INIT/TERM command-then-slew and FLID Enter, `B##`/`B####` toggle, no Command IR, `*` chords untouched).
- Do not weaken CA / ATPA / heading-command / ownership tests to make this file green.

## Acceptance criteria

- [ ] **AC1 —** Integration file covers F3 command-then-slew: preview shows INIT CNTL; click unowned arrival → owned white FDB; empty click does not consume the arm.
- [ ] **AC2 —** F3 FLID Enter owns `DAL123` with nothing selected; F4 slew drops; implied select-then-F3/F4 from T02-52 still holds.
- [ ] **AC3 —** `B4500` then an unassociated 4500 paints □; unmatched unassociated stays `*`; toggle-off restores `*`.
- [ ] **AC4 —** Radio `DAL123 H270` still turns; `*J3` still arms/slews; F1 remains beaconator; F7 remains PTL ALL.
- [ ] **AC5 —** Zero Command IR from F3 / F4 / `B` (and other preview keys). Help overlay / `KEY_BINDINGS` text includes INIT CNTL command-then-slew.
- [ ] **AC6 —** `npm test`, `npm run build`, and `npm run ci` are clean; `ownership.test.ts`, starsChord/ppi `*J` arm tests, `heading-command.test.ts`, `scopeKeys.routing.test.ts`, and `atpaFidelity.integration.test.ts` stay green; `phases/02-scope/README.md` has the Preview Area addendum (T02-51–54) table, checklist, and Launching-an-agent step; prior addendum boxes are unchanged.

## Notes

Manual QA of the player loop (`npm run dev` → F3 INIT CNTL → click unowned arrival → F3 DAL123 Enter → F4 slew → `B4500` □ → radio heading → `*J3`) is skip-with-reason when no visual operator is watching Chrome. Automated tests prove the items above. **Do not invent a visual pass.**

## Test plan

- Targeted: `npm test src/scope/previewArea.integration.test.ts` (or `previewFidelity.integration.test.ts`).
- Regression: `src/scope/ownership.test.ts`, `src/scope/starsChord.test.ts`, `src/scope/ppi.test.ts`, `tests/integration/heading-command.test.ts`, `src/scope/scopeKeys.routing.test.ts`, `src/scope/atpaFidelity.integration.test.ts`.
- Overlay: `src/scope/keymap.test.ts` (INIT CNTL command-then-slew text).
- Full automated suite: `npm test`.
- Full project verification: `npm run build` and `npm run ci`.
- Manual: player loop on Chrome. skip-with-reason if no visual operator; never an invented pass.

## Suggested files

- `src/scope/previewArea.integration.test.ts` (new) (or `previewFidelity.integration.test.ts`)
- `src/scope/keymap.test.ts`
- `phases/02-scope/README.md`
