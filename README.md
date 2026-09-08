# ATC-SIM

In-browser **STARS-like** terminal radar **simulator**: high-fidelity Canvas2D PPI, on-scope system lists window manager, typed and spoken ATC clearances, kinematic flight procedures, simulated-pilot readbacks, and safety alerting (Conflict Alert, MSAW, MCI).

## Features overview

- **STARS Terminal Controller Workstation (TCW)**: Canvas2D radar display with discrete range presets (5–60 NM), camera panning, Full/Limited Data Blocks (FDB/LDB), configurable leader lines (L1–L9, STARS leader clock, lengths 0–48px), target history trails, and Predicted Track Line (PTL).
- **On-Scope System Lists Window Manager**: Interactive, draggable operational windows (TAB List `*T`, Tower Lists `*P1`–`*P3`, VFR List `*TV`, Video Maps `*TX`, Alert Status LA/CA/MCI `*TM`, CRDA Status `*TN`, Coast/Suspend `*TC`, Sign-On `*TS`, and SSA `*S`). Features title-bar drag handles, collision warning outlines, quick default reset (Shift+Click), `F1` row drops, and flight plan correlation.
- **Unified STARS Preview Area**: Dedicated movable on-scope command buffer, defaulting beneath the SSA, for track initiation (`+`), track drop (`/`), leader formatting (`*L(1-9)`, `*LDR`), forced datablocks (`*F`), flight plan correlation (`[Index#]`), Conflict Alert control (`CA K`, `CA`, `CA P`, `CA C`, `CA C E`, `CA C I`), video maps (`*D`, `MAP`), range rings (`*RR`), weather reflectivity levels (`*WX`), and altitude/beacon filters (`*LA`, `*BCN`, `B##`). `CA P` toggles a selected pair; `CA E` is rejected. Relocate with `<MULTI FUNC>P<SLEW>`: type `*P`, then left-click empty scope.
- **Separation & Spacing Tools**: Target Proximity Alert (TPA) separation halos (`*J` J-rings) and predictive cones (`*P`), 72-tick Compass Rose vectoring ring with radial heading numerals, and DCB spinners.
- **Kinematics & FMS Procedures**: Realistic standard rate turns, vertical profiles, direct-to routing (`DCT`), SID climb / STAR descent procedures (`CVIA`, `VIA`, `JOIN`), step-down crossing restrictions (`X`), and ILS localizer / glideslope interception (`APP`, `IL`, `EXP`, compound ILS clearances).
- **Safety Logic**: Kinematic Type 1–4 Conflict Alert (CA), Minimum Safe Altitude Warning (MSAW), and Mode C Intruder (MCI) alerting with visual datablock flashing, audio alarms, and Alert Status box tracking. `kdem-ca` is the playable CA bench.
- **Voice & Radio Communications**: Two-way radio communications via typed command prompt or Push-to-Talk (PTT) with local neural STT/TTS models, FAA JO 7110.65 readbacks, and automated pilot check-ins.

## Quick start

- **Node.js** `v22.6.0+`, **npm** `v10.0.0+`
- **Python** `3.11+` optional (voice / local speech models)

```bash
git clone https://github.com/benmaxlevy/ATC-SIM.git
cd ATC-SIM
npm install
npm run hooks:install
npm run dev
```

Open `http://localhost:5173` in your browser. Press **`F1`** in the application for the interactive keyboard shortcut overlay.

## Command & documentation reference

Complete documentation for operators, controllers, and developers:

| Documentation Guide | Scope & Content |
|---|---|
| [`docs/USER.md`](docs/USER.md) | **Complete Operator Manual**: URL parameters, scenario controls, typed & spoken ATC clearances, scope keyboard shortcuts, and full STARS Preview Area command grammar. |
| ↳ [Typed & Spoken Radio Commands](docs/USER.md#atc-command-reference) | Headings, altitudes, speeds, direct routing, crossing restrictions, approach clearances, compound vectors, and pilot phraseology. |
| ↳ [Scope Keyboard Shortcuts](docs/USER.md#scope-keyboard-shortcuts) | Always-on keys (`F1`–`F11`, `PageUp`/`PageDown`, `Home`/`End`), STARS DCB shortcuts (`Ctrl+F1`–`Ctrl+F11`), and scope-focused hotkeys (`T`, `M`, `H`, `L`, `F`, `B`, `/`, `*`, `+`). |
| ↳ [STARS Preview Area Commands](docs/USER.md#stars-preview-area-commands) | Unified scope buffer reference: tracking (`+`/`/`), leader lines/lengths, forced FDB, flight plan correlation (`[Index#]`), CA controls (`CA K`, `CA`, `CA P`, `CA C [E|I]`), video maps, display, and filters. |
| ↳ [System Lists & Window Manager](docs/USER.md#system-lists--window-manager) | Authorized STARS operational lists (`*T`, `*P1`–`*P3`, `*TV`, `*TX`, `*TM`, `*TN`, `*TC`, `*TS`, `*S`), drag handles, collision boxes, and `F1` row drops. |
| [`speech-api/README.md`](speech-api/README.md) | Local speech pipeline: Faster-Whisper STT, Piper TTS, and Path C semantic parser service. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture guide: v1 freeze, package structure, simulation loop tick, and parse pipeline. |
| [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md) | Local East-North-Up (ENU) nautical mile coordinate calculations. |
| [`src/scenario/README.md`](src/scenario/README.md) | Playable airspace scenarios and facility adaptation catalogs. |
| [`tools/cifp-import/README.md`](tools/cifp-import/README.md) | FAA CIFP navigation database import tool. |
| [`tools/crc-videomap-import/README.md`](tools/crc-videomap-import/README.md) | CRC cache to trainer video map converter. |
| [`phases/README.md`](phases/README.md) | Phased delivery milestones and architecture design decisions. |

## Development & testing

```bash
# Run unit and integration test suites
npm test

# Run full continuous integration check (typecheck, lint, formatting, tests)
npm run ci
```

`npm run hooks:install` enables the repository pre-push hook. It blocks pushes
when `npm run ci` fails and runs the mocked speech API tests when pushed
changes include `speech-api/`. Remote branch protection should still require
the GitHub Actions `check` and `speech-api` jobs before merging.

Speech service test suite (mocked): `SPEECH_API_MOCK=1 pytest` in [`speech-api/`](speech-api/README.md).

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).
