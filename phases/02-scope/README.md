# Phase 2 — Scope

Make the workstation feel like a **terminal radar**, not a game map.

Phase 1 proved the product loop: type a heading, hear/see a readback, aircraft turns on a crude PPI. Phase 2 does **not** add voice, procedures, or scoring. It replaces the crude picture with a STARS-like plan-view scope: dark PPI, digital maps, full/limited datablocks, leader lines, altitude filter, a handful of keyboard commands, a lite display-control strip, and a flight-strip bay.

CRC/vNAS STARS and [vice](https://pharr.org/vice/) are **references for keyboard feel and visual grammar**. Do not clone every key, do not copy proprietary maps or fonts, do not claim NAS compatibility.

## Research (do this before T02-01)

Read `phases/_shared/references.md` end-to-end, then keep **R02, R05, R07, R08, R12** open while implementing.

| Need | Open | Search fallback |
| --- | --- | --- |
| Datablock / Mode C / strip English | [PCG](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/) (R02) | `FAA Pilot Controller Glossary datablock Mode C` |
| Altitude filter / display data | [FOA STARS](https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html) (R05) | `FAA FOA STARS altitude filter` |
| Keys, FDB/LDB, leaders, DCB, range | [CRC STARS](https://docs.virtualnas.net/crc/stars/) (R07) | `vNAS CRC STARS datablock leader DCB` |
| Scope + typed-command feel | [vice](https://pharr.org/vice/) (R08) | `vice STARS emulation keyboard` |
| What not to look like | R12 | browser ATC OSM nametag zoom |

User-facing copy uses glossary words only. Each `src/scope/*` module gets a one-line analog + trainer-delta comment (template in `references.md`).

## Why this phase exists

A typed closed loop on a dotted map is a prototype. Controllers (and anyone who has sat CRC) judge a trainer in the first two seconds of video: Is it north-up and black? Do range rings sit on a runway and a localizer feather? Can I change range and leader direction without thinking? If the answer is “it’s a zoomable game map with callsign labels,” the rest of the sim will not be believed.

This phase is also the **performance envelope**. Architecture’s quality bar is 30 arrivals at 60 FPS on a 2020 laptop with Canvas2D. If datablocks and history dots blow that budget, later weather and alerts will not get a second chance.

## Depends on

Phase 1 exit is green:

- `stepWorld(world, dt)` at 20 Hz; rAF renders only.
- 4–8 KDEM arrivals, click-to-select, command line, template readbacks.
- Crude Canvas2D PPI (dots + callsign) from **T01-10** / **T01-11**.

Phase 2 **replaces** that crude PPI in `src/scope`. It must not break the command line or the parser. Radio still lives in Command IR (`phases/_shared/command-ir.md`). Scope keys **never** produce a `Command`, a readback, or an intent change.

## Goals

When this phase exits, a controller sitting at Chrome on Windows can:

1. See a **dark, north-up PPI** with a limited palette (black / dim-gray maps / green unowned FDB / white owned FDB / blue position symbol / yellow selected). Red is reserved for phase 4 alerts.
2. Set **range 5–60 NM** in discrete presets, **center** on the airport or a clicked point, and pan without “zoom to cursor.”
3. See **KDEM digital maps**: runway 27, ILS 27 localizer feather, range rings, optional coastline polyline from scenario JSON.
4. Read a **full datablock** (callsign, altitude, ground speed) tied to the target with an **8-direction leader**.
5. Toggle **limited datablocks**, **Mode C**, **history dots**, **predicted track line**, and an **altitude filter**.
6. Use a **documented Windows keyboard subset** (and a mouse **DCB cell grid**) without colliding with typed radio (`L090` remains a left turn to 090 when the command line is focused).
7. **F3-initiate** a track as a color/ownership stub only — no NAS handoff.
8. Work an **on-PPI flight-strip** list that mirrors intent from `World`.
9. Hold **30 targets at 60 FPS** (measured; see T02-12).

## Non-goals (phase 2)

Lift nothing from `phases/_shared/non-goals.md`. In addition, **do not** build:

| Out | Why |
| --- | --- |
| Full NAS DCB / CRDA / FMA / WX mosaic | T02-16/17 are the historical lite grid. **T02-22–33** lift a trainer main/aux/submenu subset (SHIFT, PREF local, disabled WX, then a physical two-row MAIN skin). Still not CRDA, FMA, weather paint, or a Raytheon clone. |
| CRDA, FMA, ARV, timed approaches | Phase 4+. |
| Weather mosaic, precipitation, wind barbs | T02-68–72 VIP mosaic shipped (IEM N0Q fills + WXC contours, display only). Wind still later. |
| Real STARS bitmap font or any licensed NAS typeface | Metric-similar **monospace** only. |
| CRC-compatible full keyboard | Subset below is frozen; document every difference. Local PREF slots are T02-29, not a NAS pref host. |
| Handoff, point-out, quick-look other facility, scratchpad, beacon code | F3 only recolors ownership. |
| Auto-deconflict of overlapping datablocks | Known limitation; log if asked. |
| WebGL phosphor bloom, afterglow trails | Canvas2D. History dots are discrete samples, not a phosphor sim. |
| Map editor, CIFP maps, real coastlines | KDEM JSON only. |
| Touch-first mobile layout | Desktop Chrome/Edge. |
| Any change to Command IR types, parser tokens, or pilot-agent validation | Phase 1 freeze. |

## Frozen decisions (do not reopen)

### 1. Radio vs scope are different pipelines

From `phases/_shared/glossary.md`:

- **Radio commands** (heading, altitude, speed, approach) → parser → Command IR → pilot agent → readback + intent.
- **Scope commands** (range, center, leader, filter, PTL, F3) → `src/scope` state only. **No readback. No `Command`. No kinematics.**

If a key could be mistaken for a parser token, it is either always-on (non-printable / F-key / Page/Home) or it only fires when the command line is **blurred**.

### 2. Focus model (Windows)

One physical keyboard, two foci.

| Focus | How you get it | What keys do |
| --- | --- | --- |
| **Radio** | Click the command line, or `Tab` onto it, or `/` (slash) as a dedicated focus key that does not insert `/` into the buffer | Printable characters parse as phase 1 tokens (`H270`, `L090`, `C30`, …) |
| **Scope** | Click the PPI or a strip, or `Tab` onto the canvas | Letter chords (`L`+digit, `T`, `M`, `F`, `H`) are scope commands |

**Always-on keys** work in **both** foci. Implementation **must** `preventDefault` + `stopPropagation` so they never type into the command line:

| Action | Windows key | Notes |
| --- | --- | --- |
| Range in (smaller NM) | `PageUp` | Previous preset. At 5 NM: no-op, no wrap. |
| Range out (larger NM) | `PageDown` | Next preset. At 60 NM: no-op, no wrap. |
| Center on airport ref | `Home` | View center = KDEM airport reference from T00-04 / T00-05. |
| Center on last PPI click | `End` | If no click yet this session, same as `Home`. |
| Help overlay | `F1` | **Not** CRC F1. Ours is help. Document that. |
| Initiate track stub | `F3` | CRC analog: Initiate Track. Color only. |
| Drop track stub | `F4` | Trainer sugar: owned → unowned. **Not** a NAS terminate. |
| PTL toggle | `F7` | Global predicted track line. |
| History toggle | `F8` | Global history dots. |
| Cycle focus | `Tab` | Command line ↔ PPI. Do not steal Tab from help overlay inputs. |

**Mouse (pointer over PPI), always-on:**

| Action | Gesture | Notes |
| --- | --- | --- |
| Range in / out | Wheel up / down | Same presets as PageUp/Down. |
| Pan | Middle-button drag | Trainer sugar. Updates view-center offset. **Not** CRC. |
| Select track | Left click on target or datablock | Existing T01-11. Hit-test includes datablock box. |
| Deselect | Left click empty PPI | |
| Center here | Double-click empty PPI | Sets view center to that world point. |

**Scope-focus only (command line blurred):**

| Action | Sequence | CRC / vice analog |
| --- | --- | --- |
| Leader direction | `L` then `1`–`9` within 1.5 s | L1–L9. Top-row **or** numpad. |
| Full ↔ limited datablock | `T` | Tag/untag analog. Selected track; if none selected, **all** tracks. |
| Mode C field on/off | `M` | Hide/show reported altitude on **full** blocks. Assigned + GS remain. |
| Altitude filter | `F`, then 3-digit min, `Enter`, 3-digit max, `Enter` | Hundreds of feet. `Esc` cancels the chord. |
| History (duplicate of F8) | `H` | Convenience when scope-focused. |

**Hard conflicts — do not bind these letters as always-on:**

| Letter | Phase 1 radio meaning | Scope uses it only when |
| --- | --- | --- |
| `L` | `L090` fly heading left | Scope focus, leader chord |
| `T` | `T20L` turn degrees | Scope focus, datablock toggle |
| `C` | `C30` climb | **Never** a scope key. Center is `Home`. |
| `R` | `R180` right heading | **Never** a scope key. Range is PageUp/Down. |
| `H` | `H270` heading | Scope focus only (history). Always-on history is `F8`. |
| `A` / `D` / `S` / `I` | altitude / speed / ident | Never scope keys. |

Chord rule: after `L` or `F`, a 1.5 s timer. Invalid digit or timeout → cancel, no mutation, no error readback (optionally a dim status-line hint: `LEADER?`). **Never** forward leftover digits into the parser.

### 3. Range is a radar preset, not a camera zoom

Frozen presets (nautical miles, inclusive): **5, 10, 15, 20, 30, 40, 50, 60**.

- Default at session start: **20 NM**.
- Range is the **radius** from the **view center** to the shorter half-dimension of the PPI (the inscribed circle of the drawable canvas). The square canvas shows some corners beyond range; clip map/rings to the circle **or** to the AABB — pick one in T02-01 and test it. Prefer **circular clip** (PPI tradition).
- Changing range **does not** move the view center. **No zoom-to-cursor.** That is the single biggest “game map” tell.
- CRC has more presets (6, 8, 12, 16, 24, …). We do not.

### 4. Coordinates and camera

T00-04 froze world coordinates (local tangent NM east/north, or lat/lon + documented origin). The scope camera talks **only** in NM east/north of that origin plus pixels.

```ts
interface ScopeCamera {
  rangeNm: 5 | 10 | 15 | 20 | 30 | 40 | 50 | 60;
  /** World point drawn at PPI center. */
  centerEastNm: number;
  centerNorthNm: number;
}
```

- North-up. No rotation in v1 (`phases/_shared/glossary.md` PPI).
- `nmToScreen` / `screenToNm` are pure functions, unit-tested, used by maps, targets, leaders, PTL, click-select.
- Pan = mutate `centerEastNm` / `centerNorthNm`.

### 5. Palette (limited color)

STARS-like, not a screenshot clone. **No red in phase 2** (alerts are phase 4).

| Role | Hex (frozen) | Used for |
| --- | --- | --- |
| Background | `#000000` | PPI fill |
| Map | `#8C8C8C` | Runway, loc feather, coastline (FAA dim gray maps A/B) |
| Map dim | `#606060` | Range rings (FAA dark gray) |
| Unowned FDB + leader | `#00FF00` | Default after spawn — CRC other-TCP / unowned green |
| Owned FDB + leader | `#FFFFFF` | After F3 INIT CNTL — CRC owned white |
| Position symbol | `#1E78FF` | Search/fusion diamond (FAA 30,120,255). Independent of FDB. |
| History | `#1E50C8` … `#1E1E5A` | Five FAA history blues, newest brighter. Not track-tinted. |
| PTL | `#FFFFFF` | Predicted track line (FAA white) |
| Selected accent | `#FFFF00` | Selection box / IDENT flash; not the FDB color |
| DCB cells (T02-16–30) | `#003300` fill, `#00FF00` text, 1 px `#000` gutters | Historical functional DCB baseline. |
| DCB physical caps (T02-31–33) | dark olive `#021B08`–`#0A2412` cap; `#D6DED6`–`#E0E0E0` text; muted `#4C604C` disabled text | Two-row separated physical caps; normal = raised light-top/left, black-bottom/right bevel; pressed = inset, lighter olive body. DCB only—PPI palette roles stay unchanged. |
| SSA / lists | `#00FF00` | Screen-fixed SSA and on-PPI strip list |
| UI chrome | `#9AA0A6` on `#111` | help overlay chrome — still dark, not game HUD |

Export as `src/scope/palette.ts`. Do not sprinkle hex literals in draw calls.

### 6. Font

Do **not** bundle or imitate a licensed STARS font.

Use a **metric-similar monospace**, 11–13 px on a 1080p PPI (DCB **CHAR SIZE** cycles these):

- Preferred webfont: **IBM Plex Mono** (SIL OFL, tabular figures) at 12px, or
- System stack: `"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace`

Datablock layout is **character-cell based** (columns of hundreds vs GS). Proportional fonts are a bug.

### 7. Datablock content (v1, amended T02-19)

**Full datablock** (three lines, monospace, character-cell):

```
DAL123
030  210
B738
```

- Line 1: callsign as stored (no telephony here; that’s readback-only).
- Line 2: **Mode C** in hundreds of feet, zero-padded to 3 (`Math.round(altFt / 100)`), then two spaces, then **ground speed** in knots, 3 digits (`210`).
- If **assigned altitude** differs from Mode C by ≥ 100 ft, insert assigned hundreds between them:

```
DAL123
032  030  210
B738
```

Meaning: reported 3200, assigned 3000, GS 210. This is the phase-2 altitude contract — not a full STARS field-by-field clone (no beacon, no CSI, no NAS FP scratchpad).
- Optional trainer **scratchpad** (TrackDisplay, 0–4 A–Z0–9, default empty) appends after GS with two spaces when non-empty. Not a host flight-plan / landing-runway assignment:

```
DAL123
030  210  ABCD
B738
```

- Line 3 (frozen extra line): aircraft **type** from scenario spawn (ICAO stub, e.g. `B738`). Display-only; does not affect kinematics. Omit line 3 when type is missing. **Not** assigned H/A/S — that would be a fourth field set, not a third line. No 4-line block.

Line 2 columns (two-space gaps, left to right): Mode C hundreds (if `M` shows it) · assigned hundreds (if ≥100 ft off) · GS · scratchpad (if non-empty).

**Limited datablock** (one line, no callsign, no scratchpad, no type):

```
032
```

Mode C hundreds only, shorter leader allowed (same direction, half length).

**Mode C toggle (`M`)** hides the reported-altitude field on **full** blocks. If assigned differs, still show assigned + GS. If assigned equals Mode C and Mode C is hidden, show GS only on line 2. Type on line 3 is unchanged. Scratchpad still tails line 2 when set.

`T` / `M` behavior is unchanged (scope-focus only; radio `T20L` still parses).

Default **leader** length is **36 CSS px** (pixel-constant, L8). L5 overlay remains length 0. DCB LDR length menu is T02-17.

Font: IBM Plex Mono or system monospace — not a STARS face.

### 8. Leader directions (L1–L9 analog)

Numpad compass, **including 5 = overlay**:

```
7 NW    8 N    9 NE
4 W     5 CTR  6 E
1 SW    2 S    3 SE
```

- Default at spawn: **L8** (north). Same for all tracks until changed.
- Phase 2 leader length is **fixed**: **36 px** at the current canvas (T02-19; was 24), **or** 0.35 NM world — pick **pixel-constant** (36 px) so length does not explode at 5 NM range. Documented in T02-05 / T02-19. T02-17 LDR DIR is direction only (no length menu).
- L5: length 0; datablock top-left at the target (with a 4 px gap so the symbol stays visible).
- Per-track direction stored on display state, not on `Aircraft`.
- Changing `L`+digit applies to the **selected** track; if none selected, apply to **all**.

### 9. Altitude filter

```ts
interface AltitudeFilter {
  minHundreds: number; // 0–180
  maxHundreds: number; // 0–180, >= min
}
```

- Default `000–180` (show everything v1 can fly).
- Compare against **Mode C hundreds**, inclusive.
- Outside filter: still draw **target symbol + history**; **suppress datablock and leader**. This is STARS-ish “filtered” rather than deleting the blip (deleting blips feels like a bug).
- PTL: suppress when filtered.
- Filter does not affect strips (strips always list all aircraft).

### 10. Predicted track line

- Global toggle (F7 / DCB). Default **off**.
- Length: **1.0 minute** of current GS along **current ground track** (heading true). Phase 2 is a straight line, not a turn curve.
- Distance NM = `gsKt / 60 * minutes`.
- Draw from symbol center to endpoint; small cap tick.
- Per-selected-only PTL is out of scope (global is enough).

### 11. History dots

- Optional, default **on** (radar feel). Toggle F8 / `H` / DCB.
- Sample position every **5.0 s of sim time** (not wall, not every physics frame).
- Keep **5** dots (plus current symbol = 6 positions visually).
- Ring buffer per track; clear on spawn.
- Dots are 2 px squares, no leaders.

### 12. Ownership color (F3 stub)

```ts
type TrackOwnership = "unowned" | "owned";
```

- Spawn = `unowned` (green FDB; CRC other-TCP analog).
- `F3` with a selection: `unowned` → `owned` (white FDB). Already owned: no-op.
- `F4`: `owned` → `unowned`.
- **Does not** create a flight plan, does not emit Command IR, does not talk to a second position (that stub is phase 5).
- Selected accent (yellow box) is independent of ownership.

### 13. Canvas2D, one PPI

`src/scope` renders via Canvas2D. No WebGL in this phase. rAF calls `renderScope(ctx, world, scopeView)` after physics. Maps are **static Path2D** (or cached) — rebuild on resize/range/center, not per frame.

### 14. KDEM maps live in scenario JSON

Extend the T00-05 KDEM file with a `maps` object. Do not scrape charts. Coastline is a **fictional** polyline for depth, optional (`enabled: false` still valid).

## Visual specification

Think CRT terminal, not moving-map GPS.

- Full-viewport dark shell from T00-10 remains. Disclaimer remains visible (corner or settings; do not delete T00-01).
- PPI is the large center. DCB is a **green cell grid on the glass** (not a grey HTML toolbar). Historical T02-16/17 cells stay until T02-22–30: then MAIN/AUX via SHIFT, submenus replace the bar, dock TOP/LEFT/RIGHT/BOTTOM. Altitude **FILTER** stays on MAIN (trainer delta). Pad the drawable PPI so the bar does not cover the range circle.
- Command line stays **bottom** (phase 1).
- **SSA** top-left on the PPI (map-green mono, screen-fixed): sim time `HHMM/SS`, `KDEM 29.92` stub, `FILTER` hundreds, `RANGE n`, `OFF CNTR` if panned, static `OK` fused stub. Not live METAR / Site-Fused.
- Flight-strip list **on the PPI** (bottom-left corner, overflow scroll). Click row selects. Altitude filter does not hide rows. Not a labeled right **FLIGHT STRIPS** dock.
- Help overlay is a translucent dark panel listing the keymap; it pauses nothing (sim keeps ticking).
- No north-up arrow needed (always north-up); a small `N` tick at the top of the range circle is allowed.
- Range readout: `RANGE n` in the DCB and SSA (glossary **range**).

**Draw order (back to front):**

1. Background fill
2. Range rings
3. Coastline (if enabled)
4. Runway
5. Localizer feather
6. History dots
7. PTL
8. Target symbols
9. Leader lines
10. Datablocks
11. Selection box
12. SSA (screen-fixed)
13. Help overlay (DOM or canvas last)

## Architecture (scope module)

```
World (core) ──read-only──► renderScope
                    │
ScopeView state ────┤  camera, layers, filter, PTL, history on/off
                    │
DisplayState ───────┤  per-track: ownership, leaderDir, blockMode, history[]
                    │
Pointer / keys ─────┘  never writes Aircraft.intent
```

`src/pilot` remains the only writer of intent from commands. Scope may write **display** fields hung off a `TrackDisplay` map keyed by aircraft id.

Suggested layout (phase 0 folders; do not invent a second package system):

| Path | Owns |
| --- | --- |
| `src/scope/palette.ts` | Frozen colors |
| `src/scope/camera.ts` | Range, center, nm↔px |
| `src/scope/mapLayers.ts` | Geometry from KDEM JSON |
| `src/scope/history.ts` | Ring buffer, 5 s sample |
| `src/scope/datablock.ts` | Format strings |
| `src/scope/leader.ts` | 9-direction offsets |
| `src/scope/altitudeFilter.ts` | Predicate |
| `src/scope/ptl.ts` | Endpoint math |
| `src/scope/ownership.ts` | F3/F4 state machine |
| `src/scope/keymap.ts` | Tables + chord state |
| `src/scope/renderScope.ts` | Draw |
| `src/scope/ssa.ts` | SSA line builder (screen-fixed status) |
| `src/scope/scopeKeys.ts` | Event wiring, focus rules |
| `src/ui/DisplayControlBar.tsx` | DCB cell grid (T02-16) |
| `src/ui/FlightStrips.tsx` | On-PPI flight-strip list |
| `src/ui/ScopeHelpOverlay.tsx` | F1 |
| `src/scenario/kdem.json` | `maps` extension |

Core/parse/pilot tests stay **DOM-free**. Scope math (camera, filter, datablock format, PTL, leader offsets, ownership) must be unit-tested **without canvas**. Render/bench may use `OffscreenCanvas` or a jsdom canvas mock; FPS on a real GPU is a **Manual** AC.

## Keyboard feel vs CRC (honest delta)

Implementers will be tempted to “just copy CRC.” Freeze this delta in the help overlay footer: `TRAINER KEYS — NOT CRC`.

| CRC / vNAS (typical) | ATC-SIM phase 2 |
| --- | --- |
| RANGE via DCB presets including 6/8/12/16/24 | PageUp/Down + wheel; 8 presets 5–60 |
| CENTER then click | `Home` / `End` / double-click / DCB PLACE CNTR then PPI click / middle-drag pan |
| Full DCB | Green cell grid (T02-16); MAPS/RR/LDR/BRITE in T02-17; trainer MAIN/AUX/submenus in T02-22–30. Disabled WX; local PREF 1–8. Not NAS |
| F3 Initiate Track (NAS associate) | F3 color stub |
| Leader length + direction menus | Direction L1–L9; fixed **36 px** (T02-19). T02-17 LDR DIR is direction only (no length menu) |
| Pref sets, brightness, charsize | T02-26 CHAR SIZE per subsystem + BRITE channels (Plex/system mono). T02-29 local PREF 1–8. Not a NAS pref host |
| F1 as a STARS function | F1 = help |
| Radio is a headset | Radio is the phase 1 command line |

## Risks

| Risk | Mitigation |
| --- | --- |
| Scope `L`/`T`/`H` steal radio tokens | Focus model + always-on only on F-keys/Page/Home; tests that radio focus still parses `L090` |
| Continuous zoom / zoom-to-cursor sneaks in | T02-01 ACs forbid it |
| Datablock overlap at 30 tracks | Accept; do not auto-layout |
| Per-frame map rebuild / string alloc | Cache Path2D; format datablocks only when alt/GS change (or once per render is OK if bench passes) |
| Font licensing | IBM Plex Mono OFL or system monospace; no STARS dump |
| “Make it look exactly like CRC” | AGENT.md + this README; visual acceptance script scores *grammar* not pixels |
| F3 grows into a handoff system | T02-08 out-of-scope list is explicit |
| 60 FPS fails | T02-12 lands before T02-13; drop PTL/history default if needed **only after measuring** — do not skip datablocks |

## Ticket order

Implement in this order unless a ticket says it can run in parallel. IDs are stable; do not renumber.

| ID | Title | Pri | Size | Depends on | Parallel OK? |
| --- | --- | --- | --- | --- | --- |
| [T02-01](tickets/T02-01-scope-camera-range-pan-center.md) | Scope camera range pan center | P0 | M | T01-10 | — |
| [T02-02](tickets/T02-02-map-layers-runway-loc-rings.md) | Map layers runway loc and rings | P0 | M | T02-01, T00-05 | — |
| [T02-03](tickets/T02-03-target-symbol-and-history.md) | Target symbol and history | P0 | M | T02-01 | After 01, parallel with 02 |
| [T02-04](tickets/T02-04-full-and-limited-datablocks.md) | Full and limited datablocks | P0 | L | T02-03 | — |
| [T02-05](tickets/T02-05-leader-lines.md) | Leader lines | P0 | M | T02-04 | — |
| [T02-06](tickets/T02-06-altitude-filter.md) | Altitude filter | P0 | M | T02-04 | Parallel with 05, 07 |
| [T02-07](tickets/T02-07-predicted-track-line.md) | Predicted track line | P1 | S | T02-03 | Parallel with 04–06 |
| [T02-08](tickets/T02-08-stars-like-color-ownership.md) | STARS-like color ownership | P1 | M | T02-03, T02-04 | After 04 |
| [T02-09](tickets/T02-09-scope-keyboard-map-help-overlay.md) | Scope keyboard map help overlay | P0 | M | T02-01–08 keys exist | After 08 (keys land *in* feature tickets) |
| [T02-10](tickets/T02-10-display-control-bar-lite.md) | Display control bar lite | P1 | M | T02-01, T02-02, T02-06, T02-07 | After 06 |
| [T02-11](tickets/T02-11-flight-strips-window.md) | Flight strips window | P1 | M | T01-02, T01-11 | After 01, parallel with maps |
| [T02-12](tickets/T02-12-30-target-60fps-budget-test.md) | 30-target 60fps budget test | P1 | M | T02-02–05 | After 05; before 13 |
| [T02-13](tickets/T02-13-phase-2-visual-acceptance-script.md) | Phase 2 visual acceptance script | P0 | S | T02-01–12 | Last of original exit |

### Phase 2 polish (after original exit)

Original T02-01–13 **stay green**. These tickets amend DCB-lite / HUD / FDB *look* so the glass reads as a TCW, not a web trainer. They do **not** clone full DCB, WX, PREF, SHIFT, CSA, CRDA, FMA, STARS fonts, or OSM.

Implement **T02-14 → T02-21**. Do not skip T02-16 to “just add MAPS.”

| ID | Title | Pri | Size | Depends on | Parallel OK? |
| --- | --- | --- | --- | --- | --- |
| [T02-14](tickets/T02-14-video-map-catalog.md) | Video map catalog per airport | P0 | M | T02-02 | — |
| [T02-15](tickets/T02-15-trainer-chrome-off-tcw.md) | Trainer chrome off the TCW | P0 | M | T02-09, T02-10 | After 14 or parallel |
| [T02-16](tickets/T02-16-dcb-cell-grid.md) | DCB cell grid visual grammar | P0 | L | T02-10, T02-15 | After 15 |
| [T02-17](tickets/T02-17-dcb-maps-range-rr-ldr-brite.md) | DCB MAPS / RANGE / RR / LDR / CHAR / BRITE | P0 | L | T02-14, T02-16, T02-05, T02-06 | After 16 |
| [T02-18](tickets/T02-18-position-symbol-and-history-contrast.md) | Position symbol and history contrast | P1 | M | T02-03, T02-08 | Parallel with 15–16 |
| [T02-19](tickets/T02-19-datablock-scratchpad-type-leader-length.md) | Datablock scratchpad / type / leader length | P1 | M | T02-04, T02-05, T02-18 | After 18 |
| [T02-20](tickets/T02-20-ssa-status-and-on-ppi-lists.md) | SSA status and on-PPI lists | P1 | L | T02-11, T02-15, T02-06 | After 15 |
| [T02-21](tickets/T02-21-tcw-visual-acceptance.md) | TCW visual acceptance script | P0 | S | T02-14–20 | Last |

**Polish waves (max 3 in flight):**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-14 | Original phase 2 exit |
| B | T02-15, T02-18 | A (18 also T02-03/08 — already on master) |
| C | T02-16 | T02-15 |
| D | T02-17, T02-19 | C; 17 also T02-14; 19 also T02-18 |
| E | T02-20 | T02-15 + T02-11 |
| F | T02-21 | D + E |

## Phase exit checklist

**Key wiring rule:** T02-09 does **not** invent the keymap after the fact. Each feature ticket (01, 05, 06, 07, 08, history in 03, datablock toggle in 04) binds its always-on or scope-focus keys. T02-09 adds the F1 overlay, the exported table, and tests that scope keys never hit the parser.

## Phase exit checklist

Do not start phase 3 or 4 until every box is green. Phase 3 *may* overlap the tail of phase 2 because SpeechPort is isolated — but the **scope** exit below is still required before calling phase 2 done.

- [x] Range presets 5–60 NM, PageUp/Down + wheel, **no zoom-to-cursor**, `Home` centers airport.
- [x] KDEM runway 27, loc feather, rings; coastline optional from JSON.
- [x] Target symbol + optional 5-dot / 5 s history.
- [x] Full datablock: callsign, Mode C hundreds, assigned if different, GS. Limited + Mode C toggle.
- [x] Leaders L1–L9 (5 = overlay), 8 compass directions + center.
- [x] Altitude filter suppresses datablocks outside min/max; symbols remain.
- [x] PTL 1 min toggle.
- [x] Unowned green FDB / owned white FDB / blue position symbol / selected yellow; F3/F4 stub only.
- [x] F1 help lists the frozen Windows map; `TRAINER KEYS — NOT CRC`.
- [x] DCB-lite: range, map layers, filter, PTL, history.
- [x] Strips show callsign + assigned heading/alt/speed; click selects.
- [x] Scope keys never emit `command.accepted` / readback.
- [x] Typed `DAL123 H270` (radio focus) still readbacks and turns (phase 1 exit still holds).
- [x] 30-target budget test recorded (T02-12).
- [ ] T02-13 manual script signed off: “looks like a terminal radar, not a game map.” skip-with-reason: human asleep; no GPU/visual operator; live Chrome Windows script not watched. Automated tests prove the items above; do not invent a visual pass.
- [x] `npm test` green. No Command IR type changes.

### Phase 2 polish checklist (T02-14–21)

Do not call the TCW pass done until:

- [x] Video maps load from `video-maps/<ICAO>/` (T02-14).
- [x] No disclaimer banner / tutorial footer on the glass (T02-15).
- [x] DCB is a green cell grid, not an HTML toolbar (T02-16).
- [x] MAPS / RANGE / RR / LDR / CHAR SIZE / BRITE trainer subset (T02-17).
- [x] Position symbol + history contrast (T02-18).
- [x] FDB extra line + leader length (T02-19).
- [x] SSA on PPI; strips not a labeled right dock (T02-20).
- [ ] T02-21 manual script: cheap STARS trainer, not a web HUD. skip-with-reason: no visual operator; human not watching Chrome. Automated greps/tests prove chrome grammar; do not invent a visual pass.
- [x] Still no WX mosaic, PREF, SHIFT, CSA, CRDA, FMA, OSM, STARS font. *(Historical T02-14–21 freeze. T02-22–30 lift SHIFT / local PREF / disabled WX cells; mosaic / CRDA / FMA / OSM / STARS font stay out.)*

### Post-exit addendum (T02-22–30 trainer DCB)

Historical phase 2 exit (T02-01–13) and polish (T02-14–21) stay green. Do **not** uncheck those boxes. This addendum is new display-chrome work after that exit.

**Plan (within reason):** grow the DCB toward CRC STARS *jobs and grammar* without cloning NAS. Keep discrete range presets (spinner steps them; no continuous zoom). Keep altitude **FILTER** on MAIN (trainer delta — that cell is not SSA FILTER). WX1–4, VOL, MODE, SITE exist as **disabled** cells (hard labels `FSL` / `FUSION` where useful) and never paint weather or touch OS audio. CRDA, FMA, ARV, dual FSL/EFSL, licensed STARS font stay out. TPA is J-rings + mileage; ATPA is a thin toggle/stub, not a pairing engine. PREF is `localStorage`, 8 slots, not 32 NAS sets.

Implement **T02-22 → T02-30**. Do not skip T02-22 to “just add SHIFT.”

| ID | Title | Pri | Size | Depends on | Parallel OK? |
| --- | --- | --- | --- | --- | --- |
| [T02-22](tickets/T02-22-dcb-menu-model-and-primitives.md) | DCB menu model, SHIFT, primitives | P0 | L | T02-17, T02-21 | — |
| [T02-23](tickets/T02-23-dcb-main-range-cntr-rr-ldr.md) | Main RANGE / CNTR / RR / LDR | P0 | M | T02-22 | After 22 |
| [T02-24](tickets/T02-24-dcb-maps-wx-disabled.md) | MAPS 1–30, quick 1–6, WX disabled | P0 | M | T02-22, T02-14 | After 22; ∥ 23 |
| [T02-25](tickets/T02-25-dcb-aux-history-ptl-dock.md) | Aux HISTORY / PTL / dock | P0 | L | T02-22 | After 22; ∥ 23, 24 |
| [T02-26](tickets/T02-26-dcb-brite-char-size-submenus.md) | BRITE + CHAR SIZE submenus | P0 | M | T02-22 | After 22; ∥ 23–25 |
| [T02-27](tickets/T02-27-dcb-ssa-gi-filters.md) | SSA FILTER + GI TEXT FILTER | P0 | M | T02-22, T02-20 | After 22; ∥ 23–26 |
| [T02-28](tickets/T02-28-dcb-tpa-atpa-submenu.md) | TPA / ATPA submenu | P1 | M | T02-25 | After 25 |
| [T02-29](tickets/T02-29-dcb-pref-sets.md) | PREF sets (localStorage) | P0 | M | T02-23–27 | After 23–27 (28 optional) |
| [T02-30](tickets/T02-30-dcb-addendum-visual-acceptance.md) | DCB addendum visual acceptance | P0 | S | T02-22–29 | Last |

**Addendum waves (max 3 in flight):**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-22 | T02-21 (already on master) |
| B | T02-23, T02-24, T02-25 | A |
| C | T02-26, T02-27, T02-28 | B (28 needs 25) |
| D | T02-29 | C (23–27 at least) |
| E | T02-30 | D |

### Phase 2 DCB addendum checklist (T02-22–30)

Do not call the DCB addendum done until:

- [x] Menu model: MAIN ↔ AUX via SHIFT; submenus replace the bar; DONE / Esc return to MAIN.
- [x] Spinners arm on click, step on wheel, commit on second click / Esc (RANGE stays discrete 5–60 NM presets).
- [x] PLACE CNTR / OFF CNTR and PLACE RR / RR CNTR behave as separate cells.
- [x] MAPS 1–30 + quick 1–6; empty slots disabled; WX1–4 visible and unpressable.
- [x] Aux: HISTORY count, PTL length / OWN / ALL, DCB TOP/LEFT/RIGHT/BOTTOM; VOL disabled.
- [x] BRITE per drawn channel; CHAR SIZE per subsystem; WX/WXC live (T02-72); BKC still disabled / stored no-op.
- [x] SSA FILTER hides existing SSA lines; GI TEXT has 10 toggleable facility lines.
- [x] TPA J-rings work; ATPA is a stub/toggle, not a pairing engine.
- [x] PREF 1–8 persist/restore display state in `localStorage`.
- [x] WX VIP mosaic shipped; BKC/HIST/deviate still later. Still no CRDA, FMA, OSM, STARS font, Command IR from DCB. Disabled CRDA on SSA FILTER is chrome only (T02-27).
- [ ] T02-30 manual script 1–10: cheap STARS DCB, not a web settings ribbon. skip-with-reason: no visual operator; Chrome Windows script not watched. Automated greps/tests prove addendum grammar; do not invent a visual pass.

### STARS CRC Scope Fidelity Addendum (T02-34–38)

Completed visual, interactive, and datablock fidelity pass matching [CRC STARS](https://docs.virtualnas.net/crc/stars/):

| ID | Title | Pri | Size | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [T02-34](tickets/T02-34-stars-target-symbols-position-indicators.md) | Target symbols, position indicators, primary/secondary | P0 | M | T02-30 | Shipped |
| [T02-35](tickets/T02-35-stars-limited-partial-datablock-modes.md) | Limited (LDB) & Partial (PDB) datablock modes | P0 | M | T02-34 | Shipped |
| [T02-36](tickets/T02-36-stars-fdb-dynamic-timesharing-line3.md) | FDB dynamic time-sharing and Line 3 layout | P0 | M | T02-35 | Shipped |
| [T02-37](tickets/T02-37-stars-handoff-blinking-pointouts-highlight.md) | Handoff blinking, pointout indicators, cyan highlight | P0 | M | T02-36 | Shipped |
| [T02-38](tickets/T02-38-stars-crc-scope-fidelity-acceptance.md) | Scope fidelity integration suite & acceptance | P0 | M | T02-34–37 | Shipped |

### Phase 2 STARS CRC scope fidelity checklist (T02-34–38)

- [x] Target symbol shapes: `◇` unfilled diamond for primary-only, `*` for unassociated secondary, `V` for 1200 VFR, `□` for beacon-selected squawks, and sector ID letter (`D`, `T`, `C`) for tracked targets (T02-34).
- [x] Fixed 8px heading tick line removed from target symbol; PTL handles vector projection (T02-34).
- [x] LDB renders squawk + Mode C altitude; left-clicking queries ground speed for 5 seconds (e.g. `045 18` / `045 180`) (T02-35).
- [x] PDB renders Line 2 only for unowned associated tracks; left-clicking toggles between PDB and forced Green FDB (T02-35).
- [x] FDB dynamic time-sharing: Line 2 alternates on ~2.5s cycle between Phase A (Mode C + GS) and Phase B (Scratchpad + Type / Requested Alt `R<alt>`) (T02-36).
- [x] FDB Line 3 renders assigned altitude `A<alt>` when assigned altitude differs from Mode C altitude by >= 100 ft (T02-36).
- [x] Inbound handoffs render as blinking white FDB; left-clicking accepts handoff to solid white FDB and sector ID (T02-37).
- [x] Outbound accepted handoffs flash white for 5s and complete 3-click progression (solid white -> green FDB -> green PDB) (T02-37).
- [x] Pointout lifecycle: incoming blinking yellow FDB with `PO` tag; click accepts; `UN` click rejects; `**` click converts to handoff; rejected outbound pointout flashes `UN` tag (T02-37).
- [x] Datablocks support standard STARS Cyan highlight (`#00FFFF`) toggled via middle-click across LDB, PDB, and FDB (T02-37).
- [x] F4 drops track to unowned green PDB with `*` position symbol (T02-37).
- [x] Comprehensive end-to-end integration test suite in `src/scope/starsFidelity.integration.test.ts` (T02-38).

### STARS CRC Datablock & Scratchpad Fidelity Addendum (T02-39–42)

Completed datablock & scratchpad fidelity addendum matching [CRC STARS Specifications](https://docs.virtualnas.net/crc/stars/):

| ID | Title | Pri | Size | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [T02-39](tickets/T02-39-automatic-scratchpad-sp1-sp2-derivation.md) | Automatic scratchpad (SP1, SP2) derivation from aircraft intent | P0 | M | T02-38 | Shipped |
| [T02-40](tickets/T02-40-stars-fdb-groundspeed-tens-and-category-indicators.md) | STARS FDB groundspeed tens and category indicators | P1 | M | T02-39 | Shipped |
| [T02-41](tickets/T02-41-stars-fdb-multiphase-timesharing-and-handoff-center-placement.md) | Multi-phase Line 2 time-sharing & handoff center placement | P1 | L | T02-40 | Shipped |
| [T02-42](tickets/T02-42-stars-datablock-fidelity-integration-acceptance.md) | Datablock fidelity integration and acceptance test suite | P0 | L | T02-39–41 | Shipped |

### Phase 2 STARS CRC datablock fidelity checklist (T02-39–42)

- [x] Automatic scratchpad derivation: SP1 automatically derives approach shorthand (e.g. `ILS 27` -> `I27`, `RNAV 22L` -> `R22L`, `VISUAL 28` -> `V28`) as highest priority, falling back to interim altitude in 3-digit hundreds (`040`) when no approach is assigned (T02-39).
- [x] Automatic scratchpad derivation: SP2 automatically derives assigned speed shorthand with `S` prefix and 2-digit tens (e.g. `210 kt` -> `S21`, `180 kt` -> `S18`) (T02-39).
- [x] Manual scratchpads (`manualSp1`, `manualSp2`) take precedence over auto-derivation; clearing restores auto-derivation (T02-39).
- [x] Ground speed formatted in tens of knots (e.g. `18`, `21`, `25`) across FDB, PDB, and queried LDB (T02-40).
- [x] Wake/RNAV category indicators (`H`, `B`, `R`, `L`, CWT `A`–`I`) appended to ground speed (e.g. `18H`, `25R`) (T02-40).
- [x] Flight category suffixes (`V` for VFR, `E` for overflight) and PDB speed suppression support (T02-40).
- [x] Multi-phase Line 2 time-sharing: left column independently rotates `Mode C` $\leftrightarrow$ `SP1` $\leftrightarrow$ `SP2`, right column independently rotates `GS` $\leftrightarrow$ `Type` $\leftrightarrow$ `Requested Alt (R###)` every ~2.5s (T02-41).
- [x] Unassigned/empty scratchpads or types/reqAlts skipped smoothly without dead or blank display intervals (T02-41).
- [x] Transferring/receiving sector ID character placed in center position of Line 2 during active handoff (e.g. `080  D  25H`, `I27  D  B772`) (T02-41).
- [x] Emergency transponder Special Purpose Codes: 7700 (`EM`), 7600 (`RF`), 7500 (`HJ`) rendered on Line 1 next to callsign (T02-41).
- [x] Comprehensive end-to-end integration and acceptance test suite in `src/scope/datablockFidelity.integration.test.ts` (T02-42).

### TPA / ATPA Addendum (T02-43–50)

Completed TPA / ATPA addendum matching [CRC STARS](https://docs.virtualnas.net/crc/stars/) ATPA / TPA ATPA submenu / Table 36, with trainer deltas stated in every ticket (single TCP, no TDW white monitor, no aural ATPA tone, authored volumes, basic radar minima only):

| ID | Title | Pri | Size | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [T02-43](tickets/T02-43-atpa-approach-volume-schema-and-kdem-fixture.md) | ATPA approach volume schema and KDEM fixture | P0 | M | T04-27 | Shipped |
| [T02-44](tickets/T02-44-atpa-in-trail-pairing-engine.md) | ATPA in-trail pairing and predicted status engine | P0 | L | T02-43 | Shipped |
| [T02-45](tickets/T02-45-atpa-cone-geometry-and-rendering.md) | ATPA cone geometry and rendering | P0 | L | T02-44 | Shipped |
| [T02-46](tickets/T02-46-atpa-intrail-distance-and-cone-mileage.md) | ATPA in-trail distance and cone mileage | P0 | M | T02-44 | Shipped |
| [T02-47](tickets/T02-47-dcb-tpa-atpa-submenu-live-cells.md) | DCB TPA/ATPA submenu live cells | P0 | M | T02-45, T02-46 | Shipped |
| [T02-48](tickets/T02-48-richer-manual-tpa-rings-and-cones.md) | Richer manual TPA rings and cones | P1 | L | T02-45, T02-49 | Shipped |
| [T02-49](tickets/T02-49-stars-tpa-atpa-slew-chord-parser.md) | STARS TPA / ATPA slew-chord parser | P1 | M | none | Shipped |
| [T02-50](tickets/T02-50-tpa-atpa-integration-and-acceptance.md) | TPA / ATPA integration and acceptance | P0 | L | T02-47, T02-48 | Shipped |

### Phase 2 TPA / ATPA checklist (T02-43–50)

- [x] ATPA approach volumes are catalog data walked by `approachId` (KDEM `ATPA27` / `ATPA09`); a third runway adds JSON, never an `if` (T02-43).
- [x] In-trail pairing and predicted monitor / warning (45 s) / alert (24 s) status on `world.alerts.atpa` via `stepWorld`; minima from volume JSON (`basicSeparationNm` 3 NM, `reducedSeparationNm` 2.5 NM inside `reducedWithinNm` 10 NM); cone length identical for a heavy or light leader (T02-44).
- [x] Trailing track paints one unfilled wedge (vertex on the trailer, axis toward the leader, length = `requiredNm`); monitor TPA blue, warning `atpaWarning` yellow, alert `atpaAlert` red — never CA red `PALETTE.alert` (T02-45).
- [x] Trailing FDB line 3 shows two-decimal in-trail distance on warning / alert; cone mileage digits sit alongside (`"3"` / `"2.5"`); monitor omits the datablock field (T02-46).
- [x] Four live AUX TPA/ATPA cells plus master (`atpa-mileage`, `atpa-intrail`, `atpa-alert`, `atpa-monitor`); `effective = atpa.on && atpa[feature]`; Alert Cones gates warning and alert; PREF schema `v: 2` round-trips all five `AtpaState` fields; `v: 1` migrates (T02-47).
- [x] Per-track `*J` / `*P` rings and ground-track cones (1–30 NM, session state not PREF); `**J` / `**P` clear-all; size-readout inhibit; J-rings are never suppressed by ATPA; a manual `*P` cone is suppressed only on warning/alert (T02-48).
- [x] STARS slew-chord parser for `*J` / `*P` / `*A` / `*B` / `*D` (and doubles); chords are scope-only and never emit Command IR; `DAL123 H270` still turns (T02-49).
- [x] Conflict alert stays T04-09 `CA` datablock text plus tone; still **no** 3 NM CA halo; circles on this scope are TPA J-rings only.
- [x] Comprehensive end-to-end integration and acceptance test suite in `src/scope/atpaFidelity.integration.test.ts` (T02-50).

### Preview Area addendum (T02-51–54)

Completed Preview Area addendum matching [CRC STARS](https://docs.virtualnas.net/crc/stars/) Preview Area / Tracking Aircraft / Table 30, with trainer deltas stated in every ticket (F3 is color/ownership stub not NAS associate; F4 is trainer drop not NAS terminate; F1 stays beaconator; F7 stays PTL ALL; no pointouts this swarm):

| ID | Title | Pri | Size | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [T02-51](tickets/T02-51-stars-preview-area-command-buffer.md) | STARS Preview Area command buffer | P0 | M | none | Shipped |
| [T02-52](tickets/T02-52-init-term-cntl-command-then-slew.md) | INIT CNTL / TERM CNTL command-then-slew plus FLID Enter | P0 | L | T02-51 | Shipped |
| [T02-53](tickets/T02-53-beacon-code-select-preview.md) | Beacon code select from Preview Area `B##` / `B####` | P1 | M | T02-51 | Shipped |
| [T02-54](tickets/T02-54-preview-area-integration-and-acceptance.md) | Preview Area integration and acceptance | P0 | L | T02-52, T02-53 | Shipped |

### Phase 2 Preview Area checklist (T02-51–54)

- [x] Preview Area buffer (idle / entry / armed) paints CRC mnemonics in SSA/preview green under the SSA; Esc cancels to idle; invalid/unknown commit flashes `INV`; reject unknown — never parse-and-no-op; no `window.prompt`, no extra HTML `<input>` (T02-51).
- [x] F3 INIT CNTL / F4 TERM CNTL command-then-slew, implied selected-track apply, and FLID Enter / FLID slew; empty PPI click does not consume the arm; `TERM CNTL ALL` is `INV`, not drop-all (T02-52).
- [x] Scope-focus `B##` / `B####` toggles CODE BLOCK / discrete `beaconSelectCodes`; matching unassociated paints □; unmatched stays `*`; incomplete Enter is `INV`; radio-focus `B` is a literal character (T02-53).
- [x] Preview Area is **not** the radio command line: F3 / F4 / `B` never emit Command IR / readback / intent; `DAL123 H270` still turns; T02-49 `*` chords stay scope-only (T02-51–54).
- [x] Comprehensive end-to-end integration and acceptance test suite in `src/scope/previewArea.integration.test.ts` (T02-54).
- [ ] Manual player loop (F3 INIT CNTL slew → F3 DAL123 Enter → F4 slew → `B4500` □ → radio heading → `*J3`). skip-with-reason: no visual operator; Chrome player loop not watched. Automated tests prove the items above; do not invent a visual pass.

**Preview Area is not the radio command line.** Scope commands never emit Command IR / readback / intent. `DAL123 H270` still turns. `*J` / `*P` (and other T02-49 `*` chords) still arm/slew. A live `*` hint still wins over idle preview. Invalid/unknown commit flashes `INV`. Reject unknown; never parse-and-no-op. No `window.prompt`, no extra HTML `<input>`. Trainer F3 is a color/ownership stub (not NAS associate). F4 is trainer drop (not NAS terminate). F1 stays beaconator. F7 stays PTL ALL.

#### Shipped Preview Area commands (do not invent later CRC tables)

| Command | What the operator does | What happens |
| --- | --- | --- |
| F3 INIT CNTL | F3 with nothing selected | Preview paints `INIT CNTL` (never the literal `"F3"`); next target click owns **that** track (white FDB). Empty PPI click does not consume the arm. Pending inbound: one click accept+own (`acceptInboundHandoff`). |
| F3 implied | F3 with a track already selected | Applies immediately (`applyInitiateTrackToSelection`). Preview may flash `INIT CNTL` then clear. |
| F3 + FLID + Enter | F3, type full callsign / numeric tail / unique 4-digit squawk, Enter | Owns that aircraft with nothing selected. Unknown or ambiguous → brief `INV`, no apply. |
| F3 + FLID + slew | F3, type FLID, click a target | Applies to the clicked track only if the FLID uniquely matches that track; else `INV`. |
| F4 TERM CNTL | F4 with nothing selected | Preview paints `TERM CNTL` (never `"F4"`); next target click drops **that** track. Empty click does not consume the arm. |
| F4 implied | F4 with a track selected | Drops the selection now. |
| F4 + FLID + Enter | F4, type FLID, Enter | Drops the resolved aircraft. `TERM CNTL ALL` is `INV`, not drop-all. |
| Esc | Esc while preview is live (entry or armed) | Cancels preview to idle. Precedence: live preview > live `*` chord > DCB. |
| Backspace | Backspace while typing ACID after F3/F4 | Edits the typed ACID. |
| Scope-focus `B` + two digits + Enter | PPI focused, `B` `4` `5` Enter | Toggles CODE BLOCK `"45"` on `beaconSelectCodes`; unassociated squawks starting with `45` paint □. Second `B45` Enter removes it. |
| Scope-focus `B` + four digits | PPI focused, `B4500` (four digits may auto-commit) | Toggles discrete `"4500"`. Matching unassociated paints □; unmatched stays `*`. |
| Incomplete `B` Enter | Bare `B`, one digit, or three digits then Enter | `INV`; select list unchanged. Non-digit after `B` (other than Enter/Esc/Backspace) is `INV`. |
| Radio-focus `B` | Command line focused, type `B` | Literal character. Never always-on. Callsign typing still works. |

#### Explicitly not Preview Area this swarm (out / still later)

pointouts `UN` / `**` / `(ID)*` / initiate-recall PO (leave existing click / radio-buffer `UN`/`**`); `TERM CNTL ALL`; typed TCP / Δ handoffs; `BE`/`BI`; assign-code `M ####`; MULTIFUNC (F7 stays PTL ALL); scratchpad `Y`/`+`; per-track PTL `R`; highlight keyboard (stays middle-click); quicklook `Q`; CRDA; WX; list relocate; RBL / `.dot` commands.

### Phase 2 addendum (T02-68–72 WX mosaic)

T02-68–72 VIP mosaic is shipped: IEM N0Q fills + WXC contours, display only.
Wind still later. Historical T02-22–30 remains accurate: its WX cells first
shipped without weather paint.

| ID | Title | Pri | Size | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [T02-68](tickets/T02-68-wx-mosaic-iem-client-and-vip.md) | WX mosaic IEM client and VIP decode | P0 | M | none | Shipped |
| [T02-69](tickets/T02-69-wx-vip-paint-under-tracks.md) | WX VIP paint under tracks | P0 | M | T02-68 | Shipped |
| [T02-70](tickets/T02-70-dcb-wx-levels-and-pref.md) | DCB WX levels and PREF | P0 | M | T02-69 | Shipped |
| [T02-71](tickets/T02-71-preview-wx-commands.md) | Preview WX commands | P0 | S | T02-69 | Shipped |
| [T02-72](tickets/T02-72-brite-wx-wxc-and-acceptance.md) | BRITE WX/WXC and acceptance | P0 | M | T02-70, T02-71 | Shipped |

## Launching an agent

1. Confirm phase 1 README exit is green.
2. Paste **[AGENT.md](AGENT.md)** as the whole-phase prompt, **or** paste one ticket and say: implement only this ticket, stop when ACs are checked.
3. Work T02-01 → T02-13 as in the table. Do not skip T02-12 to “make it pretty.”
4. After original exit: polish T02-14 → T02-21 (DCB cells, chrome, SSA). Still not a Raytheon clone.
5. After polish: DCB addendum T02-22 → T02-30 (main/aux/submenus). Still not CRDA / FMA / weather paint.
6. Scope fidelity addendum T02-34 → T02-38 (STARS CRC symbol shapes, LDB/PDB/FDB modes, time-sharing, handoffs, pointouts, cyan highlights).
7. Datablock & scratchpad fidelity addendum T02-39 → T02-42 (SP1/SP2 derivation, tens groundspeed + categories, multi-phase time-sharing with center handoff placement, emergency SPCs).
8. TPA / ATPA addendum T02-43 → T02-50 (volumes as data, in-trail pairing, monitor/warning/alert cones, four live DCB cells, PREF v2, `*J`/`*P` chords, integration acceptance). Wake-category minima stay deferred.
9. Preview Area addendum T02-51 → T02-54 (buffer + INV, INIT/TERM command-then-slew and FLID Enter, `B##`/`B####` beacon select, integration acceptance). Pointouts, TERM CNTL ALL, and MULTIFUNC stay deferred.

## Glossary reminders

Use `phases/_shared/glossary.md` terms: **scope**, **PPI**, **datablock**, **track**, **CRC keys**. Distances NM, altitudes feet MSL, speed knots. Do not invent “zoom level,” “labels,” or “sprites” in user-facing UI copy — say **range**, **datablock**, **target**. Forbidden/required list: `phases/_shared/references.md`.

