# T05-04 Phraseology checker from IR

**Phase:** 05 Training
**Priority:** P0
**Size:** L
**Depends on:** T05-01
**Blocks:** T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Replace the T05-01 stub with a deterministic **phraseology checker**: each issued `Command` is `canonical`, `nonstandard`, or `disallowed` by comparing `sourceText` + `instructions` to the allowed typed grammar and the phase 3 spoken grammar. No LLM.

## Context

`phases/_shared/command-ir.md`: voice and text compile to `Command`. `sourceText` is the raw typed line or ASR text.

Typed tokens: phase 1 table in `phases/01-closed-loop/README.md` and the shared IR.

Spoken path A (primary) and path B fallback: `phases/03-voice/README.md` §4. Scoring treats path B as **nonstandard**.

`phases/_shared/non-goals.md`: LLM is not the command executor **and** not the grader.

README deduction table: nonstandard −2, disallowed −5, via `scoreSession`.

## Research

Read **R01** (allowed v1 phraseology only), **R08** (typed tokens are canonical on keyboard), phase 3 grammar.

- Search: `7110.65 phraseology climb and maintain` — grader must not punish vice tokens in **text** mode.
- Spoken path A = 7110.65-shaped; path B = nonstandard salvage.
- Do not scrape a full 7110.65 rule engine. Comment the coverage list.

## Scope

- Implement `checkPhraseology(command: Command): PhraseologyVerdict` in `src/train` (may import `@parse` grammar helpers; do not duplicate two grammars if you can call `parseCommand` in a “classify” mode).
- Wire `scoreSession` to use the real checker on every `command.accepted`.
- Disallowed **instruction combinations** (independent of source text) listed below.
- Canonical source text:
  - `source === "text"`: normalized line matches the vice-inspired token grammar (callsign optional).
  - `source === "voice"`: normalized `sourceText` parses via **path A only**. If it only parses via path B, `nonstandard` + `grammar: "spoken_b"`.
- Optional: append `phraseology.checked` to the log when a command is accepted (pilot or a thin wrapper). If you skip emit, scoring still calls the checker at score time (required).
- Vitest: table-driven cases from Implementation notes. DOM-free.

## Out of scope

- Judging “polite” English, accent, or 7110.65 beyond the frozen v1 instruction set.
- Rejecting vice tokens in **text** mode (those are canonical for keyboard).
- Changing parser accept/reject behavior (the checker does not move airplanes).
- LLM, remote API.
- Scoring UI (already T05-02).

## Implementation notes

```ts
export type PhraseologyVerdict =
  | { status: "canonical"; grammar: "typed" | "spoken_a" }
  | { status: "nonstandard"; grammar: "spoken_b" | "unmatched_text"; reasons: string[] }
  | { status: "disallowed"; reasons: string[] };
```

If both disallowed combo **and** messy text apply, return **`disallowed`** (harsher). List all reasons.

### Disallowed combinations (v1)

Count instruction `type`s on the command (after parse, so this is IR-level):

| Rule | Reason code |
| --- | --- |
| More than one `ALTITUDE` | `multi_altitude` |
| More than one `SPEED` | `multi_speed` |
| More than one lateral among `FLY_HEADING`, `TURN_DEGREES`, `PRESENT_HEADING`, `DIRECT` | `multi_lateral` |
| `SAY_HEADING` or `SAY_ALTITUDE` with any other instruction | `say_mixed` |
| `DIRECT` together with `CLEARED_APPROACH` | `direct_and_approach` |
| More than **four** instructions | `too_many_instructions` |

**Allowed:** `FLY_HEADING` + `ALTITUDE` + `SPEED`; `FLY_HEADING` + `CLEARED_APPROACH` (vector to intercept); `IDENT` + any single clearance; `EXPECT_APPROACH` + heading.

### Canonical text

Normalize: collapse whitespace, uppercase callsign tokens, uppercase letter commands.

A text command is canonical if `parseCommand(sourceText)` (typed path) yields the same `instructions` (deep equal ignoring unrelated fields) as `command.instructions`. If the user typed extra junk that still parsed, `nonstandard` / `unmatched_text`.

### Canonical voice

1. Run the phase 3 normalizer on `sourceText`.
2. If path A produces instructions deep-equal to `command.instructions` → `canonical` / `spoken_a`.
3. Else if path B would produce them → `nonstandard` / `spoken_b`.
4. Else `nonstandard` / `unmatched_text` (should be rare on `command.accepted`).

Voice `sourceText` that is clearly typed tokens (`H270`, `D30`) → `nonstandard` reason `tokens_on_voice`.

### Do not use the network

Checker must run in Vitest node.

## Acceptance criteria

- [ ] **AC1 —** Text `DAL123 H270` (or fixture equivalent) → `canonical` / `typed` (Vitest).
- [ ] **AC2 —** Voice sourceText `delta one two three descend and maintain three thousand` (normalized variants allowed) → `canonical` / `spoken_a` when instructions are the matching `ALTITUDE` (Vitest).
- [ ] **AC3 —** Voice command that only works via path B fallback → `nonstandard` (Vitest; construct by mocking or using a known B-only fragment documented in the test).
- [ ] **AC4 —** Two `FLY_HEADING` instructions on one `Command` → `disallowed` / `multi_lateral` (Vitest).
- [ ] **AC5 —** `SAY_ALTITUDE` + `SPEED` → `disallowed` / `say_mixed` (Vitest).
- [ ] **AC6 —** `scoreSession` on a log with one accepted nonstandard command has phraseology raw 98 and a `phrase_nonstandard` deduction (Vitest).
- [ ] **AC7 —** No fetch, openai, anthropic, or `SpeechPort` import from the checker module (Vitest or grep).
- [ ] **AC8 —** Stub always-canonical path from T05-01 is gone; failing tests that assumed stub are updated.

## Test plan

- Unit: `src/train/phraseology/check-phraseology.test.ts` (table-driven).
- Integration: `scoreSession` + one accepted command (AC6).
- Manual: none required (panel will show phraseology after this).

## Suggested files

- `src/train/phraseology/check-phraseology.ts`
- `src/train/phraseology/check-phraseology.test.ts`
- `src/train/score/score-session.ts` (call real checker)
- `src/parse/spoken/*` (reuse; do not fork)
