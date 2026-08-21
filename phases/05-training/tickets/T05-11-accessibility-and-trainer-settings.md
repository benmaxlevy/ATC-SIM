# T05-11 Accessibility and trainer settings

**Phase:** 05 Training
**Priority:** P0
**Size:** M
**Depends on:** T05-02, T05-05, T05-09
**Blocks:** T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Trainer settings persist (imperfect pilots, scoring toggles, working position, a11y). Color is not the only ownership cue. Readbacks and practice score are available to keyboard and screen-reader users. No certification language in the settings copy.

## Context

Phase 2 palette uses color for ownership; T05-09 added `APP`/`FIN` text — this ticket **enforces** that path and adds high-contrast / reduced-motion / captions.

Phase 3 settings already switch SpeechPort (T03-10). Extend that page rather than a third settings island if it exists.

`phases/_shared/glossary.md` units unchanged. Pause already exists (T01-12) — document it as an a11y control (stop moving targets).

WCAG is a **target**, not a certification of the app. Do not put “WCAG certified” in the UI.

## Scope

- `TrainerSettings` persisted (`localStorage` key `atc-sim.trainer.v1`) with documented defaults.
- Settings UI fields listed below.
- `aria-live="polite"` on readback line (if missing from T01-09) and practice score total.
- Reduced motion: disable IDENT flash and datablock blink; history dots may stay (not flashing).
- High contrast: optional palette override (white targets on black, thicker strokes) — must still include `APP`/`FIN` text.
- Captions: readback text remains visible even when TTS plays (do not hide the status line when voice is on).
- Keyboard: settings reachable without mouse (button in chrome, `F1` help already exists — add “Trainer settings” entry or `Shift+F1`). Do not steal PTT or radio tokens.
- Grep/ban list on `src/ui` trainer strings: no `certified` except inside `not a certification`.
- Focus: score panel toggle and debrief/replay buttons in tab order after command line.

## Out of scope

- Full WCAG audit, screen-reader lab study, color-blind simulation suite (mention deuteranopia in notes: text labels are the mitigation).
- Localizing to non-English.
- Changing Command IR.
- Multiplayer.

## Implementation notes

```ts
export interface TrainerSettings {
  imperfect: ImperfectPilotSettings; // T05-05; enabled default false
  efficiencyEnabled: boolean; // default false (P1 scoring)
  workingPositionId: "APP" | "FIN";
  highContrast: boolean;
  reducedMotion: boolean;
  showScorePanel: boolean; // default true
  showBriefOnStart: boolean; // default true
}
```

Copy for imperfect toggle:

`Imperfect pilots (training). Delayed and incorrect readbacks. Off by default. Not a realism certificate.`

High contrast must not remove CA yellow/red; it may thicken them. Ownership text remains.

Persist on change. Invalid JSON in localStorage → defaults (do not crash boot).

## Acceptance criteria

- [ ] **AC1 —** Fresh storage loads `imperfect.enabled === false` (Vitest on parse-settings).
- [ ] **AC2 —** Toggling imperfect in settings survives reload (Manual).
- [ ] **AC3 —** Readback node has `aria-live="polite"` (unit on DOM or Manual inspect).
- [ ] **AC4 —** Score total has `aria-live="polite"` (T05-02 may have done this; verify).
- [ ] **AC5 —** Reduced motion: IDENT does not flash (unit: flash duration 0 or skip animation).
- [ ] **AC6 —** Owned track still shows `APP`/`FIN` text with high contrast on (Manual).
- [ ] **AC7 —** Settings panel contains the practice-score subtitle or a sentence that the score is not a certification.
- [ ] **AC8 —** Keyboard: open settings, change imperfect, close, issue a command — still works (Manual).
- [ ] **AC9 —** Ban: trainer settings copy has no `FAA-approved` / `NAS-approved`.

## Test plan

- Unit: `trainer-settings-storage.test.ts` (parse, default, corrupt JSON).
- Integration: none.
- Manual: NVDA/Narrator optional; at least Chrome inspect aria-live + tab order.

## Suggested files

- `src/train/settings.ts`
- `src/ui/trainer-settings.ts`
- `src/ui/trainer-settings.test.ts`
- `src/scope/palette.ts` (high contrast map)
- `src/ui/App.tsx` (wire persist)
