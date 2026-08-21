# ATC-SIM

In-browser **STARS-like** ATC trainer: terminal radar, typed then spoken commands, simulated-pilot readbacks. Training/entertainment only — not FAA equipment and not the Raytheon STARS product.

**Start coding:** paste [`phases/00-slice/AGENT.md`](phases/00-slice/AGENT.md) into a new agent.

**How to launch any phase:** [`phases/LAUNCH.md`](phases/LAUNCH.md)

## Run

```text
npm install
npm run dev
```

Default KDEM spawn is **6 arrivals** (student band 4–8). The 30-track Canvas2D budget check is opt-in and does not change Command IR:

- `http://localhost:5173/?traffic=30` — `spawnArrivals(world, 30)` on a wide downwind arc
- `http://localhost:5173/?traffic=30&debug=fps` — same, plus a corner `30 TRACKS  FPS nn` readout

Without `?debug=fps` the default UI stays clean (no FPS HUD).
