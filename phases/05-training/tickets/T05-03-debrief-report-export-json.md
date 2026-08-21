# T05-03 Debrief report export JSON

**Phase:** 05 Training
**Priority:** P0
**Size:** M
**Depends on:** T05-01
**Blocks:** T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The user can download a **debrief JSON** for the current session: practice score, deductions, observed MSAW, event summary, trainer settings snapshot, and the frozen disclaimer. No cloud upload.

## Context

Scoring stays in `@train`. This ticket is serialize + a browser download. Replay of full `World` is T05-07; debrief is the **review artifact**, not the playback file. They may share helper types but **must not** require each other.

`phases/_shared/non-goals.md`: training/entertainment only. Export must include `scoreKind: "practice"` and T00-01 disclaimer so a file that leaks to email still cannot pass as a certificate.

## Scope

- `buildDebrief(events, ctx, extras) → DebriefReport` (DOM-free).
- Emit `session.ended` on export (and on a dedicated End session control if the shell has none — add a button **End session / debrief**).
- UI: button `Download debrief JSON` that saves `atc-sim-debrief-<yyyy-mm-ddThhmmss>.json`.
- JSON includes: disclaimer, scoreKind, `score` (`SessionScore`), `eventCounts` by type, `commands` summary (id, callsign, source, instruction types, accepted/rejected), `observed` MSAW, `trainerSettings`, `scenarioId`, `exportedAtWallMs`.
- Do not include raw PCM, mic data, SpeechPort secrets, or STT API keys.
- Vitest: round-trip `JSON.parse(JSON.stringify(buildDebrief(...)))` equals the object (JSON-safe).

## Out of scope

- Replay snapshots / `WorldDto` (T05-07). A `"replayHint": "use Replay export"` string is optional; do not embed World here.
- LMS, HTTP POST, accounts.
- PDF, HTML print stylesheet (JSON only).
- Changing score formulas.

## Implementation notes

```ts
export interface DebriefReport {
  version: 1;
  product: "ATC-SIM";
  scoreKind: "practice";
  disclaimer: string;
  scenarioId: string;
  exportedAtWallMs: number;
  trainerSettings: TrainerSettings; // T05-11 may widen; use a minimal interface now
  score: SessionScore;
  eventCounts: Record<string, number>;
  commands: Array<{
    id: string;
    atSimMs: number;
    accepted: boolean;
    callsign: string;
    source: "text" | "voice";
    instructionTypes: string[];
    reason?: string;
  }>;
}
```

Until T05-11 exists, `TrainerSettings` may be:

```ts
{ imperfectPilotsEnabled: false; efficiencyEnabled: boolean; workingPositionId?: "APP" | "FIN" }
```

`exportedAtWallMs` is passed in by the UI (`Date.now()`), not read inside `buildDebrief`, so tests stay deterministic.

Download: `Blob` + object URL + `<a download>`. Revoke the URL after click.

Button placement: near the score panel. Do not auto-download on CA.

## Acceptance criteria

- [ ] **AC1 —** `buildDebrief` is DOM-free and returns `scoreKind: "practice"` and the T00-01 disclaimer (Vitest).
- [ ] **AC2 —** JSON.stringify output parses; no `undefined` in required fields (Vitest).
- [ ] **AC3 —** Command summary lists one accepted heading fixture and one rejected fixture with `reason` (Vitest).
- [ ] **AC4 —** Manual: clicking download produces a `.json` file that opens in a text editor and contains `"Practice score"` **or** `"scoreKind": "practice"` plus the disclaimer paragraph.
- [ ] **AC5 —** No `fetch` to a remote gradebook in this ticket’s files.
- [ ] **AC6 —** Exporting appends `session.ended` once per click (second click may append a second ended event — prefer idempotent: if last event is already `session.ended` at this sim time, skip). Document the pick. Vitest the chosen behavior.
- [ ] **AC7 —** Filename prefix is `atc-sim-debrief-`.

## Test plan

- Unit: `src/train/debrief/export-debrief.test.ts`.
- Integration: none.
- Manual: download in Chrome/Edge, open file.

## Suggested files

- `src/train/debrief/export-debrief.ts`
- `src/train/debrief/export-debrief.test.ts`
- `src/ui/debrief-export.ts`
- `src/core/events/types.ts` (`session.ended` if missing)
