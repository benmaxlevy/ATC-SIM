# ATC-SIM product freeze (v1)

Training and entertainment only. The display is a **STARS-like TCW analog** (FAA TAMR/STARS is the NAS terminal automation platform at TRACONs and towers). This app is not STARS, not an FAA device, and not certified for NAS use. Exact UI copy: `docs/DISCLAIMER.md`.

Details live in `phases/_shared/` (architecture, Command IR, SpeechPort, glossary, non-goals). This file restates frozen v1 decisions; it does not add new ones.

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
