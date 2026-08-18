#!/usr/bin/env bash
# Affiche ce que contient TA mémoire mem0 locale (Qdrant, sur ta machine).
# Preuve que les données sont bien stockées localement, pas dans le cloud.
set -euo pipefail

USER_ID="${1:-pascal}"

docker compose exec -T mem0-mcp-server python - "$USER_ID" <<'PY'
import sys
from mem0 import Memory

OLLAMA_V1 = "http://host.docker.internal:11434/v1"
config = {
    "llm": {"provider": "openai", "config": {"model": "llama3.2:3b", "openai_base_url": OLLAMA_V1, "api_key": "ollama"}},
    "embedder": {"provider": "openai", "config": {"model": "nomic-embed-text", "openai_base_url": OLLAMA_V1, "api_key": "ollama"}},
    "vector_store": {"provider": "qdrant", "config": {"host": "mem0_store", "port": 6333, "collection_name": "claude_memory", "embedding_model_dims": 768}},
}
user_id = sys.argv[1] if len(sys.argv) > 1 else "pascal"
m = Memory.from_config(config)
res = m.get_all(filters={"user_id": user_id})
items = res.get("results", res) if isinstance(res, dict) else res
print(f"\n{len(items)} mémoire(s) dans TON Qdrant local (collection claude_memory, user={user_id}) :\n")
for it in items:
    print("  •", it.get("memory", it) if isinstance(it, dict) else it)
print()
PY
