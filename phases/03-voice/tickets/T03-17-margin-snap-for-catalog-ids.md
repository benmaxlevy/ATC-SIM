# T03-17 Margin snap for catalog ids

**Phase:** 03 Voice
**Priority:** P0
**Size:** M
**Depends on:** T03-16
**Blocks:** T03-18
**Launch:** Implement this ticket only. Do not start T03-18 or downstream tickets.

## Goal

Snap a spoken or ASR token onto a catalog id only when the retrieved winner is clearly best: score ≥ floor **and** (sole candidate above floor **or** best − second ≥ margin). A tie or a weak score does **not** snap. Expose a structured ungrounded outcome so T03-18 can miss Path C. This ticket does **not** call Path C.

## Context

Agreed policy: snap the most likely id when the margin is clear; tie → LLM later; weak or none → LLM later. Raw argmax on KATL-scale catalogs invents ids (`AL` / `NO` / `TO`). Unique-match is not enough once we rank: two close scores are a tie even if they are not equal.

`phases/_shared/parse-pipeline.md` — one `parseCommand` for text and voice. Catalog snap after typed / A / B / C is local ASR repair onto listed ids. Path C remains miss-only salvage. **Do not** change the miss trigger or fetch `/parse` here (T03-18).

`phases/_shared/non-goals.md` — never invent ids that are not in the catalog; LLM is not the primary parser (Path A stays English grammar). Path C is optional salvage after a local miss, not an executor.

`phases/_shared/command-ir.md` — frozen `Instruction` union. Prefer **not** adding new instruction types.

T03-16 owns the spoken index and retrieve API over the full facility catalog (ranked `{ id, score }[]`). This ticket **consumes** that ranked list. It does not re-implement retrieve, STT headers, or Path C candidate wiring.

Existing `src/parse/spoken/catalog-ground.ts` unique snap **must remain** for exact and alias unique hits that already pass (`C-Max` → `SEMAX`, unique edit-distance-1, unique ILS-type among LOC/RNAV on the same runway). Do not replace that path with argmax.

Prerequisite unique snap (Haynes → `HAINZ`, AJ → `AJAAY`, ILS 26R → `I26R`) is already on `master` or lands with the T03-16 wave. Do not re-implement that unique matcher; add floor + margin **on top of retrieve**.

## Research

- **R01** JO 7110.65 radio communications — official phraseology **proceed direct (fix)** / published identifier. Search: `FAA JO 7110.65 proceed direct`.
- **R02** PCG — **fix**. Search: `FAA Pilot Controller Glossary fix`.
- **R11** CIFP / NASR — catalog ids are published five-letter fixes and procedure ids (`HAINZ`, `I26R`), not ASR spellings. Search: `FAA CIFP Coded Instrument Flight Procedures`.
- **Official term:** published **fix** / procedure / approach **identifier**.
- **Trainer delta:** identifier snap is **trainer ASR repair**, not NAS. NAS does not fuzzy-match Whisper output onto CIFP. Unique exact/alias hits stay local; floor + margin decide when a ranked guess is allowed. Tie or weak score leaves the token ungrounded for Path C (T03-18), not a invented 5-letter id.
- Cite analog + trainer delta in a code comment on `snapFix` (or the exported constants): `// R01 proceed direct uses published identifiers; T03-17 snap is trainer ASR repair with floor+margin, not NAS.`

## Scope

- Named constants **FLOOR** and **MARGIN**, exported from the snap module (suggested names `SNAP_SCORE_FLOOR` and `SNAP_SCORE_MARGIN`). Document the values in this ticket and freeze them in tests by importing the constants — do not copy magic numbers into assertions.
  - Frozen values (0–1 T03-16 scores, higher is better): **`SNAP_SCORE_FLOOR = 0.80`**, **`SNAP_SCORE_MARGIN = 0.05`**.
  - Tie includes `best − second < SNAP_SCORE_MARGIN` (0.91 vs 0.89 is a tie under these constants).
- `snapFix(token, ranked, preferIds?)` →
  `{ kind: "snap"; id: string } | { kind: "tie"; ids: string[] } | { kind: "weak" } | { kind: "none" }`.
- Prefer procedure-referenced / on-route / on-scope ids **only** as a tie-break when scores are within margin — **never** a hard filter. `HAINZ` on an ILS must still win when it is uniquely better. Optional `preferIds` is a `ReadonlySet<string>` passed in; parse stays World-free (do not import kinematics or the scope).
- Wire snap into `groundFixToCatalog` / instruction grounding without breaking SEMAX unique tests or ILS26R → `I26R` unique ILS-type tests.
- Expose an ungrounded outcome on the parse path (see Implementation notes). Do **not** treat ungrounded as a successful `DIRECT` with raw `HAYNES`.
- Synthetic tests: unique Haynes snaps; two equal-score ids → tie, no snap; best 0.91 vs 0.89 → tie; garbage → `none` / `weak`; short AL-like collision fixture.

## Out of scope

- Path C fetch / `POST /parse` / changing when stage 4 runs (T03-18).
- Parse-pipeline miss trigger: ungrounded identifier → local miss (T03-18). This ticket **exposes** the signal; T03-18 **consumes** it.
- STT headers / `X-ATC-Fixes` (T03-19).
- Second LLM, always-on post-STT model, paid / metered vendors.
- Replacing Path A. Changing kinematics or the pilot executor.
- Re-implementing T03-16 retrieve / spoken index.
- Changing `CLEARED_APPROACH` ILS-vs-LOC type gating except to reuse the same margin helper if that is a trivial call-site swap.
- Facility-id branches (`KATL`, `KDEM`, `"DEM1"` on a live path). Production catalog counts.
- New `Instruction` types.

## Implementation notes

### Snap rule

T03-16 ranked candidates are `{ id: string; score: number }[]`, sorted best-first, scores in `[0, 1]`. `snapFix` does not re-score.

Let `best` be the top score and `second` the next (or absent). Candidates **above floor** are those with `score >= SNAP_SCORE_FLOOR`.

| Outcome | When |
| --- | --- |
| `none` | `ranked` empty (or token too short to retrieve — same as today’s unique miss). |
| `weak` | At least one candidate, but `best < SNAP_SCORE_FLOOR`. Do **not** snap the least-bad id. |
| `snap` | `best >= SNAP_SCORE_FLOOR` **and** (exactly one candidate above floor **or** `best − second >= SNAP_SCORE_MARGIN`). |
| `tie` | `best >= SNAP_SCORE_FLOOR` **and** at least two candidates above floor **and** `best − second < SNAP_SCORE_MARGIN`. `ids` lists that close cluster (at least the top two). |

Equal scores are a tie. “Too close” is also a tie. Unique-match of an exact/alias hit in `catalog-ground.ts` still wins **before** ranking; `snapFix` is for the ranked leftover.

### Tie-break (not a filter)

Optional `preferIds`: procedure-referenced, on-route, and/or on-scope catalog ids supplied by the caller.

- Apply **only** when the numeric rule would return `tie` (scores within margin).
- If **exactly one** id in the close cluster is in `preferIds`, return `{ kind: "snap", id }` for that id.
- If both, neither, or more than one match, keep `{ kind: "tie", ids }`.
- **Never** drop off-route candidates before scoring. A uniquely better off-route id (`best − second >= margin`) must snap even if `preferIds` contains a worse on-route id. `HAINZ` on ILS is this case: on-route preference must not steal it, and it must not require an on-route flag to win.

AC2 fixtures must **omit** `preferIds` (or pass an empty set) so a within-margin pair stays `tie`.

### Unique snap stays

Keep `groundFixToCatalog` exact / alias / unique levenshtein-1 behavior. Suggested compose order for a token:

1. Existing unique exact / alias / unique near-miss → snap that id (no floor/margin). SEMAX / C-Max stays here.
2. Else T03-16 `retrieve` → `snapFix`.
3. `snap` → use `id`. `tie` / `weak` / `none` → do **not** invent an id.

Same helper may wrap approach/procedure tokens if the call is trivial. Do **not** change ILS-vs-LOC type gating: spoken `ILS 26R` / `ILS26R` among ILS + LOC + RNAV on the same runway remains a **type-gated unique** win (`I26R`), not a margin fight. If type-gating already yields one id, that is unique snap (AC5); do not require `best − second >= margin` on top.

### Ungrounded signal (pick this approach)

**Do not** add `Instruction` types. `command-ir.md` stays closed.

Extend the `ok: true` branch of `ParseResult` (`src/parse/parseRadioText.ts`) with an optional parallel list:

```ts
ungroundedFixes?: string[];
```

When `snapFix` returns `tie`, `weak`, or `none` for a DIRECT/CROSS (and the same for approach/procedure ids if those helpers use ranking):

- Keep the **raw token** on the instruction (`fixId: "HAYNES"`), so the union stays valid.
- Append that raw token to `ungroundedFixes`.
- `tie.ids` may be retained for T03-18 / logs (optional extra field is fine if it stays off the `Instruction` union). A minimal implementation is: raw token on the instruction + `ungroundedFixes` populated. Document whichever extra you add.

Do **not** use today’s `groundFixToCatalog(...) ?? inst.fixId` as a successful grounded parse. That path currently leaves raw `HAYNES` looking like a complete `DIRECT`. Tests in this ticket must assert `ungroundedFixes` (or equivalent) and must **not** treat that result as a successful Haynes snap.

This ticket **does not** turn ungrounded into `ok: false` / Path C. `parseCommand` may still return `ok: true` with the flag set until T03-18. Do not fetch `/parse`. Do not edit `phases/_shared/parse-pipeline.md`.

If approaches/procedures need the same flag, add `ungroundedApproaches` / `ungroundedProcedures` the same way — still not new instruction types.

### Constants

```ts
/** Minimum T03-16 retrieve score to consider a snap. Frozen by T03-17 tests. */
export const SNAP_SCORE_FLOOR = 0.8;

/** Minimum best−second gap. Smaller gaps are ties (including 0.91 vs 0.89). */
export const SNAP_SCORE_MARGIN = 0.05;
```

Export from `catalog-ground.ts` or a small sibling (e.g. `catalog-snap.ts`) imported by grounding. Tests import the constants. Changing the numbers is a ticket change, not a silent tweak.

### Short AL-like collision

Synthetic catalog where a short token (`AL`, `NO`, `TO`) ranks several 5-letter ids with scores within margin (or all below floor). `snapFix` must return `tie` or `weak` / `none` — never file-order argmax onto the first `AL….` id. This is the KATL-scale failure mode this ticket exists to stop.

### Generic fixtures

Synthetic catalogs only. Do not encode KATL production counts, map IDs, or facility ICAO on a live path. Comments and test names may say Haynes / ILS 26R / SEMAX.

## Acceptance criteria

- [ ] **AC1 —** Given a synthetic catalog containing `HAINZ` and distractors, and a ranked list where `HAINZ` is unique above `SNAP_SCORE_FLOOR` with `best − second >= SNAP_SCORE_MARGIN` (or is the sole candidate above floor), when the token is `Haynes` / `HAYNES`, then `snapFix` returns `{ kind: "snap", id: "HAINZ" }`. Instruction grounding uses `HAINZ`, not raw `HAYNES`.
- [ ] **AC2 —** Given two synthetic ids with equal scores, or scores within `SNAP_SCORE_MARGIN` (including **0.91 vs 0.89**), and no `preferIds` tie-break, then `snapFix` returns `{ kind: "tie", ids }` listing both, and **does not** snap. `ungroundedFixes` (or equivalent) contains the raw token.
- [ ] **AC3 —** Given `best < SNAP_SCORE_FLOOR`, then no snap even if exactly one candidate exists (`kind: "weak"`). Raw token is ungrounded, not promoted to a catalog id.
- [ ] **AC4 —** `groundFixToCatalog("C-Max" | "c max" | "see max", …)` still returns `"SEMAX"` (existing unique alias tests stay green). Ranking/margin must not break unique SEMAX snap.
- [ ] **AC5 —** Spoken / ASR `ILS26R` (and equivalent ILS-type tokens) still snaps to `I26R` among synthetic LOC and RNAV approaches on the same runway. Type-gated uniqueness is still a unique win; do not require a margin gap against the LOC/RNAV ids.
- [ ] **AC6 —** Given an off-route id uniquely better than an on-route id (`best − second >= SNAP_SCORE_MARGIN`), `preferIds` containing only the on-route id does **not** steal the snap. The uniquely better off-route id wins (`HAINZ`-on-ILS shape).
- [ ] **AC7 —** `SNAP_SCORE_FLOOR` and `SNAP_SCORE_MARGIN` are exported and asserted in tests (imported constants, not duplicated literals). No facility-id branch on a live path. Automated tests exist for AC1–AC3 and the AL-like collision (no snap / tie or weak).
- [ ] **AC8 — Research:** A code comment on `snapFix` or the constants cites R01 published identifiers + trainer delta (ASR repair with floor+margin, not NAS). No new user-facing synonym for **fix**.

## Test plan

- Unit: `snapFix` — Haynes unique → `HAINZ`; two equal scores → `tie` + ids; 0.91 vs 0.89 → `tie`; below floor → `weak`; empty ranked → `none`; AL-like short collision → no snap; on-route preferIds resolves a within-margin pair only when exactly one cluster member matches; uniquely better off-route ignores preferIds (AC6).
- Unit: existing `catalog-ground.test.ts` SEMAX / C-Max / unique near-miss / empty catalog still pass. New synthetic ILS+LOC+RNAV same-runway fixture for `I26R` (AC5).
- Unit: instruction grounding — unique snap still rewrites `DIRECT`/`CROSS`; ungrounded path sets `ungroundedFixes` and does **not** look like a successful Haynes `DIRECT`.
- Integration: none required beyond parse grounding if `okStage` / `ParseResult` grows the list. Do not add Path C fetch spies.
- Manual: none.

## Suggested files

- `src/parse/spoken/catalog-ground.ts` (compose unique snap + `snapFix`; keep exact/alias unique)
- `src/parse/spoken/catalog-snap.ts` (optional sibling: constants, `snapFix`, `SnapResult`)
- `src/parse/spoken/catalog-ground.test.ts` (SEMAX + new margin cases)
- `src/parse/spoken/catalog-snap.test.ts` (if split)
- `src/parse/parseRadioText.ts` (`ParseResult` `ungroundedFixes`)
- `src/parse/parse-command.ts` (`okStage` propagates the list; do not call Path C on it)
- T03-16 retrieve types/helpers (import only; do not rewrite the index)
