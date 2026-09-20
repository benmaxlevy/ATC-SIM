"""Live Path C eval against a synthetic facility catalog (not KDEM).

Not CI. Needs local GGUF weights.

  python eval_parse.py
  python eval_parse.py --url http://127.0.0.1:8090/parse
  python eval_parse.py --only hdg-left-asr,via-star-spoken
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

SCHEMA_VERSION = "command-ir-v0"

# Fictional second facility. Live Path C must map from this catalog, not KDEM.
FACILITY: dict[str, Any] = {
    "callsigns": ["UAL456", "AAL12", "SWA88"],
    "selectedCallsign": "UAL456",
    "fixes": ["CEDAR", "RIVVR", "MOUNT"],
    "procedures": [
        {"id": "RIVR1", "name": "RIVER ONE"},
        {"id": "HILL2", "name": "HILL TWO"},
    ],
    "approaches": [
        {"id": "ILS09", "name": "ILS RWY 09", "runway": "09"},
        {"id": "RNAV18", "name": "RNAV RWY 18", "runway": "18"},
    ],
    "airports": [
        {"icao": "KATL", "name": "Atlanta International", "aliases": ["Atlanta Airport"]},
        {"icao": "KSEA", "name": "Seattle Tacoma International", "aliases": ["Seattle Airport"]},
    ],
}

CS = "UAL456"

CASES: list[dict[str, Any]] = [
    # --- FLY_HEADING ---
    {
        "id": "hdg-left-clean",
        "text": "United four five six turn left heading two seven zero",
        "expect": {
            "callsignToken": CS,
            "instructions": [{"type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT"}],
        },
    },
    {
        "id": "hdg-left-asr",
        "text": "United four five six turn leftening two seven zero",
        "expect": {
            "callsignToken": CS,
            "instructions": [{"type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT"}],
        },
    },
    {
        "id": "hdg-left-asr-digits",
        "text": "United 456 turn leftening one five zero",
        "expect": {
            "callsignToken": CS,
            "instructions": [{"type": "FLY_HEADING", "headingDeg": 150, "turn": "LEFT"}],
        },
    },
    {
        "id": "hdg-right-clean",
        "text": "turn right heading zero niner zero",
        "expect": {"instructions": [{"type": "FLY_HEADING", "headingDeg": 90, "turn": "RIGHT"}]},
    },
    {
        "id": "hdg-shortest-clean",
        "text": "fly heading one eight zero",
        "expect": {
            "instructions": [{"type": "FLY_HEADING", "headingDeg": 180, "turn": "SHORTEST"}]
        },
    },
    {
        "id": "hdg-360-to-0",
        "text": "fly heading three six zero",
        "expect": {"instructions": [{"type": "FLY_HEADING", "headingDeg": 0, "turn": "SHORTEST"}]},
    },
    {
        "id": "hdg-rightening-asr",
        "text": "American twelve turn rightening two four zero",
        "expect": {
            "callsignToken": "AAL12",
            "instructions": [{"type": "FLY_HEADING", "headingDeg": 240, "turn": "RIGHT"}],
        },
    },
    # --- TURN_DEGREES / PRESENT ---
    {
        "id": "turn-deg-clean",
        "text": "turn left twenty degrees",
        "expect": {
            "instructions": [{"type": "TURN_DEGREES", "direction": "LEFT", "degrees": 20}]
        },
    },
    {
        "id": "turn-deg-asr",
        "text": "turn 40 degrees right",
        "expect": {
            "instructions": [{"type": "TURN_DEGREES", "direction": "RIGHT", "degrees": 40}]
        },
    },
    {
        "id": "present-clean",
        "text": "continue present heading",
        "expect": {"instructions": [{"type": "PRESENT_HEADING"}]},
    },
    {
        "id": "present-asr",
        "text": "maintain present heading",
        "expect": {"instructions": [{"type": "PRESENT_HEADING"}]},
    },
    # --- ALTITUDE ---
    {
        "id": "alt-descend-clean",
        "text": "descend and maintain four thousand",
        "expect": {
            "instructions": [{"type": "ALTITUDE", "altitudeFt": 4000, "verb": "DESCEND"}]
        },
    },
    {
        "id": "alt-descent-asr",
        "text": "descent and maintain 4000",
        "expect": {
            "instructions": [{"type": "ALTITUDE", "altitudeFt": 4000, "verb": "DESCEND"}]
        },
    },
    {
        "id": "alt-decent-asr",
        "text": "decent and maintain four thousand",
        "expect": {
            "instructions": [{"type": "ALTITUDE", "altitudeFt": 4000, "verb": "DESCEND"}]
        },
    },
    {
        "id": "alt-climb-clean",
        "text": "climb and maintain one one thousand",
        "expect": {
            "instructions": [{"type": "ALTITUDE", "altitudeFt": 11000, "verb": "CLIMB"}]
        },
    },
    {
        "id": "alt-maintain-clean",
        "text": "maintain five thousand",
        "expect": {
            "instructions": [{"type": "ALTITUDE", "altitudeFt": 5000, "verb": "MAINTAIN"}]
        },
    },
    {
        "id": "alt-expedite",
        "text": "descend and maintain three thousand without delay",
        "expect": {
            "instructions": [
                {"type": "ALTITUDE", "altitudeFt": 3000, "verb": "DESCEND", "expedite": True}
            ]
        },
    },
    {
        "id": "alt-until-established",
        "text": "maintain four thousand until established on the localizer",
        "expect": {
            "instructions": [
                {
                    "type": "ALTITUDE",
                    "altitudeFt": 4000,
                    "verb": "MAINTAIN",
                    "untilEstablished": True,
                }
            ]
        },
    },
    # --- SPEED ---
    {
        "id": "spd-maintain-clean",
        "text": "maintain two one zero knots",
        "expect": {"instructions": [{"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN"}]},
    },
    {
        "id": "spd-reduce-clean",
        "text": "reduce speed to two zero zero",
        "expect": {"instructions": [{"type": "SPEED", "speedKt": 200, "verb": "REDUCE"}]},
    },
    {
        "id": "spd-increase-clean",
        "text": "increase speed to two five zero knots",
        "expect": {"instructions": [{"type": "SPEED", "speedKt": 250, "verb": "INCREASE"}]},
    },
    # --- DIRECT ---
    {
        "id": "dct-clean",
        "text": "proceed direct cedar",
        "expect": {"instructions": [{"type": "DIRECT", "fixId": "CEDAR"}]},
    },
    {
        "id": "dct-asr-split",
        "text": "proceed direct see dar",
        "expect": {"instructions": [{"type": "DIRECT", "fixId": "CEDAR"}]},
    },
    {
        "id": "dct-to-fix",
        "text": "direct to mount",
        "expect": {"instructions": [{"type": "DIRECT", "fixId": "MOUNT"}]},
    },
    # --- SQUAWK / VFR ---
    {
        "id": "squawk-discrete",
        "text": "squawk two two two two",
        "expect": {"instructions": [{"type": "ASSIGN_SQUAWK", "code": "2222", "source": "DISCRETE"}]},
    },
    {
        "id": "squad-discrete-asr",
        "text": "squad 2222",
        "expect": {"instructions": [{"type": "ASSIGN_SQUAWK", "code": "2222", "source": "DISCRETE"}]},
    },
    {
        "id": "squawk-vfr",
        "text": "squawk vfr",
        "expect": {"instructions": [{"type": "ASSIGN_SQUAWK", "code": "1200", "source": "VFR"}]},
    },
    {
        "id": "maintain-vfr",
        "text": "maintain vfr",
        "expect": {"instructions": [{"type": "MAINTAIN_VFR"}]},
    },
    {
        "id": "class-b-enter-alias",
        "text": "cleared into the class bravo airspace",
        "expect": {"instructions": [{"type": "CLASS_B_CLEARANCE", "operation": "TO_ENTER"}]},
    },
    {
        "id": "class-b-resume-vfr-altitudes",
        "text": "resume appropriate vfr altitudes",
        "expect": {"instructions": [{"type": "RESUME_APPROPRIATE_VFR_ALTITUDES"}]},
    },
    {
        "id": "class-b-cleared-as-requested",
        "text": "cleared as requested",
        "expect": {"instructions": [{"type": "CLASS_B_CLEARANCE_AS_REQUESTED"}]},
    },
    {
        "id": "class-b-unable",
        "text": "unable class b clearance",
        "expect": {"instructions": [{"type": "DECLINE_REQUEST", "service": "CLASS_B_ACCESS"}]},
    },
    {
        "id": "radar-contact-bare",
        "text": "radar contact",
        "expect": {"instructions": [{"type": "RADAR_CONTACT"}]},
    },
    {
        "id": "radar-contact-position",
        "text": "radar contact five miles from CEDAR",
        "expect": {
            "instructions": [
                {"type": "RADAR_CONTACT", "distanceNm": 5, "referenceId": "CEDAR", "referenceKind": "FIX"}
            ]
        },
    },
    {
        "id": "radar-contact-airport",
        "text": "radar contact two five miles southeast of atlanta airport",
        "expect": {
            "instructions": [
                {"type": "RADAR_CONTACT", "distanceNm": 25, "referenceId": "KATL", "referenceKind": "AIRPORT"}
            ]
        },
    },
    # --- Request-control commands ---
    {
        "id": "say-request",
        "text": "say request",
        "expect": {"instructions": [{"type": "REQUEST_DETAILS"}]},
    },
    {
        "id": "standby",
        "text": "stand by",
        "expect": {"instructions": [{"type": "STANDBY_REQUEST"}]},
    },
    {
        "id": "approve-flight-following",
        "text": "approve flight following",
        "expect": {"instructions": [{"type": "APPROVE_FLIGHT_FOLLOWING"}]},
    },
    {
        "id": "decline-flight-following",
        "text": "unable flight following",
        "expect": {"instructions": [{"type": "DECLINE_REQUEST", "service": "FLIGHT_FOLLOWING"}]},
    },
    {
        "id": "decline-ifr-pickup",
        "text": "unable ifr pickup",
        "expect": {"instructions": [{"type": "DECLINE_REQUEST", "service": "IFR_PICKUP"}]},
    },
    {
        "id": "terminate-radar-service",
        "text": "radar service terminated",
        "expect": {"instructions": [{"type": "TERMINATE_RADAR_SERVICE"}]},
    },
    {
        "id": "acknowledge-ifr-cancellation",
        "text": "ifr cancellation received",
        "expect": {"instructions": [{"type": "ACKNOWLEDGE_IFR_CANCELLATION"}]},
    },
    {
        "id": "contact-tower",
        "text": "contact Atlanta tower",
        "expect": {"instructions": [{"type": "CONTACT_TOWER", "facilityName": "ATLANTA"}]},
    },
    {
        "id": "contact-center",
        "text": "contact Atlanta center",
        "expect": {"instructions": [{"type": "CONTACT_CENTER", "facilityName": "ATLANTA"}]},
    },
    # --- IFR clearance forms ---
    {
        "id": "clearance-as-filed-airport-alias",
        "text": "cleared to Atlanta Airport as filed",
        "expect": {
            "instructions": [
                {"type": "IFR_CLEARANCE", "limitId": "KATL", "access": {"type": "AS_FILED"}}
            ]
        },
    },
    {
        "id": "clearance-direct-airport",
        "text": "cleared to KATL via direct",
        "expect": {
            "instructions": [
                {"type": "IFR_CLEARANCE", "limitId": "KATL", "access": {"type": "DIRECT"}}
            ]
        },
    },
    {
        "id": "clearance-fix-then-direct",
        "text": "cleared to KATL via CEDAR then direct",
        "expect": {
            "instructions": [
                {
                    "type": "IFR_CLEARANCE",
                    "limitId": "KATL",
                    "access": {"type": "FIX_THEN_DIRECT", "fixId": "CEDAR"},
                }
            ]
        },
    },
    {
        "id": "clearance-radar-vectors",
        "text": "cleared to Seattle Airport via radar vectors",
        "expect": {
            "instructions": [
                {"type": "IFR_CLEARANCE", "limitId": "KSEA", "access": {"type": "RADAR_VECTORS"}}
            ]
        },
    },
    {
        "id": "clearance-sid-optionals",
        "text": "cleared to KATL via RIVR1 transition HILL2 altitude 5000 climb via frequency 119.5 squawk 2345",
        "expect": {
            "instructions": [
                {
                    "type": "IFR_CLEARANCE",
                    "limitId": "KATL",
                    "access": {"type": "SID", "procedureId": "RIVR1", "transitionId": "HILL2"},
                    "altitudeFt": 5000,
                    "climbVia": True,
                    "frequency": "119.5",
                    "squawk": "2345",
                }
            ]
        },
    },
    {
        "id": "clearance-route-chain-fallback",
        "text": "cleared to KATL via swept hound",
        "context": {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "clearanceLimits": [],
            "routeWindow": {
                "transcript": "swept hound",
                "fixMatches": [
                    {"span": {"start": 0, "end": 5, "text": "swept"}, "candidates": [{"id": "SWEPT", "kind": "FIX", "score": 1, "method": "exact"}]},
                    {"span": {"start": 6, "end": 11, "text": "hound"}, "candidates": [{"id": "HOUND", "kind": "NAVAID", "score": 1, "method": "exact"}]},
                ],
                "procedures": [],
            },
        },
        "expect": {
            "instructions": [
                {
                    "type": "IFR_CLEARANCE",
                    "limitId": "KATL",
                    "access": {
                        "type": "EXPLICIT_ROUTE",
                        "segments": [
                            {"type": "DIRECT", "fixId": "SWEPT"},
                            {"type": "DIRECT", "fixId": "HOUND"},
                        ],
                    },
                }
            ]
        },
    },
    {
        "id": "clearance-route-unique-near-match",
        "text": "cleared to KATL via swep hound",
        "context": {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "routeWindow": {
                "transcript": "swep hound",
                "fixMatches": [
                    {"span": {"start": 0, "end": 4, "text": "swep"}, "candidates": [{"id": "SWEPT", "kind": "FIX", "score": 0.6, "method": "levenshtein", "distance": 1}]},
                    {"span": {"start": 5, "end": 10, "text": "hound"}, "candidates": [{"id": "HOUND", "kind": "NAVAID", "score": 1, "method": "exact"}]},
                ],
                "procedures": [],
            },
        },
        "expect": {
            "instructions": [
                {
                    "type": "IFR_CLEARANCE",
                    "limitId": "KATL",
                    "access": {"type": "EXPLICIT_ROUTE", "segments": [{"type": "DIRECT", "fixId": "SWEPT"}, {"type": "DIRECT", "fixId": "HOUND"}]},
                }
            ]
        },
    },
    {
        "id": "clearance-route-ambiguous-alternatives",
        "text": "cleared to KATL via kimmi",
        "context": {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "routeWindow": {
                "transcript": "kimmi",
                "fixMatches": [
                    {"span": {"start": 0, "end": 5, "text": "kimmi"}, "candidates": [{"id": "KIMMS", "kind": "FIX", "score": 0.6, "method": "levenshtein", "distance": 1}, {"id": "KIMMY", "kind": "FIX", "score": 0.6, "method": "levenshtein", "distance": 1}]},
                ],
                "procedures": [],
            },
        },
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
    {
        "id": "clearance-route-airport-not-fix",
        "text": "cleared to KATL via atlanta",
        "context": {
            "airports": [{"icao": "KATL", "name": "Atlanta International", "aliases": ["Atlanta"]}],
            "routeWindow": {
                "transcript": "atlanta",
                "fixMatches": [
                    {"span": {"start": 0, "end": 7, "text": "atlanta"}, "candidates": [{"id": "KATL", "kind": "FIX", "score": 1, "method": "exact"}]},
                ],
                "procedures": [],
            },
        },
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
    {
        "id": "clearance-route-hallucinated-id",
        "text": "cleared to KATL via invented",
        "context": {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "routeWindow": {
                "transcript": "invented",
                "fixMatches": [],
                "procedures": [],
            },
        },
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
    {
        "id": "tactical-direct-not-clearance",
        "text": "cleared direct CEDAR",
        "expect": {"instructions": [{"type": "DIRECT", "fixId": "CEDAR"}]},
    },
    {
        "id": "clearance-unknown-airport",
        "text": "cleared to Portland Airport via direct",
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
    {
        "id": "squad-invalid-octal",
        "text": "squad 8921",
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
    # --- APPROACH ---
    {
        "id": "expect-ils-clean",
        "text": "expect ILS runway zero niner approach",
        "expect": {"instructions": [{"type": "EXPECT_APPROACH", "approachId": "ILS09"}]},
    },
    {
        "id": "expect-ils-asr",
        "text": "expect ils runway 09",
        "expect": {"instructions": [{"type": "EXPECT_APPROACH", "approachId": "ILS09"}]},
    },
    {
        "id": "app-ils-clean",
        "text": "cleared ILS runway zero niner approach",
        "expect": {"instructions": [{"type": "CLEARED_APPROACH", "approachId": "ILS09"}]},
    },
    {
        "id": "app-ils-asr",
        "text": "cleared ils rwy 09",
        "expect": {"instructions": [{"type": "CLEARED_APPROACH", "approachId": "ILS09"}]},
    },
    {
        "id": "app-rnav-clean",
        "text": "cleared RNAV runway one eight approach",
        "expect": {"instructions": [{"type": "CLEARED_APPROACH", "approachId": "RNAV18"}]},
    },
    {
        "id": "app-visual-clean",
        "text": "cleared visual approach runway zero niner",
        "expect": {"instructions": [{"type": "CLEARED_VISUAL", "runwayId": "09"}]},
    },
    {
        "id": "app-visual-rwy",
        "text": "cleared visual runway one eight",
        "expect": {"instructions": [{"type": "CLEARED_VISUAL", "runwayId": "18"}]},
    },
    {
        "id": "loc-clean",
        "text": "intercept runway zero niner localizer",
        "expect": {"instructions": [{"type": "INTERCEPT_LOCALIZER", "approachId": "ILS09"}]},
    },
    {
        "id": "loc-asr",
        "text": "intercept the loc runway 09",
        "expect": {"instructions": [{"type": "INTERCEPT_LOCALIZER", "approachId": "ILS09"}]},
    },
    # --- IDENT / SAY / GA ---
    {
        "id": "ident-clean",
        "text": "ident",
        "expect": {"instructions": [{"type": "IDENT"}]},
    },
    {
        "id": "ident-asr",
        "text": "squawk iden",
        "expect": {"instructions": [{"type": "IDENT"}]},
    },
    {
        "id": "say-hdg",
        "text": "say heading",
        "expect": {"instructions": [{"type": "SAY_HEADING"}]},
    },
    {
        "id": "say-alt",
        "text": "say altitude",
        "expect": {"instructions": [{"type": "SAY_ALTITUDE"}]},
    },
    {
        "id": "ga-clean",
        "text": "go around",
        "expect": {"instructions": [{"type": "GO_AROUND"}]},
    },
    {
        "id": "ga-asr",
        "text": "goin around",
        "expect": {"instructions": [{"type": "GO_AROUND"}]},
    },
    {
        "id": "cancel-approach-clearance",
        "text": "cancel approach clearance, fly heading 270, maintain 5000",
        "expect": {
            "instructions": [
                {"type": "CANCEL_APPROACH"},
                {"type": "FLY_HEADING", "headingDeg": 270, "turn": "SHORTEST"},
                {"type": "ALTITUDE", "altitudeFt": 5000, "verb": "MAINTAIN"},
            ]
        },
    },
    # --- PROCEDURE / CROSS ---
    {
        "id": "via-star-clean",
        "text": "descend via river one",
        "expect": {"instructions": [{"type": "DESCEND_VIA", "procedureId": "RIVR1"}]},
    },
    {
        "id": "via-star-asr",
        "text": "descend via river 1",
        "expect": {"instructions": [{"type": "DESCEND_VIA", "procedureId": "RIVR1"}]},
    },
    {
        "id": "cvia-sid-clean",
        "text": "climb via hill two",
        "expect": {"instructions": [{"type": "CLIMB_VIA", "procedureId": "HILL2"}]},
    },
    {
        "id": "join-clean",
        "text": "join river one",
        "expect": {"instructions": [{"type": "JOIN_PROCEDURE", "procedureId": "RIVR1"}]},
    },
    {
        "id": "join-asr",
        "text": "join the river one arrival",
        "expect": {"instructions": [{"type": "JOIN_PROCEDURE", "procedureId": "RIVR1"}]},
    },
    {
        "id": "cross-at-clean",
        "text": "cross cedar at four thousand",
        "expect": {
            "instructions": [
                {"type": "CROSS", "fixId": "CEDAR", "altitudeFt": 4000, "restriction": "AT"}
            ]
        },
    },
    {
        "id": "cross-aoa-clean",
        "text": "cross cedar at or above five thousand",
        "expect": {
            "instructions": [
                {
                    "type": "CROSS",
                    "fixId": "CEDAR",
                    "altitudeFt": 5000,
                    "restriction": "AT_OR_ABOVE",
                }
            ]
        },
    },
    {
        "id": "cross-aob-clean",
        "text": "cross mount at or below three thousand",
        "expect": {
            "instructions": [
                {
                    "type": "CROSS",
                    "fixId": "MOUNT",
                    "altitudeFt": 3000,
                    "restriction": "AT_OR_BELOW",
                }
            ]
        },
    },
    # --- COMBINED ---
    {
        "id": "combo-hdg-alt-spd-asr",
        "text": (
            "United four five six, turn leftening one five zero, "
            "maintain five thousand, maintain two one zero knots."
        ),
        "expect": {
            "callsignToken": CS,
            "instructions": [
                {"type": "FLY_HEADING", "headingDeg": 150, "turn": "LEFT"},
                {"type": "ALTITUDE", "altitudeFt": 5000, "verb": "MAINTAIN"},
                {"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN"},
            ],
        },
    },
    {
        "id": "combo-advisory-ptac",
        "text": (
            "You are 12 miles from cedar. Maintain four thousand until established "
            "on the localizer. Cleared ILS runway zero niner approach."
        ),
        "expect": {
            "instructions": [
                {
                    "type": "ALTITUDE",
                    "altitudeFt": 4000,
                    "verb": "MAINTAIN",
                    "untilEstablished": True,
                },
                {"type": "CLEARED_APPROACH", "approachId": "ILS09"},
            ]
        },
    },
    {
        "id": "combo-turn-loc-alt",
        "text": "Turn 40 degrees left. Intercept runway 09 localizer. Maintain 5000.",
        "expect": {
            "instructions": [
                {"type": "TURN_DEGREES", "direction": "LEFT", "degrees": 40},
                {"type": "INTERCEPT_LOCALIZER", "approachId": "ILS09"},
                {"type": "ALTITUDE", "altitudeFt": 5000, "verb": "MAINTAIN"},
            ]
        },
    },
    # --- NEGATIVE / anti-KDEM ---
    {
        "id": "miss-garbage",
        "text": "pizza the runway",
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
    {
        "id": "miss-unknown-star",
        "text": "descend via demo one",
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
    {
        "id": "miss-advisory-only",
        "text": "you are 15 miles from cedar",
        "expect": {"ok": False, "error": "PARSE_MISS"},
    },
]


def _heading(value: object) -> object:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        n = int(value)
        return 0 if n == 360 else n
    return value


def _inst_covers(got: dict[str, Any], exp: dict[str, Any]) -> bool:
    if got.get("type") != exp.get("type"):
        return False
    for key, want in exp.items():
        if key == "type":
            continue
        have = got.get(key)
        if key == "headingDeg":
            if _heading(have) != _heading(want):
                return False
        elif have != want:
            return False
    return True


def check_case(body: dict[str, Any], expect: dict[str, Any]) -> str | None:
    if expect.get("ok") is False:
        if body.get("ok") is not False:
            return f"wanted PARSE_MISS got {body!r}"
        if body.get("error") != expect.get("error", "PARSE_MISS"):
            return f"wanted error {expect.get('error')} got {body!r}"
        return None
    if body.get("ok") is not True:
        return f"wanted ok got {body!r}"
    want_cs = expect.get("callsignToken")
    if want_cs is not None and body.get("callsignToken") != want_cs:
        return f"callsignToken {body.get('callsignToken')!r} != {want_cs!r}"
    got_list = body.get("instructions")
    want_list = expect.get("instructions") or []
    if not isinstance(got_list, list) or len(got_list) != len(want_list):
        return f"instructions {got_list!r} != {want_list!r}"
    for got, want in zip(got_list, want_list):
        if not isinstance(got, dict) or not _inst_covers(got, want):
            return f"instructions {got_list!r} != {want_list!r}"
    return None


def parse_http(
    url: str, text: str, timeout: float, context: dict[str, Any] | None = None
) -> dict[str, Any]:
    payload = json.dumps(
        {
            "text": text,
            "source": "voice",
            "schemaVersion": SCHEMA_VERSION,
            "context": context or FACILITY,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_inproc(engine: Any, text: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    outcome = engine.parse(text, "voice", SCHEMA_VERSION, context or FACILITY)
    return outcome.body()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="", help="POST /parse URL. Empty = in-process engine.")
    parser.add_argument("--only", default="", help="Comma-separated case ids.")
    parser.add_argument("--timeout", type=float, default=60.0)
    args = parser.parse_args()
    wanted = {part.strip() for part in args.only.split(",") if part.strip()}
    cases = [case for case in CASES if not wanted or case["id"] in wanted]
    if wanted:
        missing = wanted.difference(case["id"] for case in cases)
        if missing:
            print("unknown ids:", ", ".join(sorted(missing)), file=sys.stderr)
            return 2

    engine = None
    if not args.url:
        from config import Settings
        from parse_engine import build_parse

        settings = Settings.load()
        engine = build_parse(settings)
        if engine is None or not engine.ready:
            print("Path C engine unavailable", file=sys.stderr)
            return 2

    failed = 0
    t_all = time.perf_counter()
    for case in cases:
        t0 = time.perf_counter()
        try:
            if args.url:
                body = parse_http(args.url, case["text"], args.timeout, case.get("context"))
            else:
                body = parse_inproc(engine, case["text"], case.get("context"))
        except Exception as exc:  # noqa: BLE001 — eval surface
            body = {"ok": False, "error": f"EXC:{type(exc).__name__}:{exc}"}
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        err = check_case(body, case["expect"])
        mark = "FAIL" if err else "ok"
        if err:
            failed += 1
        print(f"{mark:4} {elapsed_ms:5}ms  {case['id']}")
        if err:
            print(f"       text={case['text']}")
            print(f"       {err}")
    total_ms = int((time.perf_counter() - t_all) * 1000)
    print(f"{len(cases) - failed}/{len(cases)} passed  {total_ms}ms")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
