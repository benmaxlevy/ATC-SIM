# Phase 4 — Procedures

Aircraft fly published geometry. The scope starts warning you.

This is the first phase where a heading is not the only way to move. After phase 4, a controller can put an arrival on a short STAR, take vectors, and issue a **7110.65 ILS clearance** that the aircraft actually flies: *turn right heading xxx, maintain xxxxx until established, cleared ILS approach runway 27*. The target captures the localizer while holding that altitude, then glidepath from below, then either a tower stub or a missed-approach climb. Conflict alert and MSAW light up in yellow, then red.

KDEM ships as **demo data files**: VORs, NDBs, ILS components, named fixes, STAR, and ILS 27 — not literals inside `stepWorld`. None of this is NAS-certified. All of it must be deterministic, testable, and driven by JSON plus Command IR — not by scraped charts.

**Depends on:** phase 2 exit (STARS-like PPI, maps, datablocks). Phase 3 (voice) is *not* required; every procedure command is typed first. If phase 3 is already present, the same parser tokens work through SpeechPort.

**Must not start:** phase 5, until this phase's **Phase exit** checklist is green.

---

## Why this phase exists

Phases 0–2 prove: the world ticks, a typed vector is read back, the aircraft turns, the scope looks like a terminal radar. That is enough to *steer*. It is not enough to *work a final*.

A TRACON trainer without procedures is a heading game. The product fantasy for phase 4 is:

1. An arrival is on **DEMO ONE** (north or south transition, alt **and** speed at each fix) and then “vectors.”
2. The controller vectors to a loc intercept, then the **one** ILS clearance (typed or spoken):

   > turn right heading two four zero, maintain two thousand until established, cleared ILS approach runway two seven

   Typed equivalent: `R240 A20 APP ILS27` (same-line heading + alt + APP sets `untilEstablished`).
3. The aircraft **turns to that heading**, **holds 2000 until loc capture (established)**, then captures GS from below and descends on a 3° path. Readback uses the same words (callsign once, comma-joined).
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

- KDEM ships first-class **demo data files** under `src/scenario/data/kdem/`: VORs, NDBs, ILS loc/GS/DME/markers, named fixes (including STAR/FAF/missed), STAR DEMO ONE, ILS 27. Runtime loads that set. `DCT` resolves **fixes and navaids**.
- `DIRECT` to a named fix on that catalog actually tracks the fix (fly-by).
- `EXPECT_APPROACH` and `CLEARED_APPROACH` change intent (expect is arming/scratchpad; cleared starts intercept).
- **Phraseology = fly-through.** Canonical ILS transmission is heading + *maintain (alt) until established* + *cleared ILS approach runway 27*. Same `Command` (three instructions). Aircraft: fly heading, **hold altitude until established on the localizer**, then GS from below. Bare `APP ILS27` still arms intercept from the current heading and holds the already-assigned altitude until established.
- Vector-to-intercept: assigned heading until localizer capture, then inbound course.
- After loc capture (**established**), intercept glidepath from below; then follow GS. Do not start GS before loc capture.
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
2. **Procedures and navaids are data, not code.** One **facility catalog** schema (ICAO folder: vors, ndbs, ils, fixes, procedures, sids). KDEM is the first instance under `src/scenario/data/kdem/`. Types use `airportId: string`, not a `"KDEM"` literal. Optional `latDeg`/`lonDeg` on navaids/fixes (runtime still `xNm`/`yNm`; convert at load/import). Empty `sids: []` is required so a **later** FAA CIFP/NASR update script can write the same shape — **do not** build that fetch/script in this phase. Kinematics consume a resolved route, not hard-coded lat/lon in `stepWorld`. T04-01 must **load the committed KDEM files**, not invent a second coordinate set.
3. **Pilot agent still owns intent.** Scope never calls intercept math. Parser never calls kinematics. Alerts are a pure function of `World` (plus catalog), not of mouse clicks.
4. **Heading cancels published lateral path.** `FLY_HEADING` / `TURN_DEGREES` / `PRESENT_HEADING` drop STAR legs, DIRECT, and loc intercept/approach. Re-clear the approach to arm intercept again. This is how “vector to intercept” works.
5. **Cleared approach is the intercept trigger.** `EXPECT_APPROACH` does not capture. `CLEARED_APPROACH` arms intercept from the **current assigned heading** (or present heading if none).
6. **Glidepath from below only, and only after established on the loc.** Do not dive through GS from above. Do not capture GS before `lateral === LOC`. Until loc capture, honor the assigned altitude (and STAR constraints if on descend-via). After loc capture, still honor assigned until GS intercept from below (typical: hold 2000 until ~6 NM).
7. **Alerts are lite, not TAMR.** Thresholds are documented constants. No ARV, no CRDA, no weather, no sensor uncertainty. UI must keep the training/entertainment posture — never “MSAW certified.”
8. **CIFP fixture now; live FAA later.** T04-08 proves the catalog schema on a frozen in-repo fixture (offline). A future ticket (not this swarm) may add `faa:update` to pull official CIFP/NASR into another ICAO folder. Do not commit a full FAA cycle. Do not scrape Jeppesen/ForeFlight. Do not fetch CIFP from the browser. Do not replace KDEM as the default in this phase.
9. **Coordinate system is whatever phase 0 froze.** Tickets below speak `xNm` (east) and `yNm` (north) in the local tangent plane. Convert lat/lon only at catalog load / importer boundary.
10. **Units stay glossary-frozen.** NM, feet MSL, knots, degrees `[0, 360)`, sim ms. IAS still treated as TAS until T04-11 adds a wind vector; even then IAS≈TAS, wind only affects *ground* velocity.

---

## Player fantasy (one session)

Spawn: `DAL123` on DEMO ONE **north** transition, before `NEMAX`, 250 kt, at or above 10000.

1. Aircraft flies NEMAX → NELBO → NJOIN → MERGE (alt and speed constraints), then rolls out present heading (**vectors**).
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
| `src/scenario` | Facility catalog types + KDEM instance (`data/kdem/` vors, ndbs, ils, fixes, procedures, sids), MVA JSON, schema validation |
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

**STAR DEMO ONE (`DEM1`)** — **one** STAR, two transitions (north / south corridors from the RANGE-20 maps), merge at `MERGE`, then **VECTORS**.

RANGE 20, rings every 5 NM. Video map `DEM1` (`006-dem1-star.json`, MAPS 6, default on) is an independent corridor drawing. The STAR is `procedures.json` + `fixes.json`. Do **not** generate one from the other.

North transition `N`:

| Fix | `(xNm, yNm)` | Dist | Altitude | Speed |
| --- | --- | --- | --- | --- |
| `NEMAX` | `(17, 12)` | ~21 NM | at-or-above 10000 | at-or-below 250 |
| `NELBO` | `(16, 7)` | ~17 NM | at-or-above 8000 | at-or-below 230 |
| `NJOIN` | `(12, 4)` | ~13 NM | at-or-above 6000 | at-or-below 210 |

South transition `S` (mirror):

| Fix | `(xNm, yNm)` | Dist | Altitude | Speed |
| --- | --- | --- | --- | --- |
| `SEMAX` | `(17, -12)` | ~21 NM | at-or-above 10000 | at-or-below 250 |
| `SELBO` | `(16, -7)` | ~17 NM | at-or-above 8000 | at-or-below 230 |
| `SJOIN` | `(12, -4)` | ~13 NM | at-or-above 6000 | at-or-below 210 |

Common route, then vectors:

| Fix | `(xNm, yNm)` | Dist | Altitude | Speed |
| --- | --- | --- | --- | --- |
| `MERGE` | `(10, 0)` | 10 NM | **at** 4000 | at-or-below 210 |
| termination | — | — | **VECTORS** (present heading; assigned or last constraint) | — |

`FI27` `(6, 0)` is the ILS FAF, **not** a STAR fix. After `MERGE` the controller vectors to intercept and issues the ILS clearance (maintain 2000 until established).

**Navaids (same tangent plane; ids are DIRECT targets too):**

| Id | Kind | `(xNm, yNm)` | Radio |
| --- | --- | --- | --- |
| `DEM` | VOR/DME | `(0.4, 0.8)` | 113.00 T |
| `OCT` | VOR/DME | `(38, -10)` | 115.90 L |
| `DMO` | NDB | `(6.0, 0.15)` | 385 kHz |
| `IDEM` | LOC | `(-1.85, 0)` | 110.30, course 270 (antenna; GS origin remains threshold) |
| `IDEMGS` | GS | `(0.18, -0.07)` | 335.0, 3° / TCH 50 (height math uses threshold, not antenna xy) |
| `IDEMDME` | DME | `(-1.85, 0)` | paired with loc |
| `OM27` | OM | `(6.2, 0)` | near FAF |
| `MM27` | MM | `(0.55, 0)` | short final |

**Other committed fixes:** `RW09` `(-1.645, 0)`, `NORMA` `(8, 12)`, `SNARF` `(8, -10)`, `DEMEE` `(20, 0)`, `OCTTA` `(28, -6)`. Encode exactly as `src/scenario/data/kdem/*.json`.

**STAR vertical / speed rule:** while `DESCEND_VIA` (or spawned on the STAR with via armed), do not go *below* the next unpassed **at-or-above** altitude, and do not go *above* the next unpassed **at-or-below** speed (slow to meet it; do not accelerate to a speed restriction). `AT` altitude = be at that altitude by the fix. After `MERGE` / `nav.star.vectors`, lateral = heading; vertical = assigned altitude if the controller has issued one, else last constraint (4000).

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

`CLEARED_APPROACH` sets `intent.clearedApproachId` and `lateral = INTERCEPT_LOC` using whatever heading they are currently flying (or the heading in the **same** Command). Assigned altitude (including `untilEstablished`) is held until loc capture.

Speed: do **not** auto-configure flaps/gear. Optional documented approach speed cap (e.g. if assigned speed is null, decelerate toward 160 kt inside 10 NM on loc) is **P2 — skip unless a ticket needs it for GS rate sanity**. Prefer leaving assigned speed alone so tests stay linear.

### 7110.65 ILS clearance — phraseology and aircraft must match

Canonical **one** transmission (JO 7110.65 vector to final / ILS):

> “Delta one two three turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven”

| What the controller said | IR (same `Command`, this order) | What the aircraft does |
| --- | --- | --- |
| turn right heading 240 | `FLY_HEADING` 240 `RIGHT` | Turn right to 240; **this** is the intercept heading |
| maintain 2000 until established | `ALTITUDE` `MAINTAIN` 2000 `untilEstablished: true` | Hold 2000 until **established on the localizer** (`nav.loc.captured`). Do not start GS before that |
| cleared ILS approach runway 27 | `CLEARED_APPROACH` `ILS27` | Arm `INTERCEPT_LOC`; capture loc from that heading; then GS from below (T04-06) |

Path A must also accept `… until established on the localizer …` and `cleared ils runway two seven approach` (existing T03 wording). Readback echoes the clauses (callsign once): `turn right heading two four zero, maintain two thousand until established, cleared i l s runway two seven approach`.

Typed same clearance: `DAL123 R240 A20 APP ILS27`. Same-line heading + altitude + `APP` **sets** `untilEstablished` on the altitude instruction. Split transmissions (`H240` then later `APP ILS27`) still intercept from the **current** heading and hold the **already assigned** altitude until established — the aircraft law is the same; only the readback omits “until established” if the flag was not on that Command.

`EXPECT_APPROACH` still does not capture. A heading after `APP` still cancels the approach (re-clear to intercept again).

---

## Command IR and parser (phase 4 tokens)

Existing IR (do not rename): `DIRECT`, `EXPECT_APPROACH`, `CLEARED_APPROACH`.

Phase 1 parser table already maps `APP ILS27` → `CLEARED_APPROACH`. Implement fly-through. Phase 4 Path A must parse the **combined ILS clearance** above (T04-05), not only the short `cleared ils runway two seven approach` from phase 3.

**Add these typed tokens** (vice-inspired, not vice-compatible):

| Typed | IR |
| --- | --- |
| `DCT NEMAX` | `DIRECT { fixId: "NEMAX" }` |
| `EXP ILS27` | `EXPECT_APPROACH { approachId: "ILS27" }` |
| `APP ILS27` | `CLEARED_APPROACH { approachId: "ILS27" }` (already specified) |
| `VIA DEM1` | `DESCEND_VIA { procedureId: "DEM1" }` **new** |
| `X NEMAX 40` | `CROSS { fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" }` **new, optional but recommended** |
| `X NEMAX 40A` / `X NEMAX 40B` | same with `AT_OR_ABOVE` / `AT_OR_BELOW` |
| `GA` | `GO_AROUND` **new, optional**; immediate missed if on approach |

`D` remains descend. Do not steal `D` for direct.

If you add any new `Instruction` variant, **patch `phases/_shared/command-ir.md` in the same PR** and extend the TypeScript union from T00-06. The planning task that wrote this folder must not edit `_shared`; the *implementation* ticket must.

Readbacks (deterministic, FAA digits, callsign once):

- `DIRECT NEMAX` → `{callsign} direct NEMAX`
- `EXPECT_APPROACH ILS27` → `{callsign} expect ILS runway two seven`
- `CLEARED_APPROACH ILS27` → `{callsign} cleared i l s runway two seven approach`
- Combined ILS vector (heading + until-established alt + APP) → join with commas; include **until established** when the altitude instruction has that flag
- `DESCEND_VIA DEM1` → `{callsign} descend via DEMO ONE`
- `CROSS NEMAX AT 4000` → `{callsign} cross NEMAX at four thousand`
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
4. Tool README: fixture CLI only in this phase. Mention (do not implement) that a later script should write another ICAO folder in this same schema from official CIFP/NASR. Do not scrape charts; do not commit FAA cycles; KDEM stays default.
5. **Never** scrape charts. **Never** fetch CIFP from the browser at runtime. **Never** build the live update script in T04-08.

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
- Flying RNAV (RNP), holds, procedure turns, DME arcs, circling. **Storing** empty `sids` and extra `approach.type` values in JSON is in scope. T04-20 is the explicit post-exit exception for fictional, catalog-backed SID departure generation.
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
| T04-01 | Procedure JSON + KDEM demo navaids/fixes/ILS27/DEMO ONE | P0 | L | none (phase 2 exit) | T04-02, T04-08, T04-10, T04-12 |
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
| T04-13 | STAR inbound geometry helpers | P0 | S | T04-01, T04-02, T04-03 | T04-14, T04-15 |
| T04-14 | Seeded STAR inbound spawn (default session) | P0 | M | T04-13, T04-04 | none |
| T04-15 | STAR descend-via check-in | P0 | M | T04-13 | none |
| T04-16 | Inbound handoff state (spawn pending) | P0 | M | T04-14 | T04-17 |
| T04-17 | Accept inbound handoff (scope) | P0 | M | T04-16 | none |
| T04-18 | Session traffic parameters | P0 | M | T04-17 | T04-19, T04-20, T05-13 |
| T04-19 | Time-based arrival scheduler | P0 | L | T04-18 | T04-20, T05-13 |
| T04-20 | SID departure generation | P0 | L | T04-19, T04-21 | T05-13 |
| T04-21 | Playable scenario inventory | P0 | M | T04-17 | T04-20, T05-13 |

**Parallelism:** After T04-01, T04-08 and T04-10 can proceed beside T04-02. T04-09 can start immediately. T04-04 ∥ T04-05 after T04-03. T04-11 can land anytime after kinematics; prefer after T04-05 so loc tests include a wind case if the ticket is pulled.

T04-11 is **not** required for phase exit. T04-08 **is** required: the importer must pass on the frozen fixture even if no real CIFP file is present.

### Post-exit addendum (T04-13–15)

Historical phase 4 exit (T04-01–10, T04-12) stays green. Do **not** uncheck those boxes. This addendum is new product work after that exit:

- Default student session spawns arrivals on catalog STAR **entry** fixes (first transition leg), VIA armed, descending the published path.
- STAR × transition assignment is seeded-random over the loaded catalog (KDEM today: DEMO ONE N/S). A second STAR JSON of the same shape needs no live `if`.
- Each VIA arrival checks in: `approach, {callsign}, descending via {STAR name} arrival through {altitude} feet`.
- `kdem-ils27` stays deterministic (DAL123 north / AAL45 south). `?traffic=N` stays the FPS downwind arc. T01-04 downwind box survives as a test fixture.

Wave: **T04-13** alone, then **T04-14 ∥ T04-15**. T04-16–17 (inbound HO accept) are a later addendum.

### Post-exit addendum (T04-16–17 inbound handoff)

Default STAR arrivals spawn pending inbound handoff from sector `C` (unowned green FDB). Click/slew accepts (CRC analog); owned FDB is **white**. Radio vectors reject until accept. Check-in waits until owned. `kdem-ils27` / `?traffic=N` stay commandable without HO. **Do not** draw 3 NM CA circles (CRC STARS CA is datablock `CA` + tone, not a halo).

### Post-exit addendum (T04-18–21 session traffic)

Session traffic is a trainer setup concern, not DCB PREF. T04-18 separates normal seeded STAR count from the `?traffic=N` downwind FPS bench. T04-19 adds simulated-time arrival density. T04-20 adds fictional, catalog-backed SID departures only with working generic procedure behavior. T04-21 inventories playable scenarios so UI derives airport/scenario choices from data rather than named KDEM loaders.

Wave: **T04-18 ∥ T04-21**, then **T04-19**, then **T04-20**. T05-13 waits for all four; it provides session setup UI only after every visible traffic control works.

---

## Phase exit checklist

Do not start phase 5 until every box is true.

- [ ] KDEM demo data is committed under `src/scenario/data/kdem/` (vors, ndbs, ils, fixes, procedures, **sids**), schema-validated (`airportId: string`, `sids` array), and contains DEMO ONE (N/S transitions + MERGE), ILS 27, DIRECT-able ids `DEM`, `NEMAX`, `FI27`. Video map `DEM1` exists as a separate MAPS file (not generated from the STAR).
- [ ] Spoken/typed ILS clearance *turn right heading … maintain … until established, cleared ILS approach runway 27* parses to heading + altitude(`untilEstablished`) + `CLEARED_APPROACH`; readback uses those words; aircraft holds altitude until loc capture then GS from below.
- [ ] `DCT <fix>` sequences a fly-by to a catalog fix; unknown fix rejects.
- [ ] `EXP ILS27` sets expected approach; does not capture loc.
- [ ] `APP ILS27` after an intercept heading captures loc, then GS from below; phase 1 no-op is gone. GS does **not** start before loc established.
- [ ] After last STAR fix, aircraft is on vectors (heading mode).
- [ ] Descend-via / crossing constraints honor at-or-above (no bust in the unit test).
- [ ] DA without tower handoff → missed stub (heading + climb). Tower stub → land + despawn.
- [ ] CA: predicted pair `< 3 NM` & `< 1000 ft` yellow; current red. Automated test.
- [ ] MSAW: below MVA polygon yellow then red; inhibited on GS inside FAF. Automated test.
- [ ] `tools/cifp-import` converts `testdata/cifp/frozen-subset.cifp` to the catalog schema; test green **without network**.
- [ ] No chart scraping. No full CIFP cycle in git.
- [ ] T04-12 manual script passable: STAR → vectors → **full ILS clearance** (heading + maintain until established + cleared ILS 27) → loc then GS → handoff or missed, CA or MSAW visible in the same session (spawn a violator or use the script’s second target).
- [ ] `npm test` green. Training/entertainment labeling still visible (phase 0).
- [ ] If IR was extended: `phases/_shared/command-ir.md` updated in the same PR(s) as the types.

**Not required to exit:** T04-11 wind, loc/GS needles, radio audio for alerts, live FAA/CIFP/NASR download, flying SIDs, loading a second ICAO.

---

## How to launch an agent

1. Confirm phase 2 README **Phase exit** is green.
2. Paste **`AGENT.md`** from this folder as the implementation prompt, **or** paste a single `tickets/T04-xx-*.md` and say: implement only this ticket, stop when ACs are checked.
3. Do not implement phase 5 scoring against these events until phase 4 exits — emitting the events is enough.

Ticket IDs are stable. Do not renumber. T04-13–21 are post-exit addenda. If you must extend further, add `T04-22` at the end.
