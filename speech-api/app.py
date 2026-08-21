"""Local speech HTTP service: Whisper STT + Piper TTS on our CPU/GPU."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from typing import List, Optional

from pydantic import BaseModel, Field

from config import Settings
from engines import SttEngine, TtsEngine, build_stt, build_tts
from parse_engine import ParseEngine, build_parse
from wavutil import is_wave

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("speech-api")


class TtsRequest(BaseModel):
    text: str
    voiceId: str = Field(default="")


class ParseContext(BaseModel):
    """Live-strip grounding for Path C. No n-best, no STT confidence, no kinematics."""

    callsigns: List[str] = Field(default_factory=list)
    selectedCallsign: Optional[str] = None


class ParseRequest(BaseModel):
    """Path C request. No n-best, no confidence. Optional context is the live roster."""

    text: str = ""
    source: str = "voice"
    schemaVersion: str = "command-ir-v0"
    context: Optional[ParseContext] = None


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings.load()
    cfg.apply_hub_cache()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = cfg
        app.state.stt = build_stt(cfg)
        app.state.tts = build_tts(cfg)
        parse_engine = build_parse(cfg)
        app.state.parse = parse_engine
        parse_status = "ready" if parse_engine is not None and parse_engine.ready else "off"
        log.info(
            "speech-api ready mock=%s stt=%s tts=%s parse=%s model=%s bind later via HOST/PORT",
            cfg.mock,
            cfg.stt_model_id,
            cfg.tts_voice,
            parse_status,
            cfg.parse_model_id,
        )
        yield

    app = FastAPI(title="ATC-SIM speech-api", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cfg.cors_origins),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health(request: Request) -> dict:
        engine: ParseEngine | None = getattr(request.app.state, "parse", None)
        parse_status = "ready" if engine is not None and engine.ready else "off"
        return {
            "ok": True,
            "sttModel": cfg.stt_model_id,
            "ttsVoice": cfg.tts_voice,
            "parse": parse_status,
        }

    @app.post("/stt")
    async def stt(request: Request) -> dict:
        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="empty audio body")
        if not is_wave(body):
            raise HTTPException(status_code=400, detail="body must be audio/wav")
        # Do not log raw audio — only byte length.
        log.info("stt request bytes=%s", len(body))
        engine: SttEngine = request.app.state.stt
        try:
            text, confidence = engine.transcribe(body)
        except Exception:
            log.exception("stt inference failed")
            raise HTTPException(status_code=503, detail="STT_FAILED") from None
        if not isinstance(confidence, (int, float)) or confidence != confidence:
            confidence = 1.0
        return {"text": str(text), "confidence": float(confidence)}

    @app.post("/tts")
    async def tts(payload: TtsRequest, request: Request) -> Response:
        log.info("tts request chars=%s voiceId=%s", len(payload.text), payload.voiceId or cfg.tts_voice)
        engine: TtsEngine = request.app.state.tts
        try:
            wav = engine.synthesize(payload.text, payload.voiceId)
        except Exception:
            log.exception("tts inference failed")
            raise HTTPException(status_code=503, detail="TTS_FAILED") from None
        if not wav:
            raise HTTPException(status_code=503, detail="TTS_FAILED")
        return Response(content=wav, media_type="audio/wav")

    @app.post("/parse")
    def parse(payload: ParseRequest, request: Request) -> JSONResponse:
        engine: ParseEngine | None = getattr(request.app.state, "parse", None)
        if engine is None or not engine.ready:
            return JSONResponse(
                status_code=503,
                content={"ok": False, "error": "UNAVAILABLE"},
            )
        try:
            ctx = payload.context.model_dump() if payload.context is not None else None
            outcome = engine.parse(payload.text, payload.source, payload.schemaVersion, ctx)
        except Exception:
            log.exception("parse failed")
            return JSONResponse(
                status_code=200,
                content={"ok": False, "error": "PARSE_MISS"},
            )
        return JSONResponse(status_code=outcome.http_status, content=outcome.body())

    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = Settings.load()
    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
