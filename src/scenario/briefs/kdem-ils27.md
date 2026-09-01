# KDEM ILS 27 (phase 4)

Playable STAR → vector → ILS 27 slice. Training / entertainment only.

Load: `npm run dev` then open `?scenario=kdem-ils27` (aliases: `phase4`, `ils27`). Default boot stays the phase-1 downwind pack (`?scenario=kdem`).

## Traffic
 
Traffic callsigns are assigned dynamically at runtime from the session pool. Identify aircraft on scope by their datablock callsign:
 
- **North inbound** (`N` transition) — spawned before NEMAX at 11000 / 250 kt on the DEMO ONE arrival with descend-via armed. Do not bust NEMAX (Mode C ≥ 100, speed ≤ 250).
- **South inbound** (`S` transition) — spawned at SEMAX on the DEMO ONE arrival, same alt band. Vector both onto a shared final to light CA yellow then red. (MSAW: vectoring off the loc below the MVA also works.)
 
## ILS clearance

Spoken or typed 7110.65 vector-to-final, e.g. `<CALLSIGN> R240 A20 APP ILS27`. Hold 2000 until loc, then GS.

## Tower stub

Inside 5 NM on loc/GS: **Shift+H** (documented on F1). Scope only — no readback. Sets LANDING, tower ownership color, `handoff.tower`. Aircraft continues GS and despawns (`nav.landed`). Skip HO → missed at DA (270 / 3000).
