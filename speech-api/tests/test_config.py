"""speech-api/.env loading. Process env wins; tests pin PARSE_MODEL_ID empty."""

from __future__ import annotations

import os
from pathlib import Path

from config import DEFAULT_PARSE_MODEL_ID, load_env_file


def test_load_env_file_sets_missing_keys(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("PARSE_MODEL_ID", raising=False)
    monkeypatch.delenv("PARSE_GGUF_FILE", raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "# comment\n"
        "export PARSE_MODEL_ID=Qwen/Qwen2.5-1.5B-Instruct-GGUF\n"
        'PARSE_GGUF_FILE="qwen2.5-1.5b-instruct-q4_k_m.gguf"\n',
        encoding="utf-8",
    )
    assert load_env_file(env) is True
    assert os.environ["PARSE_MODEL_ID"] == DEFAULT_PARSE_MODEL_ID
    assert os.environ["PARSE_GGUF_FILE"] == "qwen2.5-1.5b-instruct-q4_k_m.gguf"


def test_load_env_file_does_not_override_process_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PARSE_MODEL_ID", "")
    env = tmp_path / ".env"
    env.write_text(f"PARSE_MODEL_ID={DEFAULT_PARSE_MODEL_ID}\n", encoding="utf-8")
    assert load_env_file(env) is True
    assert os.environ.get("PARSE_MODEL_ID") == ""


def test_load_env_file_missing_returns_false(tmp_path: Path) -> None:
    assert load_env_file(tmp_path / "nope.env") is False


def test_env_example_enables_named_qwen_gguf() -> None:
    text = (Path(__file__).resolve().parents[1] / ".env.example").read_text(encoding="utf-8")
    assert f"PARSE_MODEL_ID={DEFAULT_PARSE_MODEL_ID}" in text
    assert "PARSE_GGUF_FILE=qwen2.5-1.5b-instruct-q4_k_m.gguf" in text
    assert "not a 7B" in text
