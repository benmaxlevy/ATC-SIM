# KDEM ILS 27 (phase 4)

Playable STAR → vector → ILS 27 slice. Training / entertainment only.

Load: `npm run dev` then open `?scenario=kdem-ils27` (aliases: `phase4`, `ils27`). Default boot stays the phase-1 downwind pack (`?scenario=kdem`).

## Traffic

- **DAL123** — DEMO ONE **north** (`N`), spawned before NEMAX at 11000 / 250 kt with descend-via armed. Do not bust NEMAX (Mode C ≥ 100, speed ≤ 250).
- **AAL45** — DEMO ONE **south** at **SEMAX**, same alt band. Vector both onto a shared final to light CA yellow then red. (MSAW: `D10` off the loc below the MVA also works.)

## ILS clearance

Typed: `DAL123 R240 A20 APP ILS27` (or spoken 7110.65 vector-to-final). Hold 2000 until loc, then GS.

## Tower stub

Inside 5 NM on loc/GS: **Shift+H** (documented on F1). Scope only — no readback. Sets LANDING, tower ownership color, `handoff.tower`. Aircraft continues GS and despawns (`nav.landed`). Skip HO → missed at DA (270 / 3000).
