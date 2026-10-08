# T03-30 Path C and GBNF alias parity

**Phase:** 03 Voice  
**Priority:** P0  
**Size:** L  
**Depends on:** T03-27, T03-29  
**Blocks:** T03-31  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Keep optional local Path C, its prompt, semantic validator, GBNF, mocks, and
live-eval contract aligned with alias-aware callsign grounding. Path C may
recognize noisy alias speech, but must return a canonical listed callsign.

## Context

Path C currently receives only canonical `callsigns: string[]`, and its prompt
requires an on-frequency ICAO token. Alias candidates need structured context.
The browser remains the schema authority; Path C remains salvage after local
parser miss and never becomes the primary parser.

## Research

- R01/R03: official aircraft identity and pilot callsign terminology.
- Shared contract: `phases/_shared/parse-pipeline.md` and
  `phases/_shared/command-ir.md`.
- Trainer delta: local Path C may use authored alias evidence; it may not claim
  FAA-complete natural-language understanding.

## Scope

- Extend TypeScript Path C context with canonical callsign plus aliases.
- Extend Python context sanitization and prompt construction with the same
  bounded candidate shape.
- Update `speech-api/parse_engine.py` semantic grounding to map noisy
  `Skyhawk 123` only to one listed canonical candidate.
- Update `speech-api/parse_grammar.gbnf` callsign output production so
  `callsignToken` emits canonical tokens, including five-digit N-numbers;
  alias text is input evidence, never output identity.
- Update prompt, GBNF, semantic validator, mock response, contract tests, and
  live eval corpus together.
- Add a frontend/backend parity guard for the candidate schema and canonical
  output rule.
- Preserve `{ text, source, schemaVersion }` request shape.
- Preserve Path C off-by-default and local-only restrictions.

## Exact forms and rejection behavior

- `Skyhawk 123 H270` with one candidate `N123` → canonical `N123`.
- No candidate or unknown alias → `PARSE_MISS`.
- Multiple matching candidates → `PARSE_MISS`.
- Alias-only or incomplete tail → `PARSE_MISS`.
- Local Path A/B success → Path C is not fetched.
- Illegal model output or non-canonical callsign → schema/semantic miss; no
  dispatch.

## Out of scope

- New Command IR instruction types.
- Cloud/paid inference.
- N-best or confidence request fields.
- Path C becoming required for phase exit.
- Alias matching without supplied live candidates.

## Implementation notes

The GBNF change is an output-contract change: it constrains canonical
`callsignToken`; it does not make the model authoritative for aliases. Keep
browser and Python candidate limits bounded and use the same canonicalization.

No preview/mode state or command lifecycle is added. Timeout, unavailable API,
schema miss, and ambiguous result remain soft parse misses with no mutation.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Noisy `Skyhawk one two three` + `[N123/Skyhawk]` | Path C returns `N123` | Browser applies normal Command IR | Candidate not listed → `PARSE_MISS` |
| Same alias + two candidates | No result | No dispatch | Ambiguous → `PARSE_MISS` |
| `N12345` | GBNF/validator accepts canonical five-digit token | Complete identity preserved | Truncated token rejected |
| Model returns `Skyhawk 123` | Semantic validation rejects non-canonical output | No mutation | Alias cannot enter Command IR |
| Local Path A/B hit | Path C is not called | Deterministic path wins | No model override |
| `/parse` unavailable/timeout | Soft miss | Sim tick continues | No uncaught exception |

## Acceptance criteria

- [ ] **AC1:** TypeScript and Python candidate schemas agree.
- [ ] **AC2:** Prompt explains alias-to-canonical grounding and ambiguity rules.
- [ ] **AC3:** GBNF accepts required canonical N-number forms through five digits
  and rejects non-canonical alias output.
- [ ] **AC4:** Semantic validator rejects unknown, ambiguous, alias-shaped, or
  unlisted callsign outputs.
- [ ] **AC5:** Mock/contract/live-eval fixtures cover canonical, alias, unknown,
  ambiguous, incomplete, five-digit, and local-hit bypass cases.
- [ ] **AC6:** Path C request shape and off-by-default behavior remain unchanged.
- [ ] **AC7:** Frontend parity guard prevents schema drift.
- [ ] **AC8 — Research:** README/prompt comments label Path C as local salvage
  and document the trainer delta.

## Test plan

- Unit: TypeScript context/schema and Path C grounding.
- API: Python sanitizer, prompt, GBNF, semantic validator, mock contract.
- Eval: add compact alias cases to the live eval corpus without audio.
- Manual: optional local `/parse` run with one and two alias candidates.

## Help/docs

T03-31 documents that Path C is optional salvage and that aliases resolve to
canonical N-numbers.

## Suggested files

- `src/parse/path-c.ts`
- `src/parse/parse-command.ts`
- `speech-api/parse_engine.py`
- `speech-api/parse_grammar.gbnf`
- `speech-api/README.md`
- Path C and speech-api tests/eval fixtures

