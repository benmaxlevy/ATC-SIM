"""CLI utility for trace database retention and pruning."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from config import Settings
from trace_db import prune_traces


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prune old diagnostic parse traces from SQLite database.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Delete records older than N days.",
    )
    parser.add_argument(
        "--max-utterances",
        type=int,
        default=None,
        help="Keep at most M latest utterances and delete older excess.",
    )
    parser.add_argument(
        "--db",
        type=str,
        default=None,
        help="Optional path to SQLite trace database (defaults to config trace_db_path).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.days is not None and args.days < 0:
        parser.error("--days must be non-negative")
    if args.max_utterances is not None and args.max_utterances < 0:
        parser.error("--max-utterances must be non-negative")

    if args.db:
        db_path: Path | str = args.db if args.db == ":memory:" else Path(args.db).resolve()
    else:
        settings = Settings.load()
        db_path = settings.trace_db_path

    u_del, sa_del = prune_traces(
        db_path,
        days=args.days,
        max_utterances=args.max_utterances,
    )
    print(f"Deleted {u_del} utterances, {sa_del} stage attempts.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
