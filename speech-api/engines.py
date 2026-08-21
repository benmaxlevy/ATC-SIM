"""Local STT/TTS. Hub = download weights once onto disk; inference is this process."""

from __future__ import annotations

import io
import logging
import math
import os
import tempfile
import time
import wave
from pathlib import Path
from typing import Protocol

from config import Settings
from hub import resolve_hub_file, whisper_weights_source
from logconfig import configure_logging, elapsed_ms
from wavutil import tone_wav

log = logging.getLogger("speech-api")

# Documented mock transcript so CI and curl examples stay stable.
MOCK_TRANSCRIPT = "delta one two three fly heading two seven zero"


def avg_logprob_to_confidence(avg_logprob: float) -> float:
    """Map Whisper avg_logprob (typically -1.2..0) onto 0–1.

    ``exp(avg_logprob)`` is too harsh against the 0.55 say-again gate
    (a usable ``-0.7`` becomes 0.50). Linear map: 0 → 1.0, -1.0 → 0.50, -2 → 0.
    """
    if not math.isfinite(avg_logprob):
        return 1.0
    return max(0.0, min(1.0, 1.0 + avg_logprob / 2.0))


class SttEngine(Protocol):
    def transcribe(self, wav_bytes: bytes) -> tuple[str, float]:
        """Return (text, confidence 0–1). Missing engine score → 1.0."""


class TtsEngine(Protocol):
    def synthesize(self, text: str, voice_id: str) -> bytes:
        """Return a non-empty mono PCM WAV."""


class MockStt:
    def transcribe(self, wav_bytes: bytes) -> tuple[str, float]:
        del wav_bytes
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
    """True when CTranslate2/ONNX asked for CUDA but the toolkit DLLs are missing."""
    text = str(exc).lower()
    return "cublas" in text or "cudnn" in text or "not found or cannot be loaded" in text


_WINDOWS_CUDA_DLLS_PREPARED = False


def windows_cuda12_bin_dirs() -> list[Path]:
    """Directories that contain CUDA 12 cuBLAS (`cublas64_12.dll`).

    Cursor/uvicorn often start with a stale PATH: the toolkit is installed and
    ``nvcc`` works in a new shell, but this process never got ``CUDA_PATH``.
    Python 3.8+ also will not load dependent CUDA DLLs from PATH unless
    ``os.add_dll_directory`` is used.
    """
    found: list[Path] = []
    seen: set[str] = set()

    def add(bin_dir: Path) -> None:
        try:
            key = str(bin_dir.resolve())
        except OSError:
            key = str(bin_dir)
        if key in seen:
            return
        if (bin_dir / "cublas64_12.dll").is_file():
            seen.add(key)
            found.append(bin_dir)

    env = (os.environ.get("CUDA_PATH") or "").strip()
    if env:
        add(Path(env) / "bin")
    if os.name == "nt":
        toolkit = Path(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA")
        if toolkit.is_dir():
            versions = sorted((p for p in toolkit.iterdir() if p.is_dir()), key=lambda p: p.name, reverse=True)
            for ver in versions:
                add(ver / "bin")
    return found


def prepare_windows_cuda_dlls() -> None:
    """Put CUDA 12 ``bin`` on PATH and the Win32 DLL search path (once)."""
    global _WINDOWS_CUDA_DLLS_PREPARED
    if os.name != "nt" or _WINDOWS_CUDA_DLLS_PREPARED:
        return
    bins = windows_cuda12_bin_dirs()
    extra = os.pathsep.join(str(p) for p in bins)
    if extra:
        os.environ["PATH"] = extra + os.pathsep + os.environ.get("PATH", "")
        if not (os.environ.get("CUDA_PATH") or "").strip() and bins:
            os.environ["CUDA_PATH"] = str(bins[0].parent)
    add_dir = getattr(os, "add_dll_directory", None)
    if add_dir is not None:
        for p in bins:
            try:
                add_dir(str(p))
            except OSError:
                pass
    _WINDOWS_CUDA_DLLS_PREPARED = True


def cublas12_available() -> bool:
    """CTranslate2 CUDA 12 builds need this lib at *inference*, not just a GPU driver."""
    import ctypes

    prepare_windows_cuda_dlls()
    if os.name == "nt":
        for bin_dir in windows_cuda12_bin_dirs():
            dll = bin_dir / "cublas64_12.dll"
            try:
                ctypes.WinDLL(str(dll))
                return True
            except OSError:
                continue
        try:
            ctypes.WinDLL("cublas64_12.dll")
            return True
        except OSError:
            return False
    for name in ("libcublas.so.12", "libcublas.so"):
        try:
            ctypes.CDLL(name)
            return True
        except OSError:
            continue
    return False


def ctranslate2_cuda_ready() -> bool:
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() <= 0:
            return False
    except Exception:
        return False
    if not cublas12_available():
        log.warning(
            "GPU visible but CUDA 12 cublas is missing (Windows: cublas64_12.dll); STT will use CPU. "
            "Install the CUDA 12 runtime or set STT_DEVICE=cpu."
        )
        return False
    return True


def onnx_cuda_available() -> bool:
    try:
        import onnxruntime as ort

        return "CUDAExecutionProvider" in ort.get_available_providers()
    except Exception:
        return False


def _pick_stt_device(settings: Settings) -> tuple[str, str]:
    requested = (settings.stt_device or "").strip().lower()
    if requested == "cpu":
        device = "cpu"
    elif requested == "cuda":
        device = "cuda" if ctranslate2_cuda_ready() else "cpu"
        if device == "cpu":
            log.warning("STT_DEVICE=cuda requested but CUDA 12 runtime is not usable; using cpu")
    elif requested:
        device = requested
    else:
        device = "cuda" if ctranslate2_cuda_ready() else "cpu"
    if settings.stt_compute_type:
        compute = settings.stt_compute_type
    else:
        compute = "float16" if device == "cuda" else "int8"
    return device, compute


def _load_whisper_model(
    settings: Settings,
    device: str,
    compute_type: str,
    *,
    local_files_only: bool = False,
) -> object:
    from faster_whisper import WhisperModel

    configure_logging()
    cache = settings.cache_dir / "faster-whisper"
    cache.mkdir(parents=True, exist_ok=True)
    return WhisperModel(
        settings.stt_model_id,
        device=device,
        compute_type=compute_type,
        download_root=str(cache),
        local_files_only=local_files_only,
        use_auth_token=settings.hf_token,
    )


class FasterWhisperStt:
    def __init__(self, settings: Settings) -> None:
        t0 = time.perf_counter()
        device, compute_type = _pick_stt_device(settings)
        cache = settings.cache_dir / "faster-whisper"
        cache.mkdir(parents=True, exist_ok=True)
        weights = whisper_weights_source(cache, settings.stt_model_id)
        self._model_id = settings.stt_model_id
        log.info(
            "STT loading model=%s device=%s compute=%s weights=%s",
            settings.stt_model_id,
            device,
            compute_type,
            weights,
        )
        self._model, device, compute_type, weights = self._load_with_fallback(
            settings, device, compute_type, weights
        )
        self._device = device
        self._compute = compute_type
        self._weights = weights
        self._elapsed_ms = elapsed_ms(t0)
        log.info(
            "STT ready model=%s device=%s compute=%s weights=%s elapsed_ms=%s",
            self._model_id,
            self._device,
            self._compute,
            self._weights,
            self._elapsed_ms,
        )

    def _load_with_fallback(
        self, settings: Settings, device: str, compute_type: str, weights: str
    ) -> tuple[object, str, str, str]:
        err = self._assign_model(settings, device, compute_type, weights == "cache")
        if err is not None and device == "cuda" and is_cuda_runtime_error(err):
            log.warning("CUDA STT failed (%s); falling back to CPU", err)
            device, compute_type = "cpu", "int8"
            err = self._assign_model(settings, device, compute_type, weights == "cache")
        if err is not None and weights == "cache":
            log.info("STT cache incomplete; downloading model=%s", settings.stt_model_id)
            weights = "download"
            err = self._assign_model(settings, device, compute_type, False)
        if err is not None:
            raise err
        return self._model, device, compute_type, weights

    def _assign_model(
        self, settings: Settings, device: str, compute_type: str, local_files_only: bool
    ) -> BaseException | None:
        try:
            self._model = _load_whisper_model(
                settings, device, compute_type, local_files_only=local_files_only
            )
            if device == "cuda":
                self._probe_cuda()
            return None
        except Exception as exc:
            return exc

    def describe(self) -> str:
        return (
            f"{self._model_id} device={self._device} compute={self._compute} "
            f"weights={self._weights} elapsed_ms={self._elapsed_ms}"
        )

    def _probe_cuda(self) -> None:
        """Encode once at boot so a missing cublas DLL does not 500 the first PTT."""
        self.transcribe(tone_wav(duration_s=0.05))

    def transcribe(self, wav_bytes: bytes) -> tuple[str, float]:
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            with open(path, "wb") as handle:
                handle.write(wav_bytes)
            segments, _info = self._model.transcribe(
                path,
                beam_size=5,
                language="en",
                condition_on_previous_text=False,
            )
            texts: list[str] = []
            logprobs: list[float] = []
            for seg in segments:
                piece = (seg.text or "").strip()
                if piece:
                    texts.append(piece)
                lp = getattr(seg, "avg_logprob", None)
                if isinstance(lp, (int, float)):
                    logprobs.append(float(lp))
            text = " ".join(texts)
            if not logprobs:
                return text, 1.0
            avg = sum(logprobs) / len(logprobs)
            return text, avg_logprob_to_confidence(avg)
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
        # ONNX CUDA is independent of CTranslate2. Driver-only machines warn and use CPU.
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
    return FasterWhisperStt(settings)


def build_tts(settings: Settings) -> TtsEngine:
    if settings.mock:
        log.info("TTS mock (SPEECH_API_MOCK=1)")
        return MockTts()
    return PiperTts(settings)
