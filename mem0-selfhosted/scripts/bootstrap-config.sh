#!/usr/bin/env bash
# Applique la config Ollama + Qdrant (768 dims) à OpenMemory.
# À lancer UNE FOIS après "docker compose up", avant le smoke-test.
# Corrige le piège connu des dimensions d'embeddings (issue mem0 #3439).
set -euo pipefail

API="${API:-http://localhost:8765}"
CONFIG_FILE="$(dirname "$0")/../config/openmemory-config.json"

echo "==> Application de la config sur $API/api/v1/config/ ..."
curl -fsS -X PUT "$API/api/v1/config/" \
  -H "Content-Type: application/json" \
  --data-binary @"$CONFIG_FILE"

echo
echo "==> Config actuelle :"
curl -fsS "$API/api/v1/config/"
echo
echo "==> OK."
