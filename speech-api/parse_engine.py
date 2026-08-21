"""Optional Path C: local instruct GGUF → Command IR JSON.

Inference is this process (llama.cpp). Hugging Face Hub is a one-time weight
download. Never call OpenAI, Groq, Anthropic, or Hugging Face Inference.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Protocol

from config import DEFAULT_PARSE_GGUF_FILE, DEFAULT_PARSE_MODEL_ID, Settings

log = logging.getLogger("speech-api")

SCHEMA_VERSION = "command-ir-v0"

INSTRUCTION_TYPES = frozenset(
    {
        "FLY_HEADING",
        "TURN_DEGREES",
        "PRESENT_HEADING",
        "ALTITUDE",
        "SPEED",
        "DIRECT",
        "EXPECT_APPROACH",
        "CLEARED_APPROACH",
        "IDENT",
        "SAY_HEADING",
        "SAY_ALTITUDE",
    }
)

TURN_DIRS = frozenset({"LEFT", "RIGHT", "SHORTEST"})
TURN_DEGREES_DIRS = frozenset({"LEFT", "RIGHT"})
ALTITUDE_VERBS = frozenset({"CLIMB", "DESCEND", "MAINTAIN"})
SPEED_VERBS = frozenset({"MAINTAIN", "INCREASE", "REDUCE"})

# Constrained JSON / GBNF target (Command IR v0). Loaded from parse_grammar.gbnf.
GRAMMAR_PATH = Path(__file__).resolve().parent / "parse_grammar.gbnf"

SYSTEM_PROMPT = """You convert air-traffic control radio into JSON only. No prose. No markdown.

The JSON object must be:
{"ok": true, "callsignToken": string-or-null, "instructions": Instruction[]}

Instruction is exactly one of these frozen Command IR v0 types (no other "type"):
- {"type": "FLY_HEADING", "headingDeg": number, "turn": "LEFT"|"RIGHT"|"SHORTEST"}
- {"type": "TURN_DEGREES", "direction": "LEFT"|"RIGHT", "degrees": number}
- {"type": "PRESENT_HEADING"}
- {"type": "ALTITUDE", "altitudeFt": number, "verb": "CLIMB"|"DESCEND"|"MAINTAIN", "expedite"?: boolean}
- {"type": "SPEED", "speedKt": number, "verb": "MAINTAIN"|"INCREASE"|"REDUCE"}
- {"type": "DIRECT", "fixId": string}
- {"type": "EXPECT_APPROACH", "approachId": string}
- {"type": "CLEARED_APPROACH", "approachId": string}
- {"type": "IDENT"}
- {"type": "SAY_HEADING"}
- {"type": "SAY_ALTITUDE"}

Rules:
- Output JSON only. If you cannot map the text, output {"ok": false, "error": "PARSE_MISS"}.
- Do not invent types (no CHAT, no conversation). Do not apply intent. Do not write a readback.
- callsignToken is an ICAO callsign like DAL123, or null if none was spoken.
- source is a hint (keyboard tokens vs ASR English), not a second schema.
"""

# Documented mock success (CI / SPEECH_API_MOCK=1). Matches parse-pipeline.md.
MOCK_PARSE_OK = {
    "ok": True,
    "callsignToken": None,
    "instructions": [{"type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT"}],
}


class ParseOutcome:
    __slots__ = ("ok", "error", "callsign_token", "instructions", "http_status")

    def __init__(
        self,
        *,
        ok: bool,
        error: str | None = None,
        callsign_token: str | None = None,
        instructions: list[dict[str, Any]] | None = None,
        http_status: int = 200,
    ) -> None:
        self.ok = ok
        self.error = error
        self.callsign_token = callsign_token
        self.instructions = instructions or []
        self.http_status = http_status

    def body(self) -> dict[str, Any]:
        if self.ok:
            return {
                "ok": True,
                "callsignToken": self.callsign_token,
                "instructions": self.instructions,
            }
        return {"ok": False, "error": self.error or "PARSE_MISS"}


class ParseEngine(Protocol):
    ready: bool

    def parse(self, text: str, source: str, schema_version: str) -> ParseOutcome: ...


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and value not in (
        float("inf"),
        float("-inf"),
    )


def _as_number(value: object) -> int | float:
    n = float(value)  # type: ignore[arg-type]
    if n.is_integer():
        return int(n)
    return n


def _exact_keys(obj: dict[str, Any], required: set[str], optional: set[str] | None = None) -> bool:
    allowed = required | (optional or set())
    return required.issubset(obj.keys()) and set(obj.keys()).issubset(allowed)


def validate_instruction(raw: object) -> dict[str, Any] | None:
    """Closed Command IR v0 check. Illegal type (e.g. CHAT) → None."""
    if not isinstance(raw, dict):
        return None
    instr_type = raw.get("type")
    if instr_type not in INSTRUCTION_TYPES:
        return None
    if instr_type == "FLY_HEADING":
        if not _exact_keys(raw, {"type", "headingDeg", "turn"}):
            return None
        if not _is_finite_number(raw["headingDeg"]) or raw["turn"] not in TURN_DIRS:
            return None
        return {"type": "FLY_HEADING", "headingDeg": _as_number(raw["headingDeg"]), "turn": raw["turn"]}
    if instr_type == "TURN_DEGREES":
        if not _exact_keys(raw, {"type", "direction", "degrees"}):
            return None
        if raw["direction"] not in TURN_DEGREES_DIRS or not _is_finite_number(raw["degrees"]):
            return None
        return {
            "type": "TURN_DEGREES",
            "direction": raw["direction"],
            "degrees": _as_number(raw["degrees"]),
        }
    if instr_type == "PRESENT_HEADING":
        if not _exact_keys(raw, {"type"}):
            return None
        return {"type": "PRESENT_HEADING"}
    if instr_type == "ALTITUDE":
        if not _exact_keys(raw, {"type", "altitudeFt", "verb"}, {"expedite"}):
            return None
        if not _is_finite_number(raw["altitudeFt"]) or raw["verb"] not in ALTITUDE_VERBS:
            return None
        out: dict[str, Any] = {
            "type": "ALTITUDE",
            "altitudeFt": _as_number(raw["altitudeFt"]),
            "verb": raw["verb"],
        }
        if "expedite" in raw:
            if not isinstance(raw["expedite"], bool):
                return None
            out["expedite"] = raw["expedite"]
        return out
    if instr_type == "SPEED":
        if not _exact_keys(raw, {"type", "speedKt", "verb"}):
            return None
        if not _is_finite_number(raw["speedKt"]) or raw["verb"] not in SPEED_VERBS:
            return None
        return {"type": "SPEED", "speedKt": _as_number(raw["speedKt"]), "verb": raw["verb"]}
    if instr_type == "DIRECT":
        if not _exact_keys(raw, {"type", "fixId"}) or not isinstance(raw["fixId"], str) or not raw["fixId"]:
            return None
        return {"type": "DIRECT", "fixId": raw["fixId"]}
    if instr_type == "EXPECT_APPROACH":
        if (
            not _exact_keys(raw, {"type", "approachId"})
            or not isinstance(raw["approachId"], str)
            or not raw["approachId"]
        ):
            return None
        return {"type": "EXPECT_APPROACH", "approachId": raw["approachId"]}
    if instr_type == "CLEARED_APPROACH":
        if (
            not _exact_keys(raw, {"type", "approachId"})
            or not isinstance(raw["approachId"], str)
            or not raw["approachId"]
        ):
            return None
        return {"type": "CLEARED_APPROACH", "approachId": raw["approachId"]}
    if instr_type == "IDENT":
        if not _exact_keys(raw, {"type"}):
            return None
        return {"type": "IDENT"}
    if instr_type == "SAY_HEADING":
        if not _exact_keys(raw, {"type"}):
            return None
        return {"type": "SAY_HEADING"}
    if instr_type == "SAY_ALTITUDE":
        if not _exact_keys(raw, {"type"}):
            return None
        return {"type": "SAY_ALTITUDE"}
    return None


def extract_json_object(text: str) -> object | None:
    raw = text.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        inner = [ln for ln in lines[1:] if ln.strip() != "```"]
        raw = "\n".join(inner).strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return None


def validate_parse_json(payload: object) -> ParseOutcome:
    """Closed schema. Prose / illegal type / empty list → SCHEMA (not 500)."""
    if not isinstance(payload, dict):
        return ParseOutcome(ok=False, error="SCHEMA")
    if payload.get("ok") is False:
        err = payload.get("error")
        if err in {"UNAVAILABLE", "PARSE_MISS", "SCHEMA"}:
            return ParseOutcome(ok=False, error=str(err))
        return ParseOutcome(ok=False, error="PARSE_MISS")
    if "instructions" not in payload:
        return ParseOutcome(ok=False, error="SCHEMA")
    token = payload.get("callsignToken", None)
    if token is not None and not isinstance(token, str):
        return ParseOutcome(ok=False, error="SCHEMA")
    if isinstance(token, str) and token.strip() == "":
        token = None
    raw_list = payload.get("instructions")
    if not isinstance(raw_list, list) or len(raw_list) == 0:
        return ParseOutcome(ok=False, error="SCHEMA")
    instructions: list[dict[str, Any]] = []
    for item in raw_list:
        checked = validate_instruction(item)
        if checked is None:
            return ParseOutcome(ok=False, error="SCHEMA")
        instructions.append(checked)
    return ParseOutcome(ok=True, callsign_token=token, instructions=instructions)


class MockParseEngine:
    """CI / SPEECH_API_MOCK=1. No GGUF download. JSON shape + SCHEMA coverage."""

    ready = True

    def parse(self, text: str, source: str, schema_version: str) -> ParseOutcome:
        del source
        if schema_version != SCHEMA_VERSION:
            return ParseOutcome(ok=False, error="SCHEMA")
        stripped = text.strip()
        if stripped == "":
            return ParseOutcome(ok=False, error="PARSE_MISS")
        # Explicit SCHEMA trigger so CI does not need a real model.
        if "[SCHEMA]" in stripped.upper() or stripped.upper().startswith("CHAT"):
            return ParseOutcome(ok=False, error="SCHEMA")
        return ParseOutcome(
            ok=True,
            callsign_token=MOCK_PARSE_OK["callsignToken"],  # type: ignore[arg-type]
            instructions=list(MOCK_PARSE_OK["instructions"]),  # type: ignore[arg-type]
        )


def _ensure_gguf(settings: Settings) -> Path:
    model_id = settings.parse_model_id
    if not model_id:
        raise RuntimeError("PARSE_MODEL_ID unset")
    local = Path(model_id)
    if local.is_file() and local.suffix.lower() == ".gguf":
        return local
    # huggingface_hub copies the GGUF onto disk once. Never InferenceClient.
    from huggingface_hub import hf_hub_download

    filename = settings.parse_gguf_file or DEFAULT_PARSE_GGUF_FILE
    cache = settings.cache_dir / "hub"
    cache.mkdir(parents=True, exist_ok=True)
    log.info("downloading parse GGUF repo=%s file=%s (one-time Hub copy)", model_id, filename)
    path = hf_hub_download(
        repo_id=model_id,
        filename=filename,
        cache_dir=str(cache),
        token=settings.hf_token,
    )
    return Path(path)


def _load_grammar() -> object | None:
    try:
        from llama_cpp import LlamaGrammar
    except ImportError:
        return None
    if not GRAMMAR_PATH.is_file():
        return None
    try:
        return LlamaGrammar.from_string(GRAMMAR_PATH.read_text(encoding="utf-8"))
    except Exception:
        log.warning("failed to load Path C GBNF; unconstrained JSON extract will be used")
        return None


class LlamaParseEngine:
    """Local llama.cpp instruct model. CPU OK, slow OK. Not a 7B default."""

    def __init__(self, settings: Settings) -> None:
        from llama_cpp import Llama

        gguf = _ensure_gguf(settings)
        n_gpu = int(os.environ.get("PARSE_N_GPU_LAYERS", "0"))
        n_ctx = int(os.environ.get("PARSE_CTX", "2048"))
        n_threads_raw = os.environ.get("PARSE_N_THREADS", "").strip()
        kwargs: dict[str, Any] = {
            "model_path": str(gguf),
            "n_ctx": n_ctx,
            "n_gpu_layers": n_gpu,
            "chat_format": "chatml",
            "verbose": False,
        }
        if n_threads_raw:
            kwargs["n_threads"] = int(n_threads_raw)
        log.info(
            "loading parse GGUF path=%s n_gpu_layers=%s n_ctx=%s (CPU OK if n_gpu_layers=0)",
            gguf,
            n_gpu,
            n_ctx,
        )
        self._llm = Llama(**kwargs)
        self._grammar = _load_grammar()
        self.ready = True

    def parse(self, text: str, source: str, schema_version: str) -> ParseOutcome:
        if schema_version != SCHEMA_VERSION:
            return ParseOutcome(ok=False, error="SCHEMA")
        if not text.strip():
            return ParseOutcome(ok=False, error="PARSE_MISS")
        user = (
            f"schemaVersion={SCHEMA_VERSION}\nsource={source}\ntext={text.strip()}\n"
            "Output JSON only."
        )
        kwargs: dict[str, Any] = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ],
            "temperature": 0.0,
            "max_tokens": 512,
        }
        if self._grammar is not None:
            kwargs["grammar"] = self._grammar
        try:
            completion = self._llm.create_chat_completion(**kwargs)
        except Exception:
            log.exception("parse inference failed")
            return ParseOutcome(ok=False, error="PARSE_MISS", http_status=200)
        try:
            content = completion["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            return ParseOutcome(ok=False, error="SCHEMA")
        if not isinstance(content, str) or not content.strip():
            return ParseOutcome(ok=False, error="SCHEMA")
        parsed = extract_json_object(content)
        if parsed is None:
            return ParseOutcome(ok=False, error="SCHEMA")
        return validate_parse_json(parsed)


def build_parse(settings: Settings) -> ParseEngine | None:
    if not settings.parse_model_id:
        return None
    if settings.mock:
        log.info(
            "parse mock mode (SPEECH_API_MOCK=1) model_id=%s; no GGUF download",
            settings.parse_model_id,
        )
        return MockParseEngine()
    try:
        return LlamaParseEngine(settings)
    except ImportError:
        log.error(
            "PARSE_MODEL_ID=%s but llama-cpp-python is not installed. "
            "pip install -r requirements-parse.txt (default model %s / %s). "
            "/parse stays UNAVAILABLE.",
            settings.parse_model_id,
            DEFAULT_PARSE_MODEL_ID,
            DEFAULT_PARSE_GGUF_FILE,
        )
        return None
    except Exception:
        log.exception("failed to load parse model; /parse stays UNAVAILABLE")
        return None
