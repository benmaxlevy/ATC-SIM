"""Replay the redacted /parse slice captured in fullrun.har.

Offline mode reports the recorded baseline. Pass ``--url`` to replay every
request against a running local speech-api. Audio, timestamps, and HAR metadata
are intentionally absent from the fixture.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

FIXTURE = Path(__file__).with_name("tests") / "fixtures" / "fullrun-parse-replay.json"
CLASSES = {"accepted", "expected_miss", "unsafe_acceptance", "incomplete_acceptance"}


def load_replay() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _post(url: str, case: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    payload = json.dumps(
        {
            "text": case["text"],
            "source": "voice",
            "schemaVersion": "command-ir-v0",
            "context": context,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="local speech-api /parse URL")
    args = parser.parse_args()
    replay = load_replay()
    counts = {name: 0 for name in sorted(CLASSES)}
    failures = 0
    for case in replay["cases"]:
        expected_class = case["classification"]
        counts[expected_class] += 1
        body = case["response"]
        if args.url:
            try:
                body = _post(args.url, case, replay["contexts"][case["context"]])
            except Exception as exc:  # noqa: BLE001 - replay report surface
                failures += 1
                print(f"FAIL {case['id']} {type(exc).__name__}: {exc}")
                continue
        marker = "BASE" if not args.url else ("OK" if body == case["response"] else "DIFF")
        if marker == "DIFF":
            failures += 1
        print(f"{marker:4} {case['id']} expected={expected_class} response={body}")
    print("classification counts:", ", ".join(f"{k}={counts[k]}" for k in sorted(counts)))
    print(f"replay: {len(replay['cases']) - failures}/{len(replay['cases'])} responses matched")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
