# T02-193 shared fix matcher and deterministic route grounding

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-190, T02-191  
**Blocks:** T02-194  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make tactical fix grounding and deterministic IFR route grounding use one
matching implementation. Preserve `groundFixToCatalog()` as the scalar
`string | null` API while exposing ranked candidate details for later Path C
context construction.

## Context

`groundFixToCatalog()` currently owns exact, spoken-alias, folded, and unique
Levenshtein-`<=1` matching. `scanIfrClearanceRouteWindow()` currently bypasses
it and uses exact aliases only. This mismatch makes a fix resolvable after
`DIRECT` but not inside a `VIA` chain.

The route remains the canonical `EXPLICIT_ROUTE.segments[]` contract from
T02-189. `DIRECT` remains a connector inside an IFR route and a separate
tactical instruction outside IFR clearance syntax.

## Research

- **R01:** FAA JO 7110.65, https://www.faa.gov/air_traffic/publications/atpubs/atc_html/;
  Search: `FAA JO 7110.65 direct route clearance 4-4-1`.
- **R02:** FAA Pilot/Controller Glossary,
  https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/;
  Search: `FAA Pilot Controller Glossary route direct NAVAID`.
- **R11:** CIFP/NASR identifiers, as listed in `phases/_shared/references.md`;
  Search: `FAA CIFP fix navaid identifiers`.

FAA terms support clearance limits, routes, fixes, and NAVAIDs. Shared
Levenshtein repair is an ATC-SIM trainer delta and must remain narrow,
catalog-grounded, and transcript-evidence-gated.

## Contract

Entry and routing remain unchanged:

```text
<ACID> CLR|CLEAR|CLEARED TO <LIMIT> VIA <ROUTE-SECTION>
```

The route section ends at the existing clearance-field boundary. Each route
element is one catalog fix/navaid or one catalog procedure/transition. A
missing `DIRECT` still means implicit direct. Optional fields remain ordered:
`ALT`, `CVIA`, `FREQ`, `SQ`.

Preview/mode state: none. This is parser-only radio behavior; it does not use
scope preview, does not construct a scope command, and does not mutate World.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `cleared to KATL via KIMMY SWEPT` with both IDs listed | Ordered `DIRECT KIMMY`, `DIRECT SWEPT` | No mutation during parsing | Incomplete route returns `PARSE_MISS` | FAA JO 7110.65 §§ 4-2-1, 4-4-1 |
| `cleared to KATL via KIMMI SWEPR` with unique distance-1 matches | Same canonical IDs as above | Deterministic path wins; no Path C call | Equal-best candidates remain a miss | Trainer matching delta; R01 |
| `cleared to KATL via SEE MAX HOUND` | Longest catalog alias plus `HOUND` | Token order preserved | Competing complete segmentations return `PARSE_MISS` | Existing T02-190 contract |
| `cleared direct KIMMI` | Tactical `DIRECT KIMMY` when uniquely grounded | Existing tactical path only | Must not become `IFR_CLEARANCE` | R01 direct terminology |
| `cleared to KATL via KIMMY` with no listed `KIMMY` | No command | No mutation | Final error `PARSE_MISS`; no fabricated ID | Data-first rule; R11 |
| `via direct ALT 50` | Empty explicit route, then altitude | Existing optional field behavior | `via` without body remains `PARSE_MISS` | FAA JO 7110.65 § 4-2-1 |

## Scope

- Extract one ranked fix-candidate implementation from the current
  `groundFixToCatalog()` and `retrieveFix()` logic.
- Keep scalar grounding semantics: exact/alias/folded candidates outrank
  near matches; a unique best Levenshtein-`<=1` candidate grounds; ties do not.
- Have the route scanner call the shared matcher for every phrase length while
  preserving longest-match and complete-chain backtracking.
- Keep distance-2 candidates out of deterministic acceptance; expose them only
  through the existing Path C retrieval policy in T02-195.
- Preserve string-ID inputs for existing tests and callers.
- Update the parser pipeline contract to state that route and tactical fix
  grounding share the matcher.

## Implementation notes

- Add a candidate result type containing `id`, score/tier, method, and optional
  distance. Candidate ranking must be implemented once.
- `groundFixToCatalog()` delegates to the shared implementation and returns
  one ID only for a unique accepted winner.
- `retrieveFix()` delegates to the same scorer, preserving its current floor,
  margin, and distance-2 Path C behavior.
- Route matching must not concatenate adjacent tokens, greedily truncate a
  long alias, or use file order to resolve a tie.
- Existing `PARSE_MISS` and application `UNABLE_ROUTE` boundaries remain.

## Acceptance criteria

- [ ] `groundFixToCatalog()` and route scanning use one matching/ranking source.
- [ ] Unique exact, alias, folded, and Levenshtein-`<=1` matches behave the
  same in tactical and route forms.
- [ ] Ambiguous candidates never become a deterministic route segment.
- [ ] Arbitrary route length, optional `DIRECT`, terminal `DIRECT`, and
  multi-word longest-match behavior remain green.
- [ ] Tactical `DIRECT` remains separate from IFR `VIA` parsing.
- [ ] Unknown or incomplete route input reaches final `PARSE_MISS` without
  constructing or applying a command.
- [ ] Existing retrieval score floor/margin behavior remains unchanged.
- [ ] `phases/_shared/parse-pipeline.md` records the shared matcher and its
  trainer-only fuzzy boundary.

## Test plan

- Unit: candidate tier ordering, exact/alias/folded/distance-1 matches,
  ambiguity, distance-2 exclusion, and retrieval parity.
- Unit: route scanner for adjacent noisy fixes, explicit/implicit `DIRECT`,
  multi-word aliases, long chains, duplicate markers, and boundaries.
- Regression: existing Atlanta/SWEPT examples and tactical direct tests.
- Integration: no World or active-clearance mutation on parser miss.
- Manual: review direct/route terminology against R01 and supplied manual
  `/home/ben/Documents/stars refs/full_manual.pdf`, § 5.5.5 p. 5-105 and
  § 5.6.17 p. 5-167.

## Help/docs

No new key or mode. Update only the shared parser contract in scope for this
ticket; user-facing route examples are finalized by T02-196.

## Out of scope

- Structured navaid names/aliases in live World wiring (T02-194).
- Path C context, prompt, validator, or Python changes (T02-195).
- New Command IR types, airway expansion, route connectivity, or airport
  search.

## Suggested files

- `src/parse/spoken/catalog-ground.ts`
- `src/parse/spoken/catalog-retrieve.ts`
- `src/parse/ifr-clearance-route-window.ts`
- `src/parse/parse-command.ts`
- `src/parse/test/ifrClearance.test.ts`
- `src/parse/test/direct.test.ts`
- `phases/_shared/parse-pipeline.md`

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including changed paths, focused
tests, `npm run ci`, and manual-review notes. No merge or push by worker.
