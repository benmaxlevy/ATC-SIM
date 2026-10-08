# Fonts converted from Vice's STARS bitmaps

Run from the repository root:

```sh
npm run fonts:regenerate
```

Requires Go **1.24.4**, Python **3.13** with `venv`, and network access for
pinned Python dependencies. The command creates an isolated temporary venv,
installs the exact versions in `requirements.txt`, compiles the standard-library
Go AST exporter, exports all glyph data and metrics, builds and verifies all
assets, and updates the browser metric catalog and CSS. No Vice renderer or
native graphics dependency is needed. At the user’s request, the working
converter directory is removed; the GPL corresponding-source ZIP beside the
fonts retains the original source and build scripts. The regeneration command
extracts that archive into a temporary directory, then removes it automatically. The input Go source is vendored verbatim
with its SHA-256. Optionally reacquire and verify it with
`npm run fonts:regenerate -- --fetch`; Vice is fetched into a temporary directory
at the exact commit, never into the application workspace.

## Source and attribution

Initial inspection fetched Vice commit
`2c0e29270727e90e70989f8e504a4a16d67efee2`. On September 20, 2026, commit
`2a1d8e590b969f06351b389a8856da79c78a1347` moved the bitmap tables into compressed
msgpack assets. This converter pins its immediate predecessor,
`afec9e5282d09697d542f5de1e11072206afd1db`, which retains the authored Go tables
and includes Vice's malformed-glyph fixes.

Source evidence:

- [Bitmap definitions](https://github.com/mmp/vice/blob/afec9e5282d09697d542f5de1e11072206afd1db/stars/font-bitmaps.go): indexed glyphs, authored dimensions, offsets, and advances.
- [Font selection](https://github.com/mmp/vice/blob/afec9e5282d09697d542f5de1e11072206afd1db/stars/fonts.go): B = ARTS, six system sizes and first three DCB sizes; delta rewriting.
- [Renderer](https://github.com/mmp/vice/blob/afec9e5282d09697d542f5de1e11072206afd1db/renderer/font.go): MSB-first scanlines, y-down bitmap rasterization, cell placement, baseline, and advance.
- [STARS symbols](https://github.com/mmp/vice/blob/afec9e5282d09697d542f5de1e11072206afd1db/stars/stars.go): 0x80 delta and 0x1e filled up triangle.

Bitmap copyright is **Copyright(c) 2022-2025 vice contributors**;
its SPDX declaration is **GPL-3.0-only**. The converted assets retain that
license. Full license, attribution, modifications, and upstream credits ship
beside the assets in `public/fonts/vice/`. The application is AGPL-3.0-only;
this change does not relicense the bitmap assets as OFL or claim vendor provenance.
Corresponding bitmap source and all conversion scripts ship in this repository.

## Exact conversion contract

All 12 ARTS faces are exported: six normal and six outline sizes,
256 source glyphs per face. Legacy faces are not converted. The UI uses the normal faces; the outline variants
are also preserved as independent assets and shown in the specimen.

A scanline's bit 31 is x=0. Source row y is top-down. A source pixel becomes
`[offsetX+x, offsetX+x+1] × [offsetY+boundsHeight-y-1, offsetY+boundsHeight-y]`
in upward font coordinates. Each pixel is **64 font units**; UPEM is
`font.Height * 64`. CSS font size equals the authored height, so one source
pixel equals one CSS pixel. Baseline is the bottom of the authored cell.
Typographic and hhea ascent equal cell height, descent and line gap are zero;
Windows clipping extents include all ink. Advance is exactly `StepX * 64`.
Horizontal side bearing is the actual ink x minimum, preserving any authored
blank padding through the pixel coordinates. Blank glyphs retain their offset
in the JSON and their source advance in the font.

Adjacent occupied cells have their shared edges removed. Boundary walks split
point contacts, preserve clockwise exterior and counterclockwise hole edges,
and remove only collinear vertices. Contours contain straight on-curve points;
there is no smoothing or approximation. `.notdef` is an explicit additional
missing-character box; it does not replace source glyph 0. Source space is
preserved, including its authored advance.

Every source index i is accessible at **U+E000+i**. Original indices 0–255 also
retain their direct mappings, except U+00A0 maps to ordinary space for browser
nonbreaking-space behavior; the original glyph 160 remains at U+E0A0. Unicode
aliases: **Δ U+0394 / ∆ U+2206 → 128**, **▲ U+25B2 → 30**,
**▼ U+25BC → 31**, **□ U+25A1 → 129**. Delta/up-triangle are identified by Vice
code. Down-triangle/square aliases are based on inspection of the authored
bitmap shapes; other symbol slots stay explicitly indexed instead of inventing
semantic names. Authored differences between sizes remain intact.

Generation reopens both TTF and WOFF2 and checks every cmap entry, advance,
side bearing, font baseline table, and orthogonal contour. Expanded serialized
edges must exactly equal source pixel boundaries. Nonzero-winding coverage is
compared at every pixel center in the glyph's original cell and a surrounding
margin. Missing glyphs, malformed rows, off-grid/invalid contours, holes filled
incorrectly, offset shifts, and mismatched metrics stop generation.

The manifest records per-face counts and verification totals. Font timestamps,
ordering, contours, and IDs are deterministic. A second regeneration must
produce identical asset hashes.

## Browser behavior

Open `/fonts/vice/specimen.html` under the Vite server. Each native-size browser
sample is followed by an independently generated SVG of the original occupied
cells. Inspect at DPR 1 and 2. Samples include letters, digits, punctuation,
delta, filled triangles, square, and indexed STARS symbols.

`src/scope/fonts.ts` resolves stored CHAR SIZE tokens to authored faces and
applies a uniform display progression. DATA BLOCKS/LISTS/TOOLS/POS levels 0–5
render at **10/11/12/13/14/15 CSS px**; DCB levels 0–2 render at **10/11/12 CSS px**.
Stored compatibility tokens remain 8–13 for text, 4–9 for POS, and 10–12 for DCB;
old saved level 6 migrates to 5. Each level keeps its corresponding authored face.
Font assets retain native outlines/metrics; browser display scales them to the
requested CSS sizes. Position IDs remain centered by their visible ink bounds
inside a tightly fitted fused circle with a one-pixel gap.
Runtime always uses ARTS, as explicitly requested. There is no font selector
or family preference. The authored ARTS outline variants are also available in the specimen.
Existing display preference schemas and CHAR SIZE values remain compatible.

All six runtime ARTS faces settle before mounting the scope and before starting
canvas paint/measurement. Each face has a bounded 5-second load deadline.
Rejected, empty, or timed-out loads use system monospace at the same displayed
cell height; layout measures the fallback actually used. No late automatic
font swap changes picking geometry. DCB has no synthetic weight or letter
spacing. Datablock placement/overlap and picking share measured render snapshots,
including actual measured advances. List hit rows use the selected display
line height. Layout caching compares every solver input, including text metrics,
targets, bounds, and protected geometry. Conservative geometry bounds avoid
expensive exact intersection tests when obstacles are far from the text box.

Browser rasterization may antialias outline edges, particularly at fractional
text origins or centered baselines; Vice uses nearest-filtered bitmap textures.
`gasp` requests no smoothing, but browser engines need not honor it. Source
shapes and metrics remain exact; browser pixel colors are a separate QA check.


## Verification performed

The pinned source was reacquired in an isolated temporary checkout and matched
its SHA-256. All **24 TTF/WOFF2 files** reproduced byte for byte using pinned
fontTools 4.57.0, Brotli 1.1.0, and Zopfli 0.2.3.post1.

Conversion verified **12 ARTS faces**, **3,072 glyphs**, and **1,496,064**
original-grid sample points across serialized TTF and WOFF2.
Chrome at DPR **1 and 2** compared **19,660,800 physical pixels** against the
source bitmaps, covering every glyph of all 12 faces at aligned native origins:
**zero coverage mismatches, zero advance mismatches, zero partially covered
pixels**. The browser specimen includes independent source references.

Browser inspection exercised DATA BLOCKS/LISTS/TOOLS/POS levels 0–5 and DCB
0–2, scope datablocks, lists, preview text and delta, plus DCB caps. No clipped
DCB caps or JavaScript errors were observed at 1920×1080. Forcing all runtime
font requests to fail confirmed a usable system-monospace fallback. Remaining
difference: fractional text origins and centered baselines can still receive
browser antialiasing; failure fallback cannot reproduce Vice glyph shapes.
QA screenshots remain local evidence and are not committed.


Final repository validation: `npm run ci` passed (252 files, 2,821 tests;
4 existing skips). `npm run build` passed. The delayed-download browser check
held all six ARTS font requests pending: no scope canvas and no mounted root
children appeared until the requests were released; the scope then mounted
with the native ARTS face. The required corresponding-source archive rebuilt
all font binaries identically, and the working converter plus temporary source
checkout/export files were removed.
