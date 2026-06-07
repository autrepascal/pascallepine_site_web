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

# OpenMemory appelle "gpt-4o-mini" en dur pour catégoriser (bug #3439).
# On crée un alias local pointant vers llama3.2:3b → l'appel reste sur Ollama.
echo "==> Création de l'alias local gpt-4o-mini (= llama3.2:3b) pour la catégorisation..."
ollama cp llama3.2:3b gpt-4o-mini

echo "==> OK. Modèles disponibles :"
ollama list
