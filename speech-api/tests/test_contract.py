import os

# Contract tests must never hit the Hub. Force mock before app import.
os.environ["SPEECH_API_MOCK"] = "1"
os.environ.pop("PARSE_MODEL_ID", None)

import pytest
from fastapi.testclient import TestClient

from app import create_app
from config import Settings
from wavutil import is_wave, tone_wav


@pytest.fixture
def client() -> TestClient:
    settings = Settings.load()
    assert settings.mock
    assert settings.parse_model_id is None
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_health_ok_parse_off(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["sttModel"], str) and body["sttModel"]
    assert isinstance(body["ttsVoice"], str) and body["ttsVoice"]
    assert body["parse"] == "off"


def test_parse_unavailable(client: TestClient) -> None:
    response = client.post(
        "/parse",
        json={
            "text": "delta one two three fly heading two seven zero",
            "source": "voice",
            "schemaVersion": "command-ir-v0",
        },
    )
    assert response.status_code == 503
    body = response.json()
    assert body["ok"] is False
    assert body["error"] == "UNAVAILABLE"


def test_stt_fixture_wav_json_shape(client: TestClient) -> None:
    wav = tone_wav(duration_s=0.1)
    response = client.post("/stt", content=wav, headers={"Content-Type": "audio/wav"})
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["text"], str)
    assert body["text"]
    assert isinstance(body["confidence"], (int, float))
    assert 0.0 <= float(body["confidence"]) <= 1.0


def test_stt_rejects_non_wav(client: TestClient) -> None:
    response = client.post("/stt", content=b"not a wav", headers={"Content-Type": "audio/wav"})
    assert response.status_code == 400


def test_tts_returns_wav(client: TestClient) -> None:
    response = client.post("/tts", json={"text": "heading two seven zero", "voiceId": "mock"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    wav = response.content
    assert len(wav) > 44
    assert is_wave(wav)


def test_cors_vite_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_piper_voice_maps_to_hub_path() -> None:
    from engines import piper_hub_filename

    assert (
        piper_hub_filename("en_US-lessac-medium")
        == "en/en_US/lessac/medium/en_US-lessac-medium.onnx"
    )
