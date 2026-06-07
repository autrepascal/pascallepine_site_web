#!/usr/bin/env bash
# Valide le pipeline mem0 en local (étape 3), en contournant les bugs du
# serveur OpenMemory. Réutilise le conteneur openmemory-mcp (qui contient mem0)
# et y exécute notre test correctement configuré.
#
# Prérequis : "docker compose up -d" déjà lancé, Ollama natif en marche,
# modèles téléchargés (bash scripts/pull-models.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Copie du test dans le conteneur..."
docker compose cp "$SCRIPT_DIR/local-pipeline-test.py" openmemory-mcp:/tmp/local-pipeline-test.py

echo "==> Exécution (mem0 + Ollama + Qdrant, 100 % local)..."
echo
docker compose exec -T openmemory-mcp python /tmp/local-pipeline-test.py
