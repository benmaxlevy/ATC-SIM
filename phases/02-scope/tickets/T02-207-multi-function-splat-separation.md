# T02-207 Multi Function and Literal Splat Separation

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** shipped Preview, list, tracking, and minimum-separation behavior\
**Merge target:** `feature/minimum-separation-graphics`\
**Launch:** Implement this ticket only. RBL work is deferred.

## Mission

Separate F7 `<MULTI FUNC>` from literal `*` throughout keyboard entry, Preview,
parsing, live slew routing, Help, and current user documentation. This is one
atomic migration of an existing input boundary, not new implementations of the
command families below. The user approved implementing separation first on the
current feature branch, using subagents. Do not retain an interchangeable alias.

## Research and authority

Authoritative manual: `/home/ben/Documents/stars refs/full_manual.pdf`, Raytheon
TI 6191.409 Final Revision 30, 20 August 2019.

- Table 2-5, pp. 2-14–17 (PDF 70–73): MULTI FUNC command inventory.
- Appendix D Table D-1, p. D-2 (PDF 942): F7 represents MULTI FUNC.
- Appendix D Tables D-2/D-3, pp. D-3–4 (PDF 943–944): Shift+8/keypad `*` is splat.
- Sections 4.9.4–4.9.17, pp. 4-51–65 (PDF 261–275): MULTI FUNC lists and Preview movement.
- Sections 4.11.1–3, pp. 4-77–79 (PDF 287–289): MULTI FUNC F/FC filters.
- Sections 5.6.15/17, pp. 5-164/167 onward (PDF 492/495 onward): B release and M modification.
- Section 6.3.1, p. 6-13 (PDF 543): MULTI FUNC R per-track PTL.
- Sections 6.13.7–9, pp. 6-88–90 (PDF 618–620): MULTI FUNC B track readout.
- Sections 6.13.17–18, pp. 6-99–102 (PDF 629–632): MULTI FUNC L positioning.
- Sections 7.14–15, pp. 7-25–26 (PDF 811–812): MULTI FUNC Q/V MSAW.
- Sections 6.21.2–17, pp. 6-163–183 (PDF 693–713): literal splat TPA/ATPA.
- Sections 6.7–8, pp. 6-55–58 (PDF 585–588): literal *T belongs to future RBL, not lists.

The previous F7/star alias is explicitly superseded. Existing action semantics,
compact trainer grammar, unsupported functions, and unrelated focus bindings
remain trainer deltas; this ticket does not claim full manual compliance for
those existing actions. Review the manual directly, not only CRC shorthand.

## Entry, grammar, precedence, and lifecycle

1. Preserve structured entry origin rather than reconstructing F7 from `*` text.
   F7 starts MULTI FUNC entry with a distinct Preview indicator. Shift+8 and
   keypad `*` remain actual splat characters. An internal legacy parser adapter
   is allowed only after origin/family validation; no cross-family fallback.
2. F7 is non-printable and keeps its existing always-on scope routing and native
   input/modal/Help protections. Ctrl+F7 retains DCB SHIFT. Preserve other
   modifier ownership; no modified F7 is newly consumed as MULTI FUNC. Literal
   star keeps its existing scope/radio focus ownership; do not newly intercept
   unrelated editable inputs. Test native-input and radio-focus distinctions.
3. F7 while another Preview entry is live replaces/cancels that entry; it never
   appends a literal star. Esc/reset/rejection/session cancellation clears the
   new origin. Backspace edits only operand text and cannot convert F7 to splat.
   An empty MULTI FUNC entry stays pending; Enter uses the existing unsupported
   command rejection. New entry cancels competing targeting using existing
   rollback/cancellation paths and preserves active MIN graphics.
4. Preserve existing operands, field order, actions, and rejection behavior
   within each migrated family. Existing incomplete inputs remain incomplete;
   commit failures use existing Preview rejection conventions (INV unless an
   action already specifies FORMAT or another exact error). Wrong-origin inputs
   cannot execute the other family's action or alter its state.
5. MULTI FUNC owns existing list tokens T/TV/TM/TC/TS/TX/TN, S, P/P1–P3,
   existing list resize/reset forms, F/FC filters, Q/V MSAW, R per-track PTL,
   L1–L9 positioning, B track/beacon-release actions, and M flight-plan edits.
   Literal *T/TV/etc. never route lists; *F/FC never route filters; *Q/V never
   route MSAW; *R never routes per-track PTL; *L1–L9 never route MULTI FUNC
   positioning; *B never invokes the migrated track/readout or release action.
6. Literal splat owns existing TPA/ATPA J/P/D+/AE/AI/BE/BI/DE/DI and double-star
   forms, existing bare-star pointout acknowledgement, existing *1–*8/*0 trainer
   leader shortcuts, and explicit trainer extensions *FP, *DEL, *C, *OFF, *RR,
   *PTL, *HIST, *WX, *LA, *BCN, *LDR and video-map *D forms. These extensions
   remain documented trainer syntax, not invented MULTI FUNC commands. Inventory
   all shipped star forms and update their actual routed Help examples.
7. Literal *P with track slew belongs to TPA; empty-space *P click must not
   relocate Preview. Literal *P1 is TPA size, never Tower list 1. F7 P/P1 clicks
   belong to Preview/Tower placement and never affect TPA. MULTI FUNC entries
   never mirror/arm a literal starsChord action.
8. Live list relocation/tracking/MSAW and Enter parsing must use the same origin
   contract. Do not fix only Enter. Armed actions retain correct ownership.
   Keep literal *T reserved/unsupported: no RBL state, input flow, or rendering.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| F7; T; Enter | Existing Flight Plan/TAB toggle | List visibility only | Literal *T cannot toggle; remains unsupported | 4.9.11 p. 4-58; PDF 268 |
| F7; T; click / T SPACE 15 Enter / TD Enter | Existing list relocation/resize/trainer reset | List state only | Malformed/unsupported rows preserve existing rejection | 4.9.6/15; PDF 263/273; reset is trainer |
| F7; P; empty click | Move Preview | Preview anchor only | Literal *P cannot relocate | 4.9.5 p. 4-52; PDF 262 |
| F7; P1; click/Enter | Existing Tower placement/toggle | Tower state only | Literal *P1 stays cone grammar | 4.9.7/12; PDF 264/269 |
| F7; F/FC with existing operands | Existing altitude-filter operation | Filter state only | Literal *F/FC cannot change filters | 4.11.1–3; PDF 287–289 |
| F7; Q/V; slew | Existing MSAW action | Existing alert/processing scope only | Literal *Q/V cannot execute it | 7.14–15; PDF 811–812 |
| F7; R; slew | Existing per-track PTL toggle | Track PTL only | Literal *R cannot toggle it; *RR/*PTL remain extensions | 6.3.1; PDF 543 |
| F7; L8; slew / existing typed identity | Existing positioning | Existing leader action only | Literal *L8 cannot invoke migrated action | 6.13.17–18; PDF 629–632 |
| F7; B/M with existing identity/fields | Existing track/release/edit action | Existing local plan/track state only | Keep duplicate/malformed/action errors; literal counterparts cannot edit plans | 5.6.15/17; PDF 492/495; 6.13.7–9 |
| Literal *J3 / *P1 / *BE / **J | Existing splat TPA/ATPA actions | Existing TPA/ATPA state only | F7 equivalent must not reach splat handlers | 6.21; PDF 693–713 |
| Ctrl+F7; Esc; Backspace; F7 during pending MIN | Existing modifier/cancel/edit ownership; distinct restart | Clear pending origin; preserve active MIN | No radio/editable-input stealing; no stale targeting | Appendix D; explicit trainer lifecycle |

## Files and user surfaces

Likely owners: `src/scope/scopeKeys.ts`, `previewArea.ts`, `previewParse.ts`,
`starsChord.ts`, `ppi.ts`, Preview paint/formatting helpers, `keymap.ts`, and
corresponding existing tests. Do not split scopeKeys or thicken renderScope.
Update keymap-backed Help/search and command reference, `docs/USER.md`, and the
current phase README keyboard contract. Do not rewrite historical SWARM/tickets.
If a surfaced function becomes unsupported, update its existing subsection in
`phases/LATER-IMPLEMENTATION-BACKLOG.md`; do not duplicate or add untouched RBL
future work merely because this ticket reserves its input family.

## Acceptance criteria and tests

- [ ] Distinct F7/star origin survives entry, armed, Enter, slew, editing and reset.
- [ ] All migrated forms and trainer extensions have explicit ownership; Help
      contains no F7/star interchangeable alias or stale migrated examples.
- [ ] Both Enter and live slew paths prove T/P/B collisions cannot cross families.
- [ ] Positive, incomplete, malformed, typed-identity ordering and wrong-origin
      tests prove unchanged actions and no unrelated state mutation.
- [ ] Focus/modifier/native-input/modal/Help and pending MIN isolation covered.
- [ ] One synthetic feature acceptance file covers the migration; update existing
      tests with real F7 entry context instead of restoring legacy compatibility.
- [ ] Manual-source review checks every row; interactive browser inspection is
      performed or explicitly recorded as unrun, never claimed from source alone.
- [ ] Focused tests, npm run ci, and git diff --check pass before commit/handoff.

## Non-goals and handoff

No RBL implementation, additional manual commands, new Mode C/quicklook behavior,
new action semantics, global parser rewrite, new surveillance modes, Command IR,
speech changes, facility-specific branches, unrelated MIN graphic adjustments,
master merge, or push. Use the feature target as the ticket base under the user's
explicit branch instruction. Work in an isolated ticket branch/worktree. Commit
explicit paths only after CI; never merge or spawn. Return exactly READY TO MERGE
or BLOCKED, with commits, changed paths, AC/test/manual evidence and leftovers.
