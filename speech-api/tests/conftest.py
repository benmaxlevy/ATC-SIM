import os

# Force mock before any test module imports app/engines (no Hub in CI).
# Empty PARSE_MODEL_ID stays in os.environ so speech-api/.env cannot opt tests into Path C.
os.environ["SPEECH_API_MOCK"] = "1"
os.environ["PARSE_MODEL_ID"] = ""
