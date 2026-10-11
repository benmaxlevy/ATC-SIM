# T02-206 Minimum-Separation Graphics and Acceptance

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** T02-204, T02-205\
**Blocks:** None\
**Merge target:** `feature/minimum-separation-graphics`\
**Launch:** Implement this ticket only. Stop at feature completion.

## Mission

Complete manual-aligned minimum-separation graphics, track/session cleanup,
and the single synthetic feature acceptance suite. Validate the entire
Del/click/click and Del/Enter workflow against the supplied manual and
Figure 6-1 reference image. Do not mistake planning/source review for a
passed implementation or browser visual check.

## Research and authority

Primary source: Raytheon TI 6191.409, Full STARS FSL TCW/TDW Operator's
Manual, Final Revision 30, 20 August 2019, at
`/home/ben/Documents/stars refs/full_manual.pdf`.

| Requirement | Printed citation | PDF page / visual evidence |
| --- | --- | --- |
| Two track selections; one current pair; replace or clear; track-drop cleanup; exact errors | §6.4 p. 6-17 | PDF 547 |
| Projected-position triangles, connecting distance graphic, boxed NM value, increasing-distance cue, horizontal-only zero | Figure 6-1 p. 6-18 | PDF 548 and the supplied reference image |
| Minimum-separation text uses TOOLS character size | §4.9.1 p. 4-47, Figure 4-9 | PDF 257 |
| TLS brightness controls PTL/Min. Sep. tools | §4.10 p. 4-74, Table 4-2 TLS row | PDF 284 |
| PTL / Min. Sep. default white | Appendix B, Table B-1 p. B-1 | PDF 929 |
| Preview errors reject commands; malformed entry `FORMAT` | §2.14 p. 2-86, Table 2-21 | PDF 142 |
| Real RPO key mapping differs from approved Del mapping | Appendix D, Tables D-2/D-3 pp. D-3–4 | PDF 943–944 |

Read the actual page images for visual/text requirements. The raster Figure
6-1 says **`NO XING`**, without a question mark; OCR supplied `NO XING?` is
wrong. Render/inspect PDF pages 547–548 if the earlier reference artifact is
not available. The supplied clipboard image is only a convenience reference;
do not commit it or depend on its temporary path at runtime.

Secondary sources are R07 <https://docs.virtualnas.net/crc/stars/#tools>,
R08 <https://pharr.org/vice/#minimum-separation>, and phase-required R02/R05
terminology sources in `phases/_shared/references.md`. These do not override
the supplied manual's clear form, error strings, or Figure 6-1 presentation.

## Approved contract and explicit trainer deltas

T02-204 owns the report-backed, constant-current-motion predictor. T02-205
owns dedicated unmodified Del with scope focus, two displayed track clicks,
Enter clear, Escape cancellation, and atomic errors. The manual does not
specify the numerical predictor/horizon, rounding for nonzero values,
viewport overflow behavior, exact pixel dimensions, incomplete-entry recovery,
or per-frame implementation. Preserve the approved choices and label them
as trainer choices, not fully specified STARS algorithms.

The manual's DSF/DSA `CMD NOT AVAIL` restriction is recorded, but no such
mode is implemented here. Do not reinterpret the MODE FSL datablock latch
as DSF/DSA, invent a mode, or return that error during ordinary MIN use.
Do not add an alternate keyboard or DCB entry surface.

## Graphics contract

- Draw each selected target's projection to its CPA position, two filled
  upright triangle markers, and the segment joining the CPA positions.
  Figure 6-1 shows upright triangles, not airplane icons or markers rotated
  with track heading. Both positions correspond to the same future time.
- Place a rectangular mileage box at the joining segment's midpoint. Show
  two-decimal horizontal distance followed by ` NM`, including exact
  `0.00 NM` for a zero prediction regardless of vertical separation. Render
  `NO XING` directly beneath the mileage only while horizontal separation
  increases; equal-velocity tracks must not receive that cue.
- Use existing white `PALETTE.ptl` (`#FFFFFF`) modulated by `view.brite.tls`.
  Use `view.charSizes.tools` and the existing Vice-derived font helpers.
  TLS zero hides all MIN ink but retains the pair. Font sizes follow existing
  TOOLS settings; do not create a separate font, slider, preference, or hue.
- Keep projections visible independently of global/per-track PTL switches;
  the MIN pair is its own tool. Preserve existing PTL geometry/enablement and
  do not duplicate or restyle the bold PTLs annotated in the manual figure.
  Do not copy the figure's explanatory arrows, prose, sample datablocks, or
  outer page frame into the operational scope graphic.
- Use the existing rectangular PPI coordinate system. Clip lines/markers to
  the viewport and keep the mileage/cue readout inside it when its nominal
  midpoint is outside. Clamping is an approved trainer presentation choice;
  never move the mathematical CPA positions or alter the reported distance.
- Keep the mileage/cue readable over geometry using the existing scope
  background. Protect its rectangle and prediction geometry from automatic
  datablock placement using the existing protected-geometry contract. Do not
  rewrite the layout solver, suppress existing alerts, or make MIN selectable
  as an aircraft. Save/restore canvas state around the stage.

## Lifecycle and sampling

Recompute from the latest displayed reports when they change, not from live
aircraft pose between scans. Conversion uses session magnetic variation
exactly once. Pair identities remain aircraft IDs across callsign/plan edits.
Camera pan/range/resize projects the same prediction in the new viewport.
Panning a previously active target outside the viewport does not delete the
pair; the on-screen requirement applies to selection and second-click
revalidation. Clip existing graphics until the view returns.

Clear active pair when either track is explicitly dropped/terminated, when
the aircraft is removed/despawns, or when either display report becomes
unavailable. Track drop includes F4/TERM CNTL and supported slash-symbol drop:
a still-moving unassociated LDB is not permission to retain the old pair after
the explicit drop. Preserve aircraft motion/plan/ownership semantics of those
existing actions; add only MIN cleanup. Loss-of-report cleanup follows the
approved trainer's immediate coverage-drop behavior, not a new coast model.

If the pending first track disappears or leaves the viewport before second
selection, the subsequent second attempt must still yield `ILL TRK` under
T02-205; do not silently erase that pending evidence and choose B as a new
first track. Reset active and pending MIN state when session/World is replaced,
including replacement with reused aircraft IDs. Exclude MIN state from PREF.
SITE changes resample as they do today; do not change sampler timing or
introduce live-truth fallbacks to keep a graphic alive.

## Acceptance Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Del, click A, click B | White projection lines, upright CPA triangles, joining segment, boxed two-decimal NM readout | MIN state only | No ordinary track-click effects | §6.4 p. 6-17; Figure 6-1 p. 6-18; Table B-1 p. B-1 |
| Del, click C, click D with existing A/B pair | Replace only after valid second click | At most one active pair | No orphan prior graphic | §6.4 replacement; approved atomic transition |
| Del, Enter | Remove pair and all its ink | Active/pending clear | Bare Enter without MIN does not clear or hijack existing command | §6.4 clear form |
| Exact horizontal crossing, differing altitudes | `0.00 NM` | Display only | No vertical-separation qualification or negative zero | Figure 6-1 p. 6-18 |
| Horizontal distance begins increasing | `NO XING` beneath mileage | Display only | Never `NO XING?`; do not show for equal-velocity constant-distance pair | Visual Figure 6-1 p. 6-18 |
| Live aircraft moves without new sampled report | MIN remains aligned with displayed target/report | No hidden interpolation | No live-position picker/projection drift | Approved surveillance-display delta |
| TOOLS size changes; TLS changes or zero | Text follows TOOLS; white ink follows TLS; zero hides ink without clearing pair | Existing display settings only | No new persisted control | §4.9.1 p. 4-47; §4.10 p. 4-74 |
| Global/per-track PTL off | MIN still shows its pair graphics | PTL state unchanged | No PTL-dependent suppression | §6.4 independent command; approved integration choice |
| Pan/range/resize puts CPA outside viewport | Correct clipped geometry and visible clamped readout | Active pair retained | No changed world prediction or distance | Approved viewport choice |
| F4/TERM CNTL or slash-symbol drop of either member | Remove active MIN pair even if LDB/aircraft remains | MIN cleanup only | Preserve existing drop semantics | §6.4 neither track dropped |
| Despawn/report loss/new session with reused IDs | Clear active pair or all session state as appropriate | MIN cleanup only | No ghost pair, no persistence | §6.4 track-drop boundary; approved report/session choices |
| Duplicate, lost-first, malformed, ambiguous input | Exact `DUP TRK`, `ILL TRK`, or `FORMAT` from T02-205 | Old valid pair retained; pending ends | No new error spelling or readback | §6.4; §2.14 Table 2-21; documented extensions |
| Search Help for minimum separation / inspect user docs | Actual Del forms, clear/cancel/errors, sampled linear prediction, horizontal-only limit | Documentation only | Never claim Del is real manual mapping or prediction is certified | Appendix D pp. D-3–4; approved deltas |

## Files and ownership

- `src/scope/render/renderScopePaint.ts`: MIN paint stage and protected
  geometry integration. Keep calculation/state helpers in
  `src/scope/minimumSeparation.ts`, not in the draw-order module.
- `src/scope/render/renderScope.ts`: add only the required stage call/order,
  after map/weather and before target/datablock/UI presentation.
- `src/scope/minimumSeparation.ts`, `src/scope/scopeView.ts`,
  `src/scope/trackDisplay.ts`, and existing drop call sites only as needed
  for MIN cleanup. Never split `scopeKeys.ts` or unrelated modules.
- `src/ui/shell.tsx`: clear MIN state alongside track/PTL session reset.
- `src/scope/keymap.ts`: complete Help command/navigation/search content.
  Inspect `src/ui/overlays/ScopeHelpOverlay.tsx` and its existing tests;
  change JSX only if the registry cannot express the required surface.
- `docs/USER.md`: operator forms, restrictions/errors, predictor and key deltas.
- `phases/02-scope/README.md`: append the feature addendum and acceptance
  status; do not rewrite old phase/swarm history or reapply stale key rules.
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`: mark this feature shipped only
  after acceptance, remove its outstanding priority item, and fix the older
  OCR-derived `NO XING?` reference to `NO XING` in its existing subsection.
  Preserve unrelated backlog entries; do not invent untouched future work.
- `src/scope/test/minimumSeparation.integration.test.ts`: extend the one
  synthetic feature integration/acceptance file from T02-205; reuse
  `src/scope/test/mockCanvas.ts`. Keep T02-204's small numerical unit file.

## Acceptance criteria and validation

- [ ] **AC1 — Automated:** End-to-end entry, one-pair replacement, exact
  errors, clear/cancel, and no forbidden click/World effects pass.
- [ ] **AC2 — Automated:** Canvas recordings verify projection endpoints,
  triangle/box/text structure, `NO XING`, zero separation, white/TLS styling,
  TOOLS sizing, PTL independence, and saved/restored paint state.
- [ ] **AC3 — Automated:** Sampled-pose alignment, nonzero magnetic variation,
  viewport projection/clipping, and protected readout layout pass.
- [ ] **AC4 — Automated:** Explicit drop, despawn, report loss, session reset
  with reused IDs, and pending lost-first rejection pass without changing
  sampler or ordinary track/drop behavior. PREF excludes MIN state.
- [ ] **AC5 — Automated/inspection:** Help/navigation/search, user docs, phase
  addendum, and backlog completion accurately match the implemented contract.
- [ ] **AC6 — Manual browser:** Perform Del/A/B, new-pair replacement,
  Del/Enter, duplicate/lost-first, and End/Help/radio/modal conflict walks.
  Compare a synthetic pair against Figure 6-1 for triangles, connecting line,
  boxed mileage, and text below; verify TOOLS/TLS and pan/range readability.
- [ ] **AC7 — Manual-source review:** Audit each table row against the cited
  pages and actual image; record manual facts versus approved trainer deltas.
  No unqualified claim of complete STARS/NAS implementation is permitted.
- [ ] **AC8 — Gate:** Focused tests, `npm run ci`, and `git diff --check` pass.

Record actual test commands/results and manual findings. If no browser visual
operator is available, record a specific manual leftover with reason; never
claim a screenshot/render recording proves a live browser pass. No new broad
benchmark suite is required for a single-pair calculation; flag an observed
regression against the existing 30-target/60 FPS envelope if one occurs.

## Non-goals and handoff

No RBL, route/turn forecasting, vertical separation advice, CA/MSAW/MCI
changes, new alerts/audio, new airport data, DSF/DSA modes, coast redesign,
new DCB control, persistent pairs, Command IR/parser/speech changes, or later
phase work. The existing warning/audio systems remain independent.

Return exactly `READY TO MERGE` or `BLOCKED`, followed by commit, completed
ACs, test/source-review results, manual evidence or explicit leftovers, and
remaining risks. Do not merge, push, spawn, or start a later phase. The
captain performs final gates on `feature/minimum-separation-graphics` and
returns the configured phase-exit result.
