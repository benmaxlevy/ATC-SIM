# T04-63 Procedure altitude/speed precedence and DSR Command IR

**Phase:** 04 Procedures (seventy-first swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-43, T04-44, T04-53
**Blocks:** T04-64
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Define Command IR and parsers for `DELETE_SPEED_RESTRICTIONS` (`DSR`) and `SPEED` with an optional `until` constraint (`FAF`, `DME`, `FIX`), plus readbacks and self-hosted `speech-api` parity across browser and Path C.

## Context

Pilots currently parse `SPEED` as a fixed speed value without endpoint constraints, and have no command to delete published procedure speed restrictions on SIDs or STARs. Additionally, Command IR and Path C GBNF must remain synchronized so new syntax parses deterministically in both channels.

## Research

- **FAA JO 7110.65 § 5-7-1 & § 5-7-2 — Speed Adjustments & Application**:
  Controllers issue "DELETE SPEED RESTRICTIONS" to cancel published speed restrictions on a SID or STAR, and specify speed adjustments with arrival fix or distance gates (e.g., "MAINTAIN 180 KNOTS UNTIL 7 DME", "MAINTAIN 210 KNOTS UNTIL MERGE", "MAINTAIN 180 KNOTS UNTIL FINAL APPROACH FIX").
- **FAA AIM § 5-4-1**:
  Speed adjustments and cancellation phraseology on published procedures.
- **Official terms**: Delete speed restrictions, maintain speed until, DME, final approach fix, speed constraint.
- **Trainer delta**: Typed vice-inspired tokens `DSR` and `S<speed>/<until>` are simulator CLI tokens mapped to Command IR; speech models parse standard FAA telephony.

## Command & State Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `DSR` / "delete speed restrictions" | `{ type: "DELETE_SPEED_RESTRICTIONS" }` | Emits single zero-arg IR instruction | Malformed trailing tokens reject as syntax error | JO 7110.65 § 5-7-2 |
| `S180/FAF` / "maintain 180 knots until final approach fix" | `{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FAF" } }` | Parses speed with FAF endpoint constraint | Missing speed value or invalid FAF token rejects | JO 7110.65 § 5-7-1 |
| `S180/7DME` / `S180/7` / "maintain 180 knots until 7 DME" | `{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 7 } }` | Parses speed with DME distance gate | Negative or non-numeric DME rejects | JO 7110.65 § 5-7-1 |
| `S210/MERGE` / "maintain 210 knots until MERGE" | `{ type: "SPEED", speedKt: 210, verb: "MAINTAIN", until: { type: "FIX", fixId: "MERGE" } }` | Parses speed with fix identifier gate | Empty or invalid fix string rejects | JO 7110.65 § 5-7-1 |
| `S210` / "maintain 210 knots" | `{ type: "SPEED", speedKt: 210, verb: "MAINTAIN" }` | Unchanged baseline speed instruction without `until` | Out-of-bounds speed rejected by pilot | JO 7110.65 § 5-7-1 |

## Scope

- In `src/core/command/types.ts`:
  - Add `"DELETE_SPEED_RESTRICTIONS"` to `INSTRUCTION_TYPES`.
  - Add `SpeedUntil` union (`{ type: "FAF" } | { type: "FIX"; fixId: string } | { type: "DME"; distanceNm: number }`).
  - Add optional `until?: SpeedUntil` to `SPEED` instruction.
  - Add `{ type: "DELETE_SPEED_RESTRICTIONS" }` to `Instruction`.
- In `src/core/aircraft.ts`:
  - Add `speedRestrictionsDeleted?: boolean` to `Intent`.
  - Add `speedUntil?: SpeedUntil` to `Intent`.
- In `src/core/index.ts`:
  - Export `SpeedUntil`.
- In `src/parse/parseRadioText.ts`:
  - Map `DSR` in `ZERO_ARG_INSTRUCTIONS` to `{ type: "DELETE_SPEED_RESTRICTIONS" }`.
  - In `finishLetterNumber` for letter `S`: parse optional `/FAF`, `/<n>DME` (or `/<n>`), `/<FIX>` into `until`.
- In `src/parse/spoken/grammar.ts` and `src/parse/spoken/pattern-matcher.ts`:
  - Parse `"delete speed restrictions"` and `"delete speed restriction"`.
  - Parse `"maintain [speed] knots until [final approach fix | faf | <n> dme | <n> miles | <fix>]"`.
- In `src/pilot/readback.ts`:
  - Read back `DELETE_SPEED_RESTRICTIONS` as `"delete speed restrictions"`.
  - Append `" until <target>"` for `SPEED` instructions with `until` (e.g. `"until 7 DME"`, `"until final approach fix"`, `"until MERGE"`).
- In `speech-api/parse_engine.py`:
  - Add `"DELETE_SPEED_RESTRICTIONS"` to `INSTRUCTION_TYPES`.
  - Update `validate_instruction` for `DELETE_SPEED_RESTRICTIONS` and `SPEED` with `until`.
- In `speech-api/parse_grammar.gbnf`:
  - Add `delete-speed-restrictions` rule.
  - Update `speed` rule with optional `until` object (`speed-until-faf`, `speed-until-fix`, `speed-until-dme`).
- In `speech-api/tests/test_parse.py`:
  - Update parity guard test and add Path C unit tests.
- Documentation:
  - Update `phases/_shared/command-ir.md` and `phases/_shared/parse-pipeline.md`.

## Out of scope

- Pilot validation against kinematics or runway threshold distances (owned by T04-64).
- Vertical FMS speed constraint override and physics deceleration (owned by T04-65).
- Airway/radial expansion or cloud speech vendor APIs.

## Acceptance criteria

- [ ] **AC1 — Command IR types**: `INSTRUCTION_TYPES` contains `DELETE_SPEED_RESTRICTIONS`, and `Instruction` includes `SpeedUntil` and `DELETE_SPEED_RESTRICTIONS`.
- [ ] **AC2 — Typed parser DSR**: `parseRadioText("AAL123 DSR")` produces `DELETE_SPEED_RESTRICTIONS`.
- [ ] **AC3 — Typed parser speed until**: `parseRadioText("AAL123 S180/FAF")`, `S180/7DME`, and `S210/MERGE` correctly populate `until`.
- [ ] **AC4 — Spoken parser DSR & speed until**: Spoken grammar and pattern matcher extract `DELETE_SPEED_RESTRICTIONS` and speed with `until` gates.
- [ ] **AC5 — Readback formatting**: `formatReadback` generates accurate readback strings for `DSR` and `SPEED ... until ...`.
- [ ] **AC6 — Speech-API parity**: `speech-api` parity tests pass; GBNF grammar accepts the new forms.
- [ ] **AC7 — Shared docs**: `phases/_shared/command-ir.md` documents `DELETE_SPEED_RESTRICTIONS` and `SpeedUntil`.

## Test plan

- **Unit:** Typed and spoken parser tests for positive, malformed, and edge inputs. Readback formatting tests.
- **Parity:** Run `cd speech-api && SPEECH_API_MOCK=1 pytest` verifying `test_path_c_instruction_type_parity_with_frontend_union`.
- **Repo CI:** `npm run ci`.

## Suggested files

- `src/core/command/types.ts`
- `src/core/aircraft.ts`
- `src/core/index.ts`
- `src/parse/parseRadioText.ts`
- `src/parse/spoken/grammar.ts`
- `src/parse/spoken/pattern-matcher.ts`
- `src/pilot/readback.ts`
- `src/parse/test/`
- `speech-api/parse_engine.py`
- `speech-api/parse_grammar.gbnf`
- `speech-api/tests/test_parse.py`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`
