# T03-16 Spoken catalog index and retrieve

**Phase:** 03 Voice
**Priority:** P0
**Size:** M
**Depends on:** T03-03, T03-14 (catalog-ground already exists). Prerequisite unique snap for CIFP `I26R` / Haynes→`HAINZ` / AJ→`AJAAY` is already on `master` (`fix/katl-spoken-approach-and-fix-grounding`; local unique-snap cap 4096). Do not re-implement that snap.
**Blocks:** T03-17, T03-18, T03-19 (T03-19 may only need the idea of “do not use file-order 64”; it can land without calling retrieve if it only stops the STT dump — but SWARM says wait for T03-16)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Precompute a spoken index over the **full** facility catalog and expose `retrieveFix(token)` → ranked `{ id, score }[]`. Parser, STT, and Path C still use today’s **unique snap** (`groundFixToCatalog`). They MAY call retrieve later for scoring; this ticket must not change the Path C miss-only trigger, must not change STT headers, and must not argmax-snap.

## Context

KATL CIFP packs are hundreds to thousands of 5-letter fixes. Local unique grounding now caps at 4096 and unique-matches Haynes / AJ. Path C `fixes=` and STT `X-ATC-Fixes` still get the first **64** registry ids in **file order**. Dumping the pack into an LLM is forbidden. Retrieve is the index so later tickets can pass a top-K cluster to Path C instead of `ids().slice(0, 64)`.

`phases/_shared/parse-pipeline.md` — one stage list for text and voice; Path C is salvage after typed / A / B miss; `context.fixes` is prompt grounding, not a vector DB. Do not change that trigger here.

`phases/_shared/non-goals.md` — LLM is not the primary parser; Path C is salvage only; no paid LLM.

`phases/_shared/speech-port.md` — do not reopen `SpeechPort`. Retrieve is a parse-side catalog index, not a speech adapter.

T03-14 already ships unique-only `groundFixToCatalog` in `src/parse/spoken/catalog-ground.ts` (`catalogFixAliases`, `normalizeFixKey` / `foldSpokenFix`, Levenshtein). Keep that unique gate. This ticket adds a **ranked** API next to it.

Twentieth swarm product law (`phases/SWARM.md`): retrieve walks the full facility; unique local snap stays the happy path; margin snap and Path C candidate wiring are later tickets.

## Research

**R01** JO 7110.65 — radio communications and intersection / fix / navaid names. Controllers speak published names as words, not as spelled 5-letter CIFP identifiers.

- Open: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/
- **Search:** `FAA JO 7110.65 intersection name`
- Official analog: intersection / fix names on frequency are spoken as pronounceable names (and navaids by ident / name per 7110.65 phraseology).
- **Trainer delta:** catalog rows are 5-letter ids (`HAINZ`, `AJAAY`). ASR and controllers say words (`Haynes`, `AJ` / `Ajay`). Retrieve ranks the spoken token onto catalog ids. Unique snap already maps Haynes→`HAINZ` and AJ→`AJAAY` when the match is unique; retrieve must rank those same pairs when the id sits **past file-order 64**.

Cite analog + trainer delta in a code comment on the new retrieve module (AC7). Do not claim full 7110.65 coverage. Do not scrape charts.

## Scope

- New module under `src/parse/spoken/` (e.g. `catalog-retrieve.ts`) built from existing catalog-ground aliases + `foldSpokenFix` / `normalizeFixKey` + Levenshtein. An optional cheap metaphone / consonant-skeleton bucket is OK if unique-match tests stay green.
- Index built from the **full** sanitized fix list plus optional approaches / procedures. Build **O(catalog) once**, not a naive nested alias rebuild per token if an inverted map is easy. Do not micro-optimize without a test that proves the cost.
- `retrieveFix(token, catalog, opts?)` returns ranked `{ id, score }[]` sorted best-first. Empty / tiny token → `[]`. Never invent an id that is not in the catalog argument.
- Export a **MAX retrieve list size** constant (e.g. `16`) for later Path C. This ticket only exposes the API + unit tests.
- Keep existing `groundFixToCatalog` unique-only behavior unless you internally use the index and still return `null` on non-unique. **Prefer:** `groundFixToCatalog` stays unique-only; retrieve is the ranked API.
- Synthetic fixtures only (`.cursor/rules/generic-test-fixtures.mdc`). Haynes/`HAINZ`, AJ/`AJAAY`, SEMAX / C-Max, padding **>64** ids. No KATL file counts, map IDs, or `fixes.json` imports.

## Out of scope

- Floor / margin snap (T03-17). Do not argmax a weak or tied cluster into a Command id.
- Ungrounded parse miss (T03-18). Do not change Path A / B / C trigger or treat unmatched tokens as a finished `DIRECT`.
- Path C `context` candidate lists (T03-18). Do not wire retrieve into `parsePathC` / `POST /parse`.
- STT `X-ATC-Fixes` hygiene (T03-19). Do not change `MAX_FIX_HEADER` / file-order 64 in `http-speech-port.ts`.
- A second LLM, always-on post-STT rewrite, or paid vendors (OpenAI, Groq, HF Inference, etc.).
- KDEM / KATL facility-id branches. A second facility must work from the catalog argument.
- Reopening `SpeechPort`. Changing kinematics or the pilot executor.
- Re-implementing unique Haynes / AJ / `I26R` snap (already on `master`).

## Implementation notes

Keep the module DOM-free under `src/parse/spoken/`. Reuse `catalogFixAliases`, `normalizeFixKey` and/or `foldSpokenFix`, and the existing Levenshtein helper from `catalog-ground.ts` (export the distance function if sharing it is cleaner than copying). Do not duplicate the unique-snap Haynes / AJ / `I26R` logic.

Suggested shape:

```ts
export const MAX_RETRIEVE_CANDIDATES = 16;

export interface RetrieveHit {
  id: string;
  score: number;
}

export function retrieveFix(
  token: string | null | undefined,
  catalog: readonly string[],
  opts?: { limit?: number },
): RetrieveHit[];
```

`opts.limit` defaults to `MAX_RETRIEVE_CANDIDATES`. Results are best-first. Cap the returned list; do not cap the **index** at 64.

**Index vs STT/Path C 64:** Path C and STT still dump file-order 64 after this ticket (T03-18 / T03-19). Retrieve must **not** inherit that slice. Index every valid unique id in the catalog argument. Reusing `sanitizeFixIds` is fine after the 4096 unique-snap cap (index 70 is inside 4096). If `sanitizeFixIds` were still 64, retrieve must not use that 64 cap — AC1 would fail. Do not add a new 64 cap inside retrieve.

**Scoring (rank, do not snap):** exact / folded-key match highest; then alias (`catalogFixAliases`, spoken fold Haynes→`HAINZ`, AJ/Ajay→`AJAAY`); then small Levenshtein. Optional metaphone / consonant skeleton may bucket candidates. Scores must be comparable so a unique Haynes hit is strictly first. Do not drop a tied fold-match (AC4). Do not invent ids. Zero / no-signal tokens return `[]`.

**Unique gate:** `groundFixToCatalog` remains unique-only. Retrieve may return several hits; unique snap still returns `null` when two ids fold-match the same token. Parser / grammar / pattern-matcher / Path C continue to call unique snap as today. Do not switch them to argmax(retrieve) in this ticket.

**Approaches / procedures:** optional in the same index for later tickets. This ticket’s ACs are fix retrieve. Do not block on `retrieveApproach`.

Export `retrieveFix` and `MAX_RETRIEVE_CANDIDATES` from `src/parse/index.ts` if later tickets will import `@parse`.

Tests: vitest, synthetic catalogs, pad ≥70 dummy valid ids then `HAINZ` so file-order-64 would miss it. Do not import `src/scenario/data/katl/fixes.json` or encode production map counts.

## Acceptance criteria

- [ ] **AC1 —** Given a synthetic catalog with `HAINZ` **past index 70** (pad ≥70 other valid ids), when `retrieveFix("Haynes", catalog)`, then the unique top hit `id` is `"HAINZ"`.
- [ ] **AC2 —** Given a synthetic catalog containing `AJAAY` and unrelated padding, when `retrieveFix("AJ", catalog)` and `retrieveFix("Ajay", catalog)`, then each list’s unique top hit is `"AJAAY"`.
- [ ] **AC3 —** Given `retrieveFix("NOPE", catalog)` (catalog has no NOPE-like id) or an empty / whitespace token, then the result is `[]` and no id is returned that is not in the catalog. Automated happy-path tests exist for AC1 / AC2.
- [ ] **AC4 —** Given two synthetic catalog ids that both fold-match the same token, when `retrieveFix(token, catalog)`, then **both** ids appear (neither dropped). `groundFixToCatalog(token, catalog)` is still `null` (unique gate).
- [ ] **AC5 —** Given a synthetic catalog that includes `SEMAX`, when `retrieveFix("C-Max", catalog)` (and the existing unique path), then `SEMAX` still unique-matches via existing aliases; `groundFixToCatalog("C-Max", catalog)` remains `"SEMAX"`.
- [ ] **AC6 —** New retrieve files do not call OpenAI, Groq, or Hugging Face Inference (`openai.com`, `api.groq.com`, `api-inference.huggingface.co`, or equivalent vendor SDKs).
- [ ] **AC7 — Research:** A code comment on the retrieve module cites JO 7110.65 spoken intersection / fix names (analog) vs trainer 5-letter catalog ids (`HAINZ` = Haynes, `AJAAY` = AJ) (delta). No user-facing copy required.
- [ ] **AC8 —** Tests do not import `katl/fixes.json` (or other production facility fix files) and do not encode production map counts, map IDs, or KATL/KDEM inventory sizes.

## Test plan

- Unit: `src/parse/spoken/catalog-retrieve.test.ts` — AC1 Haynes/`HAINZ` past index 70; AC2 AJ / Ajay → `AJAAY`; AC3 unknown / empty; AC4 non-unique fold-match (retrieve keeps both, unique snap null); AC5 SEMAX / C-Max aliases still unique; export cap constant.
- Integration: none required. Do not wire retrieve into Path C or STT in this ticket.
- Manual: none.

## Suggested files

- `src/parse/spoken/catalog-retrieve.ts`
- `src/parse/spoken/catalog-retrieve.test.ts`
- `src/parse/spoken/catalog-ground.ts` (export shared fold / Levenshtein only if needed; do not change unique-only `groundFixToCatalog`)
- `src/parse/index.ts` (export `retrieveFix` / `MAX_RETRIEVE_CANDIDATES` if later tickets import `@parse`)
