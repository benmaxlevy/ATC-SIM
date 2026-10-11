# T02-227 FMA Projection, Picking and Graphics

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-220 through T02-226\
**Blocks:** T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-227-fma-projection-picking-and-graphics`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Apply one forward/inverse lateral projection consistently to geographic graphics and scope picking, anchored at the camera center, and render FMA layers with manual visibility/colors/brightness.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 6.16.3 p. 6-131 (PDF 661): lateral magnification 1–8, stationary screen center, ring/compass removal and fixed 200-foot reference spacing.
- Figure 6-15 p. 6-126 (PDF 656), notes 1–4: zone boundary removal, range/MAG <=16 NM references, brightness and ring/compass suppression.
- Section 2.16.4 pp. 2-107–108 (PDF 163–164): NTZ white/yellow/red outline aggregation and red persistence after acknowledgment.
- Table 4-1 p. 4-74 (PDF 284) and Appendix B Table B-1 (PDF 932): layer ownership, bounds and exact FMA map colors.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. Introduce a shared display projection with forward and inverse functions around existing camera center. Let p=worldPoint-cameraCenter, u=dot(p,along), v=dot(p,cross). Forward maps u unchanged and v*MAG; inverse divides cross component by MAG. Common basis comes from selected AMZ true course. FMA off and MAG=1 are identity apart from normal camera mapping. Do not pivot about AMZ center unless it equals camera center.
2. Use the projection in geographic map/FMA paint, targets, report-backed histories, PTL endpoints, existing RBL/MIN/TPA/ATPA geometry, and screen-to-world cursor/pick/pan/tool entry. Do not leave mixed projected/unprojected consumers. Measurements and evaluation remain original ENU NM; RBL distances/bearings and aircraft physics must not be computed from magnified coordinates.
3. Keep target glyph and text sizes, line widths and datablock offsets in CSS pixels. Project geographic anchor points, then lay out leaders/datablocks in screen space. Project target/leader attachment consistently; do not stretch all Canvas text/glyphs with a global nonuniform canvas scale. Placement protection and actual pick rectangles use rendered coordinates.
4. Render AMZ outline, available/adapted runway graphics, course lines, fix bars, adjacent NTZ boundaries and reference lines. Colors from Appendix B: AMZ light blue RGB 173,216,230; runway gray 128,128,128; course/fix/reference white; normal NTZ white, caution yellow 255,255,0, warning red 255,0,0. Existing badge palette is not indiscriminately replaced.
5. Apply AMZ/RWY/NTZ/REF brightness channels from T02-226. RWY owns runway/course/fix-bar; off suppresses corresponding paint, not monitoring. Reference lines are always 200 ft apart in world coordinates and show iff display range/MAG <=16 NM. Test exact equality and just-over threshold.
6. Suppress rings and compass iff FMA active and MAG>1, without mutating their stored visibility/brightness. MAG=1 or FMA off restores their configured visibility, not unconditional visible. Disabled NTZs remove their boundaries.
7. Outline severity consumes T02-222 aggregate state, not acknowledgments or last painted aircraft order. Red remains while any qualifying NTZ-warning track remains even after acknowledgment; with warning cleared and caution remaining use yellow, otherwise white. All disabled zones draw no outline and generate no alerts.
8. Paint is read-only. Keep renderScope.ts draw order only, renderScopePaint.ts paint stages, and isolated geometry/projection helpers. No acknowledgment/evaluator/physics mutation from rendering.
9. Existing geographic overlay cursor/drag gestures use inverse projection so screen clicks remain accurate at MAG 1–8 and oblique/nonzero-variation courses. Respect DCB padding, rectangular view, DPR, viewport resize, pan, off-center camera, outside-AMZ tracks and offscreen label retention.
10. This ticket introduces no new operator grammar; all controls belong to T02-223/226. It completes the geometry behind their already-defined actions and removes resolved graphics gaps from the existing backlog without declaring unperformed browser evidence green.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| MAG 4 with camera off AMZ center | Fourfold cross scale, unchanged along scale, screen center fixed | Display coordinates only | AMZ-center pivot must not move camera-center world point | §6.16.3 |
| Projected target click; cursor/pan/RBL point entry | Correct canonical track/world location | Existing action via inverse projection | No hidden unprojected picker or stretched text | Approved shared projection contract |
| Range 30/MAG2; range 32/MAG2; range40/MAG2 | References visible; visible; hidden | Paint only | 200 ft spacing unchanged; compare exact <=16 | Figure 6-15 note 2 |
| FMA MAG>1 then MAG1/off | Rings/compass suppressed then preferences restored | No preference mutation | Previously hidden rings stay hidden | Figure 6-15 note 4 |
| Warning acknowledged; another warning remains; caution only | Red; red; yellow outline | Aggregate consumption only | Track paint order cannot change severity | §2.16.4 |
| NTZ inhibited / RWY BRITE off | NTZ outline absent / runway-course-fix paint absent | No geographic measurement or monitoring changes | NTZ brightness cannot be off | §6.16.9; Table 4-1 |

## Files and ownership

src/scope/camera.ts and focused projection helper; src/scope/pick.ts; src/scope/mapLayers.ts; src/scope/render/renderScopePaint.ts; src/scope/render/renderScope.ts draw order only; geographic overlay/hit/drag consumers; datablock placement geometry; shared src/scope/test/mockCanvas.ts and FMA feature acceptance.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: forward/inverse round trips and numeric invariants across MAG1–8, cardinal/oblique courses, nonzero variation, offset camera, resize/DPR and zero-size safeguards pass.**
- [ ] **AC2 — Automated: target/datablock picking and geographic tool/pan entry use actual projected positions; existing RBL/MIN distances remain world measurements.**
- [ ] **AC3 — Automated: reference exact boundary, ring/compass stored preference restoration, zone visibility, brightness and severity aggregation pass.**
- [ ] **AC4 — Automated: glyph/text sizes and leader/datablock placement remain screen-space, render helpers do not mutate runtime.**
- [ ] **AC5 — Manual: inspect Figure 6-15 raster, actual colors, transformed map/target/history/PTL agreement, off-center MAG adjustment, click accuracy and readable labels at MAG8.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Document MAG distortion versus geographic measurements and ring/compass/reference visibility in docs/USER.md, phases/02-scope/README.md and Help. Resolve existing FMA graphics backlog entries in this change; retain any actual remaining gaps.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No World/intent changes, alert evaluation in paint, stretched typography, new tool algorithms, global camera semantics outside FMA, automatic SOIA geometry or vendor pixel/provenance claims.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
