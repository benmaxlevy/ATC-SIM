"""Startup logging: Hub/Xet quiet, STT/TTS/LLM status visible."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app
from config import DEFAULT_PARSE_MODEL_ID, Settings
from hub import resolve_hub_file, whisper_weights_source
from logconfig import configure_logging


def test_configure_logging_quiets_huggingface() -> None:
    configure_logging()
    assert logging.getLogger("huggingface_hub").level >= logging.ERROR
    assert logging.getLogger("httpx").level >= logging.ERROR
    assert logging.getLogger("speech-api").level <= logging.INFO


def test_whisper_weights_source_detects_snapshot(tmp_path: Path) -> None:
    snap = (
        tmp_path
        / "models--Systran--faster-whisper-small.en"
        / "snapshots"
        / "abc"
    )
    snap.mkdir(parents=True)
    (snap / "config.json").write_text("{}", encoding="utf-8")
    assert whisper_weights_source(tmp_path, "Systran/faster-whisper-small.en") == "cache"
    assert whisper_weights_source(tmp_path, "missing/model") == "download"


def test_resolve_hub_file_prefers_cache(monkeypatch, tmp_path: Path) -> None:
    calls: list[bool] = []

    def fake_download(*, local_files_only: bool, **kwargs):
        del kwargs
        calls.append(local_files_only)
        if local_files_only:
            return str(tmp_path / "model.gguf")
        raise AssertionError("must not hit the Hub when cache exists")

    (tmp_path / "model.gguf").write_bytes(b"gguf")
    monkeypatch.setattr("hub._hf_hub_download", fake_download)
    path, source = resolve_hub_file(
        repo_id="Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        filename="qwen2.5-1.5b-instruct-q4_k_m.gguf",
        cache_dir=tmp_path,
        token=None,
        purpose="LLM",
    )
    assert source == "cache"
    assert path.name == "model.gguf"
    assert calls == [True]


def test_resolve_hub_file_logs_download(monkeypatch, tmp_path: Path, caplog) -> None:
    def fake_download(*, local_files_only: bool, **kwargs):
        del kwargs
        if local_files_only:
            raise FileNotFoundError("not cached")
        return str(tmp_path / "voice.onnx")

    monkeypatch.setattr("hub._hf_hub_download", fake_download)
    with caplog.at_level(logging.INFO, logger="speech-api"):
        path, source = resolve_hub_file(
            repo_id="rhasspy/piper-voices",
            filename="en/en_US/lessac/medium/en_US-lessac-medium.onnx",
            cache_dir=tmp_path,
            token=None,
            purpose="TTS en_US-lessac-medium",
        )
    assert source == "download"
    assert path.name == "voice.onnx"
    assert any("weights=download" in rec.message and "TTS" in rec.message for rec in caplog.records)


def _settings(*, parse_model_id: str | None) -> Settings:
    return Settings(
        host="127.0.0.1",
        port=8090,
        stt_model_id="mock",
        tts_voice="mock",
        parse_model_id=parse_model_id,
        parse_gguf_file="qwen2.5-1.5b-instruct-q4_k_m.gguf",
        cache_dir=Path("."),
        mock=True,
        hf_token=None,
        cors_origins=(),
        stt_device=None,
        stt_compute_type=None,
        tts_voices=("mock",),
    )


def test_startup_logs_stt_tts_llm_status(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="speech-api"):
        with TestClient(create_app(_settings(parse_model_id=DEFAULT_PARSE_MODEL_ID))):
            pass
    messages = [rec.message for rec in caplog.records]
    assert any(m.startswith("STT mock") for m in messages)
    assert any(m.startswith("TTS mock") for m in messages)
    assert any(m.startswith("LLM mock") for m in messages)
    assert any(m.startswith("speech-api ready") and "llm=[mock ready]" in m for m in messages)


def test_startup_logs_llm_off_when_unset(caplog) -> None:
    with caplog.at_level(logging.INFO, logger="speech-api"):
        with TestClient(create_app(_settings(parse_model_id=None))):
            pass
    messages = [rec.message for rec in caplog.records]
    assert any("LLM off" in m and "PARSE_MODEL_ID unset" in m for m in messages)
    assert any(m.startswith("speech-api ready") and "llm=[off]" in m for m in messages)
