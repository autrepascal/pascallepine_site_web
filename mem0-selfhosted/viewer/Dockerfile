# Visualiseur web privé de la mémoire (lecture seule).
FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    "flask" \
    "mem0ai" \
    "qdrant-client" \
    "openai"

COPY app.py /app/app.py

CMD ["python", "/app/app.py"]
