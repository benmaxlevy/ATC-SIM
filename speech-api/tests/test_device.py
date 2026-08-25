"""Qwen STT device, prompt, and deterministic generation behavior."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from config import Settings
from engines import (
    QwenAsrStt,
    _pick_stt_device,
    is_cuda_runtime_error,
)


def _settings(device: str | None = None, cache_dir: Path | None = None) -> Settings:
    return Settings(
        host="127.0.0.1",
        port=8090,
        stt_model_id="Qwen/Qwen3-ASR-1.7B",
        tts_voice="en_US-lessac-medium",
        parse_model_id=None,
        parse_gguf_file="qwen2.5-1.5b-instruct-q4_k_m.gguf",
        cache_dir=cache_dir or Path("."),
        mock=False,
        hf_token=None,
        cors_origins=(),
        stt_device=device,
        tts_voices=("en_US-lessac-medium",),
    )


def test_pytorch_cuda_failure_is_cuda_runtime_error() -> None:
    err = RuntimeError("CUDA error: no kernel image is available")
    assert is_cuda_runtime_error(err) is True
    assert is_cuda_runtime_error(ValueError("empty audio body")) is False


def test_auto_device_cpu_when_torch_cuda_unavailable(monkeypatch) -> None:
    monkeypatch.setattr("engines.torch_cuda_available", lambda: False)
    assert _pick_stt_device(_settings()) == "cpu"


def test_explicit_cuda_falls_back_when_torch_cuda_unavailable(monkeypatch) -> None:
    monkeypatch.setattr("engines.torch_cuda_available", lambda: False)
    assert _pick_stt_device(_settings("cuda")) == "cpu"


def test_explicit_cpu(monkeypatch) -> None:
    monkeypatch.setattr("engines.torch_cuda_available", lambda: True)
    assert _pick_stt_device(_settings("cpu")) == "cpu"


def test_qwen_init_falls_back_after_cuda_load_error(monkeypatch, tmp_path) -> None:
    calls: list[str] = []

    def load(_settings: Settings, device: str, **_kwargs) -> tuple[object, object]:
        calls.append(device)
        if device == "cuda":
            raise RuntimeError("CUDA error: no kernel image is available")
        return SimpleNamespace(dtype="float32"), SimpleNamespace()

    monkeypatch.setattr("engines._pick_stt_device", lambda _s: "cuda")
    monkeypatch.setattr("engines._load_qwen_model", load)
    stt = QwenAsrStt(_settings(cache_dir=tmp_path))
    assert calls == ["cuda", "cpu"]
    assert "device=cpu" in stt.describe()


def test_sanitize_stt_fixes_and_qwen_prompt() -> None:
    from engines import ATC_CALLSIGN_PREFIXES, qwen_stt_prompt, sanitize_stt_fixes, sanitize_stt_procedures

    assert sanitize_stt_fixes("semax, NEMAX, nope!, FI27") == ["SEMAX", "NEMAX", "FI27"]
    assert sanitize_stt_procedures("DEM1=DEMO ONE|SID2") == ["DEM1", "DEMO ONE", "SID2"]
    prior = (
        "Vocabulary context only. Transcribe audio; never repeat this context unless it is spoken. "
        "ATC airline call signs: "
        + ", ".join(ATC_CALLSIGN_PREFIXES)
        + "."
    )
    assert "Spirit" in ATC_CALLSIGN_PREFIXES
    assert qwen_stt_prompt(["SEMAX", "NEMAX"]) == f"{prior} Named ATC fixes: SEMAX NEMAX."
    assert qwen_stt_prompt(["SEMAX"], ["DEM1", "DEMO ONE"]) == (
        f"{prior} Named ATC fixes: SEMAX. Procedures: DEM1 DEMO ONE."
    )
    assert qwen_stt_prompt([]) == prior


def test_qwen_context_echo_is_discarded() -> None:
    from engines import discard_qwen_context_echo, qwen_stt_prompt

    prompt = qwen_stt_prompt(["SEMAX"], ["DEM1"])
    assert discard_qwen_context_echo(prompt, prompt) == ""
    assert discard_qwen_context_echo("ATC airline call signs: Delta, American.", prompt) == ""
    assert discard_qwen_context_echo("Delta one two three turn right heading two seven zero.", prompt).startswith(
        "Delta one two three"
    )


def test_qwen_transcribe_forces_english_and_passes_atc_context(monkeypatch, tmp_path) -> None:
    captured: dict[str, object] = {}

    class _PromptModel:
        processor = SimpleNamespace()

        def transcribe(self, **kwargs):
            captured["request"] = kwargs
            return [SimpleNamespace(text="delta one two three")]

    def load(_settings: Settings, device: str, **_kwargs) -> tuple[object, object]:
        del device
        model = _PromptModel()
        return model, model.processor

    monkeypatch.setattr("engines._pick_stt_device", lambda _s: "cpu")
    monkeypatch.setattr("engines._load_qwen_model", load)
    stt = QwenAsrStt(_settings(cache_dir=tmp_path))
    text, confidence = stt.transcribe(b"RIFF", ["SEMAX", "NEMAX"], ["DEM1", "DEMO ONE"])
    assert text == "delta one two three"
    assert confidence == 1.0
    request = captured["request"]
    assert request["language"] == "English"
    assert request["context"] == (
        "Vocabulary context only. Transcribe audio; never repeat this context unless it is spoken. "
        "ATC airline call signs: Delta, American, United, Southwest, JetBlue, Jet Blue, Alaska, Frontier, "
        "Spirit, FedEx, Fed Ex, Federal Express, UPS, Republic, SkyWest, Sky West, Hawaiian, Air Canada, "
        "Speedbird. Named ATC fixes: SEMAX NEMAX. Procedures: DEM1 DEMO ONE."
    )
