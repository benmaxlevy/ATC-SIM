# Architecture (v1)

Browser-first single-player trainer. Optional **self-hosted** `speech-api/` for STT/TTS and optional Path C `/parse`. No server tick. No paid speech vendors.

```
[PTT / command line]
        │
        ▼
   SpeechPort? ──transcript──► Parser ──► Command IR
                                 │
                    typed → A → B → C?  (parse-pipeline.md)
                                            │
                                            ▼
                                      Pilot agent
                                       │        │
                                       │        ▼
                                       │     Intent
                                       │        │
                                       ▼        ▼
                                  Readback   Kinematics
                                       │        │
                                       ▼        ▼
                                 SpeechPort   Tracks
                                  TTS+FX        │
                                                ▼
                                         Scope (PPI)
```

## Packages (suggested)

**Single Vite app** (frozen in phase 0). Folders under `src/`, not a monorepo.

| Folder | Owns |
| --- | --- |
| `src/core` | Sim clock, aircraft, kinematics, Command IR types |
| `src/parse` | String → `Command` (one stage list; Path C fetch injected) |
| `src/pilot` | Validation, readback templates, intent apply |
| `src/scope` | Canvas PPI, maps, datablocks, scope keys |
| `src/speech` | SpeechPort impls, capture, radio graph |
| `speech-api/` | Local HTTP: Whisper STT + Piper TTS; optional `/parse` (Path C). Hub weights on disk |
| `src/scenario` | Airport, spawn, maps JSON |
| `src/ui` | Shell, command line, strips, settings |

## Runtime

- **Language:** TypeScript, strict.
- **App:** Vite + one HTML entry.
- **Tests:** Vitest. Core/parse/pilot must be DOM-free.
- **Tick:** `requestAnimationFrame` drives render; fixed timestep `dt = 1/20 s` * simRate for physics (accumulator). Physics in a pure function `stepWorld(world, dt)` so tests can run without rAF.
- **State:** Single `World` object. No Redux required. UI subscribes via a small store or just React state lifted from `World`.

## Demo facility (phase 0 default)

**KDEM — Demo Field** (fictional), magnetic variation 0°, one runway **27**, ILS 27, one downwind spawn. Real CIFP airports are a phase 4 swap, not a phase 1 blocker.

Field elevation 0 ft (keep the math boring). Airport ref: **0°N, 0°E**. Runtime world position is a **local ENU tangent plane**: `xNm` east, `yNm` north of ARP (frozen in T00-04). Do not store lat/lon as the simulation state.

## Quality bar

- 30 arrivals on scope at 60 FPS on a 2020 laptop (integrated GPU) with Canvas2D.
- Typed command → aircraft starts turning in the next physics step (< 50 ms).
- Voice path (phase 3): PTT-up → readback audio start target **< 1.5 s** p50 against **our** `speech-api` on localhost or LAN, measured, not guessed.
