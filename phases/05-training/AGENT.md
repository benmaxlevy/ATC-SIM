# Phase 5 implementation agent

Copy everything below this line into a **new** implementation agent as the full prompt.

---

You are implementing **Phase 5 (Training)** of ATC-SIM, an in-browser STARS-like ATC trainer (visual analog only — not the Raytheon product, **not** an FAA training device).

Workspace: the ATC-SIM repo root. You write **application code**. You do **not** rewrite phase plans except to check off acceptance-criteria boxes in `phases/05-training/tickets/*.md` as you complete each ticket.

## Read first (do not edit)

Obey these contracts. If a ticket and a shared file disagree, **the shared file wins**. If `phases/05-training/README.md` and a ticket disagree on scoring numbers, **the README wins** (then fix the ticket).

1. `phases/_shared/glossary.md` — terms and units. Do not invent synonyms (Scope, PPI, Command IR, SpeechPort, Pilot agent, Intent, Kinematics, Readback, Scenario, Facility, Track, Datablock, PTT, CA / MSAW).
1b. `phases/_shared/references.md` — **R01** phraseology/handoff; PCG; never certification language.
2. `phases/_shared/architecture.md` — browser-first, packages, KDEM. T05-01 patches this file **only** to add `src/train`.
3. `phases/_shared/command-ir.md` — radio `Command`. Phraseology scoring uses this IR + `sourceText`. Do not rename fields. Do not put handoff on the IR.
4. `phases/_shared/speech-port.md` — delay readbacks **after** the pilot string, before TTS. Parser still does not know about imperfect pilots.
5. `phases/_shared/non-goals.md` — no certification claim, no VATSIM, no LLM executor, no multi-facility NAS. A second position **stub** is allowed.
6. `phases/05-training/README.md` — scoring formulas, event names, F6 handoff rule, posture copy, exit checklist.
7. `phases/_shared/ticket-template.md` — ticket shape.

Then implement **only** the tickets in `phases/05-training/tickets/`.

## Frozen decisions (closed)

- Scoring is `scoreSession(events, ctx)` — pure, DOM-free, deterministic. Same log → same total.
- Separation uses T04-09 **CA episodes** (`alert.ca.caution` / `.alert` / `.clear`). Do not reimplement NM/altitude conflict math.
- MSAW is **observed** in debrief, not in the 0–100 total.
- Phraseology is a grammar checker, **not** an LLM.
- UI label: `Practice score — not a certification`. Copy T00-01 disclaimer verbatim into exports and the brief.
- Imperfect pilots **default OFF**.
- Wrong altitude: readback **and intent** follow the corrupted altitude; log `pilot.readback.incorrect`.
- Readback delay: 2–8 s **sim time**, success readbacks only; intent for correct clearances still applies immediately.
- Unable speed is `pilot.unable`, not a parse error, when imperfect is on and speed is impossible on approach / already at min or max.
- Replay = JSON `WorldDto` + snapshots + events. Pause + inspect. No server.
- Second TCP: polygons + color + `APP`/`FIN` text. F3 initiate, F4 drop, **F6** toggle APP↔FIN. No networking. Hot-seat P0; split view P1 (skip P1 unless asked).
- Efficiency extra-miles is **P1** inside T05-01 — skip if you are told to exit without P1.
- Ban: certified, certification, FAA-approved, NAS-approved, official grade, LMS upload.

## Execution protocol

1. Confirm **phase 3 and phase 4** README exit checklists are green. If not, **STOP** and say so.
2. Work **one ticket at a time**, in the order below. Do not start downstream tickets early.
3. Read the ticket fully. Implement **Scope**. Honor **Out of scope**.
4. Run the tests/commands the ticket names. Check off every AC in the ticket file (`- [x]`). Mark Manual ACs only after you have actually verified them or, if you cannot open a browser, leave them unchecked and report them in your summary.
5. Commit only if the user asks. Do not `git push`.
6. After **T05-12** and the phase exit checklist, **STOP**. Do not start a phase 6. Do not add multiplayer, VATSIM, or LMS.

## Ticket order (mandatory)

| Order | ID | File |
| --- | --- | --- |
| 1 | T05-01 | `phases/05-training/tickets/T05-01-session-scoring-model.md` |
| 2 | T05-04 | `phases/05-training/tickets/T05-04-phraseology-checker-from-ir.md` |
| 3 | T05-02 | `phases/05-training/tickets/T05-02-live-score-panel.md` |
| 4 | T05-03 | `phases/05-training/tickets/T05-03-debrief-report-export-json.md` |
| 5 | T05-05 | `phases/05-training/tickets/T05-05-imperfect-pilot-delays-and-errors.md` |
| 6 | T05-06 | `phases/05-training/tickets/T05-06-unable-responses.md` |
| 7 | T05-07 | `phases/05-training/tickets/T05-07-replay-recorder.md` |
| 8 | T05-08 | `phases/05-training/tickets/T05-08-replay-player.md` |
| 9 | T05-09 | `phases/05-training/tickets/T05-09-second-position-stub-and-handoff.md` |
| 10 | T05-10 | `phases/05-training/tickets/T05-10-scenario-brief-markdown-kdem.md` |
| 11 | T05-11 | `phases/05-training/tickets/T05-11-accessibility-and-trainer-settings.md` |
| 12 | T05-12 | `phases/05-training/tickets/T05-12-phase-5-training-acceptance-script.md` |

T05-04 is numbered after T05-02/03 but **must be implemented before the live panel** so the panel’s phraseology component is real. T05-02 and T05-03 may swap after T05-04 if needed; do not ship the panel with a stub checker if T05-04 is done in this sequence.

If you are executing the **entire phase**, follow the table. If the user pastes a single ticket, do **only** that ticket.

## Phase exit — stop here

Green when `phases/05-training/README.md` **Phase exit checklist** is all true (except marked P1: efficiency, split view).

Short version:

- Practice score from the event log; live panel; debrief JSON.
- Phraseology grammar checker; imperfect pilots off by default; unable on impossible speed.
- Replay record + pause/inspect player.
- Second position stub + F6 color/text handoff; no network.
- KDEM brief; a11y + trainer settings; T05-12 script.
- No certification language.

Then stop.

## Hard stops (do not implement)

- Multiplayer server, WebRTC rooms, VATSIM, CRC network, LMS/SCORM/xAPI
- LLM as phraseology judge, imperfect-pilot brain, or command executor
- Recoding CA geometry (use T04-09 events)
- Claiming FAA/NAS certification or deleting the T00-01 disclaimer
- Handoff as Command IR / frequency change (scope-only stub)
- Chart scraping, full CIFP in git
- Whisper fine-tune, always-on listen

If a ticket is ambiguous, choose the option that **keeps scoring deterministic and the UI honest** and note it in the ticket’s implementation notes — do not expand scope.
