# T02-228 FMA Integrated Acceptance and Documentation

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** T02-220 through T02-227\
**Blocks:** none; final stop boundary\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-228-fma-integrated-acceptance-and-docs`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Complete the single synthetic FMA acceptance suite, verify real browser/manual behavior, reconcile current user/phase docs and backlog, and prove MODE F/S/L removal and clean FMA lifecycle.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Sections 2.6, 2.16.4/Table 2-27, 4.1, 4.10/Table 4-1, 6.16.1–9, 7.3; Figures 2-20 and 6-15–18; Appendix B Table B-1.
- Printed pp. 2-21–23, 2-66, 2-107–108, 4-4–6, 4-74, 6-125–139, 7-7; PDF 77–79, 122, 163–164, 214–216, 284, 655–669, 793, 932.
- Section 2.14 pp. 2-85–86 (PDF 141–142) and Appendix D Table D-1 p. D-2 (PDF 942): F8 command entry echoes exact on-screen label FMA/TSAS; §6.16.8 rejects FMA application outside FMA with FORMAT.
Review actual rasters, including the solid ▼ glyph and stacked FMA DCB, not only extracted OCR. The approved trainer policies and user overrides remain authoritative.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. Extend the same src/scope/test/fmaFidelity.integration.test.ts begun in T02-220, not a new production-airport unit pile or separate acceptance file per ticket. Use synthetic two/three/four-runway catalogs, associated plans/scratchpads, simulation clocks and sensor reports distinct from World truth. Reuse src/scope/test/mockCanvas.ts.
2. Cover actual DCB/keyboard/mouse entry, not helper-only mirror tests: MODE submenu confirmation, missing PREF warning and migration; AMZ/MAG/PTL/VOICE/runway/BRITE entry; F8 Preview and clicks in FMA/non-FMA; warnings/caution; inhibition/adjacency/ALL; report loss, NOM, coast/freeze and recovery; shared projection and actual picking. Assert immediate FMA/TSAS Preview cue, successful/canceled entry cleanup, non-FMA application FORMAT in readout and no F8 history changes in any mode/focus. Preserve H/DCB history controls and modified-key/native-input/Help routing.
3. Prove wrong-runway assignment derives only from scratchpad #1/#2, not approach clearance or intended runway. Matching/different/missing/conflicting assignments and ambiguous observed alignment must exercise the approved outcomes. KDEM is negative reciprocal-runway coverage; any necessary KATL committed-data validation is a separate data contract, not a generic unit count/ordering assertion.
4. Prove once-per-episode speech, known carrier/phonetic unknown ACID, caution silence-only, acknowledgment red-outline persistence and selective speech cancellation. Use injected synthesis in CI; real voice/listening/offline checks are manual.
5. Assert no radio/Command IR/Path C changes, intent/kinematics/ownership/association/selection changes from FMA commands, or global CA/MSAW/surveillance regressions. Verify old F/S/L state/functions/renderer branches no longer influence runtime and legacy PREF values are ignored.
6. Clean cancellation/reset paths: live Preview or splat replaced by F8; native input/Help/focus guards; adjusted values rolled back on cancel; mode off/AMZ change/catalog reload/session teardown; all-zone and track inhibition remove applicable frozen tracks and stale speech. Preserve active unrelated MIN/RBL/TPA and stored visibility settings.
7. Audit contract rows from all predecessor tickets against routing -> parsing -> local state -> effects -> error -> help/docs -> tests. Missing behavior is not satisfied by disabled chrome or an untested code path. Exact visible errors are FORMAT, ILL VALUE and warning NO PREF SET FOUND only where defined by those tickets; do not manufacture a new manual error family.
8. Final browser script uses synthetic or real applicable parallel data and real installed local English voice. Check actual MODE/AUX/BRITE layout, colors/blink/glyph, MAG1/4/8, pan/pick, reference threshold and rings/compass restore; interrupt/recover reports and exercise every onset phrase/Test. Record environment/voice and observable result. Unavailable browser or voice is explicitly UNRUN/unavailable, never inferred from mockCanvas. Final visual/audio completeness must be reported honestly.
9. Reconcile current README/AGENT/shared non-goals and narrow speech exception with approved feature while preserving historical tickets and SWARM history. Extend/resolve existing backlog only for actually shipped incomplete behavior. No new scope beyond T02-220–228.
10. The captain, not this worker, appends phase STATUS after final gates and returns PHASE EXIT GREEN or PHASE EXIT BLOCKED. Worker implements this ticket only and never merges/spawns/pushes.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Complete FMA sequence on synthetic triple parallel catalog | Correct geometry, assignment monitoring, controls and graphics | Display-local behavior only | No production ID/count/order assumptions | All supplied-manual sections above |
| Wrong/missing/ambiguous scratchpad assignment; report truth differs from World | RWY only for established defined mismatch/missing assignment | No scratchpad or intent rewrite | Ambiguous assignment is diagnostic; not guessed RWY | §2.16.4; approved refinement |
| NTZ warning acknowledge then caution silence-only | Steady red with red outline / unchanged yellow visual | Own episode speech cancellation | No repeated onset or caution visual acknowledgment | §§2.16.4, 7.3; user decision |
| Report loss/NOM/coast recovery plus NTZ ALL | Real status transitions and frozen cleanup | No non-FMA coast or stale speech | No aural NOM or frozen resurrection | §§2.16.4, 6.16.8–9 |
| Legacy modeFsl F/S/L; MODE submenu and PREF restore | Invented behavior gone; supported FSL/FMA semantics | Unrelated preferences retained | No relocated replacement F/S/L setting | User MODE correction; Figure 6-16 |
| F8 in FMA/non-FMA, then valid slew / non-FMA application / CLEAR-Esc | Preview FMA/TSAS then complete / FORMAT / cancel | Visible pending entry; history unchanged in every mode | No permanent cue, literal F8 label, normal-click fallthrough or invented TSAS behavior; H/DCB history preserved | §2.14; Table D-1; §6.16.8 |
| Browser unavailable / no local voice | Record actual UNRUN/unavailable evidence | No fabricated manual PASS | Injected CI speech is not browser audio evidence | Explicit validation policy |

## Files and ownership

src/scope/test/fmaFidelity.integration.test.ts; existing generic regression suites as necessary; src/ui/overlays/ScopeHelpOverlay.tsx; docs/USER.md; phases/02-scope/README.md; phases/02-scope/AGENT.md; phases/_shared/non-goals.md; narrowly scoped phases/_shared/speech-port.md note; phases/LATER-IMPLEMENTATION-BACKLOG.md. Runtime edits only to repair an identified feature acceptance defect.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: full contract-row audit has observable tests, including malformed/incomplete/order/modifier/ambiguity/capacity cases where applicable.**
- [ ] **AC2 — Automated: npm run ci and git diff --check pass; existing non-FMA display/radio/tools/CA/MSAW regressions pass.**
- [ ] **AC3 — Inspection: no runtime modeFsl F/S/L or replacement setting; no F8 history path or current help/header/key-table claim that F8 controls history; historic tickets remain history. Current user surfaces state service-level meanings, FMA/TSAS Preview entry, non-FMA FORMAT and retained H/DCB history controls.**
- [ ] **AC4 — Manual: independently review supplied manual pages/rasters and all trainer deltas, caution resolution and FMA-only speech override.**
- [ ] **AC5 — Manual: execute browser graphics/picking/keyboard/voice/offline/loss-recovery script, or explicitly record every unrun item and the limitation.**
- [ ] **AC6 — Inspection: final docs and backlog accurately describe all visible/callable behavior; no stale episode/queue/track references after lifecycle cleanup.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Finalize docs/USER.md, Help, current phase README/AGENT, shared non-goals and speech exception; remove resolved FMA backlog gaps only. Captain records final manual/browser evidence and remaining leftovers in phases/SWARM-STATUS.md after execution, not during this planning request.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No later phase, automatic SOIA flight behavior, DSF/DSA implementation, new feature/backlog scope, operational certification, cloud speech, master merge or push.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
