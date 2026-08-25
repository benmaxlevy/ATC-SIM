"""speech-api/.env loading and mandatory Path C defaults."""

from __future__ import annotations

import os
from pathlib import Path

from config import (
    DEFAULT_PARSE_GGUF_FILE,
    DEFAULT_PARSE_MODEL_ID,
    DEFAULT_STT_MODEL_ID,
    Settings,
    load_env_file,
)


def test_load_env_file_sets_missing_keys(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("PARSE_MODEL_ID", raising=False)
    monkeypatch.delenv("PARSE_GGUF_FILE", raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "# comment\n"
        f"export PARSE_MODEL_ID={DEFAULT_PARSE_MODEL_ID}\n"
        f'PARSE_GGUF_FILE="{DEFAULT_PARSE_GGUF_FILE}"\n',
        encoding="utf-8",
    )
    assert load_env_file(env) is True
    assert os.environ["PARSE_MODEL_ID"] == DEFAULT_PARSE_MODEL_ID
    assert os.environ["PARSE_GGUF_FILE"] == DEFAULT_PARSE_GGUF_FILE


def test_empty_parse_model_env_uses_mandatory_default(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PARSE_MODEL_ID", "")
    env = tmp_path / ".env"
    env.write_text("PARSE_MODEL_ID=custom/model\n", encoding="utf-8")
    assert load_env_file(env) is True
    assert os.environ.get("PARSE_MODEL_ID") == ""
    monkeypatch.setattr("config.load_env_file", lambda: False)
    assert Settings.load().parse_model_id == DEFAULT_PARSE_MODEL_ID


def test_missing_parse_model_env_uses_mandatory_default(monkeypatch) -> None:
    monkeypatch.delenv("PARSE_MODEL_ID", raising=False)
    monkeypatch.setattr("config.load_env_file", lambda: False)
    assert Settings.load().parse_model_id == DEFAULT_PARSE_MODEL_ID


def test_load_env_file_missing_returns_false(tmp_path: Path) -> None:
    assert load_env_file(tmp_path / "nope.env") is False


def test_default_stt_model_is_qwen3_asr(monkeypatch) -> None:
    monkeypatch.delenv("STT_MODEL_ID", raising=False)
    monkeypatch.setenv("SPEECH_API_MOCK", "1")
    monkeypatch.setattr("config.load_env_file", lambda: False)
    assert DEFAULT_STT_MODEL_ID == "Qwen/Qwen3-ASR-1.7B"
    assert Settings.load().stt_model_id == DEFAULT_STT_MODEL_ID


def test_env_example_enables_named_qwen_gguf() -> None:
    text = (Path(__file__).resolve().parents[1] / ".env.example").read_text(encoding="utf-8")
    assert f"PARSE_MODEL_ID={DEFAULT_PARSE_MODEL_ID}" in text
    assert f"PARSE_GGUF_FILE={DEFAULT_PARSE_GGUF_FILE}" in text
    assert "mandatory path c" in text.lower()
