"""Tests for speech-api/normalizer.py (pre-parse normalization and lemmatization)."""

from __future__ import annotations

import pytest
from normalizer import (
    is_flight_or_alphanumeric,
    is_runway_designation,
    lemmatize_token,
    normalize_orthography,
    normalize_stt_text,
)


def test_required_parent_test_cases() -> None:
    # 1. Endeavour 9255 maintained 5,000 until established...
    raw1 = "Endeavour 9255 maintained 5,000 until established..."
    assert normalize_stt_text(raw1) == "endeavor 9255 maintain 5000 until established"

    # 2. proceed direct Bluff, cross Bluff at and maintain five thousand
    raw2 = "proceed direct Bluff, cross Bluff at and maintain five thousand"
    assert normalize_stt_text(raw2) == "proceed direct bluff cross bluff at and maintain five thousand"

    # 3. fife tree niner
    raw3 = "fife tree niner"
    assert normalize_stt_text(raw3) == "five three nine"


def test_verb_lemmatization_past_tense() -> None:
    cases = {
        "maintained": "maintain",
        "turned": "turn",
        "climbed": "climb",
        "descended": "descend",
        "intercepted": "intercept",
        "cleared": "clear",
        "reduced": "reduce",
        "increased": "increase",
        "expedited": "expedite",
        "proceeded": "proceed",
        "contacted": "contact",
        "squawked": "squawk",
        "slowed": "slow",
        "resumed": "resume",
        "joined": "join",
        "stopped": "stop",
    }
    for inflected, lemma in cases.items():
        assert lemmatize_token(inflected) == lemma


def test_verb_lemmatization_progressive() -> None:
    cases = {
        "descending": "descend",
        "turning": "turn",
        "climbing": "climb",
        "proceeding": "proceed",
        "maintaining": "maintain",
        "intercepting": "intercept",
        "reducing": "reduce",
        "increasing": "increase",
        "expediting": "expedite",
        "slowing": "slow",
        "stopping": "stop",
    }
    for inflected, lemma in cases.items():
        assert lemmatize_token(inflected) == lemma


def test_verb_lemmatization_3rd_person() -> None:
    cases = {
        "maintains": "maintain",
        "crosses": "cross",
        "turns": "turn",
        "climbs": "climb",
        "descends": "descend",
        "reduces": "reduce",
        "increases": "increase",
        "expedites": "expedite",
        "proceeds": "proceed",
        "flies": "fly",
    }
    for inflected, lemma in cases.items():
        assert lemmatize_token(inflected) == lemma


def test_verb_lemmatization_irregulars() -> None:
    assert lemmatize_token("flew") == "fly"
    assert lemmatize_token("sped") == "speed"
    assert lemmatize_token("held") == "hold"
    assert lemmatize_token("went") == "go"


def test_guardrails_protect_numbers_runways_fixes_keywords() -> None:
    # Numbers & words
    assert lemmatize_token("26") == "26"
    assert lemmatize_token("270") == "270"
    assert lemmatize_token("5000") == "5000"
    assert lemmatize_token("one") == "one"
    assert lemmatize_token("two") == "two"
    assert lemmatize_token("three") == "three"
    assert lemmatize_token("four") == "four"

    # Flight numbers & runway designations
    assert lemmatize_token("dal123") == "dal123"
    assert lemmatize_token("aal456") == "aal456"
    assert lemmatize_token("26l") == "26l"
    assert lemmatize_token("26r") == "26r"
    assert lemmatize_token("rw26r") == "rw26r"
    assert is_runway_designation("26R")
    assert is_runway_designation("RWY09L")
    assert is_flight_or_alphanumeric("UAL9953")

    # 5-letter fix names
    assert lemmatize_token("foger") == "foger"
    assert lemmatize_token("bluff") == "bluff"
    assert lemmatize_token("semax") == "semax"
    assert lemmatize_token("drako") == "drako"

    # Protected ATC keywords
    assert lemmatize_token("heading") == "heading"
    assert lemmatize_token("degrees") == "degrees"
    assert lemmatize_token("knots") == "knots"
    assert lemmatize_token("miles") == "miles"
    assert lemmatize_token("speed") == "speed"
    assert lemmatize_token("proceed") == "proceed"
    assert lemmatize_token("feet") == "feet"
    assert lemmatize_token("established") == "established"

    # Protected telephony callsigns
    assert lemmatize_token("united") == "united"
    assert lemmatize_token("american") == "american"
    assert lemmatize_token("endeavor") == "endeavor"


def test_orthographic_normalization() -> None:
    assert normalize_orthography("endeavour") == "endeavor"
    assert normalize_orthography("colour") == "color"
    assert normalize_orthography("harbour") == "harbor"
    assert normalize_orthography("centre") == "center"
    assert normalize_orthography("centres") == "centers"

    # Protected native English -our words
    assert normalize_orthography("four") == "four"
    assert normalize_orthography("hour") == "hour"
    assert normalize_orthography("our") == "our"
    assert normalize_orthography("tour") == "tour"
    assert normalize_orthography("sour") == "sour"
    assert normalize_orthography("pour") == "pour"


def test_filler_words_and_artifacts() -> None:
    raw = "uh delta 123 um please turn left ah heading 270 now"
    assert normalize_stt_text(raw) == "delta 123 turn left heading 270"

    raw_for_me = "turn left heading 270 for me please"
    assert normalize_stt_text(raw_for_me) == "turn left heading 270"


def test_comma_stripping_in_numbers() -> None:
    assert normalize_stt_text("climb and maintain 10,000") == "climb and maintain 10000"
    assert normalize_stt_text("descend to 5,000 feet") == "descend to 5000 feet"
    assert normalize_stt_text("1,000,000") == "1000000"


def test_spoken_icao_numbers() -> None:
    assert normalize_stt_text("fly heading tree fife zero") == "fly heading three five zero"
    assert normalize_stt_text("descend to niner thousand") == "descend to nine thousand"
    assert normalize_stt_text("maintain four thousand till established") == "maintain four thousand until established"
