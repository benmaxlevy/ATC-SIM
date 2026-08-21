# T05-01 Session scoring model

**Phase:** 05 Training
**Priority:** P0
**Size:** L
**Depends on:** phase 3 exit and phase 4 exit
**Blocks:** T05-02, T05-03, T05-04
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A DOM-free `scoreSession(events, ctx)` turns a T00-08 session log (plus later event variants) into a deterministic **practice score** with separation, phraseology (stub until T05-04), optional efficiency, and optional voice radio-discipline components.

## Context

`phases/_shared/command-ir.md` requires accepted/rejected commands on the session log. `phases/00-slice/tickets/T00-08-session-event-log-schema.md` froze `SessionLog` + three event types; this ticket **extends** the union as needed without breaking existing appends.

`phases/04-procedures/README.md` CA events: `alert.ca.caution`, `alert.ca.alert`, `alert.ca.clear`. Scoring **counts episodes**, it does not recompute 3 NM / 1000 ft.

Normative formulas, weights, and omitted-component renormalization: `phases/05-training/README.md` § Scoring model.

`phases/_shared/non-goals.md`: do not claim certification. `scoreKind` is always `"practice"`.

## Scope

- Add package `src/train` with barrel `@train`. Path alias like the others.
- Patch `phases/_shared/architecture.md` **in this PR only** to list `src/train` (scoring, debrief, replay types). Do not rewrite other architecture rows.
- Extend `SessionEvent` if CA/nav/speech types are missing so tests can append them (match phase 4/3 names if they already exist).
- Implement `scoreSession` + CA episode grouping + weight renormalization + T00-01 disclaimer string on the result.
- Phraseology: call `checkPhraseology` if exported; until T05-04, ship `checkPhraseology` as a **stub** that returns `canonical` for every command (T05-04 replaces the body).
- Readback-discipline: consume `pilot.readback.started` / `.completed` if present; if absent, component `raw = 100` when `hadVoice`.
- MSAW: count episodes into `observed` only.
- Vitest: fixtures built from Command fixtures (T00-06) + synthetic CA events.
- Optional P1: efficiency via `nav.star.distance` / published STAR length (see Implementation notes). Mark those ACs P1.

## Out of scope

- Live UI panel (T05-02), JSON download button (T05-03).
- Real phraseology grammar (T05-04) — stub only.
- Imperfect pilots, replay, second position.
- Recoding conflict geometry.
- LLM, LMS, uploading scores.
- Split view.

## Implementation notes

### Package

```ts
// src/train/index.ts
export { scoreSession } from "./score/score-session";
export type { SessionScore, ScoreContext, ScoreDeduction } from "./score/types";
export { checkPhraseology } from "./phraseology/check-phraseology";
```

Import rules: `@train` may import `@core`, `@parse`, `@scenario`. `@core` must not import `@train`. Re-export types from `@train`, not from `@ui`.

### Disclaimer

Read the frozen paragraph from `docs/DISCLAIMER.md` or a copied constant `TRAINING_DISCLAIMER` that **byte-matches** T00-01. Tests: `result.disclaimer` equals that paragraph.

### CA episodes

See README table. Pair key = sorted callsigns join `"|"`. Tests must prove **100 caution events for the same pair without clear = one episode**, not −500 points.

If phase 4 payload field names differ (`ac1`/`ac2` vs `callsigns: [a,b]`), write a normalizer in `ca-episodes.ts`.

### Stub checker

```ts
export function checkPhraseology(_command: Command): PhraseologyVerdict {
  return { status: "canonical", grammar: "typed" };
}
```

Keep this function’s **signature** stable so T05-04 is a body change + tests.

### Weights

Implement `renormalizeWeights(present: ComponentId[], base: Record<ComponentId, number>)` with README defaults. Test: no voice, no efficiency → weights 0.625 / 0.375.

### `total`

`Math.round` of the weighted sum (half-up). Clamp 0–100. `scoreKind: "practice"` required.

### P1 efficiency

Only if you implement P1 in this ticket:

- Published length: `distanceNm(ALPHA,BRAVO)+distanceNm(BRAVO,CHARLIE)` from KDEM catalog (do not hard-code 19.86 in production; tests may assert ≈ 19.86 ± 0.05).
- Prefer event `nav.star.distance`. If missing, increment `distanceFlownNm` on aircraft while lateral `PROCEDURE` in `stepWorld` and emit the event at `nav.star.vectors`. Keep the kinematics change tiny.
- `extraNm ≤ 2` → 100; else `100 - 5*(extraNm-2)`.

Skip P1 if the user asked for a minimal phase exit.

## Acceptance criteria

- [ ] **AC1 —** `@train` resolves; `scoreSession` lives under `src/train` and imports no React, DOM, or `@ui` (Vitest + grep/import graph).
- [ ] **AC2 —** `phases/_shared/architecture.md` includes `src/train` in the package table (this PR).
- [ ] **AC3 —** Empty log (or only `session.started`) yields `total === 100`, `scoreKind === "practice"`, disclaimer matches T00-01 (Vitest).
- [ ] **AC4 —** One caution-only CA episode deducts 5 from separation raw (95) and lowers `total` by the renormalized weight (Vitest).
- [ ] **AC5 —** 50 `alert.ca.caution` for the same pair without `clear` still counts as **one** open episode, not 50 (Vitest).
- [ ] **AC6 —** Red alert episode duration 31 s sim deducts 20+10 from separation raw (Vitest).
- [ ] **AC7 —** MSAW events do not change `total`; they increment `observed.msaw*` (Vitest).
- [ ] **AC8 —** `hadVoice: false` omits `components.readbackDelay` and renormalizes remaining weights to 1 (Vitest).
- [ ] **P1 AC9 —** With `efficiencyEnabled` and one `nav.star.distance` of published+3 NM, efficiency raw is 95 (Vitest). **Optional for phase exit.**

## Test plan

- Unit: `src/train/score/score-session.test.ts`, `ca-episodes.test.ts`, `weights.test.ts`.
- Integration: none required.
- Manual: none.

## Suggested files

- `src/train/index.ts`
- `src/train/score/types.ts`
- `src/train/score/score-session.ts`
- `src/train/score/ca-episodes.ts`
- `src/train/score/weights.ts`
- `src/train/score/score-session.test.ts`
- `src/train/phraseology/check-phraseology.ts`
- `src/core/events/types.ts` (extend union)
- `phases/_shared/architecture.md` (package row only)
- `vite.config.ts` / `tsconfig.json` aliases
