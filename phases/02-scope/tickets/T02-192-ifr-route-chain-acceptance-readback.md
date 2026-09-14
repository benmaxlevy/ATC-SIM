# T02-192 IFR route-chain acceptance, readback, and documentation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-190, T02-191  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only; stop at configured boundary.

## Mission

Prove the complete route-chain behavior through typed parsing, deterministic
spoken parsing, constrained Path-C fallback, application, FMS execution,
readback, Help, and user documentation.

## Contract

The existing IFR clearance entry and optional-field order remain unchanged:

```text
<ACID> CLR|CLEARED TO <LIMIT>
  AS FILED
  | VIA DIRECT
  | VIA <route-window>
  | VIA RADAR VECTORS
  [ALT <hundreds>] [CVIA] [FREQ <value>] [SQ <code>]
```

The route window may contain any number of catalog-grounded fixes, navaids,
procedures, and transitions. `DIRECT` is optional before route points and
terminal `DIRECT` means direct to the clearance limit. Readback preserves
route order and identifies the explicit route without collapsing it to one
intermediate fix.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Exact Atlanta regression with `via direct swept direct` | Parses KATL plus SWEPT route leg | Aircraft receives active route snapshot | Existing `PARSE_MISS` regression is fixed | FAA JO 7110.65 §§4-2-1, 4-2-5 |
| Three direct points without markers | Applies all points in order | FMS advances through every point | Unknown point leaves prior state unchanged | FAA JO 7110.65 §§4-4-1, 4-4-2 |
| Mixed procedure/fix chain via deterministic path | Applies canonical route and readback | Plan remains unchanged | Ambiguous procedure/transition -> `PARSE_MISS` or `UNABLE_ROUTE` at existing layer | FAA JO 7110.65 §§4-2-1, 4-4-2 |
| Same chain recovered by Path C | Same IR, application, and readback | No side effect before validation | Hallucinated candidate -> `PARSE_MISS` | T02-182 closed-schema contract |
| Route followed by `ALT`, `CVIA`, `FREQ`, `SQ` | Route and optionals apply in existing order | Optional state changes remain aircraft-only where required | Reordered/duplicate optional -> existing `PARSE_MISS`/`UNABLE_CLEARANCE` | FAA JO 7110.65 §§4-2-1, 4-3-2/3, 5-2-1 |
| Invalid chain with an existing clearance | New clearance rejected | Existing active route, plan, and aircraft state stay unchanged | Exact application code `UNABLE_ROUTE` | Supplied STARS manual §§5.5.5 p. 5-105, 5.6.17 p. 5-167; trainer contract |

## Scope

- Add one feature-level acceptance/integration suite using synthetic catalogs,
  plus the exact Atlanta/SWEPT regression against committed facility data.
- Verify parity across typed, Path A, Path B, and Path C routes.
- Update `src/pilot/readback.ts` and readback tests for ordered chains.
- Update Help and `docs/USER.md` with exact supported forms, implicit-direct
  behavior, examples, and the trainer-only constrained Path-C fallback.
- Verify no flight-plan mutation, no tactical-direct regression, and no route
  truncation.
- Record the manual/FAA review and any trainer-vs-real-system delta.

## Acceptance criteria

- [ ] One acceptance suite covers the complete route-chain lifecycle.
- [ ] All parser paths produce equivalent canonical route segments.
- [ ] FMS execution visits every segment in order.
- [ ] Readback preserves all route segments and does not emit legacy
  one-intermediate phrasing for a longer chain.
- [ ] Invalid or ambiguous chains are atomic and retain prior state.
- [ ] Help and `docs/USER.md` match the implemented grammar and fallback rules.
- [ ] Existing direct, SID, STAR, as-filed, vector, optionals, and squawk
  provenance behavior remains green.

## Test plan

- Feature-level typed/spoken/Path-C route-chain acceptance suite.
- Readback tests for zero, one, three, and mixed procedure segments.
- FMS cursor/execution tests for long chains and limit termination.
- Atomic rejection with an existing active clearance.
- Optional-field ordering, duplicate, incomplete, unknown, ambiguous, and
  airport-as-route cases.
- `npm run ci`.
- `cd speech-api && SPEECH_API_MOCK=1 pytest` because the feature changes the
  speech contract.

## Manual review

- Review clearance item order and route content against FAA JO 7110.65
  §§4-2-1, 4-2-5, 4-4-1, and 4-4-2.
- Review flight-plan create/modify presentation against supplied STARS manual
  §§5.5.5 p. 5-105 and 5.6.17 p. 5-167. Treat route snapshot/readback
  semantics as ATC-SIM trainer behavior.
- Review Help and `docs/USER.md` text manually for exact grammar.
- Label implicit-direct parsing and constrained Path-C recovery as ATC-SIM
  trainer behavior where it extends published phraseology.

## Non-goals

No route amendment command family, airway expansion, holds/EFC, vectors-to-final,
VFR pickup/airfile, cloud inference, broad ASR repair, airport search, or new
facility-specific data branches.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, including changed paths,
focused tests, both CI gates, and manual/FAA review notes. No merge or push by
worker.
