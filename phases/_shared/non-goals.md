# Non-goals (all phases)

These are out of scope unless a later ticket explicitly lifts them. Implementing agents must not do this work "while they are here."

## Product

- Clone or reverse-engineer Raytheon/Collins STARS, TAMR internals, or proprietary maps.
- Claim operational / NAS / FAA-training-device certification.
- VATSIM / MSFS / X-Plane live traffic in v1.
- Tower cab, ASDE-X, ERAM, or oceanic.
- Multi-facility NAS, ARTCC, or overlapping sectors (phase 5 may *stub* a second position).
- Weather mosaic, precipitation, wind (until a phase 4 ticket).
- Full DCB, CRDA, FMA, ARV, preference sets, dual FSL/EFSL.

## Architecture

- Server-authoritative world tick for single player.
- Running the sim or ATC-tuned Whisper on Cloudflare Workers / "edge functions."
- LLM as the command executor or aircraft autopilot.
- Free-form chat with pilots.
- Microservice split **beyond** the optional local `speech-api/` process. The world tick stays in the browser.

## Voice

- Full-duplex always-on listening (this is PTT).
- Fine-tuning Whisper **in this repo** (using a published HF weight is fine).
- Shipping a 500 MB+ ATC-medium model **inside the Vite bundle** as the default path (the **speech-api** may cache a Hub model on disk).
- **Paid / metered third-party STT or TTS APIs** (OpenAI, Deepgram, Groq, ElevenLabs, Google Cloud Speech, Azure, AWS, HF Inference API/Endpoints, etc.). Voice goes through **our** API running **our** weights.

## Data / legal

- Scraping copyrighted charts (Jeppesen, ForeFlight, etc.).
- Bundling non-redistributable FAA products without a documented source.

Label the app **training / entertainment only** in the UI by the end of phase 0.
