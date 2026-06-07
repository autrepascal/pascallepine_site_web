#!/usr/bin/env bash
# Télécharge les modèles Ollama nécessaires (à lancer une seule fois).
# Prérequis : Ollama installé et lancé (https://ollama.com/download)
set -euo pipefail

echo "==> Vérification d'Ollama..."
if ! command -v ollama >/dev/null 2>&1; then
  echo "ERREUR : Ollama n'est pas installé. -> https://ollama.com/download"
  exit 1
fi

echo "==> Téléchargement du LLM (llama3.2:3b, ~2 Go)..."
ollama pull llama3.2:3b

echo "==> Téléchargement du modèle d'embeddings (nomic-embed-text, ~0,3 Go)..."
ollama pull nomic-embed-text

echo "==> OK. Modèles disponibles :"
ollama list
