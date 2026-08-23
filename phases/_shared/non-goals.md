# Non-goals (all phases)

These are out of scope unless a later ticket explicitly lifts them. Implementing agents must not do this work "while they are here."

## Product

- Clone or reverse-engineer Raytheon/Collins STARS, TAMR internals, or proprietary maps.
- Claim operational / NAS / FAA-training-device certification.
- VATSIM / MSFS / X-Plane live traffic in v1.
- Tower cab, ASDE-X, ERAM, or oceanic.
- Multi-facility NAS, ARTCC, or overlapping sectors (phase 5 may *stub* a second position).
- Weather mosaic, precipitation, wind (until a phase 4 ticket). WX DCB cells may exist as **disabled** chrome (T02-24); they must not paint weather.
- CRDA, FMA, ARV, dual FSL/EFSL.
- Full NAS DCB / preference host. T02-22–30 lift a **trainer DCB subset** (main/aux/submenus, local PREF slots, disabled WX/VOL/MODE/SITE). Still not a Raytheon clone.

## Architecture

- Server-authoritative world tick for single player.
- Running the sim or ATC-tuned Whisper on Cloudflare Workers / "edge functions."
- LLM as the command executor, aircraft autopilot, phraseology **grader**, or free-form chat with pilots.
- LLM as the **primary** parser (Path A stays the English grammar). Optional Path C may emit `Instruction` JSON on **our** `speech-api` `POST /parse` after local stages miss; the browser schema-checks; the pilot still validates (`parse-pipeline.md`).
- Microservice split **beyond** the optional local `speech-api/` process (STT, TTS, and `/parse` live there). The world tick stays in the browser.

## Voice

- Full-duplex always-on listening (this is PTT).
- Fine-tuning Whisper **in this repo** (using a published HF weight is fine).
- Shipping a 500 MB+ ATC-medium model **inside the Vite bundle** as the default path (the **speech-api** may cache a Hub model on disk).
- **Paid / metered third-party STT or TTS APIs** (OpenAI, Deepgram, Groq, ElevenLabs, Google Cloud Speech, Azure, AWS, HF Inference API/Endpoints, etc.). Voice goes through **our** API running **our** weights.

## Data / legal

- Scraping copyrighted charts (Jeppesen, ForeFlight, etc.).
- Bundling non-redistributable FAA products without a documented source.

Label the app **training / entertainment only** in the UI by the end of phase 0.
