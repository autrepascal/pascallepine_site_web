#!/usr/bin/env bash
# Teste directement l'écriture + relecture dans la collection claude_memory
# (celle qu'utilise le serveur MCP), sans passer par Claude.
set -euo pipefail

docker compose exec -T mem0-mcp-server python - <<'PY'
from mem0 import Memory

OLLAMA_V1 = "http://host.docker.internal:11434/v1"
config = {
    "llm": {"provider": "openai", "config": {"model": "llama3.2:3b", "openai_base_url": OLLAMA_V1, "api_key": "ollama"}},
    "embedder": {"provider": "openai", "config": {"model": "nomic-embed-text", "openai_base_url": OLLAMA_V1, "api_key": "ollama"}},
    "vector_store": {"provider": "qdrant", "config": {"host": "mem0_store", "port": 6333, "collection_name": "claude_memory", "embedding_model_dims": 768}},
}
m = Memory.from_config(config)

print("==> Écriture...")
print(m.add("Pascal développe autrepascal.ca et préfère avancer une étape validée à la fois.",
            user_id="pascal", infer=False))

print("\n==> Relecture (get_all)...")
res = m.get_all(filters={"user_id": "pascal"})
items = res.get("results", res) if isinstance(res, dict) else res
print(f"{len(items)} mémoire(s) :")
for it in items:
    print("  •", it.get("memory", it) if isinstance(it, dict) else it)
PY
