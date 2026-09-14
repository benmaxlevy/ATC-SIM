"""Mandatory Path C: local instruct GGUF → Command IR JSON.

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
        "ASSIGN_SQUAWK",
        "MAINTAIN_VFR",
        "IFR_CLEARANCE",
        "IDENT",
        "SAY_HEADING",
        "SAY_ALTITUDE",
        "DESCEND_VIA",
        "CLIMB_VIA",
        "JOIN_PROCEDURE",
        "CROSS",
        "GO_AROUND",
    }
)

ROUTE_SEGMENT_TYPES = frozenset({"DIRECT", "PROCEDURE"})
ROUTE_FIX_MATCH_METHODS = frozenset({"exact", "alias", "folded", "levenshtein"})
ROUTE_CONNECTORS = frozenset({"direct", "then"})

TURN_DIRS = frozenset({"LEFT", "RIGHT", "SHORTEST"})
TURN_DEGREES_DIRS = frozenset({"LEFT", "RIGHT"})
ALTITUDE_VERBS = frozenset({"CLIMB", "DESCEND", "MAINTAIN"})
SPEED_VERBS = frozenset({"MAINTAIN", "INCREASE", "REDUCE"})
CROSS_RESTRICTIONS = frozenset({"AT", "AT_OR_ABOVE", "AT_OR_BELOW"})

# Constrained JSON / GBNF target (Command IR v0). Loaded from parse_grammar.gbnf.
GRAMMAR_PATH = Path(__file__).resolve().parent / "parse_grammar.gbnf"

SYSTEM_PROMPT = """Convert ATC radio into Command IR v0 JSON. Output JSON only; grammar supplies its closed shape. Never output prose, a readback, intent execution, or a new instruction type. Recover the intended 7110.65 clearance from noisy ASR when that clearance is unambiguous. Return PARSE_MISS only when no command can be recovered or a required identifier is ambiguous.

Repair fused, slurred, and compact ASR when the intended clearance is clear. Normalize airline telephony to ICAO (Delta DAL, Southwest SWA, American AAL, United UAL, JetBlue JBU, Alaska ASA, Frontier FFT, Spirit NKS, FedEx FDX, UPS UPS), spoken digits to a callsign token, niner/tree/fife to 9/3/5, headings/altitudes to numbers, heading 360 to 0, and grouped thousands (one one thousand is 11000). Preserve a recognizable spoken callsign; use onFrequency only when its flight number uniquely repairs noisy audio. Never substitute selected or unrelated traffic.

“turn left heading 270” is FLY_HEADING with LEFT, never TURN_DEGREES. ASR “turn leftening 360” and “turn leftening one five zero” mean “turn left heading …” and are FLY_HEADING with LEFT. “zero niner zero” is heading 90. “fly heading” with no left/right is SHORTEST; never invent LEFT or RIGHT. “turn 20 degrees right” is TURN_DEGREES with RIGHT and degrees 20, never FLY_HEADING. TURN_DEGREES requires “degrees” without a heading. “present heading” is PRESENT_HEADING. “descend and maintain 4000” and ASR “descent and maintain 4000” are ALTITUDE with DESCEND and altitudeFt 4000. “cross <fix> at and maintain <altitude>” maps to {"type": "CROSS", "restriction": "AT"}. “maintain 210 knots” is SPEED with MAINTAIN and speedKt 210, never FLY_HEADING or ALTITUDE. “increase speed to 250 knots” is SPEED INCREASE; “reduce speed” is REDUCE. “maintain five thousand, maintain two one zero knots” is both ALTITUDE MAINTAIN 5000 and SPEED MAINTAIN 210; never drop one instruction. DESCEND_VIA and CLIMB_VIA require the word “via” plus a listed procedure; never use VIA for an altitude assignment; never map an unmatched spoken name onto a different listed procedure. “without delay” means expedite, never untilEstablished; “until established” belongs on ALTITUDE. IDENT, go around, localizer intercept, and cleared/expect approach retain their normal instruction meanings. Position reports never imply DIRECT.

Position advisories are not commands, but never stop parsing later sentences. “You are 15 miles from a fix. Maintain 4000 until established on the localizer. Cleared ILS runway 09 approach.” has two instructions after the advisory: ALTITUDE with MAINTAIN, altitudeFt 4000, untilEstablished true; then CLEARED_APPROACH using the matching approaches= id. Preserve every independent instruction in spoken order. “Turn 40 degrees left. Intercept runway 09 localizer. Maintain 5000.” requires three instructions: TURN_DEGREES, INTERCEPT_LOCALIZER using the matching approaches= id, then ALTITUDE. Do not drop one instruction or combine it into another.

Type meanings: DIRECT requires direct/proceed; EXPECT_APPROACH requires expect; CLEARED_APPROACH requires clear/cleared; INTERCEPT_LOCALIZER requires intercept plus localizer; IDENT requires ident; SAY_HEADING and SAY_ALTITUDE require say; JOIN_PROCEDURE requires join; CROSS requires cross; GO_AROUND requires go around. Emit a type when the transcript supports that clearance, including fused ASR (leftening = left heading, descent = descend). Do not invent a type with no supporting phrase.

New command examples: “squawk 2222” and ASR “squad 2222” are ASSIGN_SQUAWK with code 2222 and source DISCRETE; repair squad only when exactly four octal digits follow it. “squawk vfr” is ASSIGN_SQUAWK with code 1200 and source VFR. “maintain vfr” is MAINTAIN_VFR; it is not an IFR clearance or VFR-on-top authorization. “cleared to KATL via direct”, “cleared to KATL via SIITH then direct”, “cleared to KATL via radar vectors”, and “cleared to KATL as filed” are IFR_CLEARANCE with the matching access method. A SID clearance may include optional altitude, climb via, frequency, and squawk fields. “cleared direct ATL VOR” and “proceed direct ATL VOR” are tactical DIRECT only; they must not become IFR_CLEARANCE. “cleared to ATL VOR via direct” is an IFR clearance, not tactical DIRECT. Emit only the fields supported by the transcript; clearance limit and access are required, all other clearance fields are optional.

Catalog lists are authoritative. Never default a facility, procedure, approach, airport, or fix. DIRECT/CROSS use only fixes= ids. IFR_CLEARANCE limitId may use only fixes= or the separate airports= clearance-limit candidates; airport candidates must never become generic DIRECT/CROSS fixes. DESCEND_VIA, CLIMB_VIA, and JOIN_PROCEDURE use only procedures= ids; JOIN is lateral-only, not VIA. EXPECT_APPROACH, CLEARED_APPROACH, and INTERCEPT_LOCALIZER use only approaches= ids. Procedures and approaches are separate namespaces. Repair a noisy name only when one listed id is unambiguous; otherwise return PARSE_MISS. In routeWindow, fixMatches groups alternatives by one transcript span. A malformed, ambiguous, unknown, airport, unsupported, or evidence-free segment is PARSE_MISS. DIRECT is an optional marker in an IFR route window; when absent, emit one direct segment per supplied fix/navaid candidate, preserving supplied transcript order and spans. Every route segment selects exactly one candidate from one listed fixMatches row; never use an ID from another span, concatenate tokens into an ID such as SWEPT_KIMMY, or move the clearance-limit airport into a tactical DIRECT. A complete route must cover every non-connector token in order; DIRECT and THEN are connectors. An IFR `clear/cleared to ... via ...` transcript is never tactical DIRECT. transitionId only when that transition is nested under the supplied catalog procedure and has transcript evidence. For an IFR clear/cleared-to/via transcript, never output tactical DIRECT. Never invent a field or segment. source is a hint, not another schema.
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
MAX_AIRPORTS = 64
_CALLSIGN_RE = re.compile(r"^[A-Z0-9]{2,8}$")
_FIX_RE = re.compile(r"^[A-Z]{2,6}[0-9]{0,2}$")
_NAVAID_RE = re.compile(r"^[A-Z0-9]{2,10}$")
_PROC_RE = re.compile(r"^[A-Z]{2,8}[0-9]{0,2}$")
_APPROACH_RE = re.compile(r"^[A-Z0-9]{2,10}$")
_AIRPORT_RE = re.compile(r"^[A-Z]{4}$")


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


def _sanitize_airports(raw: object) -> list[dict[str, Any]]:
    """Sanitize the separate clearance-limit airport namespace."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        raw_icao = item.get("icao")
        raw_name = item.get("name")
        if not isinstance(raw_icao, str) or not isinstance(raw_name, str):
            continue
        icao = raw_icao.strip().upper()
        name = raw_name.strip()
        if _AIRPORT_RE.match(icao) is None or len(name) < 2 or icao in seen:
            continue
        aliases: list[str] = []
        raw_aliases = item.get("aliases")
        if isinstance(raw_aliases, list):
            alias_seen: set[str] = set()
            for alias in raw_aliases:
                if not isinstance(alias, str):
                    continue
                clean = alias.strip()
                key = clean.casefold()
                if len(clean) >= 2 and key not in alias_seen:
                    alias_seen.add(key)
                    aliases.append(clean)
        seen.add(icao)
        out.append({"icao": icao, "name": name, "aliases": aliases})
        if len(out) >= MAX_AIRPORTS:
            break
    return out


def _sanitize_spans(raw: object) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        start, end, text = item.get("start"), item.get("end"), item.get("text")
        if (
            not isinstance(start, int)
            or isinstance(start, bool)
            or not isinstance(end, int)
            or isinstance(end, bool)
            or start < 0
            or end <= start
            or not isinstance(text, str)
            or not text.strip()
        ):
            continue
        out.append({"start": start, "end": end, "text": text})
        if len(out) >= MAX_PATH_CANDIDATES:
            break
    return out


def _sanitize_route_candidate(raw: object) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    candidate_id = raw.get("id")
    kind = raw.get("kind")
    if (
        not isinstance(candidate_id, str)
        or not isinstance(kind, str)
        or kind not in {"FIX", "NAVAID"}
    ):
        return None
    candidate_id = candidate_id.strip().upper()
    if (_NAVAID_RE if kind == "NAVAID" else _FIX_RE).match(candidate_id) is None:
        return None
    aliases_raw = raw.get("aliases") or []
    aliases = [alias.strip() for alias in aliases_raw if isinstance(alias, str) and alias.strip()]
    spans = _sanitize_spans(raw.get("spans"))
    if not spans:
        return None
    return {"id": candidate_id, "kind": kind, "aliases": list(dict.fromkeys(aliases)), "spans": spans}


def _sanitize_transition_candidate(raw: object) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    transition_id = raw.get("id")
    if not isinstance(transition_id, str) or not transition_id.strip():
        return None
    aliases_raw = raw.get("aliases") or []
    aliases = [alias.strip() for alias in aliases_raw if isinstance(alias, str) and alias.strip()]
    spans = _sanitize_spans(raw.get("spans"))
    if not spans:
        return None
    return {
        "id": transition_id.strip().upper(),
        "aliases": list(dict.fromkeys(aliases)),
        "spans": spans,
    }


def _sanitize_route_procedure(raw: object) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    procedure_id = raw.get("id")
    if not isinstance(procedure_id, str) or not procedure_id.strip():
        return None
    aliases_raw = raw.get("aliases") or []
    aliases = [alias.strip() for alias in aliases_raw if isinstance(alias, str) and alias.strip()]
    spans = _sanitize_spans(raw.get("spans"))
    if not spans:
        return None
    transitions: list[dict[str, Any]] = []
    for item in raw.get("transitions") or []:
        checked = _sanitize_transition_candidate(item)
        if checked is not None and checked["id"] not in {row["id"] for row in transitions}:
            transitions.append(checked)
    return {
        "id": procedure_id.strip().upper(),
        "aliases": list(dict.fromkeys(aliases)),
        "spans": spans,
        "transitions": transitions,
    }


MAX_PATH_CANDIDATES = 32
MAX_PATH_C_FIX_MATCHES = 16


def _sanitize_route_fix_match_candidate(
    raw: object, airport_ids: set[str]
) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    candidate_id = raw.get("id")
    kind = raw.get("kind")
    score = raw.get("score")
    method = raw.get("method")
    if (
        not isinstance(candidate_id, str)
        or not isinstance(kind, str)
        or kind not in {"FIX", "NAVAID"}
        or not isinstance(score, (int, float))
        or isinstance(score, bool)
        or not _is_finite_number(score)
        or score < 0
        or score > 1
        or not isinstance(method, str)
        or method not in ROUTE_FIX_MATCH_METHODS
    ):
        return None
    candidate_id = candidate_id.strip().upper()
    if (
        (_NAVAID_RE if kind == "NAVAID" else _FIX_RE).match(candidate_id) is None
        or candidate_id in airport_ids
    ):
        return None
    out: dict[str, Any] = {
        "id": candidate_id,
        "kind": kind,
        "score": float(score),
        "method": method,
    }
    distance = raw.get("distance")
    if distance is not None:
        if (
            not isinstance(distance, int)
            or isinstance(distance, bool)
            or distance < 0
            or distance > 2
        ):
            return None
        out["distance"] = distance
    return out


def _sanitize_route_fix_match(raw: object, airport_ids: set[str]) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    span = _sanitize_spans([raw.get("span")])
    if not span:
        return None
    if any(token.casefold() in ROUTE_CONNECTORS for token in span[0]["text"].split()):
        return None
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    raw_candidates = raw.get("candidates")
    if not isinstance(raw_candidates, list):
        return None
    for item in raw_candidates:
        candidate = _sanitize_route_fix_match_candidate(item, airport_ids)
        if candidate is None or candidate["id"] in seen:
            continue
        seen.add(candidate["id"])
        candidates.append(candidate)
        if len(candidates) >= MAX_PATH_C_FIX_MATCHES:
            break
    if not candidates:
        return None
    return {"span": span[0], "candidates": candidates}


def _sanitize_route_window(raw: object, airport_ids: set[str] | None = None) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or not isinstance(raw.get("transcript"), str):
        return None
    transcript = raw["transcript"].strip()
    if not transcript:
        return None
    excluded_airports = airport_ids or set()
    fix_matches: list[dict[str, Any]] = []
    seen_spans: set[tuple[int, int]] = set()
    for item in raw.get("fixMatches") or []:
        checked = _sanitize_route_fix_match(item, excluded_airports)
        if checked is None:
            continue
        key = (checked["span"]["start"], checked["span"]["end"])
        if key in seen_spans:
            continue
        seen_spans.add(key)
        fix_matches.append(checked)
        if len(fix_matches) >= MAX_PATH_CANDIDATES:
            break
    procedures: list[dict[str, Any]] = []
    for item in raw.get("procedures") or []:
        checked = _sanitize_route_procedure(item)
        if checked is not None and checked["id"] not in {row["id"] for row in procedures}:
            procedures.append(checked)
    return {"transcript": transcript, "fixMatches": fix_matches, "procedures": procedures}


def sanitize_parse_context(raw: object) -> dict[str, Any] | None:
    """Keep live-strip + catalog grounding tiny. Drop junk; never n-best or confidence."""
    if not isinstance(raw, dict):
        return None
    callsigns = _sanitize_id_list(raw.get("callsigns") or [], _CALLSIGN_RE, MAX_ROSTER)
    fixes = _sanitize_id_list(raw.get("fixes") or [], _FIX_RE, MAX_FIXES)
    procedures = _sanitize_procedures(raw.get("procedures") or [])
    approaches = _sanitize_approaches(raw.get("approaches") or [])
    airports = _sanitize_airports(raw.get("airports") or [])
    airport_ids = {row["icao"] for row in airports}
    route_window = _sanitize_route_window(raw.get("routeWindow"), airport_ids)
    clearance_limits: list[dict[str, Any]] = []
    for item in raw.get("clearanceLimits") or []:
        checked = _sanitize_route_candidate(item)
        if checked is not None and checked["id"] not in {row["id"] for row in clearance_limits}:
            clearance_limits.append(checked)
    selected_raw = raw.get("selectedCallsign")
    selected: str | None = None
    if isinstance(selected_raw, str):
        up = selected_raw.strip().upper()
        if up and _CALLSIGN_RE.match(up):
            selected = up
    if (
        not callsigns
        and not selected
        and not fixes
        and not procedures
        and not approaches
        and not airports
        and route_window is None
        and not clearance_limits
    ):
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
    if airports:
        out["airports"] = airports
    if route_window is not None:
        out["routeWindow"] = route_window
    if clearance_limits:
        out["clearanceLimits"] = clearance_limits
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
                    "DESCEND_VIA/CLIMB_VIA/JOIN_PROCEDURE procedureId MUST be a listed catalog id. "
                    "Match noisy spoken names (star/sid words, digits) to that id."
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
                    "EXPECT_APPROACH/CLEARED_APPROACH/INTERCEPT_LOCALIZER approachId MUST be a listed catalog id. "
                    "Match spoken runway/approach variants to that id."
                )
        airports = ctx.get("airports") or []
        if airports:
            bits = []
            for airport in airports:
                if not isinstance(airport, dict):
                    continue
                icao = str(airport.get("icao") or "")
                name = str(airport.get("name") or "")
                aliases = airport.get("aliases") or []
                alias_text = "/".join(str(alias) for alias in aliases if str(alias).strip())
                label = f"{icao} ({name}" + (f"; {alias_text}" if alias_text else "") + ")"
                bits.append(label)
            if bits:
                lines.append("airports=" + ",".join(bits))
                lines.append(
                    "IFR_CLEARANCE limitId MUST be a listed airport ICAO when the limit is an airport. "
                    "Airports are clearance limits only, never DIRECT/CROSS fixes."
                )
        limits = ctx.get("clearanceLimits") or []
        if limits:
            lines.append("clearanceLimits=" + json.dumps(limits, separators=(",", ":")))
            lines.append("IFR_CLEARANCE limitId may use only one supplied clearanceLimits id.")
        route = ctx.get("routeWindow")
        if route:
            lines.append("routeWindow=" + json.dumps(route, separators=(",", ":")))
            lines.append(
                "routeWindow.fixMatches is grouped evidence: choose exactly one listed candidate "
                "from one row for each route element, cover every non-connector token, and keep "
                "the selected spans ordered and non-overlapping. DIRECT and THEN are connectors; "
                "never concatenate tokens, invent IDs, use airports as route fixes, omit a token, "
                "or emit tactical DIRECT for an IFR clearance."
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
        heading = _as_number(raw["headingDeg"])
        if heading == 360:
            heading = 0
        return {"type": "FLY_HEADING", "headingDeg": heading, "turn": raw["turn"]}
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
    if instr_type == "ASSIGN_SQUAWK":
        if not _exact_keys(raw, {"type", "code", "source"}):
            return None
        code = raw["code"]
        source = raw["source"]
        if not isinstance(code, str) or re.fullmatch(r"[0-7]{4}", code) is None:
            return None
        if source not in {"DISCRETE", "VFR"}:
            return None
        if source == "VFR" and code != "1200":
            return None
        return {"type": "ASSIGN_SQUAWK", "code": code, "source": source}
    if instr_type == "MAINTAIN_VFR":
        if not _exact_keys(raw, {"type"}):
            return None
        return {"type": "MAINTAIN_VFR"}
    if instr_type == "IFR_CLEARANCE":
        optional = {"altitudeFt", "climbVia", "frequency", "squawk"}
        if not _exact_keys(raw, {"type", "limitId", "access"}, optional):
            return None
        if not isinstance(raw["limitId"], str) or not raw["limitId"]:
            return None
        access = raw["access"]
        if not isinstance(access, dict) or not isinstance(access.get("type"), str):
            return None
        access_type = access["type"]
        if access_type in {"AS_FILED", "DIRECT", "RADAR_VECTORS"}:
            if not _exact_keys(access, {"type"}):
                return None
        elif access_type == "FIX_THEN_DIRECT":
            if (
                not _exact_keys(access, {"type", "fixId"})
                or not isinstance(access["fixId"], str)
                or not access["fixId"]
            ):
                return None
        elif access_type == "SID":
            if (
                not _exact_keys(access, {"type", "procedureId"}, {"transitionId"})
                or not isinstance(access["procedureId"], str)
                or not access["procedureId"]
                or ("transitionId" in access and not isinstance(access["transitionId"], str))
            ):
                return None
        elif access_type == "EXPLICIT_ROUTE":
            segments = access.get("segments")
            if not _exact_keys(access, {"type", "segments"}) or not isinstance(segments, list):
                return None
            for segment in segments:
                if not isinstance(segment, dict) or segment.get("type") not in ROUTE_SEGMENT_TYPES:
                    return None
                if segment["type"] == "DIRECT":
                    if (
                        not _exact_keys(segment, {"type", "fixId"})
                        or not isinstance(segment.get("fixId"), str)
                        or not segment["fixId"]
                    ):
                        return None
                elif (
                    not _exact_keys(segment, {"type", "procedureId"}, {"transitionId"})
                    or not isinstance(segment.get("procedureId"), str)
                    or not segment["procedureId"]
                    or (
                        "transitionId" in segment
                        and (
                            not isinstance(segment.get("transitionId"), str)
                            or not segment["transitionId"]
                        )
                    )
                ):
                    return None
        else:
            return None
        if "altitudeFt" in raw and not _is_finite_number(raw["altitudeFt"]):
            return None
        if "climbVia" in raw and not isinstance(raw["climbVia"], bool):
            return None
        if "frequency" in raw and (not isinstance(raw["frequency"], str) or not raw["frequency"]):
            return None
        if "squawk" in raw and (
            not isinstance(raw["squawk"], str) or re.fullmatch(r"[0-7]{4}", raw["squawk"]) is None
        ):
            return None
        out: dict[str, Any] = {
            "type": "IFR_CLEARANCE",
            "limitId": raw["limitId"],
            "access": dict(access),
        }
        for key in ("altitudeFt", "climbVia", "frequency", "squawk"):
            if key in raw:
                out[key] = _as_number(raw[key]) if key == "altitudeFt" else raw[key]
        return out
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
            not _exact_keys(raw, {"type", "procedureId"}, {"transitionId"})
            or not isinstance(raw["procedureId"], str)
            or not raw["procedureId"]
            or ("transitionId" in raw and not isinstance(raw["transitionId"], str))
        ):
            return None
        out = {"type": "DESCEND_VIA", "procedureId": raw["procedureId"]}
        if "transitionId" in raw:
            out["transitionId"] = raw["transitionId"]
        return out
    if instr_type == "CLIMB_VIA":
        if (
            not _exact_keys(raw, {"type", "procedureId"}, {"transitionId"})
            or not isinstance(raw["procedureId"], str)
            or not raw["procedureId"]
            or ("transitionId" in raw and not isinstance(raw["transitionId"], str))
        ):
            return None
        out = {"type": "CLIMB_VIA", "procedureId": raw["procedureId"]}
        if "transitionId" in raw:
            out["transitionId"] = raw["transitionId"]
        return out
    if instr_type == "JOIN_PROCEDURE":
        if (
            not _exact_keys(raw, {"type", "procedureId"}, {"transitionId"})
            or not isinstance(raw["procedureId"], str)
            or not raw["procedureId"]
            or ("transitionId" in raw and not isinstance(raw["transitionId"], str))
        ):
            return None
        out = {"type": "JOIN_PROCEDURE", "procedureId": raw["procedureId"]}
        if "transitionId" in raw:
            out["transitionId"] = raw["transitionId"]
        return out
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


def _instruction_has_transcript_evidence(instruction: dict[str, Any], text: str) -> bool:
    def has(pattern: str) -> bool:
        return re.search(pattern, text) is not None

    has_speed_cue = has(r"\b(knots?|speed|mach|slow)\b")
    instruction_type = instruction["type"]
    if instruction_type == "FLY_HEADING":
        if has(r"\b(say|present)\b"):
            return False
        if has(r"\bdegrees?\b") and not has(r"\bheading\b"):
            return False
        if has_speed_cue and not has(r"\bheading\b") and not has(r"\bturn\b"):
            return False
        return has(r"\bheading\b") or has(r"\bturn\b")
    if instruction_type == "TURN_DEGREES":
        return has(r"\bdegrees?\b") and not has(r"\bheading\b")
    if instruction_type == "PRESENT_HEADING":
        return has(r"\bpresent\s+heading\b")
    if instruction_type == "ALTITUDE":
        verb = instruction["verb"].lower()
        if has(r"\bvia\b") and not has(r"\bmaintain\b"):
            return False
        if verb in {"climb", "descend"}:
            return has(rf"\b{verb}\b") or (verb == "descend" and has(r"\bdescent\b"))
        return _has_altitude_maintain_evidence(text)
    if instruction_type == "SPEED":
        if not has_speed_cue:
            return False
        verb = instruction["verb"].lower()
        if verb == "increase":
            return has(r"\bincrease\b")
        if verb == "reduce":
            return has(r"\b(reduce|slow)\b")
        return not has(r"\b(increase|reduce)\b")
    if instruction_type == "DIRECT":
        if has(r"\b(?:cleared|clear)\s+to\b"):
            return False
        return has(r"\b(direct|proceed)\b")
    if instruction_type == "ASSIGN_SQUAWK":
        if not has(r"\b(squawk|squad)\b"):
            return False
        if instruction.get("source") == "VFR":
            return has(r"\bvfr\b")
        return bool(re.search(r"\b[0-7]{4}\b", text))
    if instruction_type == "MAINTAIN_VFR":
        return has(r"\bmaintain\s+vfr\b")
    if instruction_type == "IFR_CLEARANCE":
        # Tactical "cleared/proceed direct FIX" is a DIRECT instruction. An
        # IFR clearance has the clearance limit and an explicit access method.
        if not bool(
            has(r"\b(?:cleared|clear)\s+to\b")
            and has(r"\b(?:via|as\s+filed|direct|radar\s+vectors?)\b")
        ):
            return False
        access = instruction.get("access")
        if isinstance(access, dict) and access.get("type") == "EXPLICIT_ROUTE":
            return bool(access.get("segments")) and has(r"\bvia\b")
        return True
    if instruction_type == "EXPECT_APPROACH":
        return has(r"\bexpect\b") and has(r"\b(approach|ils|localizer|runway)\b")
    if instruction_type == "CLEARED_APPROACH":
        return has(r"\b(?:cleared|clear)\b") and has(r"\b(approach|ils|localizer|runway)\b")
    if instruction_type == "INTERCEPT_LOCALIZER":
        return has(r"\bintercept\b") and has(r"\b(localizer|loc)\b")
    if instruction_type == "IDENT":
        return has(r"\b(ident|iden)\b")
    if instruction_type == "SAY_HEADING":
        return has(r"\bsay\b") and has(r"\bheading\b")
    if instruction_type == "SAY_ALTITUDE":
        return has(r"\bsay\b") and has(r"\b(altitude|alt)\b")
    if instruction_type == "DESCEND_VIA":
        return (has(r"\bdescend\b") or has(r"\bdescent\b")) and has(r"\bvia\b")
    if instruction_type == "CLIMB_VIA":
        return has(r"\bclimb\b") and has(r"\bvia\b")
    if instruction_type == "JOIN_PROCEDURE":
        return has(r"\bjoin\b")
    if instruction_type == "CROSS":
        return has(r"\bcross\b")
    if instruction_type == "GO_AROUND":
        return has(r"\bgo\w*\s*around\b|\bgo-around\b")
    return False


_ALTITUDE_LEX = re.compile(r"\b(thousand|thousands|feet|flight\s*level)\b")
_MAINTAIN_COMPACT_FT = re.compile(r"\bmaintain(?:ed)?\s+\d{3,5}\b(?!\s*(?:knots?|speed|mach))")

_VERB_LEMMAS = {
    "maintained": "maintain",
    "maintaining": "maintain",
    "descended": "descend",
    "descending": "descend",
    "climbed": "climb",
    "climbing": "climb",
    "turned": "turn",
    "turning": "turn",
    "intercepted": "intercept",
    "intercepting": "intercept",
    "proceeded": "proceed",
    "proceeding": "proceed",
    "expected": "expect",
    "expecting": "expect",
    "joined": "join",
    "joining": "join",
    "crossed": "cross",
    "crossing": "cross",
    "increased": "increase",
    "increasing": "increase",
    "reduced": "reduce",
    "reducing": "reduce",
    "slowed": "slow",
    "slowing": "slow",
    "squawked": "squawk",
    "squawking": "squawk",
}
_LEMMA_RE = re.compile(r"\b(" + "|".join(_VERB_LEMMAS.keys()) + r")\b")


def _has_altitude_maintain_evidence(text: str) -> bool:
    """True when a maintain-altitude phrase exists, even if knots also appear."""
    if re.search(r"\bmaintain(?:ed)?\b", text) is None:
        return False
    if _ALTITUDE_LEX.search(text) is not None:
        return True
    return _MAINTAIN_COMPACT_FT.search(text) is not None


def normalize_evidence_text(text: str) -> str:
    from normalizer import normalize_stt_text

    return normalize_stt_text(text)


def guard_instruction_semantics(text: str, outcome: ParseOutcome) -> ParseOutcome:
    """Reject Path C instruction types unsupported by transcript evidence."""
    if not outcome.ok:
        return outcome
    normalized = normalize_evidence_text(text)
    kept = [
        instruction
        for instruction in outcome.instructions
        if _instruction_has_transcript_evidence(instruction, normalized)
    ]
    if not kept:
        return ParseOutcome(ok=False, error="PARSE_MISS")
    if len(kept) != len(outcome.instructions):
        return ParseOutcome(
            ok=True,
            callsign_token=outcome.callsign_token,
            instructions=kept,
        )
    return outcome


_PROCEDURE_STOP = frozenset(
    {
        "via",
        "join",
        "the",
        "to",
        "and",
        "arrival",
        "star",
        "sid",
        "procedure",
        "descend",
        "climb",
        "descent",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "niner",
        "zero",
        "oh",
    }
)


def _letter_tokens(source: str) -> set[str]:
    return {
        tok
        for tok in re.findall(r"[a-z]+", source.lower())
        if len(tok) > 1 and tok not in _PROCEDURE_STOP
    }


def _procedure_spoken_overlap(text: str, procedure_id: str, rows: list[dict[str, str]]) -> bool:
    name = ""
    for row in rows:
        if row.get("id") == procedure_id:
            name = row.get("name") or ""
            break
    spoken = text
    match = re.search(r"\b(?:via|join)\b(.+)", text.lower())
    if match:
        spoken = match.group(1)
    spoken_letters = _letter_tokens(spoken)
    if not spoken_letters:
        return True
    return bool(spoken_letters & _letter_tokens(procedure_id + " " + name))


def _span_is_evidence(span: dict[str, Any], transcript: str) -> bool:
    start, end, text = span.get("start"), span.get("end"), span.get("text")
    return (
        isinstance(start, int)
        and isinstance(end, int)
        and isinstance(text, str)
        and 0 <= start < end <= len(transcript)
        and transcript[start:end].casefold() == text.casefold()
    )


def _candidate_has_evidence(candidate: dict[str, Any], transcript: str) -> bool:
    return any(_span_is_evidence(span, transcript) for span in candidate.get("spans") or [])


def _route_segment_evidence_intervals(
    segment: dict[str, Any], route: dict[str, Any]
) -> list[tuple[int, int]]:
    if segment.get("type") == "DIRECT":
        return [
            (match["span"]["start"], match["span"]["end"])
            for match in route.get("fixMatches") or []
            if _direct_fix_match_is_unambiguous(match, segment.get("fixId"))
            and _span_is_evidence(match.get("span") or {}, route["transcript"])
        ]
    procedure = next(
        (item for item in route.get("procedures") or [] if item.get("id") == segment.get("procedureId")),
        None,
    )
    if procedure is None or not _candidate_has_evidence(procedure, route["transcript"]):
        return []
    transition_id = segment.get("transitionId")
    if transition_id is None:
        return [(span["start"], span["end"]) for span in procedure.get("spans") or []]
    transition = next(
        (item for item in procedure.get("transitions") or [] if item.get("id") == transition_id),
        None,
    )
    if transition is None or not _candidate_has_evidence(transition, route["transcript"]):
        return []
    return [
        (procedure_span["start"], transition_span["end"])
        for procedure_span in procedure.get("spans") or []
        for transition_span in transition.get("spans") or []
        if transition_span["start"] >= procedure_span["start"]
        and transition_span["end"] > procedure_span["end"]
    ]


def _direct_fix_match_is_unambiguous(match: dict[str, Any], fix_id: object) -> bool:
    candidates = match.get("candidates") or []
    selected = next(
        (candidate for candidate in candidates if candidate.get("id") == fix_id),
        None,
    )
    if selected is None or not candidates:
        return False
    best_score = max(candidate["score"] for candidate in candidates)
    return selected["score"] == best_score and sum(
        candidate["score"] == best_score for candidate in candidates
    ) == 1


def _ordered_route_evidence_paths(
    segments: list[dict[str, Any]], route: dict[str, Any]
) -> list[list[tuple[int, int]]]:
    paths: list[list[tuple[int, int]]] = [[]]
    for segment in segments:
        intervals = _route_segment_evidence_intervals(segment, route)
        next_paths: list[list[tuple[int, int]]] = []
        seen: set[tuple[tuple[int, int], ...]] = set()
        for path in paths:
            previous_end = path[-1][1] if path else -1
            for interval in intervals:
                if interval[0] < previous_end:
                    continue
                candidate = [*path, interval]
                key = tuple(candidate)
                if key in seen:
                    continue
                seen.add(key)
                next_paths.append(candidate)
        paths = next_paths
        if not paths:
            return []
    return paths


def _route_evidence_covered(route: dict[str, Any], intervals: list[tuple[int, int]]) -> bool:
    for match in re.finditer(r"\S+", route["transcript"]):
        if match.group(0).lower() in ROUTE_CONNECTORS:
            continue
        if not any(
            match.start() < end and match.end() > start
            for start, end in intervals
        ):
            return False

    return True


def _guard_route_window_ids(
    context: dict[str, Any], outcome: ParseOutcome
) -> ParseOutcome:
    route = context.get("routeWindow")
    if not isinstance(route, dict) or not outcome.ok:
        return outcome
    if len(outcome.instructions) != 1:
        return ParseOutcome(ok=False, error="PARSE_MISS")
    instruction = outcome.instructions[0]
    if instruction.get("type") != "IFR_CLEARANCE":
        return ParseOutcome(ok=False, error="PARSE_MISS")
    access = instruction.get("access") or {}
    if access.get("type") != "EXPLICIT_ROUTE" or not access.get("segments"):
        return ParseOutcome(ok=False, error="PARSE_MISS")
    transcript = route.get("transcript")
    if not isinstance(transcript, str) or not transcript.strip():
        return ParseOutcome(ok=False, error="PARSE_MISS")
    for match in route.get("fixMatches") or []:
        if (
            not isinstance(match, dict)
            or not _span_is_evidence(match.get("span") or {}, transcript)
            or not match.get("candidates")
        ):
            return ParseOutcome(ok=False, error="PARSE_MISS")
    for procedure in route.get("procedures") or []:
        if not isinstance(procedure, dict) or not _candidate_has_evidence(procedure, transcript):
            return ParseOutcome(ok=False, error="PARSE_MISS")
        for transition in procedure.get("transitions") or []:
            if transition.get("spans") and not _candidate_has_evidence(transition, transcript):
                return ParseOutcome(ok=False, error="PARSE_MISS")
    airport_ids = {row["icao"] for row in context.get("airports") or [] if isinstance(row, dict)}
    limit_ids = airport_ids | {
        row["id"] for row in context.get("clearanceLimits") or [] if isinstance(row, dict)
    }
    if instruction.get("limitId") not in limit_ids:
        return ParseOutcome(ok=False, error="PARSE_MISS")
    if not any(
        _route_evidence_covered(route, path)
        for path in _ordered_route_evidence_paths(access["segments"], route)
    ):
        return ParseOutcome(ok=False, error="PARSE_MISS")
    procedures = {
        row["id"]: row for row in route.get("procedures") or [] if isinstance(row, dict)
    }
    for segment in access["segments"]:
        if not isinstance(segment, dict):
            return ParseOutcome(ok=False, error="PARSE_MISS")
        if segment.get("type") == "DIRECT":
            if (
                segment.get("fixId") in airport_ids
                or not any(
                    _direct_fix_match_is_unambiguous(match, segment.get("fixId"))
                    and _span_is_evidence(match.get("span") or {}, transcript)
                    for match in route.get("fixMatches") or []
                )
            ):
                return ParseOutcome(ok=False, error="PARSE_MISS")
        elif segment.get("type") == "PROCEDURE":
            procedure = procedures.get(segment.get("procedureId"))
            if procedure is None or not _candidate_has_evidence(procedure, transcript):
                return ParseOutcome(ok=False, error="PARSE_MISS")
            transition_id = segment.get("transitionId")
            if transition_id is not None:
                transitions = {
                    row["id"]: row
                    for row in procedure.get("transitions") or []
                    if isinstance(row, dict)
                }
                transition = transitions.get(transition_id)
                if transition is None or not _candidate_has_evidence(transition, transcript):
                    return ParseOutcome(ok=False, error="PARSE_MISS")
        else:
            return ParseOutcome(ok=False, error="PARSE_MISS")
    return outcome


def guard_catalog_ids(
    text: str,
    context: dict[str, Any] | None,
    outcome: ParseOutcome,
) -> ParseOutcome:
    """When a catalog is provided, instruction ids must be listed ids."""
    if not outcome.ok:
        return outcome
    ctx = sanitize_parse_context(context) if context else None
    if not ctx:
        return outcome
    if ctx.get("routeWindow") is not None:
        return _guard_route_window_ids(ctx, outcome)
    fixes = set(ctx.get("fixes") or [])
    airports = {row["icao"] for row in ctx.get("airports") or []}
    procedures = {row["id"] for row in ctx.get("procedures") or []}
    approaches = {row["id"] for row in ctx.get("approaches") or []}
    roster = set(ctx.get("callsigns") or [])
    token = outcome.callsign_token
    if token and roster and token not in roster:
        token = None
    for instruction in outcome.instructions:
        kind = instruction["type"]
        if kind in {"DIRECT", "CROSS"}:
            if roster and instruction.get("fixId") in roster:
                return ParseOutcome(ok=False, error="PARSE_MISS")
            if instruction.get("fixId") in airports:
                return ParseOutcome(ok=False, error="PARSE_MISS")
            if fixes and instruction.get("fixId") not in fixes:
                return ParseOutcome(ok=False, error="PARSE_MISS")
        if kind == "IFR_CLEARANCE":
            limit_id = instruction.get("limitId")
            # An IFR limit can be a navaid/fix or a separately grounded
            # airport. Airport candidates are never added to `fixes`.
            if (fixes or airports) and limit_id not in fixes and limit_id not in airports:
                return ParseOutcome(ok=False, error="PARSE_MISS")
            access = instruction.get("access") or {}
            if access.get("type") == "FIX_THEN_DIRECT":
                if access.get("fixId") in airports:
                    return ParseOutcome(ok=False, error="PARSE_MISS")
                if fixes and access.get("fixId") not in fixes:
                    return ParseOutcome(ok=False, error="PARSE_MISS")
            if access.get("type") == "SID" and procedures:
                if access.get("procedureId") not in procedures:
                    return ParseOutcome(ok=False, error="PARSE_MISS")
        if kind in {"DESCEND_VIA", "CLIMB_VIA", "JOIN_PROCEDURE"}:
            if roster and instruction.get("procedureId") in roster:
                return ParseOutcome(ok=False, error="PARSE_MISS")
            if procedures and (
                instruction.get("procedureId") not in procedures
                or not _procedure_spoken_overlap(
                    text, str(instruction.get("procedureId") or ""), ctx.get("procedures") or []
                )
            ):
                return ParseOutcome(ok=False, error="PARSE_MISS")
        if kind in {"EXPECT_APPROACH", "CLEARED_APPROACH", "INTERCEPT_LOCALIZER"}:
            if roster and instruction.get("approachId") in roster:
                return ParseOutcome(ok=False, error="PARSE_MISS")
            if approaches and instruction.get("approachId") not in approaches:
                return ParseOutcome(ok=False, error="PARSE_MISS")
    if token != outcome.callsign_token:
        return ParseOutcome(
            ok=True,
            callsign_token=token,
            instructions=outcome.instructions,
        )
    return outcome


def _mock_route_parse(context: dict[str, Any]) -> ParseOutcome:
    route = context.get("routeWindow") if isinstance(context, dict) else None
    if not isinstance(route, dict):
        return ParseOutcome(ok=False, error="PARSE_MISS")
    entries: list[tuple[int, int, str, dict[str, Any], dict[str, Any] | None]] = []
    for match in route.get("fixMatches") or []:
        span = match.get("span") or {}
        for candidate in match.get("candidates") or []:
            entries.append(
                (int(span["start"]), int(span["end"]), "DIRECT", candidate, span)
            )
    for procedure in route.get("procedures") or []:
        spans = procedure.get("spans") or []
        for span in spans:
            entries.append(
                (int(span["start"]), int(span["end"]), "PROCEDURE", procedure, span)
            )
    entries.sort(key=lambda item: (item[0], -(item[1] - item[0]), item[2], item[3]["id"]))
    if not entries:
        return ParseOutcome(ok=False, error="PARSE_MISS")

    route_tokens = list(re.finditer(r"\S+", route["transcript"]))
    route_tokens = [match for match in route_tokens if match.group(0).lower() not in ROUTE_CONNECTORS]

    def choose(token_index: int, previous_end: int) -> list[tuple[int, int, str, dict[str, Any], dict[str, Any] | None]] | None:
        if token_index >= len(route_tokens):
            return []
        token = route_tokens[token_index]
        for entry in entries:
            start, end, *_ = entry
            if start < previous_end or start > token.start() or end < token.end():
                continue
            next_token_index = token_index + 1
            while (
                next_token_index < len(route_tokens)
                and route_tokens[next_token_index].start() < end
            ):
                next_token_index += 1
            tail = choose(next_token_index, end)
            if tail is not None:
                return [entry, *tail]
        return None

    chosen = choose(0, -1)
    if not chosen:
        return ParseOutcome(ok=False, error="PARSE_MISS")
    segments: list[dict[str, Any]] = []
    for _, _, kind, candidate, _ in chosen:
        if kind == "DIRECT":
            segments.append({"type": "DIRECT", "fixId": candidate["id"]})
            continue
        segment = {"type": "PROCEDURE", "procedureId": candidate["id"]}
        transitions = [item for item in candidate.get("transitions") or [] if item.get("spans")]
        if len(transitions) == 1:
            segment["transitionId"] = transitions[0]["id"]
        segments.append(segment)
    limits = context.get("clearanceLimits") or []
    airports = context.get("airports") or []
    limit_id = (limits[0].get("id") if limits else None) or (airports[0].get("icao") if airports else None)
    if not limit_id:
        return ParseOutcome(ok=False, error="PARSE_MISS")
    return ParseOutcome(
        ok=True,
        instructions=[
            {
                "type": "IFR_CLEARANCE",
                "limitId": limit_id,
                "access": {"type": "EXPLICIT_ROUTE", "segments": segments},
            }
        ],
    )


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
        del source
        if schema_version != SCHEMA_VERSION:
            return ParseOutcome(ok=False, error="SCHEMA")
        stripped = text.strip()
        if stripped == "":
            return ParseOutcome(ok=False, error="PARSE_MISS")
        # Explicit SCHEMA trigger so CI does not need a real model.
        if "[SCHEMA]" in stripped.upper() or stripped.upper().startswith("CHAT"):
            return ParseOutcome(ok=False, error="SCHEMA")
        if isinstance(context, dict) and context.get("routeWindow") is not None:
            route = _mock_route_parse(context)
            return guard_catalog_ids(stripped, context, guard_instruction_semantics(stripped, route))
        return ParseOutcome(
            ok=True,
            callsign_token=MOCK_PARSE_OK["callsignToken"],  # type: ignore[arg-type]
            instructions=list(MOCK_PARSE_OK["instructions"]),  # type: ignore[arg-type]
        )


def _ensure_gguf(settings: Settings) -> tuple[Path, str]:
    model_id = settings.parse_model_id
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
    """True when this llama-cpp-python build can offload layers."""
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
    """Local llama.cpp instruct model. CPU OK, slow OK. Default is Qwen3 4B."""

    def __init__(self, settings: Settings) -> None:
        import time

        from llama_cpp import Llama

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
        self._model_id = settings.parse_model_id
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
        from normalizer import normalize_stt_text

        fixes = context.get("fixes") if isinstance(context, dict) else None
        normalized_text = normalize_stt_text(text, recognized_fixes=fixes)
        user = build_parse_user_message(normalized_text, source, context)
        kwargs: dict[str, Any] = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ],
            "temperature": 0.0,
            "max_tokens": 128,
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
        outcome = validate_parse_json(parsed)
        guarded = guard_catalog_ids(normalized_text, context, guard_instruction_semantics(normalized_text, outcome))
        if outcome.ok and not guarded.ok:
            log.info(
                "parse guard miss types=%s",
                [ins.get("type") for ins in outcome.instructions],
            )
        return guarded


def build_parse(settings: Settings) -> ParseEngine | None:
    # Settings.load always supplies the mandatory default. Keep hand-built
    # invalid settings fail-soft for callers that bypass configuration.
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
            "pip install -r requirements.txt (default model %s / %s). "
            "POST /parse stays UNAVAILABLE.",
            settings.parse_model_id,
            DEFAULT_PARSE_MODEL_ID,
            DEFAULT_PARSE_GGUF_FILE,
        )
        return None
    except Exception:
        log.exception("LLM failed to load; POST /parse UNAVAILABLE")
        return None
