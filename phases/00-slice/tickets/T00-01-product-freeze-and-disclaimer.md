# T00-01 Product freeze and disclaimer

**Phase:** 00 Slice
**Priority:** P0
**Size:** S
**Depends on:** none
**Blocks:** T00-10
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The repo contains a checked-in product freeze and the **exact** UI disclaimer string. Later tickets copy that string; they do not rewrite it.

## Context

`phases/_shared/non-goals.md` requires the app to be labeled **training / entertainment only** by the end of phase 0. `phases/_shared/architecture.md` freezes KDEM and browser-first runtime. This ticket is documentation only (Vite does not exist until T00-02).

Glossary: do not call this product “STARS” without the “STARS-like / not the Raytheon product” distinction.

## Research

Read **R04** (what STARS actually is) so `docs/PRODUCT.md` can say **STARS-like TCW analog**, not STARS.

- Open: https://www.faa.gov/air_traffic/technology/tamr
- Search: `FAA TAMR STARS TRACON`
- Disclaimer copy is frozen; do not “improve” it with FAA-certification language.

## Scope

- Add `docs/PRODUCT.md` restating frozen v1 decisions (table below). Do not add new decisions.
- Add `docs/DISCLAIMER.md` containing **only** the disclaimer heading plus the exact copy in Implementation notes (the UI string must be copy-paste identical, including punctuation).
- Do not create `src/`, `package.json`, or UI.

## Out of scope

- Rendering the disclaimer in a browser (T00-10).
- Legal review, license files beyond what git already has, trademarks filing.
- Changing `phases/_shared/*`.
- Parser, SpeechPort, Scenario JSON.

## Implementation notes

### Exact disclaimer copy (frozen)

Use this string **verbatim** as the UI disclaimer (one paragraph). `docs/DISCLAIMER.md` must include it inside a fenced block or as a single quoted paragraph so T00-10 can copy it byte-for-byte:

```
ATC-SIM is a training and entertainment product. It is not an FAA training device, is not certified for operational or NAS use, and is not affiliated with the FAA or any STARS vendor. The display is a STARS-like visual analog only.
```

### `docs/PRODUCT.md` must include these rows (same meaning)

| Topic | Frozen value |
| --- | --- |
| Claim | Training / entertainment only (see disclaimer). |
| Runtime | In-browser Vite SPA. No server-authoritative tick. |
| Demo Facility | KDEM (fictional Demo Field). Mag var 0°. Field elev 0 ft. Runway 27. ILS id `ILS27`. ARP 0°N, 0°E. |
| Coordinates | Local ENU NM; T00-04 documents formulas. |
| Command IR | Radio-only; types match `phases/_shared/command-ir.md`. |
| SpeechPort | Adapter; `null` in phase 0. Quality path is **our** `speech-api` (HF weights). No paid STT/TTS vendors. |
| Scope vs radio | Scope commands never produce a Readback. |
| v1 traffic | Single-player simulated aircraft. No VATSIM/MSFS live traffic. |

Keep the file short (one screen). Point at `phases/_shared/` for details rather than duplicating Command IR types.

## Acceptance criteria

- [ ] **AC1 —** `docs/PRODUCT.md` exists and states browser-first Vite, no server tick, single-player, KDEM rwy 27 / mag var 0 / elev 0.
- [ ] **AC2 —** `docs/PRODUCT.md` states Command IR is radio-only and SpeechPort is an adapter with a phase-0 `null` impl.
- [ ] **AC3 —** `docs/DISCLAIMER.md` contains the exact disclaimer paragraph from Implementation notes with no paraphrase.
- [ ] **AC4 —** No `src/` application files were added by this ticket (docs only).
- [ ] **AC5 —** Product freeze does not claim FAA certification, NAS use, or that the app *is* STARS.

## Test plan

- Unit: none.
- Integration: none.
- Manual: Read both docs; confirm wording matches this ticket.

## Suggested files

- `docs/PRODUCT.md`
- `docs/DISCLAIMER.md`
