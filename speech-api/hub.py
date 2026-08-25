"""One-time Hugging Face Hub copies onto disk. Never InferenceClient."""

from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger("speech-api")


def _hf_hub_download(**kwargs):
    from huggingface_hub import hf_hub_download

    return hf_hub_download(**kwargs)


def model_weights_source(cache: Path, model_id: str) -> str:
    """'cache' if a Hugging Face model snapshot is already on disk, else 'download'."""
    snap = cache / f"models--{model_id.replace('/', '--')}"
    if snap.is_dir() and (any(snap.rglob("model.bin")) or any(snap.rglob("config.json"))):
        return "cache"
    direct = cache / model_id.replace("/", "--")
    if (direct / "model.bin").is_file() or (direct / "config.json").is_file():
        return "cache"
    alias = cache / model_id
    if (alias / "model.bin").is_file() or (alias / "config.json").is_file():
        return "cache"
    return "download"


def resolve_hub_file(
    *,
    repo_id: str,
    filename: str,
    cache_dir: Path,
    token: str | None,
    purpose: str,
) -> tuple[Path, str]:
    """Return (path, 'cache'|'download'). Logs only on a real Hub copy."""
    from logconfig import configure_logging

    configure_logging()
    cache_dir.mkdir(parents=True, exist_ok=True)
    kwargs = {
        "repo_id": repo_id,
        "filename": filename,
        "cache_dir": str(cache_dir),
        "token": token,
    }
    try:
        path = _hf_hub_download(local_files_only=True, **kwargs)
        return Path(path), "cache"
    except Exception:
        log.info("%s weights=download repo=%s file=%s (one-time Hub copy)", purpose, repo_id, filename)
        path = _hf_hub_download(local_files_only=False, **kwargs)
        return Path(path), "download"
