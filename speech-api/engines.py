"""Local STT/TTS. Hub = download weights once onto disk; inference is this process."""

from __future__ import annotations

import io
import logging
import os
import re
import tempfile
import time
import wave
from pathlib import Path
from typing import Protocol

from config import Settings
from hub import model_weights_source, resolve_hub_file
from logconfig import configure_logging, elapsed_ms
from wavutil import tone_wav

log = logging.getLogger("speech-api")

# Documented mock transcript so CI and curl examples stay stable.
MOCK_TRANSCRIPT = "delta one two three fly heading two seven zero"

MAX_STT_FIXES = 64
_STT_FIX_RE = re.compile(r"^[A-Z]{2,6}[0-9]{0,2}$")

# Qwen's transcription prompt is a prior, not a parser allowlist.
# Keep every shipped spoken telephony prefix here so ASR preserves carrier words
# such as Spirit instead of replacing them with a phonetically similar token.
ATC_CALLSIGN_PREFIXES = (
    "Delta",
    "American",
    "United",
    "Southwest",
    "JetBlue",
    "Jet Blue",
    "Alaska",
    "Frontier",
    "Spirit",
    "FedEx",
    "Fed Ex",
    "Federal Express",
    "UPS",
    "Republic",
    "SkyWest",
    "Sky West",
    "Hawaiian",
    "Air Canada",
    "Speedbird",
)


def sanitize_stt_fixes(header: str | None) -> list[str]:
    """Catalog ids from `X-ATC-Fixes`. Tiny list; never kinematics or n-best."""
    if not header or not header.strip():
        return []
    out: list[str] = []
    seen: set[str] = set()
    for part in header.split(","):
        up = part.strip().upper()
        if not up or up in seen or _STT_FIX_RE.match(up) is None:
            continue
        seen.add(up)
        out.append(up)
        if len(out) >= MAX_STT_FIXES:
            break
    return out


def qwen_stt_prompt(fixes: list[str], procedures: list[str] | None = None) -> str:
    """Bias Qwen toward radio carrier words and catalog spellings."""
    parts = [
        "Vocabulary context only. Transcribe audio; never repeat this context unless it is spoken. "
        "ATC airline call signs: "
        + ", ".join(ATC_CALLSIGN_PREFIXES)
        + "."
    ]
    if fixes:
        parts.append("Named ATC fixes: " + " ".join(fixes) + ".")
    if procedures:
        parts.append("Procedures: " + " ".join(procedures) + ".")
    return " ".join(parts)


def discard_qwen_context_echo(text: str, prompt: str) -> str:
    """Suppress model output that repeats injected vocabulary instead of radio audio."""
    normalized_text = " ".join(text.lower().split())
    normalized_prompt = " ".join(prompt.lower().split())
    if not normalized_text:
        return ""
    if normalized_text in normalized_prompt:
        return ""
    if "atc airline call signs:" in normalized_text:
        return ""
    return text


def sanitize_stt_procedures(header: str | None) -> list[str]:
    """Labels from `X-ATC-Procedures` (`DEM1=DEMO ONE|…`) for Qwen context."""
    if not header or not header.strip():
        return []
    out: list[str] = []
    seen: set[str] = set()
    for part in header.split("|"):
        chunk = part.strip()
        if not chunk:
            continue
        pid, _, pname = chunk.partition("=")
        pid = pid.strip().upper()
        pname = pname.strip().upper()
        for label in (pid, pname):
            if not label or label in seen:
                continue
            seen.add(label)
            out.append(label)
        if len(out) >= 32:
            break
    return out


class SttEngine(Protocol):
    def transcribe(
        self,
        wav_bytes: bytes,
        fixes: list[str] | None = None,
        procedures: list[str] | None = None,
    ) -> tuple[str, float]:
        """Return (text, confidence 0–1). Missing engine score → 1.0."""


class TtsEngine(Protocol):
    def synthesize(self, text: str, voice_id: str) -> bytes:
        """Return a non-empty mono PCM WAV."""


class MockStt:
    def transcribe(
        self, wav_bytes: bytes, fixes: list[str] | None = None, procedures: list[str] | None = None
    ) -> tuple[str, float]:
        del wav_bytes, fixes, procedures
        return MOCK_TRANSCRIPT, 1.0

    def describe(self) -> str:
        return "mock"


class MockTts:
    def synthesize(self, text: str, voice_id: str) -> bytes:
        del text, voice_id
        return tone_wav()

    def describe(self) -> str:
        return "mock"


def is_cuda_runtime_error(exc: BaseException) -> bool:
    """True when PyTorch cannot execute on the requested CUDA runtime."""
    text = str(exc).lower()
    return any(
        marker in text
        for marker in (
            "cuda",
            "cublas",
            "cudnn",
            "not found or cannot be loaded",
            "no cuda",
        )
    )


def torch_cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def onnx_cuda_available() -> bool:
    try:
        import onnxruntime as ort

        return "CUDAExecutionProvider" in ort.get_available_providers()
    except Exception:
        return False


def _pick_stt_device(settings: Settings) -> str:
    requested = (settings.stt_device or "").strip().lower()
    if requested == "cpu":
        return "cpu"
    elif requested == "cuda":
        if torch_cuda_available():
            return "cuda"
        log.warning("STT_DEVICE=cuda requested but PyTorch CUDA is unavailable; using cpu")
        return "cpu"
    if requested:
        log.warning("Unknown STT_DEVICE=%s; using automatic device selection", requested)
    return "cuda" if torch_cuda_available() else "cpu"


def _load_qwen_model(
    settings: Settings,
    device: str,
    *,
    local_files_only: bool = False,
) -> tuple[object, object]:
    import torch
    from qwen_asr import Qwen3ASRModel

    configure_logging()
    cache = settings.cache_dir / "qwen3-asr"
    cache.mkdir(parents=True, exist_ok=True)
    previous_offline = os.environ.get("HF_HUB_OFFLINE")
    if local_files_only:
        os.environ["HF_HUB_OFFLINE"] = "1"
    try:
        model = Qwen3ASRModel.from_pretrained(
            settings.stt_model_id,
            dtype=torch.bfloat16 if device == "cuda" else torch.float32,
            device_map="cuda:0" if device == "cuda" else "cpu",
            max_inference_batch_size=1,
            max_new_tokens=256,
            token=settings.hf_token,
        )
    finally:
        if previous_offline is None:
            os.environ.pop("HF_HUB_OFFLINE", None)
        else:
            os.environ["HF_HUB_OFFLINE"] = previous_offline
    return model, model.processor


class QwenAsrStt:
    def __init__(self, settings: Settings) -> None:
        t0 = time.perf_counter()
        device = _pick_stt_device(settings)
        cache = settings.cache_dir / "qwen3-asr"
        cache.mkdir(parents=True, exist_ok=True)
        weights = model_weights_source(cache, settings.stt_model_id)
        self._model_id = settings.stt_model_id
        log.info(
            "STT loading model=%s device=%s weights=%s",
            settings.stt_model_id,
            device,
            weights,
        )
        self._model, self._processor, device, weights = self._load_with_fallback(settings, device, weights)
        self._device = device
        self._weights = weights
        self._elapsed_ms = elapsed_ms(t0)
        log.info(
            "STT ready model=%s device=%s weights=%s elapsed_ms=%s",
            self._model_id,
            self._device,
            self._weights,
            self._elapsed_ms,
        )

    def _load_with_fallback(
        self, settings: Settings, device: str, weights: str
    ) -> tuple[object, object, str, str]:
        err = self._assign_model(settings, device, weights == "cache")
        if err is not None and device == "cuda" and is_cuda_runtime_error(err):
            log.warning("CUDA STT failed (%s); falling back to CPU", err)
            device = "cpu"
            err = self._assign_model(settings, device, weights == "cache")
        if err is not None and weights == "cache":
            log.info("STT cache incomplete; downloading model=%s", settings.stt_model_id)
            weights = "download"
            err = self._assign_model(settings, device, False)
        if err is not None:
            raise err
        return self._model, self._processor, device, weights

    def _assign_model(self, settings: Settings, device: str, local_files_only: bool) -> BaseException | None:
        try:
            self._model, self._processor = _load_qwen_model(settings, device, local_files_only=local_files_only)
            return None
        except Exception as exc:
            return exc

    def describe(self) -> str:
        return f"{self._model_id} device={self._device} weights={self._weights} elapsed_ms={self._elapsed_ms}"

    def transcribe(
        self, wav_bytes: bytes, fixes: list[str] | None = None, procedures: list[str] | None = None
    ) -> tuple[str, float]:
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            with open(path, "wb") as handle:
                handle.write(wav_bytes)
            prompt = qwen_stt_prompt(fixes or [], procedures)
            results = self._model.transcribe(
                audio=path,
                context=prompt,
                language="English",
            )
            text = discard_qwen_context_echo(str(results[0].text).strip(), prompt)
            return text, 1.0
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass


def piper_hub_filename(voice_id: str) -> str:
    """Map Piper voice id `en_US-lessac-medium` to rhasspy/piper-voices path."""
    parts = voice_id.split("-")
    if len(parts) < 3:
        raise ValueError(
            f"TTS_VOICE must look like en_US-lessac-medium, got {voice_id!r}"
        )
    locale = parts[0]
    quality = parts[-1]
    name = "-".join(parts[1:-1])
    lang = locale.split("_")[0]
    return f"{lang}/{locale}/{name}/{quality}/{voice_id}.onnx"


def ensure_piper_onnx(voice_id: str, cache_dir: Path, token: str | None) -> tuple[Path, str]:
    # huggingface_hub copies files from the Hub onto disk. Never call InferenceClient
    # or any metered inference endpoint.
    rel = piper_hub_filename(voice_id)
    hub_cache = cache_dir / "hub"
    onnx, source = resolve_hub_file(
        repo_id="rhasspy/piper-voices",
        filename=rel,
        cache_dir=hub_cache,
        token=token,
        purpose=f"TTS {voice_id}",
    )
    resolve_hub_file(
        repo_id="rhasspy/piper-voices",
        filename=f"{rel}.json",
        cache_dir=hub_cache,
        token=token,
        purpose=f"TTS {voice_id} config",
    )
    return onnx, source


class PiperTts:
    def __init__(self, settings: Settings) -> None:
        t0 = time.perf_counter()
        self._default_voice = settings.tts_voice
        self._cache_dir = settings.cache_dir
        self._token = settings.hf_token
        # ONNX CUDA selection is independent from Qwen's PyTorch device.
        self._use_cuda = onnx_cuda_available()
        self._device = "cuda" if self._use_cuda else "cpu"
        self._voices: dict[str, object] = {}
        roster = list(settings.tts_voices)
        if self._default_voice not in roster:
            roster.append(self._default_voice)
        log.info(
            "TTS loading voices=%s device=%s default=%s",
            len(roster),
            self._device,
            self._default_voice,
        )
        for vid in roster:
            try:
                self._load(vid)
            except Exception:
                log.warning("TTS skip voice=%s", vid, exc_info=True)
        if self._default_voice not in self._voices:
            self._load(self._default_voice)
        self._elapsed_ms = elapsed_ms(t0)
        log.info(
            "TTS ready voices=%s/%s device=%s default=%s elapsed_ms=%s",
            len(self._voices),
            len(roster),
            self._device,
            self._default_voice,
            self._elapsed_ms,
        )

    def describe(self) -> str:
        return (
            f"{len(self._voices)} voices device={self._device} "
            f"default={self._default_voice} elapsed_ms={self._elapsed_ms}"
        )

    def _load(self, voice_id: str) -> None:
        from piper import PiperVoice

        onnx, _source = ensure_piper_onnx(voice_id, self._cache_dir, self._token)
        try:
            self._voices[voice_id] = PiperVoice.load(str(onnx), use_cuda=self._use_cuda)
        except TypeError:
            self._voices[voice_id] = PiperVoice.load(str(onnx))

    def synthesize(self, text: str, voice_id: str) -> bytes:
        vid = (voice_id or "").strip() or self._default_voice
        if vid not in self._voices:
            self._load(vid)
        voice = self._voices[vid]
        spoken = text if text.strip() else " "
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            synthesize_wav = getattr(voice, "synthesize_wav", None)
            if callable(synthesize_wav):
                synthesize_wav(spoken, wf)
            else:
                voice.synthesize(spoken, wf)
        wav = buf.getvalue()
        if len(wav) < 44:
            raise RuntimeError("piper produced an empty WAV")
        return wav


def build_stt(settings: Settings) -> SttEngine:
    if settings.mock:
        log.info("STT mock (SPEECH_API_MOCK=1)")
        return MockStt()
    return QwenAsrStt(settings)


def build_tts(settings: Settings) -> TtsEngine:
    if settings.mock:
        log.info("TTS mock (SPEECH_API_MOCK=1)")
        return MockTts()
    return PiperTts(settings)
