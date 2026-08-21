FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py config.py engines.py wavutil.py download_weights.py parse_engine.py parse_grammar.gbnf logconfig.py hub.py ./

ENV HOST=0.0.0.0
ENV PORT=8090
ENV SPEECH_API_CACHE=/app/.cache
EXPOSE 8090

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090"]
