"""Startup logging: our engines at INFO, Hub/Xet/httpx quiet."""

from __future__ import annotations

import logging
import os
import time

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"

# Root stays INFO for uvicorn + speech-api. These libraries flood INFO on Hub cache hits.
_QUIET_LOGGERS = (
    "huggingface_hub",
    "huggingface_hub.utils",
    "huggingface_hub.file_download",
    "huggingface_hub.utils._http",
    "hf_xet",
    "xet",
    "filelock",
    "httpx",
    "httpcore",
    "httpcore.http11",
    "httpcore.connection",
    "urllib3",
    "urllib3.connectionpool",
    "transformers",
    "onnxruntime",
    "numba",
    "fsspec",
    "fsspec.local",
)


def _apply_hub_env() -> None:
    """Must run before huggingface_hub / hf_xet import."""
    os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
    os.environ.setdefault("HF_HUB_VERBOSITY", "error")
    os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
    os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
    # hf_xet reads RUST_LOG; default INFO dumps CAS config on every Hub touch.
    os.environ.setdefault("RUST_LOG", "error")


def _quiet_imported_backends() -> None:
    try:
        from huggingface_hub.utils import disable_progress_bars

        try:
            from huggingface_hub.utils import logging as hf_logging
        except ImportError:
            from huggingface_hub import logging as hf_logging

        hf_logging.set_verbosity_error()
        disable_progress_bars()
    except Exception:
        pass
    try:
        import onnxruntime as ort

        ort.set_default_logger_severity(3)  # ERROR
    except Exception:
        pass


def configure_logging() -> None:
    """Idempotent. Call before STT/TTS/LLM load."""
    _apply_hub_env()
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
    logging.getLogger("speech-api").setLevel(logging.INFO)
    for name in _QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.ERROR)
    _quiet_imported_backends()


def elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)
