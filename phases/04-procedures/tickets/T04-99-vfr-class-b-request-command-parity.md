# T04-99 VFR Class B request-response Command IR and parser parity

**Phase:** 04 Procedures (VFR Class B pilot requests)
**Priority:** P0
**Size:** M
**Depends on:** T04-97, T04-98
**Blocks:** T04-100
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Add the controller responses needed to work a Class B pilot request:
`CLEARED AS REQUESTED` and Class B `UNABLE`. Keep `REMAIN OUTSIDE BRAVO
AIRSPACE` and `STANDBY_REQUEST` exact and regression-tested. Every new or
changed instruction must remain synchronized across typed input, Path A, Path B,
Path C, PTT, frontend schema, self-hosted speech parser, and GBNF.

## Command contract

Add:

```ts
| { type: "CLASS_B_CLEARANCE_AS_REQUESTED" }
| {
    type: "DECLINE_REQUEST";
    service: "FLIGHT_FOLLOWING" | "IFR_PICKUP" | "CLASS_B_ACCESS";
  }
```

Accepted full forms:

```text
CLEARED AS REQUESTED
UNABLE CLASS B CLEARANCE
UNABLE TO PROVIDE CLASS B CLEARANCE
REMAIN OUTSIDE BRAVO AIRSPACE
STAND BY
STANDBY
```

`CLEARED AS REQUESTED` has no route, altitude, operation, or other modifier.
It obtains operation/route/altitude only from the pending Class B request at
runtime. `UNABLE` has no route or altitude modifier and maps to
`DECLINE_REQUEST { service: "CLASS_B_ACCESS" }`.

Do not add fuzzy variants, `OUT_OF` pilot-request forms, `REMAIN CLEAR OF`
aliases, compact aliases, or route/altitude suffixes to these commands.

## Routing and precedence

- `CLASS_B_CLEARANCE_AS_REQUESTED` takes precedence over generic clearance and
  request-control matching.
- Class B `UNABLE` forms take precedence over existing flight-following and IFR
  pickup decline forms only when the complete `CLASS B CLEARANCE` phrase is
  present.
- `REMAIN OUTSIDE BRAVO AIRSPACE` takes precedence over generic direct and
  altitude matching.
- `STAND BY` and `STANDBY` retain existing `STANDBY_REQUEST` behavior.
- All commands are single-instruction request-control/clearance transmissions;
  bundling another instruction is a parse or command rejection.
- `CLEARED AS REQUESTED` without an associated request remains syntactically
  valid but is rejected at runtime by T04-100.

There is no new Preview Area mode or preview-state transition. These are radio
instructions routed through the existing command-line/PTT parser and existing
single-instruction request-control validation. Parsing alone never changes
aircraft or request state.

## Path parity requirements

Update together:

- `src/core/command/types.ts` and `INSTRUCTION_TYPES` parity guard.
- Typed/deterministic parser and precedence in `src/parse/parse-command.ts` and
  related spoken matcher files.
- Path C schema validation and context handling.
- `speech-api/parse_engine.py`, `speech-api/parse_grammar.gbnf`, prompt,
  semantic validator, mock/contract tests, and live eval corpus.
- `phases/_shared/command-ir.md` and `phases/_shared/parse-pipeline.md`.
- Readback fixtures/formatting where required.

Path A/B and GBNF must emit the same closed JSON shapes as typed and Path C.
Unknown or tied route evidence remains a parse miss. No cloud inference or
unconstrained fuzzy repair is allowed.

Path C must preserve the same safety contract: Class B evidence requires the
canonical `CLEARED` phrase; a transcript containing `VIA` requires nonempty,
catalog-grounded route legs; `CLASS_B_CLEARANCE` must be the only instruction;
and semantic evidence failure rejects the whole result rather than returning a
partial instruction list.

## Acceptance contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `CLEARED AS REQUESTED` | `CLASS_B_CLEARANCE_AS_REQUESTED` | Parse only; no mutation before pilot validation | Extra route/altitude tokens → `PARSE_MISS` | JO 7110.65 §§2-1-18, 7-9-2 |
| `UNABLE CLASS B CLEARANCE` | `DECLINE_REQUEST { service: "CLASS_B_ACCESS" }` | Parse only | Missing `CLASS B CLEARANCE` → `PARSE_MISS` | JO 7110.65 §2-1-18 |
| `UNABLE TO PROVIDE CLASS B CLEARANCE` | Same Class B decline instruction | Parse only | Unsupported “unable transition” fuzzy form → `PARSE_MISS` | JO 7110.65 §2-1-18 |
| `REMAIN OUTSIDE BRAVO AIRSPACE` | Existing `REMAIN_OUTSIDE_BRAVO` | Parse only | Missing `AIRSPACE` or `BRAVO` → `PARSE_MISS` | JO 7110.65 §7-9-2 |
| `STAND BY` / `STANDBY` | Existing `STANDBY_REQUEST` | Parse only | Bundled instruction → single-instruction rejection | JO 7110.65 §2-1-18 |
| Typed, Path A, Path B, Path C, and PTT equivalent | Same instruction and fields | Only `parseStage`/source metadata differs | Unsupported schema key or service value → schema miss | Command IR parity contract |
| `CLEARED AS REQUESTED VIA FIX` | Parse miss | No mutation | Optional fields are forbidden | Grammar test |
| `UNABLE CLASS B CLEARANCE MAINTAIN 3000` | Parse miss | No mutation | Modifier conflict/order violation | Grammar test |
| Unknown/tied fix in unrelated Class B grammar | Parse miss | No mutation | No evidence-based repair | Parse-pipeline contract |

## Tests

- Frontend typed, Path A, Path B, Path C, and PTT parity matrix.
- GBNF positive/incomplete/malformed/extra-token tests.
- Exact negative cases above plus existing `TO_ENTER` alias regressions.
- `INSTRUCTION_TYPES` parity guard proves frontend and Python sets match.
- Live eval corpus includes both Class B approval and denial forms.
- Existing flight-following, IFR-pickup, Class B clearance, and request-control
  tests remain green.

## Acceptance criteria

- [ ] `CLASS_B_CLEARANCE_AS_REQUESTED` and Class B `DECLINE_REQUEST` are in the
  frontend and speech-api closed instruction sets.
- [ ] Typed, Path A, Path B, Path C, PTT, prompt, semantic validator, GBNF,
  mock/contract tests, and live eval corpus agree.
- [ ] Exact positive, incomplete, malformed, modifier-conflict, extra-token,
  and unsupported-fuzzy cases are covered.
- [ ] Existing `TO_ENTER`, `THROUGH`, `OUT_OF`, `REMAIN_OUTSIDE_BRAVO`, and
  `STANDBY_REQUEST` grammar remains compatible.
- [ ] No parser path emits IFR or mutates runtime state.

## Help/docs

Expose the exact forms in `src/scope/keymap.ts` and update
`phases/_shared/command-ir.md` and `phases/_shared/parse-pipeline.md`. Explain
that `UNABLE` declines the pending Class B request and that `STAND BY` does not
approve or deny it. T04-100 owns `docs/USER.md` and the phase README.

## Out of scope

- Request scheduling and formatter output (T04-97/T04-98).
- Runtime state mutation and request resolution (T04-100).
- New `OUT_OF` pilot request grammar or fuzzy ASR repair.

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including parser tests, GBNF and
speech mock pytest results, parity guard result, changed paths, and manual FAA
review status.
