# T05-10 Scenario brief markdown for KDEM

**Phase:** 05 Training
**Priority:** P0
**Size:** S
**Depends on:** none
**Blocks:** T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A committed **markdown briefing** for the KDEM session is shown at session start. It tells the player what to work, how they are scored, and that this is not a certified lesson. No LMS.

## Context

KDEM is the frozen demo facility (`phases/_shared/architecture.md`): rwy 27, mag var 0, elev 0, ILS 27, DEMO ONE STAR (phase 4).

Disclaimer copy is frozen in T00-01 / `docs/DISCLAIMER.md`. The brief must include that paragraph **verbatim**.

`phases/_shared/non-goals.md`: do not claim FAA training-device status.

## Scope

- Add `src/scenario/briefs/kdem.md` (or `src/scenario/data/briefs/kdem.md`) with the sections in Implementation notes.
- Load at session start: modal or side panel **before** the first spawn is “live,” or over the PPI with `Begin session` that dismisses it. Do not skip on every hot reload in dev if that is painful — skip only when `?skipBrief=1`.
- Render markdown safely (no `dangerouslySetInnerHTML` of untrusted remote MD). This file is committed; a small allow-list renderer or `react-markdown` if already in the repo is OK. Prefer a **simple** heading/paragraph/list parser or pre-rendered sections in TS if adding a dependency is undesirable. **Do not add a large MD ecosystem** if the repo has none — structured TS sections that match the markdown file are acceptable **if** the `.md` remains the source of truth and a test checks the file contains the disclaimer.
- Checkbox “Don’t show again this browser” via `localStorage` is allowed; default is **show**.
- No certification language beyond the required negation in the disclaimer.

## Out of scope

- Lesson authoring UI, multiple airports, CIFP-derived briefs.
- Scoring implementation (link to the panel is enough).
- PDF export of the brief.

## Implementation notes

`kdem.md` must contain these headings (wording of heading text may match exactly):

1. **Facility** — KDEM Demo Field, Demo Approach, rwy 27, mag var 0°, field elev 0 ft. Fictional.
2. **Positions (stub)** — Demo Approach (APP) and Demo Final (FIN); F3 initiate, F6 handoff; not NAS.
3. **Traffic / procedure** — Arrivals on DEMO ONE (ALPHA BRAVO CHARLIE then vectors), vector to ILS 27.
4. **Objectives** — Sequence arrivals, keep separation, phraseology from the v1 grammar, optional tower handoff inside 5 NM (phase 4 stub).
5. **How you are scored** — Practice score only: CA episodes, phraseology grammar, optional extra miles vs STAR, voice radio discipline. MSAW observed not graded. Not a certificate.
6. **Imperfect pilots** — Off unless enabled in trainer settings; delayed readback; wrong altitude digit; unable speed.
7. **Disclaimer** — T00-01 paragraph verbatim.

Tone: instructor board, not a game quest log. No “XP”, no “level up”.

## Acceptance criteria

- [ ] **AC1 —** `src/scenario/briefs/kdem.md` exists and contains the T00-01 disclaimer paragraph byte-for-byte (Vitest read file).
- [ ] **AC2 —** File contains headings for facility, positions, scoring, and imperfect pilots (Vitest `/##/` or string includes).
- [ ] **AC3 —** File does not contain `FAA-approved`, `certified device`, or `NAS operational` (Vitest).
- [ ] **AC4 —** Manual: starting a session shows the brief UI; dismissing it reveals the PPI; sim can still pause.
- [ ] **AC5 —** Brief UI is labeled as a scenario brief, not a “certificate of training.”

## Test plan

- Unit: `kdem-brief.test.ts` reads the markdown from disk (Vitest `fs` or import raw).
- Integration: none.
- Manual: boot `npm run dev`, confirm modal/panel.

## Suggested files

- `src/scenario/briefs/kdem.md`
- `src/scenario/briefs/kdem-brief.test.ts`
- `src/ui/brief-modal.ts`
