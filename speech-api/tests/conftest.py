import os

# Force mock before any test module imports app/engines (no Hub in CI).
# Mock mode keeps mandatory Path C ready without a GGUF download.
os.environ["SPEECH_API_MOCK"] = "1"
