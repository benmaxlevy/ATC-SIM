# T02-220 FMA Adaptation and AMZ Geometry

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** shipped catalog loading and generic navigation geometry on master\
**Blocks:** T02-221 through T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-220-fma-adaptation-and-amz-geometry`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Derive generic straight-parallel trainer AMZs from catalog approaches and threshold fixes, with a single validated catalog adaptation source for custom geometry. Generate runway groups and adjacent NTZs rather than unrelated pair-only volumes.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 2.16.4 pp. 2-107–108 (PDF 163–164): associated monitored targets, assigned NOZ history, alert qualification.
- Section 6.16 pp. 6-125–126 (PDF 655–656), Figure 6-15: multi-runway AMZ, NOZ/NTZ graphics, fix bar, 200-foot reference lines.
- Sections 6.16.2–3 pp. 6-130–131 (PDF 660–661): adapted AMZ selection and common runway-direction magnification.
- FAA AIM §§5-4-13–16, https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html : geometry alone does not prove PRM eligibility; SOIA needs offset approach-course and visual-transition geometry.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. Use existing catalog loading, ENU NM origin and magnetic/true heading helpers. The canonical inbound field is publishedCourseMagneticDeg; legacy courseDeg is accepted only at the loader boundary. Apply authored magnetic variation once. Do not add airport-specific switches.
2. Resolve finite threshold fixes; group distinct runway IDs, not approach rows. Prefer ILS, then LOC, then RNAV source procedures, using stable procedure-ID ordering within a type. Explicit adaptation may select another catalog procedure. Reciprocal runway ends do not form a parallel pair.
3. Use wrapped angular distance and a 1-degree same-direction candidate tolerance. Use a common circular-mean true course for a derived group; this is an explicit trainer straightening approximation. The ENU north-clockwise basis is along=(sin theta, cos theta), cross=(cos theta, -sin theta). Separation is abs(dx*cos(theta)-dy*sin(theta)), not the swapped expression in the original proposal.
4. Order members laterally and generate NTZs only between adjacent members whose separation satisfies the trainer candidate interval 2,500–9,000 ft. Support two through four runway members and one through three adjacent NTZs. Do not generate a zone spanning an intervening runway. More members or inconsistent geometry require an adaptation diagnostic rather than silently dropping a runway or DCB control.
5. Derived defaults are captureLengthNm=18, ntzWidthFt=2000, outerMarginNm=0.5, reference spacing exactly 200 ft, and departure extension to the reciprocal threshold when available or 1 NM otherwise. These dimensions and the 1-degree/spacing filters are trainer policies, not operational PRM qualification. Physical runway outlines use available endpoints; incomplete physical geometry carries approximation provenance.
6. The model contains stable AMZ ID/label/airport ID, selected source approach IDs, common course, ordered members, AMZ boundary, NOZs, adjacent NTZ IDs and runway adjacency, runway/course graphics, referenced fix bars, reference lines, monitoring parameters and derived/adapted provenance. Use boundary-inclusive polygons and positive NOZ widths. Fix bars use only actually referenced available fixes, including FAF; do not invent intermediate step-down fixes or a universal 0.2 NM width.
7. Catalog-owned fmaOverrides is the sole geometry adaptation source. It can select approaches/runways, replace dimensions, supply explicit AMZ/NOZ/NTZ polygons and graphics, and exclude unwanted derived groups. Scenario data may select initial AMZ or disable derived groups but may not duplicate the geometry owner. Validate stable unique IDs, finite vertices/dimensions, referenced procedures/fixes, positive widths, consistent zone/runway adjacency and supported member count. Missing optional fields use defaults; invalid authored values are never silently replaced. Malformed data has path-specific loader diagnostics; unresolved references disable the affected AMZ with visible diagnostics rather than fabricating coordinates.
8. Monitoring defaults passed forward: caution horizon 10 s, surveillance loss 10 s, coast-out 30 s, stabilization 10 s, course tolerance 3 degrees, alignment half-width 0.15 NM, maximum displayed FMA PTL 30 s. Keep caution horizon independent from displayed PTL. Optional explicit vertical limits may be carried by adaptation; do not invent a glideslope model or unapproved default altitude floor/ceiling.
9. This ticket has no operator grammar, key binding or live FMA mode. Load/derive is pure and deterministic; geometry exists in memory without altering World, assignment, ownership or flight controls. No persisted alert runtime.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Catalog has two same-direction runways and repeated ILS/LOC/RNAV rows | One deduplicated group and one adjacent NTZ | Pure in-memory geometry | No pair per procedure variant; input order does not change IDs | Figure 6-15; explicit derivation policy |
| North/east courses; 359.8 and 0.2 degrees | Correct cross separation and wrapped 0.4-degree difference | Magnetic conversion once | Along-track threshold staggering is not lateral separation | Existing ENU heading contract; §6.16.3 |
| Triple parallel synthetic thresholds | Two NTZs with correct runway adjacency | Group model only | No outer-to-outer NTZ crossing middle runway | Figures 6-15 and 6-17 |
| Reciprocal 09/27 or a single runway | No derived AMZ | Empty derived inventory | Do not make KDEM a parallel-runway fixture | Same-direction trainer qualification |
| Valid dimension override / explicit custom polygons | Adaptation replaces selected geometry | Catalog-owned configuration | Unknown reference disables affected AMZ; malformed numeric value is diagnosed, not defaulted | §6.16.2; explicit adaptation contract |

## Files and ownership

src/scenario/procedures/types.ts; src/scenario/procedures/loadCatalog.ts; generic src/scenario/types.ts / load.ts session binding where needed; new src/core/alerts/fmaGeometry.ts; src/core/index.ts exports; src/scope/test/fmaFidelity.integration.test.ts; minimal synthetic numeric units if needed.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: cardinal/oblique/wrapped headings, nonzero magnetic variation and staggered thresholds prove the basis and one-time conversion.**
- [ ] **AC2 — Automated: procedure deduplication, adjacent grouping, reciprocal/single/missing-threshold cases and stable IDs pass with synthetic fixtures.**
- [ ] **AC3 — Automated: valid, malformed, duplicate-ID, unknown-reference, unsupported-capacity and explicit-custom adaptation cases follow the loader contract.**
- [ ] **AC4 — Automated: reference line spacing remains 200 ft; supplied vertical constraints are finite and ordered when present.**
- [ ] **AC5 — Inspection: no live facility branches or World/intent/assignment changes. Any required committed airport contract check is separate from generic unit suites.**
- [ ] **AC6 — Manual: verify Figure 6-15 raster and label every dimension/selection approximation rather than claiming a published derivation algorithm.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Document schema, units, provenance, diagnostics, defaults and straight-parallel/SOIA boundary in docs/USER.md and phases/02-scope/README.md. Amend historical FMA exclusions through a current addendum; preserve historical tickets.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No DCB/input/audio, coast evaluator, operational PRM certification, automatic SOIA generation, catalog-specific code, new procedure flight behavior or radio parser changes.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
