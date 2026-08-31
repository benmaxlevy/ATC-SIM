# T03-19 STT fix header hygiene

**Phase:** 03 Voice
**Priority:** P1
**Size:** S
**Depends on:** T03-16 (swarm Wave B after 16). Implementation does **not** need retrieve. STT runs before a transcript exists; do **not** call retrieve on audio.
**Blocks:** T03-20
**Launch:** Implement this ticket only. Do not start T03-18, T03-20, or other downstream tickets.

## Goal

`HttpSpeechPort` no longer sends the first 64 `fixRegistry.ids()` as `X-ATC-Fixes`. That list is navaid/file order, not spoken matches, and it pollutes Qwen STT on large CIFP packs. Either omit the header, or send a tiny high-value prior: published STAR/SID procedure names (already capped) plus at most a small set of procedure-referenced fix ids (cap well under 64, e.g. 16). Retrieval from a transcript belongs to Path C (T03-18), not the STT prompt.

## Context

`createVoiceLoop` currently wires `getCatalogFixIds: () => [...world.fixRegistry.ids()]`. The voice loop passes that array into **both** `speechPort.transcribe` (`finishTranscript`) and `parseCommand`. `headerFixIds` in `src/speech/ports/http-speech-port.ts` then takes the first 64 (`MAX_FIX_HEADER = 64`) and sets `X-ATC-Fixes`. `speech-api/engines.py` `MAX_STT_FIXES = 64` is a matching server safety cap.

On a large CIFP pack that dump is nearby navaids in file order, not the words the controller just said. Haynes (`HAINZ`) and AJ (`AJAAY`) already transcribed correctly **without** being in those 64. The cap hurt local snap (already raised on the snap branch) and still hurts Path C (T03-18) plus STT bias toward wrong nearby spellings.

`phases/_shared/speech-port.md` — `transcribe(audio, opts?: { fixes?: string[] })`. The header is **optional prompt bias**, not an allowlist. Do not reopen that file unless a one-line JSDoc is required to say the list must stay tiny.

`.cursor/rules/speech-self-hosted.mdc` — quality STT stays our `speech-api`. No paid vendors.

Twentieth swarm product law: **STT header is not a search index.** Do not send first-64 file-order ids. Retrieval from the transcript is Path C context.

T03-16 owns the spoken index and retrieve API. This ticket may land in Wave B after 16 for merge order. **Stopping the dump is sufficient.** Do not call `retrieve` (or any transcript-based ranker) at STT time.

## Research

- **R01** JO 7110.65 radio communications — controllers speak **STAR** / **SID** names and **fix** identifiers. Search: `FAA JO 7110.65 radio communications STAR SID phraseology`.
- **R02** PCG — official terms **standard terminal arrival**, **standard instrument departure**, **fix**. Search: `FAA Pilot Controller Glossary standard terminal arrival standard instrument departure fix`.
- **R11** CIFP / NASR — catalog ids are published identifiers, not an ASR vocabulary dump. Search: `FAA CIFP NASR waypoint fix identifier`.
- **Trainer delta:** Analog ATC has no `X-ATC-Fixes` prompt. Ours is optional Qwen/Whisper **bias**, not an allowlist. Haynes/AJ quality: STT must transcribe a spoken fix that is **absent** from the header. Cite analog + trainer delta on the STT header helper (or the create-app/voice-loop split): `// R11 CIFP ids are catalog lookup, not STT vocabulary; T03-19 does not require the spoken fix in X-ATC-Fixes.`

## Scope

- Stop sending `fixRegistry.ids()` (file/navaid order) as the STT `X-ATC-Fixes` prior.
- Prefer: keep `X-ATC-Procedures` as today (`headerProcedures` already caps at 16). Either **omit** `X-ATC-Fixes`, or add a dedicated `highValueFixIds(catalog)` that walks **only** STAR/SID/approach referenced fix ids (`stars`/`sids` legs, approach `fafFixId` / `thresholdFixId` / `locNavaidId` / `gsNavaidId` / missed `directFixId`), unique, **stable sort by id**, **max 16**. No facility-id branch. No 2000-id dump.
- Split STT prior from parse grounding. `parseCommand(..., { fixes })` (and later T03-16 retrieve / T03-18 Path C) must **not** shrink to 16 ids because the STT header did. Keep `getCatalogFixIds` for parse as the full registry unless T03-16 already replaced that path; change only what `transcribe` receives.
- Lower the **client** `MAX_FIX_HEADER` from 64 to **16** (or omit the header so the cap is unused). `speech-api/engines.py` `MAX_STT_FIXES = 64` **may stay** as a server safety cap. Do not raise it. Do not send 2000 ids and rely on the server to truncate.
- Rewrite `src/speech/ports/http-speech-port.test.ts` `"STT sends catalog ids as X-ATC-Fixes for Whisper prompt bias"` (`SEMAX,NEMAX,MERGE`) if that test is read as requiring a registry dump. It currently passes an explicit three-id `opts.fixes` list; keep it only as sanitization of a **tiny explicit** prior, or rewrite it to match omit / high-value behavior.
- New test: given **80 synthetic** catalog ids in file order, `X-ATC-Fixes` is **absent** **or** length **≤ 16**, and the header value is **not** `ids.slice(0, 64).join(",")`. First-64 file order is **not** the header.
- Do **not** change `POST /stt` JSON shape (`{ text, confidence }`). Do **not** add an LLM. Do **not** send the full CIFP pack.

## Out of scope

- Path C context / retrieved candidate lists (T03-18).
- Margin snap / ungrounded-id miss (T03-17).
- Spoken index / retrieve API (T03-16) — do not call it from STT.
- Parse-miss trigger changes.
- whisper-wasm (T03-11).
- Paid STT/TTS/LLM; OpenAI, Deepgram, Groq, HF Inference, etc.
- Replacing Path A. Changing Command IR or transcribe JSON.
- Editing `phases/_shared/speech-port.md` beyond an optional one-line JSDoc that the header is tiny optional bias.
- Changing `MAX_STT_FIXES` in `engines.py` (leave the safety cap).
- Kinematics, pilot executor, phase 5 scoring.

## Implementation notes

Today (illustrative):

```ts
// create-app.ts — dump
getCatalogFixIds: () => (world.fixRegistry ? [...world.fixRegistry.ids()] : []),

// voice-loop.ts — same list for STT and parse
return this.speechPort.transcribe(clip, {
  fixes: this.getCatalogFixIds(),
  procedures: this.getCatalogProcedures(),
});
// later:
parseCommand(transcript.text, { fixes: this.getCatalogFixIds(), ... });
```

`fixRegistry.ids()` follows navaid-then-fix **file order**. `headerFixIds` keeps insertion order and stops at 64. That is the bug.

Suggested split:

```ts
// STT: omit or high-value only. Never ids().slice(0, 64). Never retrieve(transcript).
transcribe(clip, {
  fixes: highValueFixIds(world.catalog), // or []
  procedures: proceduresFromCatalog(world.catalog),
});

// Parse: full catalog (or T03-16 retrieve after the transcript exists).
parseCommand(text, { fixes: [...world.fixRegistry.ids()], ... });
```

If adding `highValueFixIds`:

- Input: `ProcedureCatalog` (or `{ stars, sids, approaches }`). Synthetic fixtures in tests.
- Collect referenced ids only (STAR/SID legs + approach navaid/FAF/threshold/missed). Skip the rest of `navaids[]` / `fixes[]`.
- Uppercase, unique, **sort by id** (stable, not file order), `slice(0, 16)`.
- Empty catalog → no `X-ATC-Fixes` header (same as today’s empty-array path).
- Do not special-case `"KDEM"`, `"DEM1"`, `"HAINZ"`, or KATL production counts.

`headerProcedures` already caps STAR/SID `id=name` at 16 and joins with `|`. Leave that path green (`DEM1=DEMO ONE|BAY1=BAY ONE` test).

`headerFixIds` if kept: cap **16**, still sanitize `FIX_ID`, still omit the header when the list is empty. Invalid tokens (`nope!`) still dropped.

Do not invent a second SpeechPort method. Do not put catalog ids in the WAV body. Do not change transcribe JSON.

Generic tests only. No KATL map counts or facility-id runtime branches.

## Acceptance criteria

- [ ] **AC1 —** Given 80 synthetic catalog / registry ids in file order passed toward STT, when `HttpSpeechPort.transcribe` POSTs `/stt`, then `X-ATC-Fixes` is **absent** **or** contains **≤ 16** ids, and that header value is **not** equal to `ids.slice(0, 64)` joined by commas. First-64 file order is not the header.
- [ ] **AC2 —** Given `procedures: [{ id: "dem1", name: "DEMO ONE" }, { id: "bay1", name: "BAY ONE" }]`, `X-ATC-Procedures` is still `DEM1=DEMO ONE|BAY1=BAY ONE`. Procedure header still works.
- [ ] **AC3 —** Client STT adapter does not import or fetch OpenAI, Deepgram, Groq, ElevenLabs, or `api-inference.huggingface.co`. Existing vendor grep in `http-speech-port.test.ts` stays green.
- [ ] **AC4 — Haynes-quality:** A code comment on the STT header helper or the create-app / voice-loop split states that STT must **not** require the spoken fix to be in `X-ATC-Fixes` (Haynes/AJ transcribed without being in the 64). Cites R11 + trainer delta (catalog lookup ≠ STT vocabulary).
- [ ] **AC5 —** Existing STT mock tests stay green: happy JSON (AC1/AC6 of T03-05), missing confidence → 1.0, error/timeout/in-flight/empty-body paths, procedure-header test (rewritten only if this ticket changes that contract). `POST /stt` JSON shape is unchanged.
- [ ] **AC6 —** `parseCommand` still receives the full catalog fix list (or T03-16’s retrieve path), not the STT 16-cap. Automated test exists for AC1.

## Test plan

- Unit: `src/speech/ports/http-speech-port.test.ts` — 80 synthetic ids → header absent or ≤16 and not `slice(0, 64)`; procedure header unchanged; keep or rewrite the three-id `SEMAX,NEMAX,MERGE` case so it does not require a registry dump; vendor grep.
- Unit: `highValueFixIds` (if added) — synthetic STAR/SID/approach legs only; sort by id; cap 16; extra unreferenced registry ids do not appear.
- Unit / app: voice-loop or `create-app` — `transcribe` opts are omit/high-value; `parseCommand` fixes are not truncated to the STT prior.
- Integration: none required beyond existing mock STT suite.
- Manual: none required. Optional live check: large CIFP pack, speak a heading, confirm STT is not biased toward early-file navaid names.

## Suggested files

- `src/speech/ports/http-speech-port.ts` (`headerFixIds` / `MAX_FIX_HEADER`)
- `src/speech/ports/http-speech-port.test.ts`
- `src/app/create-app.ts` (`getCatalogFixIds` vs STT prior)
- `src/speech/voice-loop.ts` (split `transcribe` fixes from `parseCommand` fixes)
- Optional: `highValueFixIds` next to `proceduresFromCatalog` in `src/parse/spoken/catalog-ground.ts` (or a small helper beside the port), plus a synthetic-fixture test
