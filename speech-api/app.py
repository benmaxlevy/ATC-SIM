"""Local speech HTTP service: Qwen ASR STT + Piper TTS on our CPU/GPU."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from typing import List, Optional

from pydantic import BaseModel, Field

from config import Settings
from engines import SttEngine, TtsEngine, build_stt, build_tts, sanitize_stt_fixes, sanitize_stt_procedures
from logconfig import configure_logging
from normalizer import normalize_stt_text
from parse_engine import PARSE_CONTRACT_VERSION, ParseEngine, build_parse
from trace_db import TraceBatchPayload, get_db_connection, init_db, insert_trace_batch
from wavutil import is_wave

configure_logging()
log = logging.getLogger("speech-api")


class TtsRequest(BaseModel):
    text: str
    voiceId: str = Field(default="")


class ParseContext(BaseModel):
    """Live-strip + catalog grounding for Path C. No n-best, no STT confidence, no kinematics."""

    callsigns: List[str] = Field(default_factory=list)
    selectedCallsign: Optional[str] = None
    fixes: List[str] = Field(default_factory=list)
    procedures: List[dict] = Field(default_factory=list)
    approaches: List[dict] = Field(default_factory=list)
    airports: List[dict] = Field(default_factory=list)
    routeWindow: Optional[dict] = None
    clearanceLimits: List[dict] = Field(default_factory=list)


class ParseRequest(BaseModel):
    """Path C request. No n-best, no confidence. Optional context is roster + catalog ids."""

    text: str = ""
    source: str = "voice"
    schemaVersion: str = "command-ir-v0"
    context: Optional[ParseContext] = None


def _describe(engine: object | None, fallback: str) -> str:
    if engine is None:
        return fallback
    fn = getattr(engine, "describe", None)
    if callable(fn):
        try:
            return str(fn())
        except Exception:
            return fallback
    return fallback


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings.load()
    cfg.apply_hub_cache()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = cfg
        log.info("speech-api starting mock=%s", cfg.mock)
        try:
            init_db(cfg.trace_db_path)
        except Exception:
            log.exception("failed to initialize trace db at %s", cfg.trace_db_path)
        app.state.stt = build_stt(cfg)
        app.state.tts = build_tts(cfg)
        parse_engine = build_parse(cfg)
        app.state.parse = parse_engine
        if parse_engine is None:
            llm_desc = "off"
        elif parse_engine.ready:
            llm_desc = _describe(parse_engine, "ready")
        else:
            llm_desc = "unavailable"
        log.info(
            "speech-api ready stt=[%s] tts=[%s] llm=[%s]",
            _describe(app.state.stt, cfg.stt_model_id),
            _describe(app.state.tts, cfg.tts_voice),
            llm_desc,
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
            "parseContract": PARSE_CONTRACT_VERSION,
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
        fixes = sanitize_stt_fixes(request.headers.get("x-atc-fixes"))
        procedures = sanitize_stt_procedures(request.headers.get("x-atc-procedures"))
        try:
            result = engine.transcribe(body, fixes, procedures)
        except Exception:
            log.exception("stt inference failed")
            raise HTTPException(status_code=503, detail="STT_FAILED") from None
        text = normalize_stt_text(str(result["text"]), recognized_fixes=fixes)
        metadata = {
            "model": str(result["model"]),
            "audioDurationMs": max(0.0, float(result["audioDurationMs"])),
            "inferenceLatencyMs": max(0.0, float(result["inferenceLatencyMs"])),
            "emptySignal": bool(result["emptySignal"]),
        }
        no_speech = result.get("noSpeechProbability")
        if isinstance(no_speech, (int, float)) and no_speech == no_speech:
            metadata["noSpeechProbability"] = float(no_speech)
        return {"text": text, "metadata": metadata}

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
            if ctx is not None:
                if ctx.get("routeWindow") is None:
                    ctx.pop("routeWindow", None)
                if not ctx.get("clearanceLimits"):
                    ctx.pop("clearanceLimits", None)
            outcome = engine.parse(payload.text, payload.source, payload.schemaVersion, ctx)
        except Exception:
            log.exception("parse failed")
            return JSONResponse(
                status_code=200,
                content={"ok": False, "error": "PARSE_MISS"},
            )
        return JSONResponse(status_code=outcome.http_status, content=outcome.body())

    @app.post("/debug/traces")
    def debug_traces(payload: TraceBatchPayload, request: Request) -> dict:
        cfg: Settings = getattr(request.app.state, "settings", None) or Settings.load()
        conn = get_db_connection(cfg.trace_db_path)
        try:
            inserted = insert_trace_batch(conn, payload)
        finally:
            conn.close()
        return {"ok": True, "inserted": inserted}

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
