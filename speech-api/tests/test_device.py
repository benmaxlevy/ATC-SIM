"""CUDA auto-detect must not pick a GPU when cublas is missing (Windows driver-only)."""

from __future__ import annotations

from pathlib import Path

from config import Settings
from engines import (
    FasterWhisperStt,
    _pick_stt_device,
    is_cuda_runtime_error,
)


def _settings(device: str | None = None, cache_dir: Path | None = None) -> Settings:
    return Settings(
        host="127.0.0.1",
        port=8090,
        stt_model_id="Systran/faster-whisper-base.en",
        tts_voice="en_US-lessac-medium",
        parse_model_id=None,
        parse_gguf_file="qwen2.5-1.5b-instruct-q4_k_m.gguf",
        cache_dir=cache_dir or Path("."),
        mock=False,
        hf_token=None,
        cors_origins=(),
        stt_device=device,
        stt_compute_type=None,
        tts_voices=("en_US-lessac-medium",),
    )


def test_windows_cuda12_bin_dirs_finds_cublas(tmp_path, monkeypatch) -> None:
    from engines import windows_cuda12_bin_dirs

    root = tmp_path / "CUDA" / "v12.6" / "bin"
    root.mkdir(parents=True)
    (root / "cublas64_12.dll").write_bytes(b"")
    monkeypatch.setenv("CUDA_PATH", str(tmp_path / "CUDA" / "v12.6"))
    dirs = windows_cuda12_bin_dirs()
    assert any(p.resolve() == root.resolve() for p in dirs)


def test_cublas_missing_is_cuda_runtime_error() -> None:
    err = RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")
    assert is_cuda_runtime_error(err) is True
    assert is_cuda_runtime_error(ValueError("empty audio body")) is False


def test_auto_device_cpu_when_cublas_missing(monkeypatch) -> None:
    monkeypatch.setattr("engines.ctranslate2_cuda_ready", lambda: False)
    assert _pick_stt_device(_settings()) == ("cpu", "int8")


def test_explicit_cuda_falls_back_when_runtime_unusable(monkeypatch) -> None:
    monkeypatch.setattr("engines.ctranslate2_cuda_ready", lambda: False)
    assert _pick_stt_device(_settings("cuda")) == ("cpu", "int8")


def test_explicit_cpu(monkeypatch) -> None:
    monkeypatch.setattr("engines.ctranslate2_cuda_ready", lambda: True)
    assert _pick_stt_device(_settings("cpu")) == ("cpu", "int8")


class _OkModel:
    def transcribe(self, path, **kwargs):
        del path, kwargs
        return iter(()), None


def test_whisper_init_falls_back_after_cublas_load_error(monkeypatch, tmp_path) -> None:
    calls: list[str] = []

    def load(_settings: Settings, device: str, compute_type: str, **_kwargs) -> object:
        del compute_type
        calls.append(device)
        if device == "cuda":
            raise RuntimeError("Library cublas64_12.dll is not found or cannot be loaded")
        return _OkModel()

    monkeypatch.setattr("engines._pick_stt_device", lambda _s: ("cuda", "float16"))
    monkeypatch.setattr("engines._load_whisper_model", load)
    stt = FasterWhisperStt(_settings(cache_dir=tmp_path))
    assert calls == ["cuda", "cpu"]
    assert "device=cpu" in stt.describe()
    text, confidence = stt.transcribe(b"RIFF")
    assert text == ""
    assert confidence == 1.0


def test_sanitize_stt_fixes_and_whisper_prompt() -> None:
    from engines import sanitize_stt_fixes, sanitize_stt_procedures, whisper_fix_prompt

    assert sanitize_stt_fixes("semax, NEMAX, nope!, FI27") == ["SEMAX", "NEMAX", "FI27"]
    assert sanitize_stt_procedures("DEM1=DEMO ONE|SID2") == ["DEM1", "DEMO ONE", "SID2"]
    assert whisper_fix_prompt(["SEMAX", "NEMAX"]) == "Named ATC fixes: SEMAX NEMAX."
    assert whisper_fix_prompt(["SEMAX"], ["DEM1", "DEMO ONE"]) == (
        "Named ATC fixes: SEMAX. Procedures: DEM1 DEMO ONE."
    )
    assert whisper_fix_prompt([]) is None


def test_whisper_transcribe_passes_initial_prompt(monkeypatch, tmp_path) -> None:
    captured: dict[str, object] = {}

    class _PromptModel:
        def transcribe(self, path, **kwargs):
            del path
            captured.clear()
            captured.update(kwargs)
            return iter(()), None

    def load(_settings: Settings, device: str, compute_type: str, **_kwargs) -> object:
        del device, compute_type
        return _PromptModel()

    monkeypatch.setattr("engines._pick_stt_device", lambda _s: ("cpu", "int8"))
    monkeypatch.setattr("engines._load_whisper_model", load)
    stt = FasterWhisperStt(_settings(cache_dir=tmp_path))
    stt.transcribe(b"RIFF", ["SEMAX", "NEMAX"])
    assert captured["initial_prompt"] == "Named ATC fixes: SEMAX NEMAX."
    assert captured["condition_on_previous_text"] is False
    stt.transcribe(b"RIFF")
    assert "initial_prompt" not in captured
