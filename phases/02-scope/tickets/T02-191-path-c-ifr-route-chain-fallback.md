# T02-191 Path-C IFR route-chain fallback and parity

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-189, T02-190  
**Blocks:** T02-192  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only; stop at configured boundary.

## Mission

Make the self-hosted Path-C parser a constrained fallback for route-window
segmentation. Deterministic parsing runs first. If it cannot form one complete
route chain, Path C receives the route-window transcript and catalog-grounded
candidate matches, then may select and order only those candidates.

Path C may repair segmentation and narrow ASR noise. It may not invent a fix,
navaid, procedure, transition, airport, route leg, or clearance field.

## Contract

Path C receives:

```text
full transcript
route window after VIA and before the next clearance section
catalog candidates with IDs, kinds, aliases, and transcript spans
airport candidates only in the clearance-limit context
```

For an explicit route it returns the canonical `EXPLICIT_ROUTE` Command IR
from T02-189. `DIRECT` markers are evidence of explicit direct semantics;
catalog-grounded fix/navaid candidates without a marker are still direct
segments. Procedure candidates may include a catalog-valid transition.

The response remains closed-schema JSON. Every returned ID must be present in
the supplied candidate set and every segment must have transcript evidence.
Validation occurs again after model output. Invalid output becomes
`PARSE_MISS`.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Deterministic miss: `via direct swept direct hound` | Path C selects supplied SWEPT/HOUND candidates in order | No mutation before application | Missing evidence -> `PARSE_MISS` | FAA JO 7110.65 §§4-2-5, 4-4-1 |
| `via swept hound maintain 7000` | Model sees only route window `swept hound` | `MAINTAIN` remains an optional field outside route | Model cannot move `MAINTAIN` into route | FAA JO 7110.65 §4-2-1 |
| Procedure plus transition candidates | Returns one supplied procedure/transition pair | Canonical IR only | Invented transition or ambiguous pair -> `PARSE_MISS` | FAA JO 7110.65 §§4-2-1, 4-4-2 |
| Candidate list excludes airport route IDs | Route contains only fixes/navaids/procedures | Airport remains limit-only | Airport ID in segment -> `PARSE_MISS` | Supplied STARS manual §§5.5.5 p. 5-95, 5.6.17 p. 5-167 |
| Model returns unknown ID, duplicate malformed segment, or prose | Validator rejects response | No world/aircraft state change | Exact API error `PARSE_MISS` | Closed Command IR contract |
| Path C output for any chain | Matches frontend schema and deterministic meaning | Normal existing clearance application only after validation | Unsupported discriminant fails parity guard | T02-182 parity contract |

## Scope

- Extend frontend Path-C request context with route-window candidate matches and
  transcript evidence.
- Update the closed frontend schema for `EXPLICIT_ROUTE`.
- Update `speech-api/parse_engine.py` instruction types, system prompt, route
  grounding validator, and semantic checks.
- Update `speech-api/parse_grammar.gbnf` for arbitrary segment arrays.
- Teach the prompt that `DIRECT` is optional route syntax and absent `DIRECT`
  implies direct only for supplied fix/navaid candidates.
- Keep model inference local/self-hosted through the existing speech API.
- Add parity guard so frontend and Python discriminants cannot diverge.
- Add synthetic mock tests and live eval cases with three-plus route legs,
  mixed procedures, ambiguous candidates, airport injection, and hallucinated
  IDs.
- Update `speech-api/README.md` and shared parser/IR docs.

## Acceptance criteria

- [ ] Path C is attempted only after deterministic route parsing misses or
  produces no unique grounded chain.
- [ ] Path C receives route-window-scoped catalog evidence, not unconstrained
  facility search.
- [ ] Returned route IDs are restricted to supplied candidates and transcript
  evidence.
- [ ] Implicit direct semantics work when `DIRECT` is absent.
- [ ] Unknown, hallucinated, airport, ambiguous, malformed, and unsupported
  outputs return `PARSE_MISS`.
- [ ] Frontend schema, GBNF, prompt, semantic validator, catalog validator,
  tests, and eval corpus agree on `EXPLICIT_ROUTE`.
- [ ] No cloud inference, metered speech SDK, or unconstrained fuzzy repair is
  added.

## Test plan

TypeScript:

- Path-C request-context candidate spans and schema tests.
- Deterministic miss followed by valid constrained fallback.
- Candidate omission, airport injection, unknown ID, malformed array, and
  transcript-evidence failures.
- Frontend/Python instruction parity guard.

Python:

- GBNF and semantic validation for empty, one, three, and many segments.
- Prompt contract tests for implicit/explicit `DIRECT`.
- Catalog guard tests for fix/navaid/procedure/transition candidates.
- Mock eval cases for exact Atlanta/SWEPT regression and invalid near-misses.
- `cd speech-api && SPEECH_API_MOCK=1 pytest`.

## Manual review

- Review route candidate evidence and direct semantics against FAA JO 7110.65
  §§4-2-1, 4-2-5, 4-4-1, and 4-4-2.
- Review issued route and active snapshot behavior against supplied STARS
  manual §§5.5.5 p. 5-95 and 5.6.17 p. 5-167.
- Run local self-hosted evals; confirm no cloud endpoint or metered provider
  is used.

## Non-goals

No cloud LLM, unrestricted facility search, candidate invention, generic
fuzzy-repair layer, airway/radial interpretation, airport route legs, new
Command IR instruction family, or changes to non-clearance Path-C commands.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, including changed paths,
focused TypeScript/Python tests, `npm run ci`, speech mock pytest, and
manual/FAA review notes. No merge or push by worker.
