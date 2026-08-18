# Serveur MCP HTTP + OAuth Google (Phase 2, accès web).
FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    "fastmcp" \
    "mem0ai" \
    "qdrant-client" \
    "openai"

COPY server.py /app/server.py

CMD ["python", "/app/server.py"]
