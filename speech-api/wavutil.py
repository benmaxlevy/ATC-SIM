"""Tiny WAV helpers. No third-party audio codecs."""

from __future__ import annotations

import io
import math
import struct
import wave


def is_wave(data: bytes) -> bool:
    return len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WAVE"


def write_pcm16_mono_wav(pcm16: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm16)
    return buf.getvalue()


def tone_wav(duration_s: float = 0.25, sample_rate: int = 16000, freq: float = 440.0) -> bytes:
    n = max(1, int(duration_s * sample_rate))
    frames = bytearray()
    for i in range(n):
        sample = int(0.2 * 32767.0 * math.sin(2.0 * math.pi * freq * i / sample_rate))
        frames.extend(struct.pack("<h", sample))
    return write_pcm16_mono_wav(bytes(frames), sample_rate)
