# Petit conteneur pour le serveur MCP de mémoire.
# Reste en vie (sleep infinity) ; Claude exécute le serveur via `docker exec -i`.
FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    "mem0ai" \
    "mcp" \
    "qdrant-client" \
    "openai"

COPY mcp_server.py /app/mcp_server.py

# Le conteneur idle ; chaque session Claude lance mcp_server.py par exec.
CMD ["sleep", "infinity"]
