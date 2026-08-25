"""Optional Path C: local instruct GGUF → Command IR JSON.

Inference is this process (llama.cpp). Hugging Face Hub is a one-time weight
download. Never call OpenAI, Groq, Anthropic, or Hugging Face Inference.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Protocol

from config import DEFAULT_PARSE_GGUF_FILE, DEFAULT_PARSE_MODEL_ID, Settings
from logconfig import elapsed_ms

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
        "INTERCEPT_LOCALIZER",
        "IDENT",
        "SAY_HEADING",
        "SAY_ALTITUDE",
        "DESCEND_VIA",
        "CLIMB_VIA",
        "CROSS",
        "GO_AROUND",
    }
)

TURN_DIRS = frozenset({"LEFT", "RIGHT", "SHORTEST"})
TURN_DEGREES_DIRS = frozenset({"LEFT", "RIGHT"})
ALTITUDE_VERBS = frozenset({"CLIMB", "DESCEND", "MAINTAIN"})
SPEED_VERBS = frozenset({"MAINTAIN", "INCREASE", "REDUCE"})
CROSS_RESTRICTIONS = frozenset({"AT", "AT_OR_ABOVE", "AT_OR_BELOW"})

# Constrained JSON / GBNF target (Command IR v0). Loaded from parse_grammar.gbnf.
GRAMMAR_PATH = Path(__file__).resolve().parent / "parse_grammar.gbnf"

SYSTEM_PROMPT = """You convert air-traffic control radio into JSON only. No prose. No markdown.

The JSON object must be:
{"ok": true, "callsignToken": string-or-null, "instructions": Instruction[]}
OR when unparseable / unrecognized audio:
{"ok": false, "error": "PARSE_MISS"}

Instruction is exactly one of these frozen Command IR v0 types (no other "type"):
- {"type": "FLY_HEADING", "headingDeg": number, "turn": "LEFT"|"RIGHT"|"SHORTEST"}
- {"type": "TURN_DEGREES", "direction": "LEFT"|"RIGHT", "degrees": number}
- {"type": "PRESENT_HEADING"}
- {"type": "ALTITUDE", "altitudeFt": number, "verb": "CLIMB"|"DESCEND"|"MAINTAIN", "expedite"?: boolean, "untilEstablished"?: boolean}
- {"type": "SPEED", "speedKt": number, "verb": "MAINTAIN"|"INCREASE"|"REDUCE"}
- {"type": "DIRECT", "fixId": string}
- {"type": "EXPECT_APPROACH", "approachId": string}
- {"type": "CLEARED_APPROACH", "approachId": string}
- {"type": "INTERCEPT_LOCALIZER", "approachId": string}
- {"type": "IDENT"}
- {"type": "SAY_HEADING"}
- {"type": "SAY_ALTITUDE"}
- {"type": "DESCEND_VIA", "procedureId": string}
- {"type": "CLIMB_VIA", "procedureId": string}
- {"type": "CROSS", "fixId": string, "altitudeFt": number, "restriction": "AT"|"AT_OR_ABOVE"|"AT_OR_BELOW"}
- {"type": "GO_AROUND"}

Rules and Guidance:
- Output JSON only. If you cannot map the text, output {"ok": false, "error": "PARSE_MISS"}.
- Be tolerant of minor ASR transcript anomalies, phonetic typos, and colloquial phrasing.
- Do not invent types (no CHAT, no conversation). Do not apply intent. Do not write a readback.
- callsignToken is ICAO like DAL123 or SWA203, never the spoken airline name and never null if a callsign was spoken.
- Map telephony: Delta→DAL, Southwest→SWA, American→AAL, United→UAL, JetBlue→JBU, Alaska→ASA, Frontier→FFT, Spirit→NKS, FedEx→FDX, UPS→UPS.
- ASR may write "Southwest 203", "heading 270", or "5,000" instead of digit-by-digit / "five thousand". Still SWA203, headingDeg 270, altitudeFt 5000. heading 360 → headingDeg 0.
- JO 7110.65 vectors: "turn left heading 270" → FLY_HEADING headingDeg 270 turn LEFT. NEVER TURN_DEGREES for a heading assignment.
- TURN_DEGREES only when they say "degrees" and not "heading": "turn left 20 degrees".
- fly heading 270 → FLY_HEADING SHORTEST. fly/continue/maintain present heading → PRESENT_HEADING.
- "without delay" on climb/descend is expedite: true.
- "until established" on altitude is untilEstablished: true.
- iden / ident / squawk ident → IDENT.
- go around / going around / GA → GO_AROUND.
- intercept the runway 27 localizer / IL ILS27 → INTERCEPT_LOCALIZER (loc only, no GS).
- cleared ILS / clear to ILS / cleared approach → CLEARED_APPROACH.
- Position reports (e.g. "you are six miles from the airport", "6 miles from MERGE") are controller advisories. Do NOT emit DIRECT instructions for position reports.
- If a recognizable callsign was spoken, preserve its correct ICAO token even when it is not in onFrequency. Never substitute the selected aircraft or an unrelated onFrequency callsign because a transcript is noisy.
- If the user message includes onFrequency, use it to repair a noisy callsign only when its flight number uniquely matches. Map noisy ASR (e.g. "giblet 204") to the listed flight number. Do not copy ASR junk. Do not guess a different flight number.
- If the user message includes fixes=, DIRECT/CROSS fixId MUST be one of those catalog ids. Map noisy ASR (e.g. "C-Max", "see max") to the listed spelling (SEMAX). Do not invent a fix that is not listed.
- If the user message includes procedures=, DESCEND_VIA/CLIMB_VIA procedureId MUST be a listed catalog id (DEM1, not DEMO ONE or demo 1). Map spoken STAR names to that id. Do not invent a procedure that is not listed.
- If the user message includes approaches=, EXPECT_APPROACH/CLEARED_APPROACH/INTERCEPT_LOCALIZER approachId MUST be one listed approach id (e.g. ILS27, not RW27, IL27, or a procedure id such as DEM1). Map noisy ASR (e.g. "ILX RW27", "runway 27") to the matching listed approach id.
- Procedures and approaches are separate namespaces. Never use a procedures= id as approachId. Never use an approaches= id as procedureId.
- Correct obvious ASR substitutions when intent remains clear: "interseptor runway 27 localizer" means "intercept runway 27 localizer".

Examples:
Input: "SPIRIT 310 INTERSEPTOR RUNWAY 27 LOCALIZER" with approaches=ILS27 and procedures=DEM1
Output: {"ok": true, "callsignToken": "NKS310", "instructions": [{"type": "INTERCEPT_LOCALIZER", "approachId": "ILS27"}]}
Input: "Spirit 310 clear to ILX RW27" with approaches=ILS27
Output: {"ok": true, "callsignToken": "NKS310", "instructions": [{"type": "CLEARED_APPROACH", "approachId": "ILS27"}]}
Input: "Delta 123, you are six miles from the airport. Maintain 3000 until established on the localizer cleared ILS runway 27 approach." with approaches=ILS27
Output: {"ok": true, "callsignToken": "DAL123", "instructions": [{"type": "ALTITUDE", "altitudeFt": 3000, "verb": "MAINTAIN", "untilEstablished": true}, {"type": "CLEARED_APPROACH", "approachId": "ILS27"}]}
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

    def parse(
        self,
        text: str,
        source: str,
        schema_version: str,
        context: dict[str, Any] | None = None,
    ) -> ParseOutcome: ...


MAX_ROSTER = 64
MAX_FIXES = 64
MAX_PROCEDURES = 32
MAX_APPROACHES = 32
_CALLSIGN_RE = re.compile(r"^[A-Z0-9]{2,8}$")
_FIX_RE = re.compile(r"^[A-Z]{2,6}[0-9]{0,2}$")
_PROC_RE = re.compile(r"^[A-Z]{2,8}[0-9]{0,2}$")
_APPROACH_RE = re.compile(r"^[A-Z0-9]{2,10}$")


def _sanitize_id_list(raw: object, pattern: re.Pattern[str], limit: int) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, str):
            continue
        up = item.strip().upper()
        if not up or up in seen or pattern.match(up) is None:
            continue
        seen.add(up)
        out.append(up)
        if len(out) >= limit:
            break
    return out


def _sanitize_procedures(raw: object) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return out
    for item in raw:
        pid = ""
        name: str | None = None
        if isinstance(item, str):
            left, sep, right = item.partition("=")
            pid = left.strip().upper()
            if sep:
                name = right.strip().upper() or None
        elif isinstance(item, dict):
            raw_id = item.get("id")
            if isinstance(raw_id, str):
                pid = raw_id.strip().upper()
            raw_name = item.get("name")
            if isinstance(raw_name, str) and raw_name.strip():
                name = raw_name.strip().upper()
        if not pid or pid in seen or _PROC_RE.match(pid) is None:
            continue
        seen.add(pid)
        rec: dict[str, str] = {"id": pid}
        if name:
            rec["name"] = name
        out.append(rec)
        if len(out) >= MAX_PROCEDURES:
            break
    return out


def _sanitize_approaches(raw: object) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return out
    for item in raw:
        aid = ""
        name: str | None = None
        rwy: str | None = None
        if isinstance(item, str):
            left, sep, right = item.partition("=")
            aid = left.strip().upper()
            if sep:
                name = right.strip().upper() or None
        elif isinstance(item, dict):
            raw_id = item.get("id")
            if isinstance(raw_id, str):
                aid = raw_id.strip().upper()
            raw_name = item.get("name")
            if isinstance(raw_name, str) and raw_name.strip():
                name = raw_name.strip().upper()
            raw_rwy = item.get("runway")
            if isinstance(raw_rwy, str) and raw_rwy.strip():
                rwy = raw_rwy.strip().upper()
        if not aid or aid in seen or _APPROACH_RE.match(aid) is None:
            continue
        seen.add(aid)
        rec: dict[str, str] = {"id": aid}
        if name:
            rec["name"] = name
        if rwy:
            rec["runway"] = rwy
        out.append(rec)
        if len(out) >= MAX_APPROACHES:
            break
    return out


def sanitize_parse_context(raw: object) -> dict[str, Any] | None:
    """Keep live-strip + catalog grounding tiny. Drop junk; never n-best or confidence."""
    if not isinstance(raw, dict):
        return None
    callsigns = _sanitize_id_list(raw.get("callsigns") or [], _CALLSIGN_RE, MAX_ROSTER)
    fixes = _sanitize_id_list(raw.get("fixes") or [], _FIX_RE, MAX_FIXES)
    procedures = _sanitize_procedures(raw.get("procedures") or [])
    approaches = _sanitize_approaches(raw.get("approaches") or [])
    selected_raw = raw.get("selectedCallsign")
    selected: str | None = None
    if isinstance(selected_raw, str):
        up = selected_raw.strip().upper()
        if up and _CALLSIGN_RE.match(up):
            selected = up
    if not callsigns and not selected and not fixes and not procedures and not approaches:
        return None
    out: dict[str, Any] = {"callsigns": callsigns}
    if selected:
        out["selectedCallsign"] = selected
    if fixes:
        out["fixes"] = fixes
    if procedures:
        out["procedures"] = procedures
    if approaches:
        out["approaches"] = approaches
    return out


def build_parse_user_message(text: str, source: str, context: dict[str, Any] | None = None) -> str:
    """User turn: transcript plus optional roster and catalog ids (not kinematics)."""
    lines = [f"schemaVersion={SCHEMA_VERSION}", f"source={source}"]
    ctx = sanitize_parse_context(context) if context else None
    if ctx:
        roster = ctx.get("callsigns") or []
        if roster:
            lines.append("onFrequency=" + ",".join(roster))
            lines.append(
                "callsignToken MUST be one onFrequency ICAO token or null. "
                "Match noisy ASR to the listed flight number."
            )
        selected = ctx.get("selectedCallsign")
        if selected:
            lines.append(f"selected={selected}")
        fixes = ctx.get("fixes") or []
        if fixes:
            lines.append("fixes=" + ",".join(fixes))
            lines.append(
                "DIRECT/CROSS fixId MUST be one listed catalog id. "
                "Match noisy ASR (C-Max, see max) to that spelling."
            )
        procedures = ctx.get("procedures") or []
        if procedures:
            bits: list[str] = []
            for proc in procedures:
                if not isinstance(proc, dict):
                    continue
                pid = str(proc.get("id") or "")
                pname = str(proc.get("name") or "")
                bits.append(f"{pid} ({pname})" if pname else pid)
            if bits:
                lines.append("procedures=" + ",".join(bits))
                lines.append(
                    "DESCEND_VIA/CLIMB_VIA procedureId MUST be a listed catalog id. "
                    "Map demo one / demo 1 to DEM1."
                )
        approaches = ctx.get("approaches") or []
        if approaches:
            bits = []
            for app in approaches:
                if not isinstance(app, dict):
                    continue
                aid = str(app.get("id") or "")
                aname = str(app.get("name") or "")
                bits.append(f"{aid} ({aname})" if aname else aid)
            if bits:
                lines.append("approaches=" + ",".join(bits))
                lines.append(
                    "EXPECT_APPROACH/CLEARED_APPROACH/INTERCEPT_LOCALIZER approachId MUST be a listed catalog id (e.g. ILS27). "
                    "Map spoken runway/approach variants (e.g. ILX RW27, runway 27, IL27) to that id."
                )
    lines.append(f"text={text.strip()}")
    lines.append("Output JSON only.")
    return "\n".join(lines)



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
        if not _exact_keys(raw, {"type", "altitudeFt", "verb"}, {"expedite", "untilEstablished"}):
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
        if "untilEstablished" in raw:
            if not isinstance(raw["untilEstablished"], bool):
                return None
            out["untilEstablished"] = raw["untilEstablished"]
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
    if instr_type == "INTERCEPT_LOCALIZER":
        if (
            not _exact_keys(raw, {"type", "approachId"})
            or not isinstance(raw["approachId"], str)
            or not raw["approachId"]
        ):
            return None
        return {"type": "INTERCEPT_LOCALIZER", "approachId": raw["approachId"]}
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
    if instr_type == "GO_AROUND":
        if not _exact_keys(raw, {"type"}):
            return None
        return {"type": "GO_AROUND"}
    if instr_type == "DESCEND_VIA":
        if (
            not _exact_keys(raw, {"type", "procedureId"})
            or not isinstance(raw["procedureId"], str)
            or not raw["procedureId"]
        ):
            return None
        return {"type": "DESCEND_VIA", "procedureId": raw["procedureId"]}
    if instr_type == "CLIMB_VIA":
        if (
            not _exact_keys(raw, {"type", "procedureId"})
            or not isinstance(raw["procedureId"], str)
            or not raw["procedureId"]
        ):
            return None
        return {"type": "CLIMB_VIA", "procedureId": raw["procedureId"]}
    if instr_type == "CROSS":
        if not _exact_keys(raw, {"type", "fixId", "altitudeFt", "restriction"}):
            return None
        if (
            not isinstance(raw["fixId"], str)
            or not raw["fixId"]
            or not _is_finite_number(raw["altitudeFt"])
            or raw["restriction"] not in CROSS_RESTRICTIONS
        ):
            return None
        return {
            "type": "CROSS",
            "fixId": raw["fixId"],
            "altitudeFt": _as_number(raw["altitudeFt"]),
            "restriction": raw["restriction"],
        }
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

    def describe(self) -> str:
        return "mock ready"

    def parse(
        self,
        text: str,
        source: str,
        schema_version: str,
        context: dict[str, Any] | None = None,
    ) -> ParseOutcome:
        del source, context
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


def _ensure_gguf(settings: Settings) -> tuple[Path, str]:
    model_id = settings.parse_model_id
    if not model_id:
        raise RuntimeError("PARSE_MODEL_ID unset")
    local = Path(model_id)
    if local.is_file() and local.suffix.lower() == ".gguf":
        return local, "local"
    # huggingface_hub copies the GGUF onto disk once. Never InferenceClient.
    from hub import resolve_hub_file

    filename = settings.parse_gguf_file or DEFAULT_PARSE_GGUF_FILE
    path, source = resolve_hub_file(
        repo_id=model_id,
        filename=filename,
        cache_dir=settings.cache_dir / "hub",
        token=settings.hf_token,
        purpose="LLM",
    )
    return path, source


_LLAMA_LOG_HANDLE = None


def _silence_llama_cpp() -> None:
    """Drop ggml tensor dumps; Python logs below cover load status."""
    global _LLAMA_LOG_HANDLE
    if _LLAMA_LOG_HANDLE is not None:
        return
    try:
        from llama_cpp import llama_cpp as _ll
    except ImportError:
        return

    def _on_log(level, text, user_data=None):  # noqa: ARG001
        return None

    try:
        cb_type = getattr(_ll, "llama_log_callback", None)
        setter = getattr(_ll, "llama_log_set", None)
        if cb_type is None or setter is None:
            return
        handle = cb_type(_on_log)
        try:
            setter(handle, None)
        except Exception:
            import ctypes

            setter(handle, ctypes.c_void_p())
        _LLAMA_LOG_HANDLE = handle
    except Exception:
        _LLAMA_LOG_HANDLE = None


def _llama_supports_gpu_offload() -> bool:
    """True when this llama-cpp-python build can offload layers (needs CUDA DLLs on PATH)."""
    from engines import prepare_windows_cuda_dlls

    prepare_windows_cuda_dlls()
    try:
        import llama_cpp

        fn = getattr(llama_cpp, "llama_supports_gpu_offload", None)
        if not callable(fn):
            return False
        return bool(fn())
    except Exception:
        return False


def _parse_n_gpu_layers() -> int:
    """Unset PARSE_N_GPU_LAYERS → all layers (-1) if CUDA llama works, else CPU (0)."""
    raw = os.environ.get("PARSE_N_GPU_LAYERS", "").strip()
    if raw:
        return int(raw)
    return -1 if _llama_supports_gpu_offload() else 0


def _llm_device(n_gpu_layers: int) -> str:
    return "cpu" if n_gpu_layers == 0 else "cuda"


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
        import time

        from engines import prepare_windows_cuda_dlls
        from llama_cpp import Llama

        prepare_windows_cuda_dlls()
        _silence_llama_cpp()
        t0 = time.perf_counter()
        gguf, weights = _ensure_gguf(settings)
        n_gpu = _parse_n_gpu_layers()
        n_ctx = int(os.environ.get("PARSE_CTX", "2048"))
        n_threads_raw = os.environ.get("PARSE_N_THREADS", "").strip()
        n_threads = int(n_threads_raw) if n_threads_raw else None
        device = _llm_device(n_gpu)
        kwargs: dict[str, Any] = {
            "model_path": str(gguf),
            "n_ctx": n_ctx,
            "n_gpu_layers": n_gpu,
            "chat_format": "chatml",
            "verbose": False,
        }
        if n_threads is not None:
            kwargs["n_threads"] = n_threads
        self._model_id = settings.parse_model_id or gguf.name
        self._n_gpu = n_gpu
        self._n_ctx = n_ctx
        self._weights = weights
        self._device = device
        log.info(
            "LLM loading model=%s file=%s weights=%s device=%s n_gpu_layers=%s n_ctx=%s n_threads=%s",
            self._model_id,
            gguf.name,
            weights,
            device,
            n_gpu,
            n_ctx,
            n_threads if n_threads is not None else "auto",
        )
        self._llm = Llama(**kwargs)
        self._grammar = _load_grammar()
        self.ready = True
        self._n_threads = getattr(self._llm, "n_threads", None) or (
            n_threads if n_threads is not None else "auto"
        )
        self._elapsed_ms = elapsed_ms(t0)
        log.info(
            "LLM ready model=%s device=%s grammar=%s n_gpu_layers=%s n_ctx=%s n_threads=%s elapsed_ms=%s",
            self._model_id,
            device,
            "on" if self._grammar is not None else "off",
            n_gpu,
            n_ctx,
            self._n_threads,
            self._elapsed_ms,
        )

    def describe(self) -> str:
        return (
            f"ready {self._model_id} device={self._device} weights={self._weights} "
            f"n_gpu_layers={self._n_gpu} n_ctx={self._n_ctx} n_threads={self._n_threads} "
            f"grammar={'on' if self._grammar is not None else 'off'} elapsed_ms={self._elapsed_ms}"
        )

    def parse(
        self,
        text: str,
        source: str,
        schema_version: str,
        context: dict[str, Any] | None = None,
    ) -> ParseOutcome:
        if schema_version != SCHEMA_VERSION:
            return ParseOutcome(ok=False, error="SCHEMA")
        if not text.strip():
            return ParseOutcome(ok=False, error="PARSE_MISS")
        user = build_parse_user_message(text, source, context)
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
        log.info("LLM off (PARSE_MODEL_ID unset); POST /parse UNAVAILABLE")
        return None
    if settings.mock:
        log.info("LLM mock (SPEECH_API_MOCK=1) model_id=%s", settings.parse_model_id)
        return MockParseEngine()
    try:
        return LlamaParseEngine(settings)
    except ImportError:
        log.error(
            "LLM unavailable: PARSE_MODEL_ID=%s but llama-cpp-python is not installed. "
            "pip install -r requirements-parse.txt (default model %s / %s). "
            "POST /parse stays UNAVAILABLE.",
            settings.parse_model_id,
            DEFAULT_PARSE_MODEL_ID,
            DEFAULT_PARSE_GGUF_FILE,
        )
        return None
    except Exception:
        log.exception("LLM failed to load; POST /parse UNAVAILABLE")
        return None
