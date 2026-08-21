"""Download Hub weights into speech-api/.cache/ (one-time). Inference is local."""

from __future__ import annotations

import logging

from config import Settings
from engines import build_stt, build_tts

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main() -> None:
    settings = Settings.load()
    if settings.mock:
        raise SystemExit("SPEECH_API_MOCK=1 — nothing to download. Unset it and retry.")
    settings.apply_hub_cache()
    print(f"cache: {settings.cache_dir}")
    print(f"STT:   {settings.stt_model_id}")
    print(f"TTS:   {settings.tts_voice}")
    print(f"roster:{', '.join(settings.tts_voices)}")
    print(f"parse: {settings.parse_model_id or '(off)'}")
    build_stt(settings)
    build_tts(settings)
    if settings.parse_model_id:
        from parse_engine import build_parse

        engine = build_parse(settings)
        if engine is None or not engine.ready:
            raise SystemExit("PARSE_MODEL_ID set but the GGUF did not load")
    print("weights are on disk; start the API with: python -m uvicorn app:app --host 127.0.0.1 --port 8090")


if __name__ == "__main__":
    main()
