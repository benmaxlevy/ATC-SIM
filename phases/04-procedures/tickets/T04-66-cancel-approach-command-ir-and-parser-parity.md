# T04-66 Cancel approach Command IR and parser parity

**Phase:** 04 Procedures (seventy-second swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-65
**Blocks:** T04-67
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Add a generic `CANCEL_APPROACH` radio instruction. Typed, deterministic spoken,
and self-hosted Path C parsing must produce the same closed Command IR. The
command has no approach ID and must preserve later heading/altitude instructions
in transmission order.

## Context

FAA phraseology is “CANCEL APPROACH CLEARANCE (additional instructions as
necessary).” This is generic approach phraseology, not an ILS-only command.
The current IR has `CLEARED_APPROACH`, `INTERCEPT_LOCALIZER`, and `GO_AROUND`,
but no cancellation instruction.

The typed token is intentionally `CAPP`, not `CA`: `CA` is already a scope
Conflict Alert command family. This is a trainer token, not a claim of
vice-compatible syntax.

## Research

- **R01:** FAA JO 7110.65, §4-8-1, Approach Clearance Procedures:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_8.html
- **R03:** FAA AIM, §5-4, Arrival Procedures:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html
- Official term: **cancel approach clearance**.
- Trainer delta: `CAPP` is a vice-inspired typed token; spoken parsing uses
  FAA-shaped English; Path C is constrained local salvage, not complete NAS NLU.

## Command and parser contract

IR:

```ts
{ type: "CANCEL_APPROACH" }
```

Typed forms:

- `CAPP`
- `CAPP H270 A50`
- `CAPP R270 A50`

Spoken forms:

- `cancel approach clearance`
- `cancel approach clearance, fly heading 270, maintain 5000`
- `cancel approach clearance, turn right heading 270, climb and maintain 5000`

Grammar rules:

- `CANCEL_APPROACH` must be first and may occur only once.
- It carries no approach ID.
- Later instructions retain existing grammar and order.
- A later `CLEARED_APPROACH`, `INTERCEPT_LOCALIZER`, `EXPECT_APPROACH`,
  `GO_AROUND`, or `CANCEL_APPROACH` is a parser-level `BAD_CLEARANCE`.
- `cancel approach` is incomplete and returns `PARSE_MISS` for spoken input.
- `CAPP ILS27` is a typed syntax error; `CAPP` never consumes an ID.
- Punctuation and comma removal remain owned by `normalizeSpoken`.
- `CA` remains scope-only and must not become a radio alias.

No Preview Area, scope focus, modifier, list, or association state applies.
The entry route is command line or PTT transcript through the shared parser.

## Command contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `CAPP` | One `CANCEL_APPROACH` instruction | No parse-time mutation | Trailing unknown token is rejected | R01 §4-8-1 |
| `CAPP H270 A50` | Cancel, heading 270, maintain 5000 | Ordered IR preserved | Missing number rejects; `CAPP` must be first | R01 §4-8-1 |
| `cancel approach clearance` | One `CANCEL_APPROACH` | No parse-time mutation | `cancel approach` returns `PARSE_MISS` | R01 §4-8-1 |
| Canonical combined spoken command | `[CANCEL_APPROACH, FLY_HEADING, ALTITUDE]` | Order preserved for pilot projection | `cancel approach clearance, cleared ILS...` returns `BAD_CLEARANCE` | R01 §4-8-1 |
| `CA H270` | Existing scope token remains outside radio parser | No radio IR | Must not parse as `CANCEL_APPROACH` | Existing scope CA contract |
| Path C noisy cancellation | Same IR only with transcript evidence | No invented approach ID | `cancel IFR` or unsupported prose returns `PARSE_MISS` | Shared Path C contract |

## Scope

- Add `CANCEL_APPROACH` to `src/core/command/types.ts` and `INSTRUCTION_TYPES`.
- Update `_shared/command-ir.md` and `_shared/parse-pipeline.md` in this change.
- Add typed parsing in `src/parse/parseRadioText.ts` and token constants.
- Add Path A parsing in `src/parse/spoken/grammar.ts`.
- Add Path B island parsing and precedence in `src/parse/spoken/pattern-matcher.ts`.
- Add readback text in `src/pilot/readback.ts`:
  `cancel approach clearance`.
- Add `speech-api` instruction set, validator, prompt, GBNF, evidence guard,
  mock/contract tests, and eval cases.
- Update Phase 4 README command/readback documentation.

## Out of scope

- Pilot validation or intent mutation; T04-67 owns those.
- Missed-approach, landing, tower, CA, MSAW, or catalog changes.
- New scope command aliases or Preview Area behavior.
- Cloud inference or unconstrained fuzzy repair.

## Acceptance criteria

- [ ] `Instruction` and runtime discriminant include `CANCEL_APPROACH`.
- [ ] Typed `CAPP` parses as one zero-argument instruction.
- [ ] Spoken canonical and combined forms parse with exact order.
- [ ] Incomplete, malformed, duplicate, approach-rearm, and `CA` conflict cases reject.
- [ ] Readback emits `cancel approach clearance`.
- [ ] Path C schema, GBNF, prompt, semantic evidence, eval, and parity tests pass.
- [ ] Shared command docs and Phase 4 README document syntax, ordering, trainer delta.

## Test plan

- Unit: typed parser, Path A, Path B, readback, malformed and ordering cases.
- Parity: `cd speech-api && SPEECH_API_MOCK=1 pytest`.
- Repo gate: `npm run ci`.
- Manual: issue typed and spoken canonical forms through command line/PTT; verify
  same instruction order in command log and readback.

## Suggested files

- `src/core/command/types.ts`
- `src/parse/tokens.ts`
- `src/parse/parseRadioText.ts`
- `src/parse/spoken/grammar.ts`
- `src/parse/spoken/pattern-matcher.ts`
- `src/pilot/readback.ts`
- `speech-api/parse_engine.py`
- `speech-api/parse_grammar.gbnf`
- `speech-api/eval_parse.py`
- `speech-api/tests/test_parse.py`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`
- `phases/04-procedures/README.md`

