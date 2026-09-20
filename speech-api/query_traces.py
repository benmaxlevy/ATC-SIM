"""Diagnostic query engine and CLI for ATC-SIM parse and STT traces.

Answers the 5 core diagnostic questions against .local/parse-traces.sqlite:
1. Failure root cause breakdown (STT, typed syntax, spoken_a grammar,
   ungrounded catalog token, Path B rewrite miss, Path C rejection).
2. How often does Path B rescue Path A? (Path B rescue rate: ratio of spoken_a
   miss to spoken_b hit).
3. Which Path C results are rejected by guards? (counts grouped by schema_rejection,
   evidence_rejection, catalog_grounding_rejection, timeout).
4. Which commands have the highest miss rate? (generic instruction type / command ranking).
5. Where is latency concentrated? (p50, p90, p99 per stage: stt, typed, spoken_a,
   spoken_b, llm_c).
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator, Sequence

try:
    from config import Settings
    from trace_db import get_db_connection
except ImportError:  # pragma: no cover - fallback when run outside speech-api dir
    from speech_api.config import Settings
    from speech_api.trace_db import get_db_connection


# Standard failure root cause category keys
ROOT_CAUSE_CATEGORIES = [
    "stt_empty_or_low_prob",
    "typed_syntax",
    "spoken_a_grammar",
    "ungrounded_catalog_token",
    "path_b_rewrite_miss",
    "path_c_rejection",
]

# Standard Path C guard rejection categories
PATH_C_GUARD_CATEGORIES = [
    "schema_rejection",
    "evidence_rejection",
    "catalog_grounding_rejection",
    "timeout",
]

# Standard latency stages
LATENCY_STAGES = ["stt", "typed", "spoken_a", "spoken_b", "llm_c"]


@contextmanager
def _open_conn(conn_or_path: sqlite3.Connection | Path | str) -> Generator[sqlite3.Connection | None, None, None]:
    """Yield an open sqlite3.Connection, or None if path does not exist."""
    if isinstance(conn_or_path, sqlite3.Connection):
        yield conn_or_path
        return

    path_str = str(conn_or_path)
    if path_str != ":memory:":
        p = Path(conn_or_path)
        if not p.exists():
            yield None
            return

    conn = get_db_connection(conn_or_path)
    try:
        yield conn
    finally:
        conn.close()


def _compute_percentile(sorted_values: Sequence[float], p: float) -> float:
    """Compute p-th percentile (0.0 - 100.0) with linear interpolation."""
    if not sorted_values:
        return 0.0
    n = len(sorted_values)
    if n == 1:
        return float(sorted_values[0])
    idx = (p / 100.0) * (n - 1)
    lower = int(idx)
    upper = min(lower + 1, n - 1)
    weight = idx - lower
    return float(sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight)


def get_failure_root_causes(
    conn_or_path: sqlite3.Connection | Path | str,
) -> dict[str, int]:
    """Breakdown of failure root causes for utterances with final_status != 'hit'.

    Returns counts grouped by:
    - stt_empty_or_low_prob
    - typed_syntax
    - spoken_a_grammar
    - ungrounded_catalog_token
    - path_b_rewrite_miss
    - path_c_rejection
    """
    counts = {cat: 0 for cat in ROOT_CAUSE_CATEGORIES}

    with _open_conn(conn_or_path) as conn:
        if conn is None:
            return counts

        # Fetch failed utterances
        cur = conn.execute(
            """
            SELECT utterance_id, source, stt_json, final_stage, final_status
            FROM utterances
            WHERE final_status != 'hit'
            """
        )
        failed_utterances = cur.fetchall()

        for uid, source, stt_raw, final_stage, final_status in failed_utterances:
            # Fetch stage attempts for this utterance
            cur_sa = conn.execute(
                """
                SELECT stage, status, reason, elapsed_ms, result_json
                FROM stage_attempts
                WHERE utterance_id = ?
                ORDER BY attempt_id ASC
                """,
                (uid,),
            )
            attempts = cur_sa.fetchall()

            stt_data: dict[str, Any] = {}
            if stt_raw:
                try:
                    parsed = json.loads(stt_raw) if isinstance(stt_raw, str) else stt_raw
                    if isinstance(parsed, dict):
                        stt_data = parsed
                except Exception:
                    pass

            category = _classify_failure(source, stt_data, attempts, final_stage, final_status)
            if category in counts:
                counts[category] += 1
            else:
                counts[category] = counts.get(category, 0) + 1

    return counts


def _classify_failure(
    source: str,
    stt_data: dict[str, Any],
    attempts: list[tuple[str, str, str | None, float, str | None]],
    final_stage: str | None,
    final_status: str,
) -> str:
    """Classify a failed utterance into its primary failure root cause."""
    reasons = [att[2] for att in attempts if att[2]]
    stages_by_name = {att[0]: att for att in attempts}

    # 1. Check if any attempt has an explicit category tag in reason
    for r in reasons:
        if r in ROOT_CAUSE_CATEGORIES:
            return r

    # 2. Check for ungrounded catalog tokens across any stage
    for stage, status, reason, _, res_raw in attempts:
        if reason in ("ungrounded_tokens", "ungrounded_catalog_token", "catalog_grounding_rejection"):
            return "ungrounded_catalog_token"
        if res_raw:
            try:
                res_obj = json.loads(res_raw) if isinstance(res_raw, str) else res_raw
                if isinstance(res_obj, dict):
                    ungrounded = res_obj.get("ungroundedTokens") or res_obj.get("ungroundedFixes")
                    if ungrounded and len(ungrounded) > 0:
                        return "ungrounded_catalog_token"
            except Exception:
                pass

    # 3. Check for STT empty / low-probability failure (voice source only)
    if source == "voice":
        text = str(stt_data.get("text", "")).strip()
        is_empty = stt_data.get("empty") is True or stt_data.get("is_empty") is True
        low_prob = stt_data.get("low_prob") is True or stt_data.get("lowProb") is True
        avg_logprob = stt_data.get("avg_logprob") or stt_data.get("avgLogprob")
        stt_attempt = stages_by_name.get("stt")

        if (
            not text
            or is_empty
            or low_prob
            or (avg_logprob is not None and float(avg_logprob) < -1.0)
            or (stt_attempt and stt_attempt[1] in ("miss", "rejected"))
            or any(r and "stt" in r.lower() for r in reasons)
        ):
            return "stt_empty_or_low_prob"

    # 4. Check for Path C rejection / timeout
    llm_attempt = stages_by_name.get("llm_c")
    if llm_attempt and llm_attempt[1] == "rejected":
        return "path_c_rejection"
    if final_status in ("timeout", "rejected") and final_stage == "none":
        if any(r in PATH_C_GUARD_CATEGORIES or r in ("timeout", "unavailable") for r in reasons):
            return "path_c_rejection"

    # 5. Check typed syntax for text commands
    if source == "text":
        typed_att = stages_by_name.get("typed")
        if typed_att and typed_att[1] in ("miss", "rejected"):
            return "typed_syntax"
        return "typed_syntax"

    # 6. Spoken B rewrite miss vs Spoken A grammar miss
    spoken_b_att = stages_by_name.get("spoken_b")
    spoken_a_att = stages_by_name.get("spoken_a")

    if spoken_b_att and spoken_b_att[1] == "miss":
        return "path_b_rewrite_miss"

    if spoken_a_att and spoken_a_att[1] in ("miss", "rejected"):
        return "spoken_a_grammar"

    return "spoken_a_grammar"


def get_path_b_rescue_rate(
    conn_or_path: sqlite3.Connection | Path | str,
) -> dict[str, Any]:
    """Calculate Path B rescue rate: ratio of spoken_a miss to spoken_b hit.

    Returns:
    {
        "spoken_a_misses": int,
        "spoken_b_rescues": int,
        "rescue_rate": float (0.0 to 1.0)
    }
    """
    with _open_conn(conn_or_path) as conn:
        if conn is None:
            return {
                "spoken_a_misses": 0,
                "spoken_b_rescues": 0,
                "rescue_rate": 0.0,
            }

        cur = conn.execute(
            """
            SELECT
                COUNT(CASE WHEN sa_a.status = 'miss' THEN 1 END) AS spoken_a_misses,
                COUNT(CASE WHEN sa_a.status = 'miss' AND sa_b.status = 'hit' THEN 1 END) AS spoken_b_rescues
            FROM utterances u
            JOIN stage_attempts sa_a ON u.utterance_id = sa_a.utterance_id AND sa_a.stage = 'spoken_a'
            LEFT JOIN stage_attempts sa_b ON u.utterance_id = sa_b.utterance_id AND sa_b.stage = 'spoken_b'
            """
        )
        row = cur.fetchone()
        spoken_a_misses = row[0] if row else 0
        spoken_b_rescues = row[1] if row else 0

        rate = (spoken_b_rescues / spoken_a_misses) if spoken_a_misses > 0 else 0.0
        return {
            "spoken_a_misses": spoken_a_misses,
            "spoken_b_rescues": spoken_b_rescues,
            "rescue_rate": round(rate, 4),
        }


def get_path_c_guard_rejections(
    conn_or_path: sqlite3.Connection | Path | str,
) -> dict[str, int]:
    """Counts of Path C guard rejections grouped by reason.

    Returns dict guaranteed to contain keys:
    - schema_rejection
    - evidence_rejection
    - catalog_grounding_rejection
    - timeout
    plus any additional reasons encountered.
    """
    counts = {cat: 0 for cat in PATH_C_GUARD_CATEGORIES}

    with _open_conn(conn_or_path) as conn:
        if conn is None:
            return counts

        cur = conn.execute(
            """
            SELECT COALESCE(reason, 'unknown') AS guard_reason, COUNT(*)
            FROM stage_attempts
            WHERE stage = 'llm_c' AND status = 'rejected'
            GROUP BY COALESCE(reason, 'unknown')
            """
        )
        for reason, count in cur.fetchall():
            counts[reason] = count

    return counts


def get_command_miss_rates(
    conn_or_path: sqlite3.Connection | Path | str,
) -> list[dict[str, Any]]:
    """Generic ranking of commands by miss rate.

    Extracts instruction types generically from result_json using SQLite json functions.
    Handles current and future instruction types without code modification.
    Sorted by miss_rate DESC, total DESC, command ASC.

    Returns:
    [
        {
            "command": str,
            "total": int,
            "hits": int,
            "misses": int,
            "miss_rate": float (0.0 to 1.0),
            "hit_rate": float (0.0 to 1.0),
        },
        ...
    ]
    """
    with _open_conn(conn_or_path) as conn:
        if conn is None:
            return []

        cur = conn.execute(
            """
            WITH cmd_utterances AS (
                SELECT DISTINCT u.utterance_id, jt.value AS command_type, u.final_status
                FROM utterances u
                JOIN stage_attempts sa ON u.utterance_id = sa.utterance_id
                CROSS JOIN json_each(sa.result_json, '$.instructionTypes') jt
                WHERE sa.result_json IS NOT NULL
                  AND json_valid(sa.result_json) = 1
                  AND json_type(sa.result_json, '$.instructionTypes') = 'array'

                UNION

                SELECT DISTINCT u.utterance_id, json_extract(sa.result_json, '$.commandType') AS command_type, u.final_status
                FROM utterances u
                JOIN stage_attempts sa ON u.utterance_id = sa.utterance_id
                WHERE sa.result_json IS NOT NULL
                  AND json_valid(sa.result_json) = 1
                  AND json_extract(sa.result_json, '$.commandType') IS NOT NULL

                UNION

                SELECT DISTINCT u.utterance_id, json_extract(sa.result_json, '$.instructionType') AS command_type, u.final_status
                FROM utterances u
                JOIN stage_attempts sa ON u.utterance_id = sa.utterance_id
                WHERE sa.result_json IS NOT NULL
                  AND json_valid(sa.result_json) = 1
                  AND json_extract(sa.result_json, '$.instructionType') IS NOT NULL

                UNION

                SELECT DISTINCT u.utterance_id, json_extract(sa.result_json, '$.command') AS command_type, u.final_status
                FROM utterances u
                JOIN stage_attempts sa ON u.utterance_id = sa.utterance_id
                WHERE sa.result_json IS NOT NULL
                  AND json_valid(sa.result_json) = 1
                  AND json_extract(sa.result_json, '$.command') IS NOT NULL
            )
            SELECT
                command_type,
                COUNT(*) AS total,
                COUNT(CASE WHEN final_status = 'hit' THEN 1 END) AS hits,
                COUNT(CASE WHEN final_status != 'hit' THEN 1 END) AS misses
            FROM cmd_utterances
            WHERE command_type IS NOT NULL AND command_type != ''
            GROUP BY command_type
            ORDER BY
                (1.0 * COUNT(CASE WHEN final_status != 'hit' THEN 1 END) / COUNT(*)) DESC,
                COUNT(*) DESC,
                command_type ASC
            """
        )
        rows = cur.fetchall()
        result: list[dict[str, Any]] = []
        for cmd, total, hits, misses in rows:
            miss_rate = round(misses / total, 4) if total > 0 else 0.0
            hit_rate = round(hits / total, 4) if total > 0 else 0.0
            result.append(
                {
                    "command": cmd,
                    "total": total,
                    "hits": hits,
                    "misses": misses,
                    "miss_rate": miss_rate,
                    "hit_rate": hit_rate,
                }
            )
        return result


def get_latency_distribution(
    conn_or_path: sqlite3.Connection | Path | str,
) -> dict[str, dict[str, float]]:
    """p50, p90, and p99 elapsed milliseconds broken down by stage.

    Stages: stt, typed, spoken_a, spoken_b, llm_c.
    Returns:
    {
        "stt": {"count": int, "p50": float, "p90": float, "p99": float, "min": float, "max": float, "mean": float},
        ...
    }
    """
    distributions: dict[str, dict[str, float]] = {
        stage: {
            "count": 0,
            "p50": 0.0,
            "p90": 0.0,
            "p99": 0.0,
            "min": 0.0,
            "max": 0.0,
            "mean": 0.0,
        }
        for stage in LATENCY_STAGES
    }

    with _open_conn(conn_or_path) as conn:
        if conn is None:
            return distributions

        stage_values: dict[str, list[float]] = {stage: [] for stage in LATENCY_STAGES}

        # 1. Collect stage_attempts latencies for executed stages (status != 'skipped')
        cur = conn.execute(
            """
            SELECT stage, elapsed_ms
            FROM stage_attempts
            WHERE status != 'skipped' AND elapsed_ms >= 0
            """
        )
        for stage, elapsed in cur.fetchall():
            if stage in stage_values:
                stage_values[stage].append(float(elapsed))

        # 2. Collect STT latencies from utterances.stt_json if not already present from stage_attempts
        if not stage_values["stt"]:
            cur_stt = conn.execute(
                """
                SELECT
                    COALESCE(
                        json_extract(stt_json, '$.latencyMs'),
                        json_extract(stt_json, '$.latency_ms'),
                        json_extract(stt_json, '$.elapsedMs'),
                        json_extract(stt_json, '$.elapsed_ms')
                    ) AS stt_lat
                FROM utterances
                WHERE stt_json IS NOT NULL
                  AND json_valid(stt_json) = 1
                  AND stt_lat IS NOT NULL
                """
            )
            for (stt_lat,) in cur_stt.fetchall():
                if stt_lat is not None:
                    stage_values["stt"].append(float(stt_lat))

        # 3. Compute statistics for each stage
        for stage, values in stage_values.items():
            if not values:
                continue
            values.sort()
            count = len(values)
            p50 = _compute_percentile(values, 50.0)
            p90 = _compute_percentile(values, 90.0)
            p99 = _compute_percentile(values, 99.0)
            distributions[stage] = {
                "count": count,
                "p50": round(p50, 2),
                "p90": round(p90, 2),
                "p99": round(p99, 2),
                "min": round(values[0], 2),
                "max": round(values[-1], 2),
                "mean": round(sum(values) / count, 2),
            }

    return distributions


def get_diagnostic_summary(
    conn_or_path: sqlite3.Connection | Path | str,
) -> dict[str, Any]:
    """Execute all 5 diagnostic queries and return combined dictionary."""
    return {
        "failure_root_causes": get_failure_root_causes(conn_or_path),
        "path_b_rescue_rate": get_path_b_rescue_rate(conn_or_path),
        "path_c_guard_rejections": get_path_c_guard_rejections(conn_or_path),
        "command_miss_rates": get_command_miss_rates(conn_or_path),
        "latencies": get_latency_distribution(conn_or_path),
    }


def format_summary_text(summary: dict[str, Any]) -> str:
    """Format diagnostic summary dictionary as human-readable report."""
    lines: list[str] = [
        "=" * 60,
        "              ATC-SIM Parse & STT Diagnostic Traces",
        "=" * 60,
        "",
        "1. Failure Root Cause Breakdown:",
        "-" * 60,
    ]
    labels = {
        "stt_empty_or_low_prob": "STT empty / low-prob",
        "typed_syntax": "Typed syntax",
        "spoken_a_grammar": "Spoken A grammar",
        "ungrounded_catalog_token": "Ungrounded catalog token",
        "path_b_rewrite_miss": "Path B rewrite miss",
        "path_c_rejection": "Path C rejection",
    }
    for cat, count in summary.get("failure_root_causes", {}).items():
        label = labels.get(cat, cat)
        lines.append(f"  {label:<30} {count:>8}")

    rescue = summary.get("path_b_rescue_rate", {})
    a_misses = rescue.get("spoken_a_misses", 0)
    b_rescues = rescue.get("spoken_b_rescues", 0)
    rate_pct = rescue.get("rescue_rate", 0.0) * 100.0

    lines.extend([
        "",
        "2. Path B Rescue Rate:",
        "-" * 60,
        f"  Spoken A misses:               {a_misses:>8}",
        f"  Path B rescues:                {b_rescues:>8}",
        f"  Rescue rate:                   {rate_pct:>7.2f}% ({rescue.get('rescue_rate', 0.0):.4f})",
        "",
        "3. Path C Guard Rejections:",
        "-" * 60,
    ])
    for guard, count in summary.get("path_c_guard_rejections", {}).items():
        lines.append(f"  {guard:<30} {count:>8}")

    lines.extend([
        "",
        "4. Command Miss Rate Ranking:",
        "-" * 60,
    ])
    cmd_rates = summary.get("command_miss_rates", [])
    if not cmd_rates:
        lines.append("  (No command trace data)")
    else:
        lines.append(f"  {'Command':<24} {'Total':>8} {'Hits':>8} {'Misses':>8} {'Miss %':>8}")
        for item in cmd_rates:
            miss_pct = item["miss_rate"] * 100.0
            lines.append(
                f"  {item['command']:<24} {item['total']:>8} {item['hits']:>8} {item['misses']:>8} {miss_pct:>7.1f}%"
            )

    lines.extend([
        "",
        "5. Latency Distribution (ms):",
        "-" * 60,
        f"  {'Stage':<16} {'Count':>8} {'p50':>10} {'p90':>10} {'p99':>10}",
    ])
    for stage, stats in summary.get("latencies", {}).items():
        lines.append(
            f"  {stage:<16} {stats['count']:>8} {stats['p50']:>10.2f} {stats['p90']:>10.2f} {stats['p99']:>10.2f}"
        )

    lines.extend(["=" * 60, ""])
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Query ATC-SIM STT and parse diagnostic traces.",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print full diagnostic summary covering all 5 questions (default).",
    )
    parser.add_argument(
        "--failure-root-causes",
        action="store_true",
        help="Query question 1: failure root cause breakdown.",
    )
    parser.add_argument(
        "--rescue-rate",
        action="store_true",
        help="Query question 2: Path B rescue rate.",
    )
    parser.add_argument(
        "--guard-rejections",
        action="store_true",
        help="Query question 3: Path C guard rejections.",
    )
    parser.add_argument(
        "--command-miss-rates",
        action="store_true",
        help="Query question 4: command miss rate ranking.",
    )
    parser.add_argument(
        "--latencies",
        action="store_true",
        help="Query question 5: latency distributions by stage.",
    )
    parser.add_argument(
        "--db",
        type=str,
        default=None,
        help="Optional path to SQLite trace database (defaults to config trace_db_path).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output result as JSON instead of formatted text.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.db:
        db_path: Path | str = args.db if args.db == ":memory:" else Path(args.db).resolve()
    else:
        settings = Settings.load()
        db_path = settings.trace_db_path

    # If no specific query is selected, default to summary
    specific_flags = [
        args.failure_root_causes,
        args.rescue_rate,
        args.guard_rejections,
        args.command_miss_rates,
        args.latencies,
    ]
    is_summary = args.summary or not any(specific_flags)

    result_data: Any = None
    if is_summary:
        summary = get_diagnostic_summary(db_path)
        if args.json:
            print(json.dumps(summary, indent=2))
        else:
            print(format_summary_text(summary))
        return 0

    if args.failure_root_causes:
        result_data = get_failure_root_causes(db_path)
    elif args.rescue_rate:
        result_data = get_path_b_rescue_rate(db_path)
    elif args.guard_rejections:
        result_data = get_path_c_guard_rejections(db_path)
    elif args.command_miss_rates:
        result_data = get_command_miss_rates(db_path)
    elif args.latencies:
        result_data = get_latency_distribution(db_path)

    if args.json:
        print(json.dumps(result_data, indent=2))
    else:
        print(json.dumps(result_data, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
