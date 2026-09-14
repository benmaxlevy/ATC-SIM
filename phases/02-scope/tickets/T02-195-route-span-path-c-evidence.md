# T02-195 per-span Path C route evidence

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-194  
**Blocks:** T02-196  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

When deterministic route parsing misses, send Path C route-scoped candidate
alternatives grouped by transcript span. The self-hosted parser may repair
segmentation or narrow ASR noise only by selecting supplied candidates.

## Context

The current route context lists catalog candidates with exact spans, but does
not explicitly group alternatives for one noisy route span. The model can
therefore see a global list without a precise one-element-to-one-candidate
mapping. This ticket changes request context and validation, not Command IR.

## Research

- **R01:** FAA JO 7110.65,
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/;
  Search: `FAA JO 7110.65 route of flight clearance items`.
- **R02:** FAA Pilot/Controller Glossary,
  https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/;
  Search: `FAA glossary direct route NAVAID fix`.
- **R08:** vice trainer reference,
  https://pharr.org/vice/; Search: `vice ATC route direct command`.

The route-window evidence contract is a local constrained-parser design. It is
not a claim that an LLM is an FAA phraseology authority or executor.

## Contract

Proposed request shape:

```json
{
  "routeWindow": {
    "transcript": "kimmi swept direct",
    "fixMatches": [
      {
        "span": {"start": 0, "end": 5, "text": "kimmi"},
        "candidates": [
          {"id": "KIMMY", "kind": "FIX", "score": 0.6, "method": "levenshtein"}
        ]
      }
    ],
    "procedures": []
  }
}
```

Scores/methods are hints. Candidate IDs, spans, route order, and completeness
are authoritative. `DIRECT` and `THEN` are connectors. Terminal `DIRECT` may
target the separately grounded clearance limit only.

Preview/mode state: none. Path C is a local parser fallback; it cannot mutate
World, aircraft intent, flight plans, or clearance snapshots.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Local miss: `via kimmi swept direct`, one candidate per span | Path C returns ordered `KIMMY`, `SWEPT` segments | Existing application runs only after validation | Missing span evidence -> `PARSE_MISS` | FAA JO 7110.65 §§ 4-2-1, 4-4-1 |
| One span with two equal candidates | No unsupported silent choice | No state change | `PARSE_MISS` unless complete supplied evidence makes segmentation unique | Existing ambiguity contract |
| LLM returns `SWEPT_KIMMY` | Validator rejects | Prior state unchanged | Concatenated ID | T02-191 regression |
| LLM returns tactical `{type:"DIRECT", fixId:"ATL"}` | Validator rejects | No tactical dispatch | IFR `VIA` transcript must return `IFR_CLEARANCE` | T02-191 guard |
| LLM returns an unlisted ID or omits a non-connector span | Validator rejects | No state change | `PARSE_MISS` | Closed Command IR contract |
| Route followed by `ALT`, `CVIA`, `FREQ`, `SQ` | Only route window is supplied as route evidence | Optional fields remain in existing parser | Model cannot move optional fields into route | FAA JO 7110.65 § 4-2-1 |

## Scope

- Add per-span fix-match data to the frontend `PathCRouteWindow` contract.
- Build spans from the shared matcher and structured fix/navaid vocabulary.
- Include viable candidates and score/method metadata, capped by existing
  Path C limits and scoped to the route window.
- Update `routePathCOutputIsGrounded()` and related frontend checks to require
  one supported candidate per selected route element, ordered and evidenced.
- Update `speech-api/parse_engine.py` prompt, context rendering, semantic
  validation, mock tests, and eval corpus.
- Keep the output Command IR and `parse_grammar.gbnf` route segment shape
  unchanged; add parity tests proving the output contract remains identical.
- Keep all inference on the existing local self-hosted speech API.

## Implementation notes

- Use the shared matcher for candidate generation; do not create a second
  Levenshtein implementation in Python or Path C.
- Deterministic parsing accepts only a unique local winner through distance 1.
  Path C may receive the existing distance-2 retrieval candidates, but only as
  evidence-backed alternatives and never as an automatic snap.
- Overlapping spans remain possible for multi-word aliases; validator logic
  must select one complete ordered segmentation, not every overlapping row.
- Candidate IDs are canonical. The model must not return a noisy spelling.
- Airport candidates remain in `airports`/`clearanceLimits`, never
  `fixMatches`.

## Acceptance criteria

- [ ] Path C receives per-span candidate alternatives, not an unconstrained
  facility-wide fix list.
- [ ] Every selected route segment maps to one supplied candidate and one
  transcript-supported span.
- [ ] Unknown, omitted, concatenated, airport, tactical, malformed, and
  out-of-order outputs become `PARSE_MISS`.
- [ ] Deterministic local success prevents a Path C call.
- [ ] Prompt explicitly limits output to supplied candidates and preserves
  route order.
- [ ] Frontend and Python validation agree on route evidence semantics.
- [ ] No cloud inference, new provider, or new Command IR discriminant is
  introduced.

## Test plan

- TypeScript unit: span grouping, exact/alias/near candidate alternatives,
  overlapping phrase segmentation, airport exclusion, and validator guards.
- Python unit: prompt content, context rendering, candidate-per-span semantic
  checks, malformed output, omitted span, and hallucinated ID.
- Eval: exact chain, unique near-match chain, ambiguous alternatives,
  concatenated output, tactical-direct output, and airport injection.
- Contract: frontend/Python output parity and unchanged GBNF `EXPLICIT_ROUTE`.
- Manual: supplied STARS manual `/home/ben/Documents/stars refs/full_manual.pdf`,
  § 5.5.5 p. 5-105 and § 5.6.17 p. 5-167; mark Path C as trainer-only.

## Help/docs

Update `phases/_shared/parse-pipeline.md` and `phases/_shared/command-ir.md`
with the per-span evidence rule and explicit no-invention boundary. User
examples remain in T02-196.

## Out of scope

- Changing `EXPLICIT_ROUTE.segments[]` or adding a new instruction type.
- LLM as primary parser, executor, or route-connectivity engine.
- Candidate invention, broad fuzzy repair, airport search, or cloud APIs.

## Suggested files

- `src/parse/path-c.ts`
- `src/parse/parse-command.ts`
- `src/parse/test/path-c.test.ts`
- `speech-api/parse_engine.py`
- `speech-api/tests/test_parse.py`
- `speech-api/eval_parse.py`
- `speech-api/parse_grammar.gbnf`
- `phases/_shared/parse-pipeline.md`
- `phases/_shared/command-ir.md`

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including changed paths, focused
TypeScript/Python tests, `npm run ci`, speech mock pytest, and manual-review
notes. No merge or push by worker.
