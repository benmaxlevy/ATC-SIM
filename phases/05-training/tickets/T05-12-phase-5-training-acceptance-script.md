# T05-12 Phase 5 training acceptance script

**Phase:** 05 Training
**Priority:** P0
**Size:** M
**Depends on:** T05-01 through T05-11 (all P0)
**Blocks:** phase exit
**Launch:** Implement this ticket only. Do not start downstream tickets. Do not add features; run and record the script.

## Goal

A documented, mostly automatable **acceptance script** proves phase 5: practice scoring, phraseology checker, imperfect pilots, unable, replay, second position stub, KDEM brief, a11y/settings — without certification claims or a network server.

## Context

Phase exit is in `phases/05-training/README.md`. This ticket is the **evidence pack**: a markdown script the implementer walks, plus Vitest files that lock the non-manual ACs.

Do not implement new product features here. If a gap appears, file it as `T05-13` only if the user asks; otherwise fix the failing ticket’s code **in a follow-up after this script lists the gap**. Prefer fixing P0 bugs found by the script in the same PR if small.

## Scope

- Add `phases/05-training/ACCEPTANCE.md` **or** `src/train/acceptance/PHASE5.md` with the numbered script below (keep it in the phase folder so launch agents find it): `phases/05-training/ACCEPTANCE.md`.
- Add `src/train/acceptance/ban-copy.test.ts` that greps (or reads) `src/ui`, `src/train`, `src/scenario/briefs` for forbidden claims.
- Add `src/train/acceptance/phase5.integration.test.ts` that chains: log CA episode → score deducts; phraseology disallowed combo; imperfect off vs delayed; unable on GS fixture; replay round-trip; F6 handoff event.
- Run `npm test` and record results in the script checklist (check boxes in `ACCEPTANCE.md`).
- Manual steps executed or reported as blocked (no GPU, no mic, etc.).

## Out of scope

- Efficiency P1, split view P1 — list as “not required.”
- VATSIM, LMS, multiplayer probes.
- Rewriting phase 3 voice quality targets.
- New scoring formulas.

## Implementation notes

### Forbidden copy (automated)

Fail the test if these appear as **claims** (allow the exact title `Practice score — not a certification` and the T00-01 disclaimer):

- `FAA-approved`
- `NAS-approved`
- `certified training device`
- `this certificate`
- `operational ATC`

Implementation: read files as text; the disclaimer paragraph is allow-listed.

### Integration skeleton

One Vitest file is enough if it stays DOM-free:

1. Build events: started, accepted heading, CA caution+clear, unable, handoff.
2. `scoreSession` snapshot (stable numbers).
3. `checkPhraseology` disallowed.
4. `toWorldDto`/`seekReplay` heading motion.
5. Ownership reducer F6.

### Manual script (copy into ACCEPTANCE.md)

1. `npm test` green.
2. `npm run dev` — disclaimer visible, brief shown, dismiss.
3. Score panel title exact; number 100 at idle.
4. Vector two arrivals into CA (phase 4 violator or close headings) — score drops; debrief JSON contains `ca_`.
5. Typed `DAL123 H270` — phraseology component stays 100.
6. Enable imperfect; issue altitude; wait 2–8 s for readback; if wrong digit, correct it.
7. On ILS, `S210` → unable (imperfect on).
8. Download replay; reload file; paused; scrub; inspect.
9. Hot-seat FIN, F3, F6, confirm color + `APP`/`FIN` text; no extra browser window required.
10. Settings: reduced motion, high contrast, reload persists imperfect off default after reset.
11. Confirm no second process / server was started for handoff.

## Acceptance criteria

- [ ] **AC1 —** `phases/05-training/ACCEPTANCE.md` exists with the manual script and a results table (pass/fail/blocked).
- [ ] **AC2 —** Ban-copy Vitest fails if `FAA-approved` is added to `src/ui` (Vitest; include a comment that the test is the guard).
- [ ] **AC3 —** Integration Vitest covers score deduct on one CA episode, phraseology disallowed, replay seek heading, F6 event (Vitest).
- [ ] **AC4 —** `npm test` exit 0 on the agent machine.
- [ ] **AC5 —** Manual items 2–11 executed or marked Blocked with reason (Manual).
- [ ] **AC6 —** This ticket did not add multiplayer or LMS code.
- [ ] **AC7 —** README phase exit checklist is checked off by the implementer to match reality (do not check P1 efficiency/split unless built).

## Test plan

- Unit: ban-copy.
- Integration: `phase5.integration.test.ts`.
- Manual: ACCEPTANCE.md.

## Suggested files

- `phases/05-training/ACCEPTANCE.md`
- `src/train/acceptance/ban-copy.test.ts`
- `src/train/acceptance/phase5.integration.test.ts`
