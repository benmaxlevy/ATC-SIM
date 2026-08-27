# T05-13 Session traffic setup menu

**Phase:** 05 Training
**Priority:** P0
**Size:** M
**Depends on:** T04-21, T04-24, T04-25
**Blocks:** none
**Launch:** Implement this ticket only. Do not add live session edits.

## Goal

Before a session starts or on explicit restart, user can select playable airport/scenario, arrival count, arrivals/hour, departures/hour, and seed from a Session setup menu. Apply confirms then creates a new deterministic session with those values.

## Context

T04-21 provides working departure-rate behavior. T04-24 provides the sole dynamic inventory for airport/scenario choices. T04-25 provides arrival count/rate behavior. This menu must never hardcode an airport list, use display-control PREF, or expose controls whose behavior is unavailable.

T05-11 owns trainer/a11y settings; this ticket owns session construction settings. The two panels may share chrome and keyboard conventions without merging their storage or feature models.

## Research

`phases/_shared/glossary.md` defines Scenario and Facility. `phases/_shared/extensible-features.mdc` requires data-first catalogs. Trainer controls are a product delta, not a STARS DCB or NAS control; say “Session setup,” not “PREF.”

## Scope

- Add an accessible Session setup entry point separate from DCB and trainer settings.
- Populate airport/scenario selection exclusively from `listPlayableScenarios()` inventory output. Grouping by airport is allowed; no hardcoded ICAO or scenario ids in UI.
- Expose validated fields: scenario, arrival count, arrivals/hour, departures/hour, and seed. Defaults come from loaded session parameter defaults.
- Hide or disable departures/hour only when selected inventory/scenario lacks the working departure capability; explain why. Never render a no-op active control.
- Persist draft preferences in versioned `localStorage` key `atc-sim.session.v1`; corrupt/obsolete JSON resets safely.
- Apply/restart presents clear confirmation because it discards current World/session state, then rebuilds using T04 APIs. Cancel preserves current session and draft.
- Apply is setup-only: it does not add/remove/reposition active tracks. Persisted values affect next new/restarted session.
- Keep `?scenario=`, `?traffic=`, and `?seed=` documented compatibility overrides with an explicit precedence rule.

## Out of scope

- Changing session traffic while simulation runs.
- DCB PREF integration, radio-frequency Command IR, controller position handoff.
- New airport data or remote inventory.
- Scoring/replay changes beyond using an already-created World.

## Implementation notes

Use a DOM-free parse/default/serialize module around:

```ts
interface SessionSetup {
  scenarioId: string;
  arrivalCount: number;
  arrivalsPerHour: number;
  departuresPerHour: number;
  seed: number;
}
```

`scenarioId` is inventory id, not an ICAO. UI derives all labels/options from inventory metadata. Query parameters should be evaluated once at initial boot; state exact precedence in code/tests so links remain reproducible. Use native label/control semantics, keyboard-reachable open/apply/cancel paths, and focus restoration after modal close.

## Acceptance criteria

- [ ] **AC1 —** Given inventory with multiple airport/scenario entries, when Session setup opens, then every option derives from inventory labels/ICAO and no UI source contains a hardcoded airport/scenario option.
- [ ] **AC2 —** Given fresh storage, when setup opens, then fields show validated scenario defaults; corrupt stored JSON falls back without boot failure.
- [ ] **AC3 —** Given changed arrival count/rate, departure rate, and seed, when Apply is confirmed, then a new World has the selected T04 traffic behavior; current session was not mutated before confirmation.
- [ ] **AC4 —** Given a selected scenario without departure support, then departure rate is unavailable with explanatory text and Apply cannot imply departures will spawn.
- [ ] **AC5 —** Given changed draft values, when page reloads before Apply, then the draft persists. Given Cancel, current World remains and focus returns to the opener.
- [ ] **AC6 —** Given query overrides, when booted from a documented URL, then precedence is deterministic and covered by tests.
- [ ] **AC7 —** Menu is keyboard reachable; controls have labels; Escape/cancel path does not consume radio command input.
- [ ] **AC8 —** DCB PREF behavior and `atc-sim.trainer.v1` settings remain unchanged.
- [ ] **AC9 —** Automated tests cover AC1–AC8; manual check confirms Apply/restart warning.
- [ ] **AC10 — Research:** Help/copy calls this Session setup, labels traffic values as trainer controls, and does not claim NAS/STARS behavior.

## Test plan

- Unit: storage parse/default/invalid JSON and query precedence.
- DOM: dynamic inventory options, controls/labels, confirm/cancel, unavailable departures.
- Integration: Apply creates new traffic session; DCB PREF/trainer storage regression.
- Manual: start session, change values, cancel once, then confirm restart.

## Suggested files

- `src/ui/session-setup.tsx`
- `src/ui/session-setup.test.tsx`
- `src/scenario/sessionSetup.ts`
- `src/scenario/playableScenarios.ts`
- `src/scenario/sessionTraffic.ts`
- `src/main.tsx`
- `src/ui/shell.tsx`
- `src/ui/ScopeHelpOverlay.tsx`
