# T02-182 Path-C command parity and ASR repair

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-181  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Make the self-hosted Path-C contract support every shipped Command IR command,
including squawk, maintain VFR, and IFR clearance. Teach safe, evidence-gated
ASR recovery for `squad <octal>` and keep airport candidates grounded.

| Input/form | Expected action/result | State/side effect | Error/negative case | Evidence |
| --- | --- | --- | --- | --- |
| `squad 2222` | `ASSIGN_SQUAWK 2222 DISCRETE` | normal aircraft-only squawk path | `squad 8921` misses | JO 7110.65 §5-2-1 |
| new command IR type | Python prompt/GBNF/validator/eval updated | closed IR parity | unsupported type fails CI guard | trainer contract |
| clearance with airport candidate | Path C uses listed airport ID only | normal validation | arbitrary airport name misses | JO §4-2-1 |

## Scope

- Update `speech-api` type set, GBNF, prompt, semantic validator, mock/contract
  tests, and eval corpus for `ASSIGN_SQUAWK`, `MAINTAIN_VFR`, and
  `IFR_CLEARANCE`.
- Add exact prompt examples for all current new command forms: `SQUAWK <code>`,
  `SQUAWK VFR`, `MAINTAIN VFR`, clearance access variants, and tactical
  `CLEARED/PROCEED DIRECT` distinction.
- Repair `squad` only when followed by exactly four octal digits; retain
  transcript-evidence guard and self-hosted-only speech policy.
- Add a durable `AGENTS.md` rule: any Command IR/parser grammar change updates
  frontend schema, Path-C prompt/GBNF/validator/evals/tests, and shared docs in
  the same ticket. Add an automated parity guard where practical.
- Update speech-api and shared command/parser documentation.

## Non-goals

Cloud LLMs, unconstrained semantic guessing, new radio commands, or changing
deterministic Path A/B behavior.

## Acceptance criteria

- [ ] Every shipped frontend Command IR discriminant is supported or explicitly
  rejected in Python Path C by a tested parity contract.
- [ ] `squad 2222` safely produces discrete squawk; invalid octal/length forms
  do not produce an instruction.
- [ ] Airport context survives request, prompt, validation, and grounding.
- [ ] Durable agent rule and docs prevent future prompt drift.

## Test plan

Python mock/grammar/semantic tests; TypeScript Path-C schema/context tests;
manual local-GGUF eval cases; `npm run ci` and `cd speech-api &&
SPEECH_API_MOCK=1 pytest`.

