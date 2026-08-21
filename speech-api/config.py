"""Process settings. Hugging Face Hub is a one-time weight download, not inference."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

API_DIR = Path(__file__).resolve().parent
DEFAULT_CACHE_DIR = API_DIR / ".cache"

# faster-whisper Hub id (CTranslate2). small.en is the quality default (slower than base.en).
DEFAULT_STT_MODEL_ID = "Systran/faster-whisper-small.en"
DEFAULT_TTS_VOICE = "en_US-lessac-medium"
# Distinct Piper medium voices so each callsign can hash to a different speaker.
DEFAULT_TTS_VOICES = (
    "en_US-lessac-medium",
    "en_US-amy-medium",
    "en_US-ryan-medium",
    "en_US-joe-medium",
    "en_US-kristin-medium",
    "en_US-kusal-medium",
)
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8090
# Path C default when PARSE_MODEL_ID is set. ~1–2B instruct GGUF, not a 7B.
DEFAULT_PARSE_MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct-GGUF"
DEFAULT_PARSE_GGUF_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf"

VITE_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _optional_env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def _tts_voice_roster() -> tuple[str, ...]:
    extra = os.environ.get("TTS_VOICES", "").strip()
    if not extra:
        return DEFAULT_TTS_VOICES
    voices = tuple(v.strip() for v in extra.split(",") if v.strip())
    return voices or DEFAULT_TTS_VOICES


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    stt_model_id: str
    tts_voice: str
    parse_model_id: str | None
    parse_gguf_file: str
    cache_dir: Path
    mock: bool
    hf_token: str | None
    cors_origins: tuple[str, ...]
    stt_device: str | None
    stt_compute_type: str | None
    tts_voices: tuple[str, ...]

    @classmethod
    def load(cls) -> Settings:
        extra = os.environ.get("CORS_ORIGINS", "").strip()
        origins = list(VITE_ORIGINS)
        if extra:
            origins.extend(o.strip() for o in extra.split(",") if o.strip())
        return cls(
            host=os.environ.get("HOST", DEFAULT_HOST).strip() or DEFAULT_HOST,
            port=int(os.environ.get("PORT", str(DEFAULT_PORT))),
            stt_model_id=os.environ.get("STT_MODEL_ID", DEFAULT_STT_MODEL_ID).strip()
            or DEFAULT_STT_MODEL_ID,
            tts_voice=os.environ.get("TTS_VOICE", DEFAULT_TTS_VOICE).strip() or DEFAULT_TTS_VOICE,
            parse_model_id=_optional_env("PARSE_MODEL_ID"),
            parse_gguf_file=os.environ.get("PARSE_GGUF_FILE", DEFAULT_PARSE_GGUF_FILE).strip()
            or DEFAULT_PARSE_GGUF_FILE,
            cache_dir=Path(os.environ.get("SPEECH_API_CACHE", str(DEFAULT_CACHE_DIR))),
            mock=env_flag("SPEECH_API_MOCK"),
            hf_token=_optional_env("HF_TOKEN") or _optional_env("HUGGING_FACE_HUB_TOKEN"),
            cors_origins=tuple(dict.fromkeys(origins)),
            stt_device=_optional_env("STT_DEVICE"),
            stt_compute_type=_optional_env("STT_COMPUTE_TYPE"),
            tts_voices=_tts_voice_roster(),
        )

    def apply_hub_cache(self) -> None:
        """Point Hugging Face Hub downloads at speech-api/.cache/ (gitignored)."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("HF_HOME", str(self.cache_dir / "hf"))
