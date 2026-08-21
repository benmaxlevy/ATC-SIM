import os

# Force mock before any test module imports app/engines (no Hub in CI).
os.environ["SPEECH_API_MOCK"] = "1"
os.environ.pop("PARSE_MODEL_ID", None)
