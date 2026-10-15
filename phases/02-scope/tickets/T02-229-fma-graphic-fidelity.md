# T02-229 FMA Graphic Fidelity

**Phase:** 02 Scope\
**Depends on:** T02-227\
**Blocks:** T02-230, final T02-228 reconciliation\
**Merge target:** feature/fma\
**Branch:** ticket/T02-229-fma-graphic-fidelity

## Mission

Correct the FMA map hierarchy and geometric extents observed in the supplied screenshots, without changing physical reference spacing or controller commands.

## Authority and trainer policy

Raytheon TI 6191.409 Rev30 manual `/home/ben/Documents/stars refs/full_manual.pdf`: Figure 6-15 p.6-126 (PDF656); §6.16.3 p.6-131 (PDF661); Table4-1 p.4-74 (PDF284). Inspect the actual figure raster. MAG is lateral-only magnification 1–8 about stationary screen center; reference spacing remains 200 ft. Pixel widths and dash lengths are trainer styling, not published measurements.

## Contract

1. Render thin NOZ contours and AMZ boundary, bold NTZ outlines, distinct thick gray runway segments and dashed white approach/departure course extensions. Starting CSS widths: NOZ/AMZ1, NTZ3, runway5, course1–1.5, references0.5–0.75; refine coherently from visual evidence. Keep glyph/text scale unchanged. NOZ contours use existing RWY brightness as documented trainer grouping; no new brightness menu. Shared NOZ/NTZ edges retain bold NTZ appearance.
2. Separate physical runway endpoints from departure extension endpoints. Derived departure course lines begin at the physical departure end and have positive visible length toward the AMZ departure boundary. Preserve authored explicit geometry/course lines. Document any default extension/fallback as trainer policy; do not invent physical runway dimensions from a screenshot. Ensure AMZ contains derived graphic extensions and preserve valid NOZ/NTZ topology.
3. Generate reference bands aligned to each course, at exact 200-ft nonzero lateral offsets, clipped to the approach/NOZ portions shown in the example rather than filling the entire AMZ/NTZ/departure area. Do not paint a solid zero-offset reference over a dashed course. Preserve genuine 200-ft world spacing at all MAGs; never widen physical spacing or add unapproved pixel-spacing suppression.
4. Reference eligibility is range/MAG <=16 NM, with existing REF brightness visibility. MAG>1 removes range rings and compass rose without overwriting preferences; MAG1 or FMA exit restores stored visibility. Audit actual paint and projection paths, not helper-only predicates.
5. Restore canvas dash/width/style state after each layer. Draw references and thin contours below bold NTZ/alert outlines and runway marks. Keep NTZ warning/caution color persistence and inhibit-boundary removal unchanged. North-up orientation stays; ATL courses are naturally horizontal.
6. No new grammar, shortcut or error mnemonic. Existing MAG adjustment, rollback, BRITE channels, picking and world measurements remain intact. Fix-bar placement/span is audited against the figure; change only if justified and document adaptation assumptions.

## Contract matrix

| Input/form | Expected result | State/side effect | Rejection/edge case | Evidence |
| --- | --- | --- | --- | --- |
| Synthetic parallel runways, MAG1/4/8 | Thin NOZ, bold NTZ, thick runway, dashed courses | Paint only; correct projected geometry | Shared edges cannot erase NTZ weight; dash state restored | Figure6-15 |
| Reciprocal threshold and departure extension | Physical runway ends before dashed departure extension | Derived geometry only | Missing reciprocal uses documented fallback; authored coordinates preserved | Figure6-15; trainer derivation |
| 200-ft reference offsets | Exact world spacing, approach/NOZ clipping | No physical spacing change | No zero-offset solid overlay or lines through NTZ | Figure6-15; §6.16.3 |
| Range30/MAG2 versus Range40/MAG2 | References shown versus hidden | Existing REF brightness respected | Boundary16 included; REF0 hides | Figure6-15 note2 |
| MAG1 ->4 ->1 / FMA exit | Rings and compass suppressed then restored | Stored settings unchanged | Previously disabled rings stay disabled | Figure6-15 note4 |

## Ownership and acceptance

src/core/alerts/fmaGeometry.ts; src/scope/render/renderScopePaint.ts; projection/map helpers only as needed; shared acceptance; docs/USER.md and phase README. Preserve thin render orchestrator.

- [ ] AC1: observable stroke hierarchy and dashed paths, canvas state restoration, warning/caution and inhibit invariants.
- [ ] AC2: separate runway/departure extents and valid containment using synthetic geometry; authored adaptation preserved.
- [ ] AC3: 200-ft spacing, band clipping and MAG1/4/8 projection assertions; both range/MAG boundary sides and exact16.
- [ ] AC4: actual renderer suppresses/restores rings/compass while preserving stored preferences.
- [ ] AC5: manual raster comparison and real browser screenshot, or explicitly UNRUN browser limitation; trainer dimensions documented.

## Validation and handoff

Use synthetic minimal catalogs and the shared `src/scope/test/fmaFidelity.integration.test.ts`; reuse `mockCanvas.ts`. Run focused checks, `npm run ci`, and `git diff --check` before explicit-path commits. Captain performs supplied-manual primary and independent review before squash, then CI and post-merge review. Browser evidence must be actual or explicitly UNRUN. Preserve unrelated worktrees and artifacts. No merge, push, spawn, reset, clean, force, radio/Command IR/speech-backend changes. Return READY TO MERGE or BLOCKED with AC, commit, test and manual evidence.
