from pathlib import Path

BANNED = (
    "openai.com",
    "deepgram.com",
    "api-inference.huggingface.co",
    "api.groq.com",
    "groq.com",
)

SKIP_DIRS = {".cache", ".venv", "venv", "tests", "__pycache__", ".pytest_cache"}


def test_source_does_not_call_vendor_apis() -> None:
    root = Path(__file__).resolve().parents[1]
    hits: list[str] = []
    for path in root.rglob("*.py"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        for needle in BANNED:
            if needle in text:
                hits.append(f"{path.relative_to(root)}: {needle}")
    assert hits == []


def test_parse_path_does_not_call_paid_llm_hosts() -> None:
    """AC6 — parse engine/route must not call metered LLM APIs."""
    root = Path(__file__).resolve().parents[1]
    parse_files = [root / "parse_engine.py", root / "app.py"]
    hits: list[str] = []
    for path in parse_files:
        text = path.read_text(encoding="utf-8")
        for needle in BANNED:
            if needle in text:
                hits.append(f"{path.name}: {needle}")
    assert hits == []
