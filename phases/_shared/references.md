# Research and terminology

Implementers **search these sources before inventing UI copy, keyboard chords, datablock layout, or radio phraseology.** Frozen trainer deltas (range presets, F1 = help, F3 = color only) still win over CRC when this plan says they do — but you must **know the analog** and name it in a code comment.

If a URL 404s, use the **Search** query. Do not scrape proprietary STARS binaries, Jeppesen charts, or CRC assets.

## Authority order

1. **FAA JO 7110.65** — what the controller *says* and when (phraseology, vectors, readbacks, safety alerts).
2. **AIM Pilot/Controller Glossary (PCG)** — official English for *datablock, Mode C, vector, readback, MSAW*, etc.
3. **FAA STARS / TAMR public pages + FOA STARS chapter** — workstation *names* (TCW, TDW, DCB, CA, MSAW, ARV). Not a pixel spec.
4. **CRC / vNAS STARS docs** — public keyboard and display *feel* (leaders, FDB/LDB, range, initiate track). VATSIMisms are marked in those docs; do not treat them as NAS.
5. **vice** — STARS-like scope + typed ATC tokens + virtual-pilot readbacks. Tokens are **vice-inspired, not vice-compatible**.
6. **vSTARS** (CRC predecessor) — only if CRC docs are silent on a chord; prefer CRC.

Never treat VATSIM lore, Infinite Flight, or “game ATC” YouTube as terminology sources.

## How to use in a ticket

Each ticket’s **Research** section cites IDs below (`R01` …). Before coding:

1. Open the linked doc (or search).
2. Copy **official words** into UI strings and code identifiers (`datablock`, not `label`).
3. Add a one-line comment: analog + trainer delta (`// CRC L1–L9 leaders; we omit length menu`).
4. If you diverge beyond the phase README, stop and ask — do not silently “improve” toward a moving map.

## Required vs forbidden words (UI and code comments)

| Use | Do not use (user-facing) |
| --- | --- |
| **range** (NM preset) | zoom, zoom level, camera, scale slider |
| **center** / **off-center** | pan tool (OK in code comments as trainer sugar) |
| **datablock**, **full datablock**, **limited datablock** | label, nametag, tooltip, sprite text |
| **leader** / **leader line** | stem, stick, callout line |
| **track** / **target** | blip (OK colloquially in comments), enemy, plane icon |
| **Mode C** | GPS altitude, “the height number” |
| **assigned altitude** | target altitude (ambiguous with radar target) |
| **ground speed** (datablock) | IAS on the block (we *simulate* IAS=TAS; still *display* GS) |
| **altitude filter** | altitude cull, visibility slider |
| **predicted track line (PTL)** | heading line, velocity vector (game) |
| **history** (dots) | trail, motion blur, phosphor (unless a comment) |
| **initiate track** (F3 stub) | claim, lock on, select-as-owned (say **owned** in trainer help) |
| **digital map** / **video map** | basemap, OSM, satellite |
| **localizer feather** | ILS triangle, funnel |
| **range rings** | grid circles, minimap rings |
| **DCB** (we ship DCB-lite) | toolbar, ribbon, HUD |
| **flight strip** | card, ticket, widget |
| **readback** | confirm, ACK, “pilot says OK” |
| **vector** / **fly heading** | “turn to face” |
| **descend and maintain** | “go down to” |
| **conflict alert (CA)** | TCAS, proximity alarm |
| **MSAW** | terrain warning (too generic), GPWS |

Call the product **STARS-like**, never **STARS**, in UI (`T00-01` disclaimer).

---

## Source catalog

### R01 — JO 7110.65 (Air Traffic Control)

- **URL:** https://www.faa.gov/air_traffic/publications/atpubs/atc_html/
- **Search:** `FAA JO 7110.65 Air Traffic Control HTML`
- **Use for:** Phraseology, readback/hearback, vectors, altitude assignments, approach clearances, safety alerts.
- **Chapters to search (names, not frozen paragraph numbers):** Radio communications; Beacon systems / Mode C; Radar identification & vectors; Arrival procedures; Safety alerts (CA / MSAW / terrain).

### R02 — Pilot/Controller Glossary

- **URL:** https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/
- **Search:** `FAA Pilot Controller Glossary datablock Mode C readback`
- **Use for:** Canonical definitions of **datablock**, **Mode C**, **vector**, **readback**, **minimum safe altitude warning**, **conflict alert**, **flight strip**.

### R03 — AIM (Aeronautical Information Manual)

- **URL:** https://www.faa.gov/air_traffic/publications/atpubs/aim_html/
- **Search:** `FAA AIM radio communications phraseology digits`
- **Use for:** How pilots *hear* numbers and callsigns; keep templates aligned with 7110.65, not AIM-only slang.

### R04 — FAA STARS / TAMR overview

- **URL:** https://www.faa.gov/air_traffic/technology/tamr
- **Search:** `FAA TAMR STARS Terminal Automation`
- **Use for:** What STARS *is* (TRACON/tower automation, TCW/TDW). Product posture: we emulate a **TCW-like picture**, not the NAS.

### R05 — FOA Handbook, STARS chapter

- **URL:** https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html
- **Search:** `FAA JO 7210.3 FOA STARS display data altitude filter ARV`
- **Use for:** Facility terms: altitude filters, Mode C display, MSAW/MCI, Approach Runway Verification (we do **not** build ARV in v1). Display-data *policy*, not pixels.

### R06 — Collins / Raytheon STARS product page (public)

- **URL:** https://www.rtx.com/collinsaerospace/what-we-do/industries/air-traffic-management/automation/stars
- **Search:** `Collins Aerospace STARS air traffic control display`
- **Use for:** High-level feature names (weather overlay, CRDA). Out of scope list — do not implement from marketing.

### R07 — CRC / vNAS STARS client

- **URL:** https://docs.virtualnas.net/crc/stars/
- **Search:** `vNAS CRC STARS datablock leader DCB initiate track`
- **Also:** https://docs.virtualnas.net/crc/overview/
- **Use for:** Keyboard map, FDB/LDB, leader L1–L9, range, DCB, F3 initiate. Read the **VATSIMisms** section so you do not copy network hacks as “real STARS.”

### R08 — vice (STARS/ERAM-like trainer)

- **URL:** https://pharr.org/vice/
- **Repo:** https://github.com/mmp/vice
- **Search:** `vice ATC STARS emulation keyboard TG commands site:pharr.org`
- **Use for:** Scope *feel*, typed command tokens (`H270`, `C30`), virtual-pilot readback window. Parser is **inspired by**, not compatible with, vice.

### R09 — vSTARS (legacy VATSIM client)

- **Search:** `vSTARS VATSIM user guide datablock leader` (PDF ARTCC training notes)
- **Use for:** Historical names if CRC moved a key. Prefer R07 when they conflict.

### R10 — ICAO Doc 4444 (secondary)

- **Search:** `ICAO Doc 4444 PANS-ATM radiotelephony`
- **Use for:** Contrast only. This sim is **FAA phraseology** (7110.65), not ICAO “climb to” vs “climb and maintain.”

### R11 — CIFP / NASR (procedures, phase 4)

- **Search:** `FAA CIFP Coded Instrument Flight Procedures NASR`
- **Use for:** Fix/procedure identifiers. Not maps. No Jeppesen.

### R12 — Other browser ATC scopes (anti-pattern)

- **Search:** `atc-terminal.com` / `radarcontrol.io` / open-source Canvas ATC
- **Use for:** What **not** to copy: OSM tiles, rainbow palettes, cursor-zoom, “plane sprites with nametags.” Cite as negative examples in visual QA.

---

## Topic → sources

| Topic | Read first | Search if lost |
| --- | --- | --- |
| Range, center, PPI, no zoom-to-cursor | R07 RANGE/CENTER; R12 as counterexample | `CRC STARS range presets center` |
| Video maps, loc feather, rings | R07 maps; R04/R05 “digital map” | `STARS video map localizer feather range rings` |
| History dots | R07 history / trails | `STARS history dots CRC` |
| Full / limited datablock, Mode C hundreds | R02 datablock; R07 FDB/LDB; R05 display data | `STARS full data block limited Mode C hundreds` |
| Leader L1–L9 | R07 leader; R09 | `STARS leader direction L1 L9 keypad` |
| Altitude filter | R05; R07 | `STARS altitude filter uncorrelated` |
| PTL | R07 predicted track | `STARS PTL predicted track line` |
| Initiate track / ownership color | R07 F3; R04 TCW | `CRC STARS F3 initiate track` |
| DCB | R07 DCB; R06 | `STARS display control bar DCB` |
| Flight strips | R02 flight progress strip; R07 / vice strips | `FAA flight progress strip TRACON` |
| Typed tokens `H270` `C30` | R08 vice ATC instructions | `vice STARS TG heading climb` |
| Spoken “descend and maintain” | R01 ch. altitude; R03 digits | `7110.65 descend and maintain phraseology` |
| Readback content | R01 readback; R02 | `7110.65 2-4-3 readback altitudes` |
| Vector to intercept LOC | R01 radar arrivals / vectors | `7110.65 vector to intercept localizer` |
| Cleared ILS / missed | R01 approach clearances | `7110.65 cleared ILS approach missed approach` |
| Conflict alert | R01 safety alerts; R05 CA | `7110.65 conflict alert STARS` |
| MSAW | R01; R02; R05 | `7110.65 MSAW minimum safe altitude warning` |
| Handoff (phase 5 stub) | R01 radar handoff; R07 handoff | `7110.65 radar handoff point out` |
| Callsign telephony | R03; airline table in vice/CRC as *data* not law | `FAA telephony designator DAL Delta` |

---

## Comment template (paste into `src/scope/*`)

```ts
/** Analog: CRC STARS <feature> (docs.virtualnas.net/crc/stars).
 *  Trainer delta: <what we skipped>. Not NAS STARS. */
```
