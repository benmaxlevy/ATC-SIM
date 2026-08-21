# AGENT.md — Phase 2 Scope (implementation prompt)

Copy everything below this line into a new agent. Do not start until **phase 1 exit** in `phases/01-closed-loop/README.md` is green.

---

You are implementing **ATC-SIM phase 2 (Scope)** in `c:\Users\Ben\Documents\ATC-SIM`.

## Mission

Replace the phase 1 crude PPI (dots + callsign) with a **STARS-like terminal radar**: dark north-up PPI, KDEM digital maps, full/limited datablocks, leader lines, altitude filter, a small Windows keyboard subset, DCB-lite, flight strips, and a 30-target / 60 FPS budget. The workstation must feel like a **terminal radar, not a game map**.

CRC/vNAS STARS and vice are **references for feel**. Do **not** clone every key, do not scrape charts, do not bundle a STARS font, do not build full DCB / CRDA / FMA / weather / NAS handoff.

**Research protocol:** For every ticket, complete its **Research** section first (IDs in `phases/_shared/references.md`). Add the analog+delta comment in the module. If CRC and this README disagree, **this README wins**, but you must still cite CRC so the help overlay can show the delta.

## Read first (obey; do not edit)

- `phases/_shared/glossary.md`
- `phases/_shared/references.md` — **mandatory.** Open 7110.65 / PCG / CRC STARS / vice links (or Search fallbacks) before naming UI strings or keys. Use official words: range, datablock, leader, Mode C, PTL, initiate track. Never zoom, nametag, sprite.
- `phases/_shared/architecture.md`
- `phases/_shared/command-ir.md`
- `phases/_shared/speech-port.md`
- `phases/_shared/non-goals.md`
- `phases/02-scope/README.md` — frozen keyboard, palette, datablock format, range presets
- Every ticket you implement under `phases/02-scope/tickets/`

If a canvas or chat summary disagrees with these files, **these files win**.

## Hard rules

1. **Radio vs scope:** Command IR is radio-only. Scope keys must never construct a `Command`, never call the parser, never call the pilot agent, never change `intent` or kinematics. F3 only flips ownership color.
2. **Do not change** Command IR types, parser tokens, readback templates, or `SpeechPort`.
3. **Do not reopen** frozen decisions in `phases/02-scope/README.md` (range presets, focus model, palette, L1–L9, font, no zoom-to-cursor, no red).
4. **Do not bind** `C` or `R` as scope keys (`C30` / `R180` are radio). Center = `Home`. Range = `PageUp` / `PageDown`.
5. **Canvas2D only.** No WebGL. Physics stays `stepWorld` at 20 Hz; rAF only renders.
6. **Suggested folders:** `src/scope/*` for PPI math and draw; `src/ui/*` for DCB-lite, strips, help overlay; extend `src/scenario` KDEM JSON maps. Do not create a new package system.
7. **Tests:** Vitest. Camera, datablock format, leaders, filter, PTL, ownership, keymap routing must have DOM-free unit tests. Mark Manual ACs as Manual. Keep `npm test` green after each ticket.
8. **Do not** implement phase 3 voice, phase 4 ILS/CA, or phase 5 scoring “while you are here.”
9. Work **one ticket at a time** in the order below unless the ticket says it can run in parallel **and** its dependencies are done. Check every AC before starting the next.
10. Stop when the **phase exit checklist** in `phases/02-scope/README.md` is green. Do not start phase 3 tickets.

## Ticket order

| Order | ID | File |
| --- | --- | --- |
| 1 | T02-01 | `phases/02-scope/tickets/T02-01-scope-camera-range-pan-center.md` |
| 2 | T02-02 | `phases/02-scope/tickets/T02-02-map-layers-runway-loc-rings.md` |
| 3 | T02-03 | `phases/02-scope/tickets/T02-03-target-symbol-and-history.md` (parallel with 02 after 01) |
| 4 | T02-04 | `phases/02-scope/tickets/T02-04-full-and-limited-datablocks.md` |
| 5 | T02-05 | `phases/02-scope/tickets/T02-05-leader-lines.md` |
| 6 | T02-06 | `phases/02-scope/tickets/T02-06-altitude-filter.md` (parallel with 05/07 after 04) |
| 7 | T02-07 | `phases/02-scope/tickets/T02-07-predicted-track-line.md` |
| 8 | T02-08 | `phases/02-scope/tickets/T02-08-stars-like-color-ownership.md` |
| 9 | T02-09 | `phases/02-scope/tickets/T02-09-scope-keyboard-map-help-overlay.md` |
| 10 | T02-10 | `phases/02-scope/tickets/T02-10-display-control-bar-lite.md` |
| 11 | T02-11 | `phases/02-scope/tickets/T02-11-flight-strips-window.md` (may start after T02-01) |
| 12 | T02-12 | `phases/02-scope/tickets/T02-12-30-target-60fps-budget-test.md` |
| 13 | T02-13 | `phases/02-scope/tickets/T02-13-phase-2-visual-acceptance-script.md` |

**Stop after T02-13** unless the human asked for **TCW polish** (T02-14–21). Those tickets amend DCB-lite / HUD / FDB look. They may update named README rows (palette, datablock lines, DCB). They still must not clone full DCB, WX, PREF, STARS fonts, or OSM.

| Order | ID | File |
| --- | --- | --- |
| 14 | T02-14 | `phases/02-scope/tickets/T02-14-video-map-catalog.md` |
| 15 | T02-15 | `phases/02-scope/tickets/T02-15-trainer-chrome-off-tcw.md` |
| 16 | T02-16 | `phases/02-scope/tickets/T02-16-dcb-cell-grid.md` |
| 17 | T02-17 | `phases/02-scope/tickets/T02-17-dcb-maps-range-rr-ldr-brite.md` |
| 18 | T02-18 | `phases/02-scope/tickets/T02-18-position-symbol-and-history-contrast.md` |
| 19 | T02-19 | `phases/02-scope/tickets/T02-19-datablock-scratchpad-type-leader-length.md` |
| 20 | T02-20 | `phases/02-scope/tickets/T02-20-ssa-status-and-on-ppi-lists.md` |
| 21 | T02-21 | `phases/02-scope/tickets/T02-21-tcw-visual-acceptance.md` |

Each feature ticket **wires its own keys**. T02-09 is the help overlay + routing tests, not the first place keys exist.

## Definition of done (whole phase)

- Phase 1 loop still works: radio focus, type `DAL123 H270` (or select + `H270`), text readback, aircraft turns.
- PPI is black, north-up, circular range, discrete 5–60 NM, center/pan without zoom-to-cursor.
- Maps, symbols, history, full/limited datablocks, leaders, filter, PTL, ownership colors as specified.
- F1 help shows the Windows keymap and the line `TRAINER KEYS — NOT CRC`.
- DCB-lite and strips work with mouse.
- 30-target budget recorded.
- Visual acceptance script (T02-13) completed. Polish gate is T02-21 if those tickets were in scope.
- `npm test` green. Training/entertainment disclaimer still reachable (banner or F1 / first-run after T02-15).

## If you are blocked

- Missing KDEM map fields: **extend** the T00-05 JSON; do not break spawn.
- Missing coordinate helpers: use T00-04 APIs; do not invent a second world frame.
- Tempted to copy a CRC screenshot pixel-for-pixel: stop. Match the **grammar** in the phase README (palette, two-line block, feather, rings).
- Tempted to auto-separate overlapping datablocks: out of scope.

When a ticket is done, tick its ACs in the ticket file if you are allowed to edit phase docs; otherwise leave a short summary of which ACs you verified. Then start the next ticket.
