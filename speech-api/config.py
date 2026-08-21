"""Process settings. Hugging Face Hub is a one-time weight download, not inference."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

API_DIR = Path(__file__).resolve().parent
DEFAULT_CACHE_DIR = API_DIR / ".cache"

# faster-whisper Hub id (CTranslate2). Alias `base.en` also works.
DEFAULT_STT_MODEL_ID = "Systran/faster-whisper-base.en"
DEFAULT_TTS_VOICE = "en_US-lessac-medium"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8090

VITE_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _optional_env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    stt_model_id: str
    tts_voice: str
    parse_model_id: str | None
    cache_dir: Path
    mock: bool
    hf_token: str | None
    cors_origins: tuple[str, ...]
    stt_device: str | None
    stt_compute_type: str | None

    @property
    def parse_status(self) -> str:
        # T03-13 never loads a parse model; T03-14 will set "ready" when it does.
        return "off"

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
            cache_dir=Path(os.environ.get("SPEECH_API_CACHE", str(DEFAULT_CACHE_DIR))),
            mock=env_flag("SPEECH_API_MOCK"),
            hf_token=_optional_env("HF_TOKEN") or _optional_env("HUGGING_FACE_HUB_TOKEN"),
            cors_origins=tuple(dict.fromkeys(origins)),
            stt_device=_optional_env("STT_DEVICE"),
            stt_compute_type=_optional_env("STT_COMPUTE_TYPE"),
        )

    def apply_hub_cache(self) -> None:
        """Point Hugging Face Hub downloads at speech-api/.cache/ (gitignored)."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("HF_HOME", str(self.cache_dir / "hf"))
