# Phase 4 — Procedures

Aircraft fly published geometry. The scope starts warning you.

This is the first phase where a heading is not the only way to move. After phase 4, a controller can put an arrival on a short STAR, take vectors, intercept ILS 27 from a heading, watch the aircraft capture localizer then glidepath, and either hand it to a tower stub or watch a missed-approach climb. Conflict alert and MSAW light up in yellow, then red. None of this is NAS-certified. All of it must be deterministic, testable, and driven by JSON plus Command IR — not by scraped charts.

**Depends on:** phase 2 exit (STARS-like PPI, maps, datablocks). Phase 3 (voice) is *not* required; every procedure command is typed first. If phase 3 is already present, the same parser tokens work through SpeechPort.

**Must not start:** phase 5, until this phase's **Phase exit** checklist is green.

---

## Why this phase exists

Phases 0–2 prove: the world ticks, a typed vector is read back, the aircraft turns, the scope looks like a terminal radar. That is enough to *steer*. It is not enough to *work a final*.

A TRACON trainer without procedures is a heading game. The product fantasy for phase 4 is:

1. An arrival is on a published STAR (two or three fixes, at-or-above altitudes) and then “vectors.”
2. The controller issues headings to a localizer intercept angle, then **cleared ILS 27**.
3. The aircraft intercepts the localizer, captures the glidepath from below, and descends on a 3° path.
4. Near the marker, either a tower-handoff stub takes the track, or a missed-approach stub climbs out.
5. Two aircraft too close light **CA**. An aircraft too low for the MVA polygon lights **MSAW**.

If that loop is not fun with a keyboard, CIFP import and wind will not save it. Keep KDEM as the runtime default. Treat real CIFP as a developer tool with a frozen fixture, not as a chart-scraping project.

---

## What is already true (do not rebuild)

| From | You inherit |
| --- | --- |
| Phase 0 | Vite + TS strict, Vitest, `src/core|parse|pilot|scope|speech|scenario|ui`, KDEM scenario JSON stub, Command IR types, session event log, local-tangent / NM plane, field elev 0, mag var 0, rwy 27. |
| Phase 1 | `stepWorld(world, dt)` at 20 Hz, jet kinematics (documented ~3°/s turn, ~1500–2000 fpm, ~1 kt/s), heading/altitude/speed intent, parser token table, pilot agent as the **only** intent mutator, `DIRECT` / `EXPECT_APPROACH` / `CLEARED_APPROACH` exist on the IR **but phase 1 may have no-op’d fly-through**. |
| Phase 2 | Dark PPI, range/pan, runway + localizer *feather* as map art, datablocks, leader lines, altitude filter, predicted track, ownership color, strips. Yellow/red were reserved for later — this phase uses them. |
| `_shared/command-ir.md` | Frozen instruction *names* for phases 0–3. Phase 4 **may add** instruction types. It **must not rename** existing ones. |
| `_shared/non-goals.md` | No chart scraping. No bundling non-redistributable FAA products without a documented source. No weather mosaic. No claim of certification. Wind was deferred “until a phase 4 ticket.” |

---

## Goals (when this phase is done)

- KDEM ships a first-class **procedure catalog** JSON: named fixes, one STAR (2–3 legs, at-or-above, then vectors), ILS 27 (localizer, glidepath, missed stub).
- `DIRECT` to a named fix on that catalog actually tracks the fix (fly-by).
- `EXPECT_APPROACH` and `CLEARED_APPROACH` change intent (expect is arming/scratchpad; cleared starts intercept).
- Vector-to-intercept: assigned heading until localizer capture, then inbound course.
- After loc capture, intercept glidepath from below; then follow GS.
- Missed approach stub at DA if not handed to the tower stub.
- CA lite: pair `< 3 NM` **and** `< 1000 ft` — yellow (predicted), then red (current).
- MSAW lite: below an MVA / floor polygon JSON; inhibited on GS inside FAF.
- CIFP subset importer runs against a **frozen fixture** in-repo and emits the same schema as KDEM JSON. Runtime default remains KDEM JSON. Do not scrape charts.
- Optional P1: constant wind vector. Ground track ≠ heading. Localizer tracking uses **track / position**, not heading, so wind does not break intercept math.
- A playable scenario: spawn on STAR → vectors → ILS intercept → land/handoff or missed.

---

## Frozen decisions for this phase

Do not reopen these in tickets.

1. **KDEM stays the default facility.** Fictional field, mag var 0°, elev 0 ft, one runway 27. Real airports are an importer output, not a replacement of KDEM in v1.
2. **Procedures are data, not code.** Geometry lives in JSON validated by a schema. Kinematics consume a resolved route, not hard-coded lat/lon in `stepWorld`.
3. **Pilot agent still owns intent.** Scope never calls intercept math. Parser never calls kinematics. Alerts are a pure function of `World` (plus catalog), not of mouse clicks.
4. **Heading cancels published lateral path.** `FLY_HEADING` / `TURN_DEGREES` / `PRESENT_HEADING` drop STAR legs, DIRECT, and loc intercept/approach. Re-clear the approach to arm intercept again. This is how “vector to intercept” works.
5. **Cleared approach is the intercept trigger.** `EXPECT_APPROACH` does not capture. `CLEARED_APPROACH` arms intercept from the **current assigned heading** (or present heading if none).
6. **Glidepath from below only.** Do not dive through GS from above. Until GS capture, honor the assigned altitude (and STAR constraints if on descend-via).
7. **Alerts are lite, not TAMR.** Thresholds are documented constants. No ARV, no CRDA, no weather, no sensor uncertainty. UI must keep the training/entertainment posture — never “MSAW certified.”
8. **CIFP is a dev tool.** Frozen fixture in `testdata/`. Optional developer-run import of a locally downloaded CIFP cycle. Do not commit a full FAA cycle. Do not scrape Jeppesen/ForeFlight/anything.
9. **Coordinate system is whatever phase 0 froze.** Tickets below speak `xNm` (east) and `yNm` (north) in the local tangent plane. Convert lat/lon only at catalog load / importer boundary.
10. **Units stay glossary-frozen.** NM, feet MSL, knots, degrees `[0, 360)`, sim ms. IAS still treated as TAS until T04-11 adds a wind vector; even then IAS≈TAS, wind only affects *ground* velocity.

---

## Player fantasy (one session)

Spawn: `DAL123` on DEMO ONE, somewhere before ALPHA, 250 kt, above the first at-or-above.

1. Aircraft flies ALPHA → BRAVO → CHARLIE with at-or-above constraints, then rolls out present heading (**vectors**).
2. Controller: `DAL123 D40` (descend 4000), then headings to a 30° intercept (`H240` if north of loc).
3. `DAL123 APP ILS27` → readback “cleared ILS runway two seven.” Target continues the intercept heading.
4. Localizer comes alive; aircraft turns inbound (270). Datablock / map already showed the feather (phase 2); capture is now *behavior*.
5. At ~2000 ft and ~6 NM, GS capture; descent ~700–800 fpm at 140–160 kt ground speed (exact vs speed).
6. Inside ~5 NM a tower-handoff stub is offered. Accept → ownership color changes, aircraft continues to threshold and despawns (`nav.landed`). Ignore → at DA (200 ft) missed stub: climb heading 270 to 3000, optional DIRECT to `MISSD`.
7. A second arrival aimed at the same final lights CA yellow, then red.

That session *is* phase exit. CIFP and wind are supporting tickets, not the demo.

---

## Architecture (phase 4 data flow)

```
Procedure catalog JSON (KDEM or importer output)
        │
        ▼
   NavFix registry ────────────► DIRECT / STAR legs / missed fix
        │
        ▼
Parser ──► Command IR ──► Pilot agent ──► Intent (lateral + vertical modes)
                                            │
                                            ▼
                              stepWorld: heading | fly-by | loc | GS | missed
                                            │
                                            ▼
                              Tracks + alertCA() + alertMsaw()
                                            │
                                            ▼
                              Scope: yellow then red, same PPI
```

New code belongs in:

| Folder | Owns |
| --- | --- |
| `src/scenario` | Procedure catalog types, KDEM JSON, MVA JSON, schema validation |
| `src/core` | Fix lookup, FMS geometry (direct, fly-by, loc deviation, GS height), wind triangle, CA/MSAW pure functions, `stepWorld` lateral/vertical modes |
| `src/parse` | `DCT`, `EXP`, `APP` (already), `VIA`, `X` (if IR extended), `GA` (if IR extended) |
| `src/pilot` | Resolve DIRECT/VIA/APP/EXP/CROSS/GA; reject unknown fixes; apply modes; readbacks |
| `src/scope` | CA/MSAW colors, optional loc/GS capture cue, tower-handoff stub UI |
| `src/ui` | Settings: wind (P1), alert enable, MSAW inhibit display |
| `tools/cifp-import` | Dev CLI only; not imported by the sim tick |

`src/speech` is untouched unless a token list is documented for the phase 3 normalizer — do **not** edit phase 3 tickets. If you add parser tokens, they automatically work for voice because SpeechPort → same parser.

---

## Geometry conventions (KDEM v1)

Phase 0 picked the tangent plane. Encode the following numbers in KDEM JSON so tests can hard-assert. If phase 0 placed the airport ref elsewhere, **translate** these so that runway 27 still points 270° true and the threshold of 27 is the GS origin. Document the translation in T04-01.

Assume airport ref ≈ `(0, 0)`, +x east, +y north, NM.

| Object | Value |
| --- | --- |
| Runway 27 inbound course | `270°` |
| Runway 27 threshold (GS origin) | `(0, 0)` (or documented offset) |
| Localizer usable length | `18 NM` east of threshold (point `(18, 0)` is far loc) |
| Localizer beam | ±`2.5°` full scale about the 270 course |
| Glidepath angle | `3.0°` |
| TCH | `50 ft` |
| FAF distance | `6.0 NM` (GS intercept altitude ≈ `2000 ft` at 3° + TCH; store both) |
| DA | `200 ft` MSL (AGL = MSL at KDEM) |
| Missed heading / climb | `270°` / `3000 ft` |
| Missed fix `MISSD` | `(-8, +6)` (west-northwest, stub) |

**STAR DEMO ONE (`DEM1`)** — two or three fixes, then vectors:

| Fix | `(xNm, yNm)` | Constraint |
| --- | --- | --- |
| `ALPHA` | `(30, 12)` | at-or-above `9000` |
| `BRAVO` | `(18, 8)` | at-or-above `6000` |
| `CHARLIE` | `(12, 4)` | at-or-above `4000` |
| termination | — | `VECTORS` (present heading, assigned altitude) |

Optional FAF name on the approach: `FI27` at `(6, 0)`. Threshold as `RW27` at `(0, 0)`. These are DIRECT targets and missed/approach math anchors.

**STAR vertical rule:** while `DESCEND_VIA` (or spawned on the STAR with via armed), the aircraft may descend, but must not go *below* the next unpassed at-or-above until that fix is sequenced. After `CHARLIE`, lateral = vectors; vertical = last assigned or last constraint (document one; prefer **assigned altitude** if the controller has issued one, else last constraint).

**Localizer deviation (signed, degrees):**

Let `p` be aircraft position, `t` threshold, `crs = 270°`.

- Along-track / cross-track in NM relative to the loc axis (inbound 270 = flying −x, axis y=0).
- Angular deviation `δ = atan2(crossTrack, alongTrackToThreshold)` with a documented sign: **positive = north of course** (fly south to correct) or the reverse — pick one in T04-05 and test it.
- Captured when `|δ|` decreases through a capture window (`|δ| < 0.5°` **and** intercept heading within `45°` of inbound) or when cross-track `< 0.15 NM` inside 18 NM and in front of threshold.

**GS height (MSL ft):**

```
gsAltFt = fieldElevFt + tchFt + tan(gsAngle) * distToThresholdNm * 6076.12
```

At KDEM: `50 + 318.4 * distNm` approximately (`tan(3°) * 6076.12 ≈ 318.6`). At 6 NM ≈ 1960 ft + 50 ≈ 2012 ft. Store FAF altitude `2000` as the **assigned** intercept level; do not require bit-identical 2012 in the clearance.

Capture GS when: loc already captured, **from below** (`alt >= gsAlt - 50` is *not* from below — require `alt <= gsAlt + 50` **and** `alt >= gsAlt - 200` after being below), and inside loc length, past a documented point (e.g. within 10 NM). Once captured, vertical mode follows `gsAltFt` at current distance; do not climb on GS. If the aircraft goes above GS by `> 150 ft`, drop capture and level at assigned (or continue descent to assigned) — keep this simple and tested.

**Fly-by (DIRECT and STAR legs):**

Turn radius `R_nm ≈ TAS_kt / 188.5` for a 3°/s turn (document the formula next to the phase 1 turn-rate constant; if phase 1 used a different rate, use *that* rate).

Start the fly-by when distance to the fix `≤ R / tan(θ/2)` where `θ` is the course change to the next course (or to present heading if last STAR leg). Sequence the fix when abeam / turn started. **No fly-over** in v1 except the runway threshold at land.

---

## Intent modes (extend phase 1, do not fork World)

Phase 1 intent is heading + assigned altitude + assigned speed. Phase 4 **adds modes**; assigned heading/altitude/speed remain the clearance the controller issued.

```ts
type LateralMode =
  | { type: "HEADING"; headingDeg: number }
  | { type: "DIRECT"; fixId: string }
  | { type: "PROCEDURE"; starId: string; toFixIndex: number }
  | { type: "INTERCEPT_LOC"; approachId: string }
  | { type: "LOC"; approachId: string }
  | { type: "MISSED"; approachId: string }
  | { type: "LANDING"; approachId: string };

type VerticalMode =
  | { type: "ASSIGNED" } // climb/descend/maintain assignedAltitudeFt
  | { type: "VIA_STAR"; starId: string } // honor at-or-above on remaining legs
  | { type: "GS"; approachId: string }
  | { type: "MISSED_CLIMB"; altitudeFt: number };
```

`EXPECT_APPROACH` sets `intent.expectedApproachId` only (scratchpad / strip). No lateral change.

`CLEARED_APPROACH` sets `intent.clearedApproachId` and `lateral = INTERCEPT_LOC` using whatever heading they are currently flying.

Speed: do **not** auto-configure flaps/gear. Optional documented approach speed cap (e.g. if assigned speed is null, decelerate toward 160 kt inside 10 NM on loc) is **P2 — skip unless a ticket needs it for GS rate sanity**. Prefer leaving assigned speed alone so tests stay linear.

---

## Command IR and parser (phase 4 tokens)

Existing IR (do not rename): `DIRECT`, `EXPECT_APPROACH`, `CLEARED_APPROACH`.

Phase 1 parser table already maps `APP ILS27` → `CLEARED_APPROACH`. Implement fly-through.

**Add these typed tokens** (vice-inspired, not vice-compatible):

| Typed | IR |
| --- | --- |
| `DCT ALPHA` or `DCT ALPHA` with callsign | `DIRECT { fixId: "ALPHA" }` |
| `EXP ILS27` | `EXPECT_APPROACH { approachId: "ILS27" }` |
| `APP ILS27` | `CLEARED_APPROACH { approachId: "ILS27" }` (already specified) |
| `VIA DEM1` | `DESCEND_VIA { procedureId: "DEM1" }` **new** |
| `X ALPHA 40` | `CROSS { fixId: "ALPHA", altitudeFt: 4000, restriction: "AT" }` **new, optional but recommended** |
| `X ALPHA 40A` / `X ALPHA 40B` | same with `AT_OR_ABOVE` / `AT_OR_BELOW` |
| `GA` | `GO_AROUND` **new, optional**; immediate missed if on approach |

`D` remains descend. Do not steal `D` for direct.

If you add any new `Instruction` variant, **patch `phases/_shared/command-ir.md` in the same PR** and extend the TypeScript union from T00-06. The planning task that wrote this folder must not edit `_shared`; the *implementation* ticket must.

Readbacks (deterministic, FAA digits, callsign once):

- `DIRECT ALPHA` → `{callsign} direct ALPHA`
- `EXPECT_APPROACH ILS27` → `{callsign} expect ILS runway two seven`
- `CLEARED_APPROACH ILS27` → `{callsign} cleared ILS runway two seven`
- `DESCEND_VIA DEM1` → `{callsign} descend via DEMO ONE`
- `CROSS ALPHA AT 4000` → `{callsign} cross ALPHA at four thousand`
- `GO_AROUND` → `{callsign} going around`

Reject (no intent change):

- Unknown or ambiguous callsign (unchanged).
- Unknown `fixId` / `approachId` / `starId`.
- `DIRECT` to a fix not in the loaded catalog.
- `CLEARED_APPROACH` to an id that is not an approach in the catalog.
- `VIA` to an unknown STAR.
- `CROSS` with altitude not a multiple of 100, or outside `[1000, 18000]`.

---

## Alerts (lite)

Not TAMR. Not certified. Same color language as the scope: white/green from phase 2; **yellow = caution, red = alert**.

### Conflict alert (T04-09)

Pairwise, every physics step (or every 5 Hz if you document a cheaper cadence; tests may call the pure function directly).

A pair is in **current conflict** when:

- both aircraft are in the facility volume (all KDEM traffic in v1),
- lateral distance `< 3.0 NM`,
- `|Δalt| < 1000 ft`,
- not the same id.

**Red** when current conflict is true.

**Yellow** when current conflict is false **but** a linear lookahead of `40 s` (constant GS vector, constant VS) predicts a current conflict. If you prefer a simpler first paint: yellow when `3.0 ≤ dist < 5.0 NM` **and** `|Δalt| < 1000` — **do not**. The user-facing rule is pair `< 3 NM` and `< 1000 ft`, yellow then red: implement yellow as **predicted** `< 3 / 1000`, red as **now**.

Visual: both targets / datablocks use caution then alert color; optional “CA” tag in the block. No ARV vector. No audio required (P2 beep later).

Events: `alert.ca.caution`, `alert.ca.alert`, `alert.ca.clear` with both callsigns and dist/alt.

### MSAW (T04-10)

MVA chart: polygons in NM + `minAltitudeFt`, plus `defaultMinAltitudeFt`.

Aircraft is in **MSAW alert** when MSL altitude `<` the polygon floor containing `(x, y)` (or default if outside all), **and** not inhibited.

**Inhibit** when `lateral` is `LOC` or `GS` **or** `LANDING` **and** inside FAF distance. Missed and heading modes are **not** inhibited.

Yellow: `floor - 300 < alt < floor` (approaching the floor / slightly below — pick **below floor by any amount** as yellow if you want fewer constants: **yellow = below floor, red = below floor by ≥ 300 ft**). Document one pair and test it.

Events: `alert.msaw.caution`, `alert.msaw.alert`, `alert.msaw.clear`.

No weather, no CRDA, no “low altitude on departure” special case beyond the polygons you draw. KDEM suggestion: one outer polygon (box ±40 NM) floor `2500`, one inner disk-ish octagon radius ~8 NM floor `1500`, airport vicinity optional `800`. Fine to use rectangles.

---

## Wind (T04-11, P1)

Optional constant vector on `World`:

```ts
wind?: { fromDeg: number; speedKt: number } // meteorological FROM
```

Air velocity is from **heading** and TAS (IAS). Ground velocity = air + wind. Datablock GS (phase 2) already wants ground speed — wire it to ground velocity here if it was TAS before.

Default: no wind (`undefined` or speed 0). Settings panel or scenario JSON `wind`. Loc/GS math must use **position and ground track**, so this ticket can land after intercept without rewriting capture.

Not a weather mosaic. Not gusts. Not runway wind components in ATIS (no ATIS).

---

## CIFP subset importer (T04-08)

**Problem:** FAA CIFP is useful and legally awkward to bundle.

**Solution:**

1. Runtime catalog = KDEM JSON (first-class, committed, tests freeze on it).
2. `tools/cifp-import` reads a CIFP-like text file and writes `ProcedureCatalog` JSON.
3. In-repo `testdata/cifp/frozen-subset.cifp` is a **tiny synthetic fixture** (CIFP/ARINC-424-shaped records) that maps onto DEMO-like fixes/ILS/STAR. Tests assert importer output matches `testdata/cifp/frozen-subset.expected.json`.
4. README in the tool: how a developer downloads CIFP from the official FAA source, how to run `npm run cifp:import -- --in path --airport KDCA --out src/scenario/data/`, that the cycle is **not** committed, and that redistributability is the developer’s problem.
5. **Never** scrape charts. **Never** fetch CIFP from the browser at runtime.

If the real CIFP grammar is too wide: support only the record types needed for *enroute/terminal fixes, ILS, and a STAR with altitude constraints* — document the subset. Unknown records skipped with a count in the CLI log.

KDEM will never appear in real CIFP. That is fine. The importer’s job is schema compatibility, not replacing Demo Field.

---

## Scope / UI changes (keep small)

Phase 2 already draws a localizer feather. Do not redraw the NAS.

Required:

- CA/MSAW colors on target + datablock (yellow then red). If both fire, **CA red wins** over MSAW yellow; document a priority: `CA alert > MSAW alert > CA caution > MSAW caution > ownership`.
- Strip or datablock scratchpad: expected/cleared approach id (`ILS27`).
- Tower handoff stub: when on loc/GS inside a gate (e.g. 5 NM), a non-radio control (key documented in the keyboard overlay, or a button) sets `LANDING` and ownership color to “tower.” This is **not** a Command IR radio message (glossary: radio vs scope). Optional typed radio `GA` *is* IR.

Nice (P2, skip if time): loc/GS deviation dots, capture flash. Not required to exit.

---

## Session events (for phase 5 scoring)

Append to the phase 0 log. Suggested names (stable):

| Event | When |
| --- | --- |
| `nav.direct.sequenced` | Fly-by fix sequenced |
| `nav.star.vectors` | Last STAR leg sequenced |
| `nav.loc.captured` | INTERCEPT_LOC → LOC |
| `nav.gs.captured` | vertical → GS |
| `nav.missed.started` | DA or `GA` |
| `nav.landed` | Threshold + landing mode, then despawn |
| `handoff.tower` | Tower stub accepted |
| `alert.ca.*` / `alert.msaw.*` | As above |
| `command.accepted` / `rejected` | Unchanged; now includes DIRECT/APP fly-through |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Fly-by overshoots and looks drunk | Unit-test turn start distance; cap intercept angle; if unstable, sequence as fly-over for STAR last leg only and document it. |
| Loc capture oscillates | Capture hysteresis; once LOC, hold until heading breakout or `|δ| > 2.5°` for N seconds. |
| GS from above | Refuse capture from above; stay at assigned. |
| CIFP rabbit hole | Fixture-only ACs; KDEM JSON is the product. |
| Alert spam with 30 targets | O(n²) is fine at 30. No mosaic. |
| Wind breaks heading-based intercept | Never use heading as loc sensor; use x/y. |
| Phase 1 no-op APP still in tests | Update tests in T04-05; do not leave “accepted but no-op” as success. |
| IR extension forgotten in `_shared` | Ticket T04-04 (and T04-07 if `GA`) explicitly require the patch in the **same PR**. |

---

## Out of scope (this phase)

- Full TAMR, ADS-B fusion error models, weather mosaic, dual-runway CRDA, ARV, FMA.
- RNAV (RNP) approaches, SIDs, holds, procedure turns, DME arcs, circling.
- Dual ILS, changing runways, LAHSO.
- Scraping or bundling copyrighted charts; committing a full CIFP cycle.
- Certified CA/MSAW algorithms, conflict resolution advisories.
- Autoland flare model beyond “hit threshold and despawn.”
- Tower cab, ground, ASDE-X.
- Renaming Command IR types from phases 0–3.
- LLM as FMS.

---

## Ticket order

Implement in this order unless a ticket says it can parallel. Do not start a ticket until its **Depends on** line is done.

| ID | Title | Pri | Size | Depends on | Blocks |
| --- | --- | --- | --- | --- | --- |
| T04-01 | Procedure JSON schema and KDEM ILS27 STAR | P0 | L | none (phase 2 exit) | T04-02, T04-08, T04-10, T04-12 |
| T04-02 | Nav fix lookup | P0 | S | T04-01 | T04-03 |
| T04-03 | Lateral FMS: direct and fly-by | P0 | L | T04-02 | T04-04, T04-05, T04-12 |
| T04-04 | Descend/climb via and crossing alts | P0 | M | T04-03 | T04-12 |
| T04-05 | Vector to intercept localizer | P0 | L | T04-01, T04-03 | T04-06, T04-12 |
| T04-06 | Glidepath and approach phase | P0 | L | T04-05 | T04-07, T04-12 |
| T04-07 | Missed approach stub | P0 | M | T04-06 | T04-12 |
| T04-08 | CIFP subset importer (dev tool) | P0 | M | T04-01 | none |
| T04-09 | Conflict alert lite | P0 | M | none (phase 1 world) | T04-12 |
| T04-10 | MSAW lite | P0 | M | T04-01 | T04-12 |
| T04-11 | Constant wind optional | P1 | S | phase 1 kinematics | none (exit-optional) |
| T04-12 | Phase 4 scenario: vector to ILS and land/hand off to tower stub | P0 | M | T04-04, T04-06, T04-07, T04-09, T04-10 | phase exit |

**Parallelism:** After T04-01, T04-08 and T04-10 can proceed beside T04-02. T04-09 can start immediately. T04-04 ∥ T04-05 after T04-03. T04-11 can land anytime after kinematics; prefer after T04-05 so loc tests include a wind case if the ticket is pulled.

T04-11 is **not** required for phase exit. T04-08 **is** required: the importer must pass on the frozen fixture even if no real CIFP file is present.

---

## Phase exit checklist

Do not start phase 5 until every box is true.

- [ ] KDEM procedure catalog JSON is committed, schema-validated, and contains DEMO ONE (2–3 at-or-above fixes + vectors) and ILS 27 (loc, GS, missed stub).
- [ ] `DCT <fix>` sequences a fly-by to a catalog fix; unknown fix rejects.
- [ ] `EXP ILS27` sets expected approach; does not capture loc.
- [ ] `APP ILS27` after an intercept heading captures loc, then GS from below; phase 1 no-op is gone.
- [ ] After last STAR fix, aircraft is on vectors (heading mode).
- [ ] Descend-via / crossing constraints honor at-or-above (no bust in the unit test).
- [ ] DA without tower handoff → missed stub (heading + climb). Tower stub → land + despawn.
- [ ] CA: predicted pair `< 3 NM` & `< 1000 ft` yellow; current red. Automated test.
- [ ] MSAW: below MVA polygon yellow then red; inhibited on GS inside FAF. Automated test.
- [ ] `tools/cifp-import` converts `testdata/cifp/frozen-subset.cifp` to the catalog schema; test green **without network**.
- [ ] No chart scraping. No full CIFP cycle in git.
- [ ] T04-12 manual script passable: STAR → vectors → ILS → handoff or missed, CA or MSAW visible in the same session (spawn a violator or use the script’s second target).
- [ ] `npm test` green. Training/entertainment labeling still visible (phase 0).
- [ ] If IR was extended: `phases/_shared/command-ir.md` updated in the same PR(s) as the types.

**Not required to exit:** T04-11 wind, loc/GS needles, radio audio for alerts, real-airport CIFP import by hand.

---

## How to launch an agent

1. Confirm phase 2 README **Phase exit** is green.
2. Paste **`AGENT.md`** from this folder as the implementation prompt, **or** paste a single `tickets/T04-xx-*.md` and say: implement only this ticket, stop when ACs are checked.
3. Do not implement phase 5 scoring against these events until phase 4 exits — emitting the events is enough.

Ticket IDs are stable. Do not renumber. If you must extend, add `T04-13` at the end.
