# T03-18 Ungrounded identifier is a local miss; Path C gets retrieved candidates

**Phase:** 03 Voice
**Priority:** P0
**Size:** L
**Depends on:** T03-16, T03-17
**Blocks:** T03-20
**Launch:** Implement this ticket only. Do not start T03-20. T03-19 is a parallel Wave B ticket (STT header); do not implement it here.

## Goal

If typed / Path A / Path B / island would emit `DIRECT`, `CROSS`, `VIA` (`DESCEND_VIA` / `CLIMB_VIA` / `JOIN_PROCEDURE`), `CLEARED_APPROACH`, `INTERCEPT_LOCALIZER`, or `EXPECT_APPROACH` with an **ungrounded or tied** catalog token, that local stage is a **miss** (`ok: false`). Existing Path C (`pathC: true`) may then run on the same `POST /parse`. Path C `context.fixes` / `approaches` / `procedures` are the **retrieved top cluster for this transcript** (cap 8–16), never `fixRegistry.ids().slice(0, 64)`. Unique margin snaps still finish locally and must **not** fetch Path C. No second LLM.

## Context

Today an island parse can “succeed” with raw `HAYNES`. Path C never runs. The pilot then rejects `UNKNOWN_FIX`. Path C’s prompt still gets the first 64 file-order catalog ids, so `HAINZ` would not even be listed when it sits past that slice.

Agreed product: **snap** when retrieve finds a unique winner with margin (T03-17). Otherwise treat the identifier as ungrounded, miss the local stage, and give Path C the **potential matches** for this utterance.

`phases/_shared/parse-pipeline.md` — **this ticket updates that file.** After local stages, identifier grounding can convert a would-be hit into a miss. Path C context is retrieved candidates. Miss-only still. First local **grounded** hit still wins.

`phases/_shared/non-goals.md` — LLM is not the executor; Path C is salvage after local miss; no paid hosts.

`phases/_shared/speech-port.md` — do **not** put `/parse` on `SpeechPort`. Path C stays the injected `parsePathC` fetch on `speech-api`.

T03-16 owns the spoken catalog index and retrieve API over the **full** facility. T03-17 owns floor + margin snap and the ungrounded-id signal. This ticket owns **pipeline control flow** and Path C **candidate lists**. Do not re-implement retrieve or margin math.

## Research

- **R01** JO 7110.65 radio communications — Search: `FAA JO 7110.65 Air Traffic Control HTML`. Official terms: **readback**, **cleared approach**, **direct**, **via**. Path C does **not** claim 7110.65-complete NLU.
- **Trainer delta:** Path C is **nonstandard salvage**. Grade `parseStage: "llm_c"` (`parse-pipeline.md` scoring table). Unique local snap stays the happy path (`spoken_a` / `spoken_b` / `typed`). Cite analog + trainer delta **in `parse-pipeline.md`** (AC8), not as user-facing copy.
- Do not invent a second `/ground` LLM. Same `/parse`. Hub weight download once; inference on **our** process.

## Scope

- `src/parse/parse-command.ts`: after typed / A / B / island produce instructions, if **any** `DIRECT` / `CROSS` / `DESCEND_VIA` / `CLIMB_VIA` / `JOIN_PROCEDURE` / `CLEARED_APPROACH` / `INTERCEPT_LOCALIZER` / `EXPECT_APPROACH` id is ungrounded or a T03-17 tie, **do not return ok**. Fall through. Then Path C when `pathC: true`.
- Unique T03-17 margin snap on those types still returns ok at that local stage. `parsePathC` is **not** called.
- `pathCContext` uses T03-16 retrieve results for identifier tokens in the **normalized** utterance (slots after `direct` / `cross` / `from` / `via` / `cleared` / `ils` and the typed equivalents). Include the tied cluster **plus next-best** up to `MAX_PATH_C_FIXES`. Repurpose today’s Path C fix cap (`MAX_CATALOG_FIXES = 64` used as prompt padding) **down to 16** (allowed range 8–16; ship **16** unless a named constant already exists at 8). Same for approaches / procedures **if retrieve exists** for those namespaces; otherwise keep **sanitized** lists, but **never** file-order 64 of unrelated ids.
- Do **not** send kinematics, n-best STT, or confidence to `/parse`. Request shape stays `{ text, source, schemaVersion, context? }`.
- Typed `DCT NOPE` with `pathC: false` remains **ok-parse then pilot `UNKNOWN_FIX`** (existing `direct.test.ts`). Document that exception. Spoken / island ungrounded with `pathC: false` is a **parse miss** so command line and voice share the pipeline (`handleRadioText` already maps parse miss → `formatRejectReadback({ reason: "PARSE" })` → “Unable, say again”).
- With `pathC: true`, salvage only if retrieve found **listed** candidates. If retrieve is **empty**, Path C must `PARSE_MISS` — do not hallucinate an id, and do **not** pad the prompt with unrelated catalog ids so the model can guess.
- Tests with **injected** `parsePathC` (no live GGUF): (1) unique Haynes never calls Path C; (2) tied two-id fixture calls Path C with exactly those ids (order-insensitive), not 64 padding ids; (3) `pathC: false` + ungrounded → parse miss, no `Command` with a fake catalog id.
- Keep the existing `path-c.test.ts` case that `context.fixes` equals the full passed list when that list is small (3 ids: `NEMAX` / `SEMAX` / `MERGE`). Add a test that **80 padding ids + `HAINZ`** does **not** put `padding[0..63]` into Path C when the spoken token is a Haynes-tie.
- `speech-api` prompt already says listed ids only — **keep**. Do **not** add a new `/ground` endpoint. Do not change the GGUF.
- Update `phases/_shared/parse-pipeline.md` (AC5, AC8). Do not put `/parse` on SpeechPort.

## Out of scope

- STT `X-ATC-Fixes` hygiene (T03-19).
- End-to-end acceptance / phase README ticket table leftovers (T03-20).
- Always-on LLM after STT. Replacing Path A. A second LLM that only rewrites names.
- Paid / metered vendors (OpenAI, Groq, HF Inference, etc.).
- New GGUF / changing `PARSE_MODEL_ID`.
- Phase 5 grading (still grades `parseStage`; checker must not call `/parse`).
- Kinematics, pilot executor, Command IR union changes, SpeechPort interface.
- Re-implementing T03-16 retrieve or T03-17 margin math.

## Implementation notes

Identifier types that can convert a local hit into a miss:

| Instruction | Catalog field |
| --- | --- |
| `DIRECT`, `CROSS` | `fixId` |
| `DESCEND_VIA`, `CLIMB_VIA`, `JOIN_PROCEDURE` | `procedureId` |
| `CLEARED_APPROACH`, `INTERCEPT_LOCALIZER`, `EXPECT_APPROACH` | `approachId` |

Heading / altitude / speed / ident / say-\* / go-around hits are unchanged: they stay a local win and still must not fetch Path C.

**Typed `DCT NOPE` exception (document in parse-pipeline.md and a test):** the student typed a catalog-shaped token. With `pathC: false`, keep today’s ok-parse → pilot `UNKNOWN_FIX` (`src/pilot/direct.test.ts` AC3). Do not silently change that to parse miss. Spoken “proceed direct Haynes” is the Path C problem, not `DCT NOPE`.

**Suggested control flow** (illustrative; consume T03-16 / T03-17 APIs, do not fork them):

```ts
function localHitIsGrounded(parsed: OkParse): boolean {
  // T03-17: unique margin snap → grounded. Tie / weak / unknown → ungrounded.
  return identifierInstructions(parsed).every(isGroundedCatalogId);
}

// typed / A / B / island:
if (hit.ok && localHitIsGrounded(hit)) return okStage(...);
// else miss — Path C may run
```

**Path C context (this ticket):**

- Extract identifier slot tokens from `normalizeSpoken(sourceText)`.
- `retrieve` those tokens against the **full** `opts.fixes` / procedures / approaches (T03-16 walks the full list; do not slice to 64 before retrieve).
- `context.fixes =` tied cluster ∪ next-best, capped at `MAX_PATH_C_FIXES` (**16**). Order-stable enough for tests to use order-insensitive equality.
- Never `sanitizeFixIds(opts.fixes)` as the Path C list when that sanitizer still truncates to 64 **file order**. If `sanitizeFixIds` remains for local snap, split the Path C cap: `MAX_PATH_C_FIXES = 16`.
- Empty retrieve on an identifier miss: omit `fixes` (or send `[]`), skip inventing padding, result is parse miss. Do not call Path C in a way that lets the model pick an unlisted id.
- Non-identifier local miss (`"pizza the runway"`): Path C still runs as T03-14. Do **not** fill `fixes=` with file-order 64. Roster `callsigns` / `selectedCallsign` unchanged.

**Same `/parse`.** Browser schema-check in `src/parse/path-c.ts` is unchanged. Illegal `type` (e.g. `CHAT`) → miss, no dispatch (AC4). Prompt already: listed ids only; keep that sentence.

`src/parse` stays DOM-free. Inject `parsePathC`. Do not import World. Do not add `SpeechPort.parse`.

Generic tests: synthetic catalogs (padding ids `PAD000`… plus two tied Haynes ids). Do **not** encode KATL production counts, map IDs, or facility-id branches. KDEM `ILS27` / `SEMAX` fixtures in `path-c.test.ts` / grammar tests must stay green (AC7).

## Acceptance criteria

- [ ] **AC1 — Unique margin snap:** Given a synthetic catalog where spoken Haynes uniquely snaps to `HAINZ` with T03-17 margin, when `parseCommand("proceed direct Haynes", { pathC: true, parsePathC, fixes: <that catalog> })` runs, then `parsePathC` is **not** called, result is ok, `fixId === "HAINZ"`, `parseStage` is `spoken_a` or `spoken_b` (not `llm_c`).
- [ ] **AC2 — Tie fixture:** Given a synthetic two-id tie (e.g. `HAINZ` and `HAYNS`) plus ≥80 unrelated padding ids **first** in `opts.fixes`, when spoken Haynes is ungrounded/tied and `pathC: true`, then `parsePathC` **is** called; `context.fixes` is the tied cluster (length ≤ 16), includes **both** tied ids (order-insensitive), and **excludes** the unrelated padding (in particular not `padding[0..63]`).
- [ ] **AC3 — Ungrounded + `pathC: false`:** Given spoken “proceed direct Haynes” (or equivalent island) with an ungrounded/tied id and `pathC: false`, then `parsePathC` is not called, result is **parse miss** (`ok: false`, `PARSE_MISS`), and no dispatched `Command` carries a fake catalog id. Command line and voice share this miss (`handleRadioText` → `formatRejectReadback` `PARSE`). **Document:** typed `DCT NOPE` with `pathC: false` still ok-parses and the pilot still returns `UNKNOWN_FIX` (`direct.test.ts`).
- [ ] **AC4 — Path C schema still rejects `CHAT`:** Given local miss + `pathC: true` + mock `/parse` `{ "type": "CHAT" }`, then parse miss, no `Command` dispatch. Existing `path-c.test.ts` AC4 stays green.
- [ ] **AC5 — `parse-pipeline.md` documents:** (1) ungrounded/tie identifier converts a would-be local hit into a miss; (2) Path C `context` is retrieved candidates (cap 8–16), not file-order 64; (3) miss-only still; (4) first local **grounded** hit still wins; (5) typed `DCT` unknown id vs spoken ungrounded miss.
- [ ] **AC6 — Grep-ban paid LLM hosts** in `src/parse` and the `speech-api` parse path: no `openai.com`, `api.groq.com`, `api-inference.huggingface.co`. No new `/ground` route. Same `POST /parse`.
- [ ] **AC7 — KDEM `ILS27` / `SEMAX` Path C tests stay green**, including `path-c.test.ts` “DIRECT C-Max snaps onto catalog SEMAX and sends `fixes=`” when `fixes` is the small 3-id list.
- [ ] **AC8 — Research:** `parse-pipeline.md` cites R01 + trainer delta: Path C is nonstandard salvage (`parseStage` `llm_c`), not 7110.65-complete NLU. Unique local snap remains the analog phraseology path.

## Test plan

- Unit: injected `parsePathC` in `src/parse/path-c.test.ts` (and/or `parse-command` tests) for AC1, AC2, AC3; keep CHAT / 3-id `fixes=` / ILS27 snap tests; add 80-padding Haynes-tie test; assert no n-best / confidence / kinematics on the fetch body.
- Unit: typed `DCT NOPE` still `UNKNOWN_FIX` at the pilot when `pathC: false` (existing `src/pilot/direct.test.ts` — do not break it). Spoken ungrounded + `pathC: false` is parse miss, not `UNKNOWN_FIX`.
- Unit: empty retrieve + `pathC: true` → parse miss, `parsePathC` either not called or called with **no** padded unrelated `fixes`; mock returning `DIRECT` `HAYNES` must not become a dispatched fake id if it was not in `context.fixes`.
- Grep: AC6 paid-host ban (extend the existing `path-c.test.ts` AC6 glob or add a speech-api parse-path assertion).
- Integration: none required beyond existing Path C wiring. Do not require a live GGUF.
- Manual: none required. Optional leftover for T03-20: live Haynes-tie salvage with Path C enabled.

## Suggested files

- `phases/_shared/parse-pipeline.md` (**required update**)
- `src/parse/parse-command.ts` (`pathCContext`; local-hit → miss on ungrounded id)
- `src/parse/path-c.ts` (`MAX_PATH_C_FIXES` if the cap lives next to context)
- `src/parse/path-c.test.ts`
- `src/parse/spoken/catalog-ground.ts` (split Path C cap from any remaining local sanitizer cap; do not re-implement T03-17 snap)
- T03-16 retrieve + T03-17 ungrounded signal (consume; do not duplicate)
- `src/pilot/direct.test.ts` (leave typed `DCT NOPE` → `UNKNOWN_FIX`; do not “fix” it into parse miss)
- `speech-api/parse_engine.py` (prompt listed-ids-only — **keep**; no new endpoint)
