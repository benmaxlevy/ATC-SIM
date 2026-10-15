# T02-223 FMA Track Interactions and Datablock Indicators

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-220 through T02-222\
**Blocks:** T02-224 through T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-223-fma-track-interactions-and-datablocks`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Wire local alert acknowledgment, caution speech silencing, F8 Preview entry and single-track inhibition, Field 0 indicators and solid Field 2 suppression glyph through existing scope interaction routing. Remove F8 history toggling in every mode.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 2.16.4 pp. 2-107–108 (PDF 163–164), Table 2-27: warning flashes red, acknowledgment stops flashing, caution steady yellow, onset speech, solid downward triangle.
- Figure 2-20 p. 2-66 (PDF 122): Field 2 inhibit indicator location.
- Section 7.3 p. 7-7 (PDF 793): implied left-click acknowledgment, handoff/pointout exclusions, FMA acknowledgment local to entering TCW.
- Section 6.16.8 p. 6-137 (PDF 667): F8 then slew/click associated arrival; FORMAT when the FMA command is invoked outside FMA.
- Appendix D Table D-1 p. D-2 (PDF 942): F8 serves FMA/TSAS and has exact on-screen label FMA/TSAS. Inspect the raster table, not an invented F8 label.
- Section 2.14 pp. 2-85–86 (PDF 141–142), Figure 2-25: Preview Display Area echoes command input/prompts; readout shows errors. With no entered operand, CLEAR exits the command.
- Section 6.16.9 pp. 6-138–139 (PDF 668–669): frozen-track removal and hiding suppression symbols when all NTZs inhibited.
User resolved the §7.3 versus §2.16.4 caution-audio conflict: allow silence-only; never acknowledge/change caution visuals.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. Add per-display FMA mode/active-AMZ settings, track inhibit set, primary episodes, acknowledged warning episode IDs and speech-silenced episode IDs. Mode remains unavailable through public UI until T02-225. Internal fixtures can exercise runtime. No global WorldAlerts mutation or persistence of track IDs/episodes.
2. Bare F8 enters the FMA/TSAS function through the existing Preview function-key route, whether FMA is enabled or not. Show the exact pending display label FMA/TSAS immediately in the Preview Display Area. It is a function-entry cue, not a permanent mode label, a typed operand, or the literal text F8. Apply the same application-radio/native-input/Help focus protection as existing Preview function keys such as F7; the application radio command line must not retain an F8 history fallback. F8 never toggles history in any mode or focus. History keeps its existing H and DCB controls; do not invent a replacement shortcut. Ctrl+F8 remains DCB visibility, Ctrl+F7 remains DCB SHIFT, F7 remains MULTI FUNC; Shift/Alt/Meta combinations keep existing distinct routing and do not enter bare-F8 FMA/TSAS. No star/F7/typed alias for FMA inhibition.
3. F8 entry cancels conflicting pending Preview/splat/tool targeting through existing cancellation/rollback helpers while preserving active graphics. Keep one Preview-owned pending function and arm, not a second invisible targeting state. In FMA, next left slew-click on a qualifying associated arrival toggles canonical track inhibition, completes the arm, clears its pending Preview cue and consumes the click before ordinary selection, handoff, pointout or last-center-click recording. Empty/nonqualifying click performs no track mutation, retains the visible pending entry for a valid target or cancellation and cannot fall through as an ordinary action. CLEAR/Escape with no operand cancels entry and removes the cue; focus transfer/mode exit/AMZ switch/session reset clears pending entry through existing cancellation policy. Repeated F8 replaces/restarts one entry and never stacks arms. Backspace cannot turn the function cue into a typed radio operand.
4. F8 outside FMA still opens visible FMA/TSAS entry; pressing F8 alone does not execute or immediately reject the track-inhibit action. Completing the FMA slew action outside FMA rejects with exact FORMAT, shows that error in the existing Preview readout and ends the pending inhibit arm. No track/history/selection/ownership/radio mutation and no normal-click fallthrough. A stale explicit FMA commit after mode changes also rejects FORMAT. No typed track operand, selected-track fallback, fabricated NO TRK/ILL TRK alias, or new TSAS behavior: this ticket reserves the shared label but implements only the approved FMA slew action. In FMA, invalid/nonqualifying slew remains the no-track-mutation case from rule 3.
   Enter with no operand and no slew target is incomplete: retain visible pending entry without applying a track action. Unsupported nonempty operands committed by Enter or slew reject FORMAT through Preview, never become a radio command, selected-track fallback or invented TSAS action. The FMA/TSAS display label is generated from the function owner and is not itself reparsed as an operand. The supported positive grammar remains bare F8 followed by associated-arrival slew-click in FMA.
5. Ordinary unarmed left slew-click on a track with unacknowledged primary NTZ warning/CST/RWY acknowledges that episode: badge steady red and request cancellation of its speech. Preserve existing handoff/pointout priority; do not acknowledge while current handoff/pointout owns the click. Existing CA/MSAW/SPC acknowledgement behavior still applies where eligible. No new ACK chord, no selection-dependent acknowledgment and no system-wide propagation of FMA acknowledgment.
6. On primary NTZ caution, the same eligible action is speech-silence only. Yellow badge and outline unchanged; visual acknowledgement is never set. NOM has no speech to acknowledge. A click cannot clear qualification, remove geometry, change assignments, or advance alert episodes.
7. Field 0 consumes T02-222 primary indicator and optional NOM, composed using existing slash-separated indicator formatting with CA/MSAW/SPC. Primary FMA precedence does not hide unrelated alerts. Warning indicator flashes red until acknowledged, caution/NOM steady yellow. Paint reads state; it must not mutate acknowledgment.
8. Field 2 uses the actual solid downward triangle ▼, never literal V. It supersedes existing *, delta and + without deleting their inhibit state. Show for track FMA inhibition regardless of AMZ position while FMA is active, except hide all FMA suppression glyphs while every NTZ is inhibited. Restoring zones makes still-applicable glyphs reappear.
9. Track inhibition clears its active FMA alert/speech and removes its frozen CST presentation. Unsuppress waits for current report/qualification and creates a fresh episode when warranted; no old acknowledgment resurrection. Zone-adjacency/all-zone notifications have the T02-222 suppression and T02-221 cleanup effects.
10. Preserve existing text-focus/native-input protections, datablock layout/hit geometry and track/plan actions. Inhibition/acknowledgment mutate local FMA state and named cancellation state only; no intent, ownership, plan, association, camera or radio changes.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| FMA scope F8, associated arrival slew-click | Toggle single-track inhibition | Local inhibit; clear own alerts/speech; frozen presentation removed | Never toggles history or changes selection/ownership | §6.16.8 |
| Bare F8 with FMA on or off | Pending Preview displays exact FMA/TSAS | One visible Preview function entry; history unchanged | No permanent label or literal F8 cue; existing Preview function-key focus guards apply | Appendix D Table D-1; §2.14 |
| FMA/TSAS pending outside FMA, then FMA slew action | Preview readout FORMAT; pending arm ends | No track/history/selection/ownership/radio mutation | Pressing F8 alone is entry, not immediate rejection; no TSAS implementation added | §6.16.8; Table D-1 |
| F8 then empty Enter / unsupported nonempty operand commit | Retain incomplete visible entry / FORMAT in Preview | No selected-track fallback or command application | No new typed-ACID or TSAS grammar; label is not an operand | §6.16.8 slew-only procedure; §2.14/Table 2-21; explicit incomplete-entry policy |
| Application radio focus / native editor or Help / Ctrl+F8 / Shift+F8 | Existing Preview-function focus guards / distinct modifier routing; Ctrl+F8 DCB visibility | No F8 history behavior in any context | No accidental bare-F8 entry from modified key or typing into radio | Inherited Preview/modifier protections; user F8 correction |
| F8 entry then CLEAR/Esc, empty click, invalid track, focus transfer | Cancel cue or retain visible no-mutation entry as specified | No ordinary click fallthrough; successful FMA click clears cue | Stale explicit FMA commit outside mode: FORMAT | §§2.14, 6.16.8; approved lifecycle |
| Unarmed warning click | Steady red; own speech canceled | Episode-local acknowledgment | Active handoff/pointout keeps existing priority | §7.3; §2.16.4 |
| Unarmed NTZ caution click | Silence-only request; steady yellow unchanged | Separate speech-silenced episode state | Never sets visual acknowledgment | User-selected resolution of manual conflict |
| Inhibited track with MSAW/CA inhibits | Field 2 solid ▼ takes precedence | Underlying inhibit flags preserved | All zones inhibited hides ▼; no letter V | Table 2-27; Figure 2-20; §6.16.9 |
| One warned track acknowledges; another remains in NTZ | Red outline remains | Aggregate geometry severity unchanged | Acknowledgment never returns outline to white | §2.16.4 |

## Files and ownership

src/scope/scopeView.ts; new src/scope/fmaState.ts or equivalent focused helper; src/scope/scopeKeys.ts (do not split; remove every F8 history path and stale header comment); src/scope/previewArea.ts function-entry/lifecycle glue; src/scope/previewParse.ts only for scope-owned entry dispatch as needed, with no new radio grammar; src/scope/previewDisplayLabels.ts exact FMA/TSAS display mapping; src/scope/datablock.ts; existing acknowledgment click host and renderScopePaint.ts read-only badge consumption; existing F8 history/key regression tests and shared acceptance.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: F8 immediately displays FMA/TSAS in Preview in FMA and non-FMA; valid FMA slew completes and clears cue, non-FMA FMA application gives Preview FORMAT with no fallthrough, and CLEAR/Esc cancels. Application radio/native-input/Help focus guards, repeated F8, incomplete/malformed entry and Ctrl/Shift/Alt/Meta separation pass. No bare F8 path changes history in any mode/focus; H and DCB history controls still work.**
- [ ] **AC2 — Automated: warning acknowledgment and caution silence-only are separate, reset on new episode and remain display-local.**
- [ ] **AC3 — Automated: ▼ glyph precedence and all-zone hiding/restoration preserve underlying CA/MSAW inhibits.**
- [ ] **AC4 — Automated: Field 0 composition, flashing/steady severity and multi-track outline persistence use synthetic conditions and deterministic blink time.**
- [ ] **AC5 — Manual: inspect Field 2 glyph in actual font and badge colors/flash; test current handoff/pointout exclusion through real click routing.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Update src/ui/overlays/ScopeHelpOverlay.tsx, docs/USER.md and phases/02-scope/README.md with F8 = FMA/TSAS Preview function entry in FMA and non-FMA, exact slew gesture, non-FMA FORMAT, cue completion/cancellation, caution silence-only and no ACK alias. Remove current F8-history and H-same-as-F8 claims from current help/key tables, scopeKeys header comments and regressions; history remains H/DCB. Preserve historical shipped tickets as history. Extend phases/LATER-IMPLEMENTATION-BACKLOG.md only if a public callable surface ships before its actual behavior is wired; internal unexposed state alone is not a backlog item. Shared FMA/TSAS label alone does not authorize adding a new TSAS feature or inventing one as a backlog item.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No voice implementation, new radio parser token, new TSAS commands, F8 history fallback, system-wide FMA acknowledgment, automatic runway assignment or paint-stage state mutation.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
