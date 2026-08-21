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

Spoken path A (primary) and path B/C salvage: `phases/_shared/parse-pipeline.md`. Scoring uses **`command.parseStage`**. Path B and Path C are **nonstandard**. Typed English (`source: "text"`, `parseStage: "spoken_a"`) is canonical `spoken_a`.

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
- Canonical by **`parseStage`** (`parse-pipeline.md`):
  - `typed` + `source === "text"` → `canonical` / `typed`
  - `typed` + `source === "voice"` → `nonstandard` / `tokens_on_voice`
  - `spoken_a` → `canonical` / `spoken_a` (includes English typed in the command line)
  - `spoken_b` → `nonstandard` / `spoken_b`
  - `llm_c` → `nonstandard` / `llm_c`
  - If `parseStage` missing (old logs): fall back to re-running local typed then A (never call `/parse`).
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
  | { status: "nonstandard"; grammar: "spoken_b" | "llm_c" | "tokens_on_voice" | "unmatched_text"; reasons: string[] }
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

### Grade from parseStage

Prefer `command.parseStage` (do not re-parse unless the field is missing). Never `fetch` `/parse`.

| parseStage | source | verdict |
| --- | --- | --- |
| `typed` | text | canonical / typed |
| `typed` | voice | nonstandard / tokens_on_voice |
| `spoken_a` | either | canonical / spoken_a |
| `spoken_b` | either | nonstandard / spoken_b |
| `llm_c` | either | nonstandard / llm_c |

### Canonical text (legacy logs without parseStage)

Normalize: collapse whitespace, uppercase callsign tokens, uppercase letter commands. Re-run **local** typed then A only.

### Do not use the network

Checker must run in Vitest node.

## Acceptance criteria

- [ ] **AC1 —** Text `DAL123 H270` (or fixture equivalent) → `canonical` / `typed` (Vitest).
- [ ] **AC1b —** Text English `turn left heading two seven zero` with `parseStage: "spoken_a"` → `canonical` / `spoken_a`.
- [ ] **AC2 —** Voice sourceText `delta one two three descend and maintain three thousand` (normalized variants allowed) → `canonical` / `spoken_a` when instructions are the matching `ALTITUDE` (Vitest).
- [ ] **AC3 —** Voice command that only works via path B fallback → `nonstandard` (Vitest; construct by mocking or using a known B-only fragment documented in the test).
- [ ] **AC3b —** `parseStage: "llm_c"` → `nonstandard` / `llm_c` (Vitest; no network).
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
