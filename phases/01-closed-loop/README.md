# Phase 1 — Closed loop

**Folder:** `phases/01-closed-loop/`
**Depends on:** Phase 0 Slice (`phases/00-slice/`) — do not start this phase until that README’s **Phase exit** is green.
**Exit (short):** Type a heading, see a template readback, aircraft turns on a crude PPI.

This phase **is** the product. If typing `DAL123 H270` does not produce a readback and a turn, later STARS chrome and voice will not save it.

---

## Why this phase exists

Phase 0 froze contracts, booted a dark shell, and left a command line that echoes. Nothing flies.

Phase 1 closes the radio loop **without** a microphone and **without** a STARS look-alike:

1. Aircraft exist in a `World` and move under kinematics.
2. Typed text compiles to the frozen **Command IR**.
3. The **pilot agent** validates, emits a template **readback**, then mutates **intent**.
4. A north-up Canvas2D **PPI** shows ticks so a human can see the turn.

Voice (`SpeechPort` other than `null`), maps, datablocks, CRC keys, ILS geometry, and alerts are **phase 2–4**. Do not build them here.

---

## What “closed loop” means

```
Command line (text)
        │
        ▼
     Parser  ──►  Command IR
                      │
                      ▼
                 Pilot agent
                  │        │
                  │        ▼
                  │     Intent
                  ▼        │
             Readback   Kinematics
             (text UI)     │
                           ▼
                    Tracks on PPI
```

- The command line **bypasses** `SpeechPort`. `text-only` is not a SpeechPort implementation (see `phases/_shared/speech-port.md`).
- `Command.source` is `"text"` for every command this phase issues.
- The **scope never** writes intent or calls kinematics. Only the pilot agent changes intent from a `Command`.
- `requestAnimationFrame` **renders**. Physics is `stepWorld(world, dt)` at a fixed 20 Hz sim step.

---

## Frozen decisions (do not reopen)

Encode these in tickets. Do not bikeshed them in implementation PRs.

| Decision | Value |
| --- | --- |
| Physics | Pure `stepWorld(world, dt)` with `dt = 1/20` **sim seconds**. Never use rAF timestamps as `dt`. |
| Accumulator | Wall Δt × `simRate` feeds the accumulator. Pause holds the accumulator (no steps). Cap steps per frame (suggested 8) to avoid spiral of death. |
| Sim rates | `1` and `2` only. Type `World.simRate` as `1 \| 2`. |
| Coordinate frame | Phase 0 `T00-04` local tangent / NM plane. +x east, +y north, heading 0 = true north. KDEM origin. Mag var 0° so true = magnetic. |
| Wind | None. IAS treated as TAS (`phases/_shared/glossary.md`). |
| Turn model | Rate-one **3 deg/s** toward assigned heading. Document constant `TURN_RATE_DEG_PER_S = 3`. Not a bank-angle / TAS model. |
| Vertical | **1800 fpm** toward assigned altitude (inside 1500–2000). |
| Speed | **1 kt/s** toward assigned speed. |
| Default scenario | **6** arrivals (allowed band 4–8), east of KDEM, downwind-ish, level 6000–10000 ft, 210–250 kt. **Must include `DAL123` at heading 100** (not 090) so `H270` / `SHORTEST` is a right turn toward the field, not a 180° tie. |
| Parser | Vice-inspired tokens in `phases/_shared/command-ir.md`, expanded in `T01-05`. Not vice-compatible. |
| Callsign | Full (`DAL123`) or unambiguous numeric suffix (`123`). Ambiguous suffix → reject, nobody moves. Selected track supplies callsign if omitted. |
| Readbacks | Deterministic templates, FAA digit grouping, callsign once at the start. No TTS. |
| PPI | Canvas2D, north up, range rings, ticks = dots + callsign strings. Click to select. No datablocks, leader lines, maps, or STARS keys. |
| Approach tokens | `APP ILS27` parses as `CLEARED_APPROACH` and **no-ops kinematics**. Readback only. |
| UI stack | Whatever Phase 0 `T00-10` shipped (vanilla or React). Do not add a new framework. |
| Tests | Vitest. `src/core`, `src/parse`, `src/pilot` remain **DOM-free**. |

### Kinematics constants (copy into `src/core/kinematics.ts`)

```ts
export const PHYSICS_HZ = 20;
export const SIM_DT_S = 1 / PHYSICS_HZ; // 0.05
export const TURN_RATE_DEG_PER_S = 3;
export const CLIMB_RATE_FT_PER_MIN = 1800;
export const ACCEL_KT_PER_S = 1;
```

Position integration (heading 0 = north, +x = east, +y = north):

```
dxNm = speedKt * sin(headingRad) * (dtS / 3600)
dyNm = speedKt * cos(headingRad) * (dtS / 3600)
```

### Validation bounds (pilot agent, from Command IR)

Reject (no intent change, error readback, `command.rejected`):

- Unknown or ambiguous callsign.
- Heading not in `[0, 360)` after normalize (`360` → `0` is valid).
- Altitude not a multiple of 100 ft, or outside `[1000, 18000]`.
- Speed outside `[150, 280]` KIAS.
- Empty instruction list.
- `CLIMB` when assigned altitude is not **above** present altitude; `DESCEND` when not **below**. `MAINTAIN` may be at, above, or below (fly to it).

`SAY_HEADING`, `SAY_ALTITUDE`, and `IDENT` **must not** change heading, altitude, speed, or position intent. `IDENT` may set a short-lived flash timestamp on the aircraft for the PPI.

### Token table (text, phase 1)

Callsign optional if `World.selectedAircraftId` is set. Case-insensitive. Extra whitespace collapsed.

| Typed | Instruction |
| --- | --- |
| `H270` or `H 270` | `FLY_HEADING` 270 `SHORTEST` |
| `L090` or `L 090` | `FLY_HEADING` 90 `LEFT` |
| `R180` or `R 180` | `FLY_HEADING` 180 `RIGHT` |
| `T20L` or `T 20 L` | `TURN_DEGREES` LEFT 20 |
| `T20R` | `TURN_DEGREES` RIGHT 20 |
| `C30` / `D30` / `A30` | `ALTITUDE` climb / descend / maintain **3000** ft (number = hundreds of feet) |
| `S210` | `SPEED` `MAINTAIN` 210 |
| `PH` | `PRESENT_HEADING` |
| `I` | `IDENT` |
| `SH` | `SAY_HEADING` |
| `SA` | `SAY_ALTITUDE` |
| `APP ILS27` | `CLEARED_APPROACH` `ILS27` (no-op fly-through) |

Combined line: `DAL123 H270 D30 S210` → three instructions, one `Command`, one readback.

`SH` / `SA` are **not** in the short suggested table in `command-ir.md` but the IR includes `SAY_*`. Phase 1 must parse them so those instructions are testable.

Do **not** parse `DIRECT` or `EXPECT_APPROACH` in this phase (no token in the table). Unknown tokens are parse errors.

---

## Package ownership (from architecture)

| Folder | This phase |
| --- | --- |
| `src/core` | `World`, clock, `Aircraft`, `Intent`, `stepWorld`, kinematics |
| `src/parse` | Typed string → instructions + optional callsign token |
| `src/pilot` | Resolve callsign, validate, readback string, apply intent, emit session events |
| `src/scope` | Crude Canvas2D PPI, click → selected id |
| `src/scenario` | Spawn 4–8 arrivals from KDEM JSON |
| `src/ui` | Command line submit, readback/status line, pause / 1x / 2x |
| `src/speech` | **Untouched** except still injecting `null` from Phase 0 |

---

## Phase 0 assets this phase consumes

Treat these as already true. If a file name differs slightly, follow the Phase 0 ticket, not this guess.

| Phase 0 | Phase 1 uses it for |
| --- | --- |
| `T00-03` folder layout | Put new modules in the agreed packages |
| `T00-04` NM plane | Positions, PPI projection, spawn east of origin |
| `T00-05` KDEM JSON stub | Extend with spawn rules; do not invent a second airport |
| `T00-06` Command IR types | Parser output and pilot input |
| `T00-07` Null SpeechPort | App still boots; command line does not call it |
| `T00-08` session event log | `command.accepted` / `command.rejected` |
| `T00-10` shell + echoing command line | Replace echo with parser → pilot → readback; fill PPI placeholder |

---

## Out of scope (agents must not “while here”)

From `phases/_shared/non-goals.md` plus this phase’s slice:

- Maps, coastlines, localizer feathers, datablocks, leader lines, altitude filter, predicted track, history trails, CRC/STARS keys, DCB.
- ASR, TTS, PTT, Web Audio radio FX, any non-`null` `SpeechPort`.
- ILS intercept, STAR, `DIRECT` flying, wind, CA / MSAW.
- Variable-dt physics, RK4, bank/load-factor turn, performance by aircraft type.
- LLM pilots, free-form chat, multiplayer, server tick.

Label remains **training / entertainment only** (Phase 0 disclaimer stays visible).

---

## Risks

| Risk | Mitigation |
| --- | --- |
| rAF used as physics `dt` → tests and 2x rate lie | `stepWorld` is pure; rAF only calls an accumulator |
| Parser too clever (fuzzy English) | Token table only; spoken grammar is Phase 3 |
| Scope writes heading on click-drag | Click **selects** only; radio path owns intent |
| Spawn off-screen | Default PPI range ≥ 40 NM, airport at origin, traffic +10–22 NM east |
| Ambiguous `I` vs callsign | Callsign = 3 letters + digits (or numeric suffix). `I` is IDENT |
| 180° shortest-turn flip-flop | Tie-break: `SHORTEST` at exactly 180° turns **LEFT** |
| Integration test uses canvas | Keep `T01-13` DOM-free: parse → pilot → `stepWorld` |

---

## Ticket order

Implement **one ticket at a time**. Check that ticket’s ACs before starting the next. `T01-08` is numbered after `T01-07` but **must be implemented before** `T01-07` (pilot calls the template formatter).

| ID | Title | Priority | Size | Depends on | Notes |
| --- | --- | --- | --- | --- | --- |
| [T01-01](tickets/T01-01-sim-clock-and-stepworld.md) | Sim clock and stepWorld | P0 | M | Phase 0 (`T00-03`) | Empty aircraft loop OK |
| [T01-02](tickets/T01-02-aircraft-state-and-intent-types.md) | Aircraft state and intent types | P0 | S | T01-01, `T00-06` | Types + fixtures, no motion |
| [T01-03](tickets/T01-03-kinematics-heading-altitude-speed.md) | Kinematics heading altitude speed | P0 | L | T01-02 | `stepWorld` moves aircraft |
| [T01-04](tickets/T01-04-spawn-arrivals-from-scenario.md) | Spawn arrivals from scenario | P0 | M | T01-02, `T00-05` | Can parallel T01-03 |
| [T01-05](tickets/T01-05-command-parser-text.md) | Command parser text | P0 | L | `T00-06` | Can start in parallel with T01-01 |
| [T01-06](tickets/T01-06-callsign-resolution-and-selection.md) | Callsign resolution and selection | P0 | M | T01-02, T01-05 | |
| [T01-08](tickets/T01-08-readback-templates.md) | Readback templates | P0 | M | T01-02, `T00-06` | **Before** T01-07 |
| [T01-07](tickets/T01-07-pilot-agent-validate-and-apply-intent.md) | Pilot agent validate and apply intent | P0 | L | T01-03, T01-06, T01-08, `T00-08` | Only module that sets intent from `Command` |
| [T01-09](tickets/T01-09-command-line-ui-wired-to-parser.md) | Command line UI wired to parser | P0 | M | T01-07, `T00-10` | Text readback; no speech |
| [T01-10](tickets/T01-10-crude-canvas2d-ppi.md) | Crude Canvas2D PPI | P0 | L | T01-03, T01-04, `T00-04` | rAF render only |
| [T01-11](tickets/T01-11-click-select-track.md) | Click select track | P0 | S | T01-10, T01-06, T01-09 | Focus returns to command line |
| [T01-12](tickets/T01-12-pause-sim-rate-1x-2x.md) | Pause sim rate 1x 2x | P0 | S | T01-01, T01-10 | |
| [T01-13](tickets/T01-13-integration-test-typed-heading-moves-aircraft.md) | Integration test typed heading moves aircraft | P0 | M | T01-07, T01-04 | DOM-free |
| [T01-14](tickets/T01-14-phase-1-playable-slice.md) | Phase 1 playable slice (manual script) | P0 | S | T01-09–T01-13 | Manual ACs |

Suggested git cadence: one commit per ticket is fine; not required.

---

## Phase exit checklist

Do not start Phase 2 until every box is green.

- [x] `npm test` green, including DOM-free unit tests for **parser**, **kinematics**, **pilot agent**, and **one integration test** (`T01-13`).
- [ ] `npm run dev` shows the Phase 0 dark shell, disclaimer still visible, command line at the bottom.
- [ ] **6** aircraft ticks + callsigns visible on a north-up PPI with range rings (no datablocks required).
- [ ] Typing `DAL123 H270` (Enter) shows a text readback that includes the callsign and heading two seven zero (telephony or spelled — see `T01-08`).
- [ ] The `DAL123` tick **turns toward 270** on the PPI within **2 seconds of sim time** (at 1x, wall time ≈ 2 s; do not require a full 90° capture).
- [ ] Equivalent path: click `DAL123`, type `H270`, same readback and turn.
- [ ] Ambiguous suffix (two aircraft sharing `123`) is rejected; **neither** turns.
- [ ] Pause stops motion; 1x and 2x both run; 2x is visibly faster.
- [ ] No ASR/TTS, no STARS datablocks/maps/keys, no console errors on the happy path.
- [ ] Session log contains `command.accepted` for the heading and `command.rejected` for a deliberate bad command.

### Exit demo (the product)

With 6 aircraft visible, type:

```text
DAL123 H270
```

or click that track then type `H270`.

**Then:** a readback line appears as text; the target’s heading on the PPI rotates toward 270 within 2 s of sim time.

---

## How to launch an agent

1. Confirm Phase 0 exit is green.
2. Paste [`AGENT.md`](AGENT.md) into a new implementation agent as the full prompt.
3. For a single ticket: paste that file and say: implement only this ticket, stop when ACs are checked.

Ticket IDs are stable. Do not renumber.
