# T04-82 Visual approach clearance (CLEARED_VISUAL)

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-81
**Blocks:** T04-83
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later ticket or phase.

## Goal

Add full typed and spoken command parity, Command IR, straight-in lateral/vertical guidance,
touchdown detection, datablock display, and alert inhibition for visual approach clearances
(`CLEARED_VISUAL`).

## Context

Today, visual approaches are display-only shorthands (`VISUAL 28` -> datablock `V28` via
`src/scope/trackDisplay.ts:394`). There is no Command IR instruction, no parser grammar,
no guidance model, and no clearance execution. `isIlsApproach` in `validate.ts:546` explicitly
excludes `VISUAL`.

Under this ticket, controllers can clear aircraft for a visual approach to any valid runway
at the aircraft's resolved arrival airport (center or satellite). Unlike ILS, a visual approach
requires no instrument procedure or localizer beam: it derives geometry directly from the
runway threshold and heading in `RegionalRunwayGeometry` (or center runway catalog).

## Research

- **FAA JO 7110.65 §7-4-1 through §7-4-4 (Visual Approach):** controllers may clear an aircraft
  for a visual approach when the aircraft is number one in the approach sequence or has the preceding
  aircraft in sight. Phraseology: `"Cleared visual approach Runway (number)"`.
- **AIM §5-4-23 (Visual Approach):** straight-in descent to the threshold; pilot provides own
  terrain/obstruction clearance, but controller radar monitoring continues.
- **STARS datablock convention:** line 2 / scratchpad renders `V` + runway ID (e.g. `V27L`, `V21L`).
- **Command IR / Path-C synchronization rule (`AGENTS.md`):** any new Command IR discriminant
  requires a single coherent update across:
  - `src/core/command/types.ts`: `{ type: "CLEARED_VISUAL", runwayId: string }`.
  - `src/parse/command-types.ts`, `src/parse/path-c.ts` schema and parity checks.
  - `speech-api/parse_engine.py`: prompt instructions, GBNF grammar, semantic validator, mock/eval tests.
  - `phases/_shared/command-ir.md` and `phases/_shared/parse-pipeline.md`.

## Scope

- Command IR & Schemas:
  - Add `{ type: "CLEARED_VISUAL", runwayId: string }` to `Instruction` in `src/core/command/types.ts`.
  - Update `phases/_shared/command-ir.md` and `phases/_shared/parse-pipeline.md`.
- Parsers:
  - Typed parser in `src/parse/parseRadioText.ts`: `VIS <rwy>` (e.g. `VIS 27L`, `VIS 21L`, `VIS 08`).
  - Spoken pattern matcher in `src/parse/spoken/pattern-matcher.ts`: `"cleared visual approach runway <rwy>"`.
  - Readback in `src/pilot/readback.ts`: `"cleared visual approach runway <spoken-rwy>"`.
- Path C & Speech API:
  - Update `speech-api/parse_engine.py`: prompt description, validator for `CLEARED_VISUAL`, GBNF grammar.
  - Add unit tests in `speech-api/tests/` and parity guard tests in `src/parse/test/path-c.test.ts`.
- Validation (`src/pilot/validate.ts`):
  - Validate that `runwayId` exists at the aircraft's resolved arrival airport (from `approachContext.ts`).
  - Reject unknown runways with `RUNWAY` or `UNKNOWN_APPROACH`.
  - Handle modifier conflicts and duplicate/empty inputs cleanly.
- Guidance & Kinematics (`src/core/fms/`):
  - Add visual approach guidance state (`intent.lateral = { type: "VISUAL_FINAL", runwayId, threshold, headingDeg }`).
  - Straight-in lateral tracking toward runway threshold on runway centerline heading.
  - 3° descent profile terminating at field elevation / threshold crossing height.
  - Touchdown: when threshold is reached (`alongTrack <= 0 && altitude <= LANDING_ALT_MAX_FT`), emit `nav.landed` and despawn (sharing logic with `despawnLandedAircraft`).
  - Interplay: `GO_AROUND` and `CANCEL_APPROACH` properly transition out of `VISUAL_FINAL`.
- Datablock & Alerts:
  - Datablock line 2 scratchpad displays `V` + runway ID (e.g. `V27L`) when cleared.
  - MSAW alert inhibition active when aircraft is established on visual final inside 3 NM of runway threshold.
- Documentation:
  - Update `docs/USER.md` and help overlay references with `VIS <rwy>`.

## Out of scope

- Circling approaches or contact approaches.
- `EXPECT_APPROACH` or `INTERCEPT_LOCALIZER` for visual approaches (visuals are cleared directly).
- Automated VFR auto-landing without ATC clearance (T04-83).
- Tower cab or runway occupancy conflict logic.

## Implementation notes

- DRY: visual guidance shares descent math and threshold despawn conventions with ILS landing, but does not construct artificial `LocAxis` or `catalog.approaches` records.
- Keep `src/parse/spoken/pattern-matcher.ts` unified per `AGENTS.md` file split rules.
- Test both typed and voice pipelines against invalid near-misses (e.g. `"cleared visual approach"` without runway -> `PARSE_MISS`).

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `DAL123 VIS 27L` (dest KATL) | Cleared visual 27L, flies straight-in, touches down, despawns | `intent.lateral` set to visual; `nav.landed` logged | Unknown runway -> `RUNWAY` / rejected | JO 7110.65 §7-4-1 |
| `N123AB VIS 21L` (dest KPDK) | Cleared visual KPDK 21L, flies to KPDK 21L threshold | Resolved to KPDK; threshold projected correctly | KATL runway issued to KPDK dest -> rejected | JO 7110.65 §7-4-2 |
| Spoken `"cleared visual approach runway two seven left"` | Emits `CLEARED_VISUAL { runwayId: "27L" }` with correct readback | Identical to typed execution | Near-miss without runway -> `PARSE_MISS` | JO 7110.65 §7-4-4 |
| `DAL123 CANCEL_APPROACH` on visual final | Cancels visual clearance, returns to heading hold | `intent.lateral = { type: "HEADING" }` | Already on missed -> rejected | JO 7110.65 §4-8-1 |
| `DAL123 GO_AROUND` on visual final | Initiates missed approach climb and heading | Enters missed approach mode | Not on approach -> rejected | JO 7110.65 §4-8-1 |
| Aircraft on visual final inside 3 NM | No false MSAW alerts | Inhibit active based on runway threshold | Outside 3 NM below floor -> MSAW alerts | JO 7110.65 §5-1-13 |

## Acceptance criteria

- [ ] `CLEARED_VISUAL` instruction added to Command IR and synchronized across frontend and `speech-api`.
- [ ] Typed `VIS <rwy>` and spoken `"cleared visual approach runway ..."` parse with exact readbacks.
- [ ] Validation verifies runway existence at aircraft's arrival airport and rejects invalid runways.
- [ ] Aircraft flies straight-in lateral on runway course and 3° vertical descent to touchdown.
- [ ] Threshold arrival emits `nav.landed` event and safely despawns aircraft.
- [ ] `GO_AROUND` and `CANCEL_APPROACH` handle visual approaches cleanly.
- [ ] Datablock scratchpad displays `V<rwy>` (e.g. `V27L`).
- [ ] MSAW is inhibited inside 3 NM of destination threshold.
- [ ] `docs/USER.md` and help overlay updated.
- [ ] `npm run ci` and `speech-api` tests pass.
