"""Pre-parse normalization and lemmatization for ATC speech transcripts.

Provides deterministic rule-based lemmatization, orthographic canonicalization
(UK -> US), number formatting (comma removal, ICAO number words), filler word
filtering, and suffix protection guardrails (runways, numbers, 5-letter fix names,
and critical ATC vocabulary).
"""

from __future__ import annotations

import re
from typing import Collection

# Protected words with -our that are NOT British spellings and must not be altered.
PROTECTED_OUR = frozenset(
    {
        "our",
        "ours",
        "hour",
        "hours",
        "four",
        "fours",
        "fourteen",
        "fourth",
        "sour",
        "tour",
        "tours",
        "pour",
        "poured",
        "pouring",
        "pours",
        "scour",
        "scoured",
        "scouring",
        "scours",
        "flour",
        "flours",
        "course",
        "court",
        "courage",
        "encourage",
        "journey",
        "resource",
    }
)

# Filler words to drop from transcripts
FILLERS = frozenset({"uh", "um", "er", "ah", "please", "now"})

# Spoken ICAO aliases to canonicalize
ICAO_ALWAYS = {
    "niner": "nine",
    "tree": "three",
    "fife": "five",
    "till": "until",
}

# Number words that should not be stemmed
NUMBER_WORDS = frozenset(
    {
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
        "twenty",
        "thirty",
        "forty",
        "fifty",
        "sixty",
        "seventy",
        "eighty",
        "ninety",
        "hundred",
        "thousand",
        "thousands",
    }
)

# Critical keywords, telephony callsigns, and terminology protected from suffix stripping
PROTECTED_WORDS = frozenset(
    {
        # Core ATC keywords that end in -ing, -s, -es, or -ed
        "heading",
        "degrees",
        "knots",
        "miles",
        "speed",
        "proceed",
        "feet",
        "foot",
        "established",
        "runway",
        "approach",
        "localizer",
        "altitude",
        "flight",
        "level",
        "direct",
        "via",
        "cross",
        "pass",
        "press",
        "miss",
        "this",
        "yes",
        "status",
        "flaps",
        "always",
        "during",
        "boeing",
        "airbus",
        # Telephony callsigns and components
        "united",
        "express",
        "american",
        "delta",
        "southwest",
        "jetblue",
        "alaska",
        "frontier",
        "fedex",
        "ups",
        "brickyard",
        "skywest",
        "endeavor",
        "hawaiian",
        "canada",
        "speedbird",
    }
)

# Common irregular ATC verbs
IRREGULAR_VERBS = {
    "flew": "fly",
    "sped": "speed",
    "held": "hold",
    "went": "go",
    "ran": "run",
    "spoke": "speak",
    "taken": "take",
    "took": "take",
}

# Comprehensive ATC verb inflection mapping to base lemmas
ATC_VERB_MAP = {
    # maintain
    "maintained": "maintain",
    "maintaining": "maintain",
    "maintains": "maintain",
    # turn
    "turned": "turn",
    "turning": "turn",
    "turns": "turn",
    # climb
    "climbed": "climb",
    "climbing": "climb",
    "climbs": "climb",
    # descend
    "descended": "descend",
    "descending": "descend",
    "descends": "descend",
    # intercept
    "intercepted": "intercept",
    "intercepting": "intercept",
    "intercepts": "intercept",
    # clear
    "cleared": "clear",
    "clearing": "clear",
    "clears": "clear",
    # reduce
    "reduced": "reduce",
    "reducing": "reduce",
    "reduces": "reduce",
    # increase
    "increased": "increase",
    "increasing": "increase",
    "increases": "increase",
    # expedite
    "expedited": "expedite",
    "expediting": "expedite",
    "expedites": "expedite",
    # cross
    "crossed": "cross",
    "crossing": "cross",
    "crosses": "cross",
    # proceed
    "proceeded": "proceed",
    "proceeding": "proceed",
    "proceeds": "proceed",
    # speed
    "speeded": "speed",
    "speeding": "speed",
    "speeds": "speed",
    # fly
    "flying": "fly",
    "flies": "fly",
    # hold
    "holding": "hold",
    "holds": "hold",
    # slow
    "slowed": "slow",
    "slowing": "slow",
    "slows": "slow",
    # resume
    "resumed": "resume",
    "resuming": "resume",
    "resumes": "resume",
    # contact
    "contacted": "contact",
    "contacting": "contact",
    "contacts": "contact",
    # squawk
    "squawked": "squawk",
    "squawking": "squawk",
    "squawks": "squawk",
    # join
    "joined": "join",
    "joining": "join",
    "joins": "join",
    # follow
    "followed": "follow",
    "following": "follow",
    "follows": "follow",
    # depart
    "departed": "depart",
    "departing": "depart",
    "departs": "depart",
    # expect
    "expected": "expect",
    "expecting": "expect",
    "expects": "expect",
    # report
    "reported": "report",
    "reporting": "report",
    "reports": "report",
    # request
    "requested": "request",
    "requesting": "request",
    "requests": "request",
    # enter
    "entered": "enter",
    "entering": "enter",
    "enters": "enter",
    # circle
    "circled": "circle",
    "circling": "circle",
    "circles": "circle",
    # taxi
    "taxied": "taxi",
    "taxiing": "taxi",
    "taxis": "taxi",
    # stop
    "stopped": "stop",
    "stopping": "stop",
    "stops": "stop",
    # continue
    "continued": "continue",
    "continuing": "continue",
    "continues": "continue",
    # vector
    "vectored": "vector",
    "vectoring": "vector",
    "vectors": "vector",
    # level
    "leveled": "level",
    "leveling": "level",
    "levels": "level",
    # ident
    "identified": "ident",
    "identing": "ident",
    "idented": "ident",
    "idents": "ident",
}

_RUNWAY_RE = re.compile(r"^(?:rw|rwy)?\d{1,2}[lrc]?$", re.IGNORECASE)
_DIGIT_COMMA_RE = re.compile(r"(\d+),(\d+)")
_NON_ALPHANUM_RE = re.compile(r"[^a-zA-Z0-9\s]")
_OUR_RE = re.compile(r"[a-z]{2,}our(s|ed|ing)?$", re.IGNORECASE)


def normalize_orthography(token: str) -> str:
    """UK/Commonwealth to US spelling canonicalization.

    E.g. endeavour -> endeavor, colour -> color, harbour -> harbor, centre -> center.
    Protects native English -our words like four, hour, sour, tour, flour, court, course.
    """
    lower = token.lower()
    if lower == "centre":
        return "center"
    if lower == "centres":
        return "centers"
    if lower in PROTECTED_OUR:
        return lower
    if _OUR_RE.search(lower):
        return re.sub(r"our(s|ed|ing)?$", r"or\1", lower, flags=re.IGNORECASE)
    return lower


def is_runway_designation(token: str) -> bool:
    """Matches runway IDs such as 26R, 26L, 09C, RW26R, 8, 27."""
    return bool(_RUNWAY_RE.match(token))


def is_flight_or_alphanumeric(token: str) -> bool:
    """Matches tokens containing digits, e.g. UAL9953, 5000, 270, FL350."""
    return any(c.isdigit() for c in token)


def rule_based_lemmatize(token: str) -> str:
    """Fallback suffix reduction for English verbs not covered in explicit table.

    Safeguards:
    - Tokens <= 4 characters are never stripped.
    - 5-letter tokens are protected (protects 5-letter fix names).
    - Tokens ending in -eed (e.g. speed, proceed, exceed) are never stripped.
    """
    if len(token) <= 5:
        return token

    # Past tense / participles (-ed)
    if token.endswith("ed"):
        if token.endswith("eed"):
            return token
        if token.endswith("ied") and len(token) > 4:
            return token[:-3] + "y"
        # Double consonant + ed (e.g. stopped -> stop)
        if len(token) > 5 and token[-3] == token[-4] and token[-3] not in "aeiouy":
            return token[:-3]
        return token[:-2]

    # Progressive (-ing)
    if token.endswith("ing"):
        if len(token) <= 5:
            return token
        # Double consonant + ing (e.g. stopping -> stop)
        if len(token) > 6 and token[-4] == token[-5] and token[-4] not in "aeiouy":
            return token[:-4]
        return token[:-3]

    # 3rd person singular (-es / -s)
    if token.endswith("es"):
        if token.endswith("sses") or token.endswith("ches") or token.endswith("shes") or token.endswith("xes"):
            return token[:-2]
        if token.endswith("ies") and len(token) > 4:
            return token[:-3] + "y"
        return token[:-1]

    if token.endswith("s") and not token.endswith("ss"):
        return token[:-1]

    return token


def lemmatize_token(token: str, recognized_fixes: Collection[str] | None = None) -> str:
    """Lemmatizes a single ATC token with suffix protection guardrails."""
    lower = token.lower().strip()
    if not lower:
        return ""

    # Suffix protection guardrails:
    # 1. Alphanumeric with digits (flight numbers, callsigns, altitudes, headings)
    if is_flight_or_alphanumeric(lower):
        return lower

    # 2. Runway designators (26R, 26L, etc.)
    if is_runway_designation(lower):
        return lower

    # 3. Number words (one, two, three, thousand, etc.)
    if lower in NUMBER_WORDS:
        return lower

    # 4. Known or recognized fix names (e.g. FOGER, BLUFF, SEMAX)
    if recognized_fixes:
        upper = lower.upper()
        if upper in recognized_fixes or lower in recognized_fixes:
            return lower

    # 5. Core ATC protected keywords and telephony callsigns
    if lower in PROTECTED_WORDS:
        return lower

    # 6. Irregular verbs
    if lower in IRREGULAR_VERBS:
        return IRREGULAR_VERBS[lower]

    # 7. Explicit ATC verb inflections
    if lower in ATC_VERB_MAP:
        return ATC_VERB_MAP[lower]

    # 8. Fallback rule-based lemmatization
    return rule_based_lemmatize(lower)


def normalize_stt_text(text: str, recognized_fixes: Collection[str] | None = None) -> str:
    """Full normalization and lemmatization pipeline for spoken ATC text.

    Steps:
    1. Strip commas between digits (e.g. 5,000 -> 5000).
    2. Replace hyphens with space.
    3. Strip non-alphanumeric punctuation.
    4. Tokenize and drop filler words (uh, um, er, ah, please, 'for me').
    5. Canonicalize ICAO spoken numbers (niner -> nine, tree -> three, fife -> five, till -> until).
    6. Canonicalize British/Commonwealth orthography (endeavour -> endeavor).
    7. Lemmatize ATC verbs with suffix protection guardrails.
    8. Join tokens into a clean normalized string.
    """
    if not text:
        return ""

    # 1. Comma stripping in numbers (repeated to handle multiple commas like 1,000,000)
    cleaned = text
    while _DIGIT_COMMA_RE.search(cleaned):
        cleaned = _DIGIT_COMMA_RE.sub(r"\1\2", cleaned)

    # 2. Hyphen to space
    cleaned = cleaned.replace("-", " ")

    # 3. Punctuation stripping (retain alphanumeric and spaces)
    cleaned = _NON_ALPHANUM_RE.sub(" ", cleaned)

    # 4. Split into tokens
    raw_tokens = cleaned.strip().split()
    if not raw_tokens:
        return ""

    # 5. Drop filler words (and "for me")
    tokens: list[str] = []
    i = 0
    while i < len(raw_tokens):
        tok = raw_tokens[i].lower()
        if tok == "for" and i + 1 < len(raw_tokens) and raw_tokens[i + 1].lower() == "me":
            i += 2
            continue
        if tok in FILLERS:
            i += 1
            continue
        tokens.append(tok)
        i += 1

    # 6. Apply ICAO aliases, orthography, and lemmatization
    normalized_tokens: list[str] = []
    for tok in tokens:
        # ICAO spoken aliases
        if tok in ICAO_ALWAYS:
            tok = ICAO_ALWAYS[tok]

        # Orthography (endeavour -> endeavor)
        tok = normalize_orthography(tok)

        # Lemmatization
        tok = lemmatize_token(tok, recognized_fixes=recognized_fixes)

        normalized_tokens.append(tok)

    return " ".join(normalized_tokens)
