# T03-20 Catalog retrieve + margin snap acceptance

**Phase:** 03 Voice
**Priority:** P0
**Size:** M
**Depends on:** T03-18, T03-19
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Prove the T03-16–19 addendum end-to-end with **synthetic** catalogs: unique spoken names snap locally; ties go to Path C with a **retrieved** candidate cluster; the STT header is not file-order 64; `parse-pipeline.md` and the phase 3 README ticket table match shipped behavior. `npm test` / `npm run ci` green. Honest manual leftover for live Path C tie salvage.

## Context

Twentieth swarm (`phases/SWARM.md`): catalog retrieve + margin snap after the prerequisite unique snap (CIFP-style `I26R` / Haynes→`HAINZ` / AJ→`AJAAY`, local cap 4096). This ticket **does not** re-implement retrieve, margin snap, ungrounded-id Path C, or STT header hygiene. Those are T03-16, T03-17, T03-18, and T03-19.

User-shaped utterances (KATL-shaped **spoken forms**; tests **must** use a synthetic catalog per `.cursor/rules/generic-test-fixtures.mdc`):

| Spoken (after normalizer) | Catalog id (CIFP-style spelling OK on a synthetic row) |
| --- | --- |
| `ils runway two six right` / `cleared ils runway two six right` | `I26R` |
| `haynes` (e.g. `proceed direct haynes`) | `HAINZ` |
| `aj` (e.g. `proceed direct aj`) | `AJAAY` |

Do **not** encode KATL production map counts, video-map IDs, facility inventory sizes, or `src/scenario/data/katl/` into these tests. Do not add a facility-id branch.

Contracts:

- `phases/_shared/parse-pipeline.md` — one `parseCommand`; first local hit wins; Path C miss-only; T03-18 owns the retrieve-cluster `context` behavior; this ticket **finishes leftover doc bullets** if T03-18 left them.
- `phases/_shared/speech-port.md` — self-hosted `speech-api` only; no paid STT/TTS/LLM.
- `phases/_shared/non-goals.md` — Path C is salvage, not the primary parser, not an executor.
- `phases/_shared/command-ir.md` — frozen `Instruction` union; schema-check Path C JSON in `src/parse`.
- Product law (twentieth swarm): retrieve then maybe LLM; margin not raw argmax; ungrounded identifier is not a finished Command; one salvage model; STT header is not a search index; unique local snap stays the happy path.

Phase 3 **exit E1–E14 is already green**. This is a **post-exit addendum**. Do not uncheck E1–E14. A one-line note that T03-16–20 exists is enough.

## Research

- **R01** JO 7110.65 approach clearances — official phrase **CLEARED ILS RUNWAY** (runway as spoken digits + side). Search: `FAA JO 7110.65 cleared ILS approach`.
- **R01** radio communications / vectors — **PROCEED DIRECT** to a fix. Search: `FAA JO 7110.65 proceed direct`.
- **R02** PCG — **ILS**, **readback**. Search: `FAA Pilot Controller Glossary ILS`.
- **R03** AIM digits — how pilots hear runway numbers (`two six right`). Search: `FAA AIM radio communications phraseology digits runway`.
- **Trainer delta:** Catalog retrieve + margin snap is **trainer grounding**, not 7110.65 NLU. Unique Haynes / AJ / ILS 26R must compile at Path A/B with catalog ids. Path C is salvage after a local miss (tie / weak score), using 8–16 **retrieved** ids, never `ids().slice(0, 64)`. Path C is **not** 7110.65-complete.
- Cite analog + trainer delta in a code comment on the integration fixture (AC8). No new user-facing copy unless a leftover T03-18 status string is missing glossary terms (`Unable to parse`, not “did you mean”).

## Scope

- Integration coverage in `src/parse` (`parse.test.ts` and/or `path-c.test.ts`) for the three utterance shapes against a **synthetic** catalog (may share helpers with T03-16/T03-17 unit fixtures; do not duplicate a second ranker).
- Unique Haynes / AJ / ILS 26R: `parseCommand` still returns `ok` at `spoken_a` or `spoken_b` with catalog ids `HAINZ` / `AJAAY` / `I26R`. Path C must **not** run on those hits even when `pathC: true`.
- Tie fixture: two (or more) synthetic rows whose scores are within margin of the spoken token. With `pathC: true` and an injected `parsePathC`, expect `parseStage === "llm_c"` (or the injected salvage) and a **candidate cluster** on the Path C request (`fixes=` / `approaches=` / `procedures=` as T03-18 shipped) — retrieved ids for this transcript, **not** file-order 64, **not** the whole pack.
- Confirm the T03-19 STT header assertion still exists and still passes (omit `X-ATC-Fixes` **or** a tiny high-value prior; never first-64 registry dump). Do not rewrite T03-19 unless the assertion vanished.
- Update `phases/03-voice/README.md` **§12 ticket order** with T03-16–20 as a labeled **addendum**. Do not reopen §13 E1–E14 except a short addendum note.
- Confirm `phases/_shared/parse-pipeline.md` matches shipped T03-16–19 behavior. T03-18 owns the behavior write; **finish leftover bullets here**: retrieved cluster (8–16) not `slice(0, 64)`; ungrounded identifier → local miss so Path C can run; unique high-margin snap still local; STT header is not the search index (cross-ref T03-19). Do not reopen Path C default-on vs default-off or the default GGUF id.
- Grep-ban paid LLM/STT hosts on parse + speech-api paths (same hosts as T03-14 AC6: `openai.com`, `api.groq.com`, `api-inference.huggingface.co`; do not add a new vendor).
- Existing KDEM `ILS27` / `SEMAX` fixtures stay green.
- If live Path C tie salvage was **not** run this ticket, record an honest leftover in `phases/LATER-IMPLEMENTATION-BACKLOG.md` (create a Voice heading if none). Do **not** claim Chrome PTT p50 unless this ticket measured it.

## Out of scope

- Implementing retrieve, margin snap, ungrounded-id miss, Path C candidate wiring, or STT header hygiene (T03-16–19). If those ACs are red, this ticket is **BLOCKED**, not a place to re-implement them.
- A second LLM besides Path C `POST /parse`. Always-on post-STT LLM. Dumping the full catalog into STT or Path C prompts.
- A new speech vendor or SpeechPort. Paid STT/TTS/LLM.
- Claiming Chrome PTT p50 / T03-12 E10 unless measured **this** ticket (leave leftover).
- Reopening phase 3 exit E1–E14 as a redo. Unchecking them. Starting phase 5 scoring.
- CIFP importer (`tools/cifp-import`). Videomaps. Kinematics / pilot executor. Replacing Path A.
- KATL-only runtime branches. Encoding production map counts in tests.

## Implementation notes

This is an **acceptance** ticket. Prefer composing T03-16–19 APIs over new production code. New production files are a smell; a thin synthetic fixture helper in the test file is fine.

**Synthetic catalog (illustrative — match T03-16/17 exported helpers if they exist):**

```ts
const SYNTH = {
  fixes: [
    { id: "HAINZ", name: "HAYNES" },
    { id: "AJAAY", name: "AJ" },
    { id: "OTHER", name: "OTHER" },
  ],
  approaches: [{ id: "I26R", name: "ILS RWY 26R", runway: "26R" }],
};
```

Do not `import` KATL JSON. Do not assert `fixes.length === <production count>`. A handful of rows that prove unique snap vs tie is enough. Tie rows should be **constructed** so margin fails (two Haynes-like spellings), not copied from a live facility dump.

**Unique path (AC1):** `parseCommand(..., { pathC: true, parsePathC, catalog: SYNTH })` (or whatever injection T03-16–18 shipped). Spy: `parsePathC` **not** called. `parseStage` is `spoken_a` or `spoken_b`. Instructions carry `HAINZ` / `AJAAY` / `I26R`.

**Tie path (AC2):** local stages miss (ungrounded). Injected `parsePathC` **is** called. Request `context.fixes` (and approaches/procedures if the utterance is an approach/procedure) is the retrieved cluster. Length in the T03-18 band (8–16, or smaller if the synthetic pack is tiny — **never** 64 file-order ids). Illegal to pass `ids().slice(0, 64)`.

**STT header (AC3):** keep/assert the T03-19 test in `src/speech/ports/http-speech-port.test.ts`. Today’s pre-T03-19 test that sends `SEMAX,NEMAX,MERGE` as a dump is **owned by T03-19**; this ticket only proves the post-T03-19 contract still holds.

**README §12:** append after T03-12, do not rewrite the original 01–15 graph. Suggested block:

```
Addendum (T03-16–20, post-exit; do not reopen E1–E14):
T03-16 Spoken catalog index + retrieve     P0   needs 03
T03-17 Margin snap for catalog ids         P0   needs 16
T03-19 STT fix header hygiene              P0   needs 16  (parallel with 17)
T03-18 Ungrounded id → Path C candidates   P0   needs 16 + 17
T03-20 Catalog retrieve + margin snap acceptance  P0   needs 18 + 19
```

One sentence in §13 is enough: addendum T03-16–20; unique local snap; Path C uses retrieved candidates; E1–E14 unchanged.

**Grep-ban:** extend or keep T03-14’s source glob in `src/parse/path-c.test.ts` (and speech-api parse path if T03-14 already greps it). No new host allow-list. Hugging Face Hub weight download remains allowed; Inference API is not.

**Manual leftover:** live Path C with a real `/parse` model on a Haynes-like **tie** (not unique snap). If not run: backlog row stating what is shipped vs what was not measured. Do not invent a p50.

Never throw through the sim tick. `src/parse` stays DOM-free.

## Acceptance criteria

- [ ] **AC1 —** Given a synthetic catalog containing unique `HAINZ` / `AJAAY` / `I26R` rows, when `parseCommand` is called with the three utterance shapes (Haynes, AJ, ILS runway two six right) and `pathC: true`, then each result is `ok`, `parseStage` is `spoken_a` or `spoken_b`, instructions use those catalog ids, and injected `parsePathC` is **not** fetched. T03-16/T03-17 unique-snap unit tests still pass.
- [ ] **AC2 —** Given a synthetic **tie** (or within-margin) fixture and `pathC: true` plus an injected Path C that returns a legal `Instruction[]`, then `parseStage === "llm_c"` (or the injected salvage) and the Path C request carries a **retrieved candidate cluster** (`fixes` / `approaches` / `procedures` as T03-18 shipped), not `ids().slice(0, 64)` and not the whole pack.
- [ ] **AC3 —** The T03-19 STT `X-ATC-Fixes` hygiene test still asserts: header omitted **or** a tiny high-value prior; not file-order first-64 registry ids.
- [ ] **AC4 —** `phases/03-voice/README.md` §12 lists T03-16–20 as a post-exit addendum. §13 E1–E14 are **not** unchecked; at most a one-line addendum note.
- [ ] **AC5 —** `npm run ci` is the gate (`typecheck` + `lint` + `format:check` + `test`). Paid LLM/STT host grep-ban still holds (`openai.com`, `api.groq.com`, `api-inference.huggingface.co` on parse / speech-api paths). No new speech vendor.
- [ ] **AC6 —** Integration tests use a synthetic catalog. They do **not** encode KATL production map counts, video-map IDs, ordering, or geometry. They do not import production KATL JSON. KDEM `ILS27` / `SEMAX` tests remain green.
- [ ] **AC7 —** If live Path C tie salvage (real `POST /parse`, Haynes-like tie) was not run, a Voice leftover is recorded in `phases/LATER-IMPLEMENTATION-BACKLOG.md`. Chrome PTT p50 is **not** claimed unless measured this ticket.
- [ ] **AC8 — Research:** Integration fixture comment cites R01 CLEARED ILS / PROCEED DIRECT + trainer delta (catalog snap is trainer grounding, not 7110.65 NLU). No new non-glossary user-facing parse-miss copy.

## Test plan

- Unit: existing T03-16 retrieve / T03-17 margin / T03-18 ungrounded-miss / T03-19 header tests remain in the default Vitest glob. Do not delete them.
- Integration: `src/parse/parse.test.ts` and/or `src/parse/path-c.test.ts` — three unique utterance shapes; one tie + injected Path C with candidate cluster; grep-ban if not already covered.
- Regression: KDEM spoken/catalog-ground fixtures; T03-03 grammar; T03-14 Path C schema / miss-only trigger.
- Manual: optional live Path C tie salvage with `speech-api` `/health.parse === "ready"`. If skipped, AC7 leftover. Do not fill T03-12 p50 from this ticket.

## Suggested files

- `src/parse/parse.test.ts` (unique Haynes / AJ / ILS 26R integration)
- `src/parse/path-c.test.ts` (tie + injected Path C candidate cluster; grep-ban)
- `src/speech/ports/http-speech-port.test.ts` (confirm T03-19 assertion; do not regress to first-64 dump)
- `phases/03-voice/README.md` (§12 addendum; optional one-line §13 note)
- `phases/_shared/parse-pipeline.md` (leftover retrieve-cluster / ungrounded-miss bullets only)
- `phases/LATER-IMPLEMENTATION-BACKLOG.md` (Voice leftover if live Path C tie salvage not run)
