# T05-02 Live score panel

**Phase:** 05 Training
**Priority:** P0
**Size:** M
**Depends on:** T05-01
**Blocks:** T05-11, T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The scope chrome shows a live **practice score** that recomputes from `SessionLog` as events arrive. The panel cannot be mistaken for FAA certification.

## Context

`phases/05-training/README.md` required label: `Practice score — not a certification`. T00-01 disclaimer remains visible (do not replace it with the score).

`phases/_shared/architecture.md`: `src/ui` owns shell chrome; scoring math stays in `@train`. The sim tick must not wait on React: recompute in a subscription after `append`, or on a 1 Hz sim-time throttle — not inside `stepWorld`.

Glossary: this is **not** a Datablock. Do not draw the score on the PPI canvas.

## Scope

- Score panel in the shell (right rail, above strips, or a compact overlay that does **not** cover the runway). Prefer a collapsible rail.
- Display: integer `total`, four-or-fewer component raw values that exist, duration sim time.
- Title + short subtitle with the required non-certification sentence (title string frozen in README).
- Recompute `scoreSession(log.all(), ctx)` when the log grows or when the user toggles collapse (always fresh on expand).
- `ctx.hadVoice` derived from any `command.accepted` with `source === "voice"`.
- `aria-live="polite"` on the integer total (T05-11 may extend; do it now so the panel is not silent).
- Hide component rows that are omitted (`efficiency`, `readbackDelay`).
- No “pass/fail”, no letter grade, no gold stars that imply a credential.

## Out of scope

- Debrief file download (T05-03) — a “Debrief” button placeholder is OK if disabled, prefer omit.
- Phraseology implementation (T05-04) — panel shows whatever `scoreSession` returns.
- Trainer settings form (T05-11).
- Drawing CA geometry.
- Animating the number every physics frame (throttle ≥ 250 ms wall or on event).

## Implementation notes

Suggested props:

```ts
interface ScorePanelProps {
  score: SessionScore;
  collapsed: boolean;
  onToggle(): void;
}
```

`ScoreContext.settings` at live time: use the **session-start** snapshot of weights (mutating weights mid-session is T05-11; if settings change, next `scoreSession` uses new weights — acceptable).

Copy deck (frozen):

- Title: `Practice score — not a certification`
- Do not use: Grade, Certified, FAA, Pass, Fail, Rating

If the log has no `session.started`, show `—` for duration and still call `scoreSession` (T05-01 empty-log behavior).

Layout: dark chrome consistent with phase 2 UI (`#9AA0A6` on `#111`). Do not introduce a bright “game HUD” scoreboard.

## Acceptance criteria

- [ ] **AC1 —** With a running session, the panel is visible without opening settings and shows an integer 0–100.
- [ ] **AC2 —** Visible title text is exactly `Practice score — not a certification` (case-sensitive; em dash).
- [ ] **AC3 —** Appending one CA caution episode (via a test harness or scripted log) updates separation and `total` without a reload (Manual or component test).
- [ ] **AC4 —** Phase 0 disclaimer is still visible on the same screen as the panel (Manual).
- [ ] **AC5 —** Source contains no substrings `certified`, `certification`, `FAA-approved` in the panel module (except the title’s word `certification` in the **negation** “not a certification”). Do not add other uses.
- [ ] **AC6 —** `stepWorld` / kinematics files are unchanged by this ticket (no score math in physics).
- [ ] **AC7 —** Collapse/expand does not pause the sim.

## Test plan

- Unit: panel maps `SessionScore` → visible numbers (DOM test if the repo already tests UI; otherwise a pure `formatScorePanel(score)` helper with Vitest).
- Integration: none required.
- Manual: `npm run dev`, work traffic, confirm label + disclaimer + number moves after a deliberate CA if the phase 4 violator spawn exists.

## Suggested files

- `src/ui/score-panel.tsx` (or `.ts` if the shell is not React)
- `src/ui/score-panel.test.ts`
- `src/ui/App.tsx` (wire log → panel)
- `src/train/score/format.ts` (optional pure formatter)
