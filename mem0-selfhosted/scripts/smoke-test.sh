#!/usr/bin/env bash
# Test de bout en bout : écrit une mémoire, puis la recherche.
# Si les deux étapes répondent correctement -> le pipeline local tourne.
set -euo pipefail

API="${API:-http://localhost:8765}"
USER_ID="${USER_ID:-pascal}"

echo "==> 1) Écriture d'une mémoire..."
curl -fsS -X POST "$API/api/v1/memories/" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$USER_ID\",\"text\":\"Pascal développe le projet pascallepine_site_web et préfère avancer une étape validée à la fois.\",\"app\":\"smoke-test\"}"
echo

echo "==> 2) Recherche de la mémoire (search_query=projet)..."
curl -fsS "$API/api/v1/memories/?user_id=$USER_ID&search_query=projet"
echo

echo
echo "==> Si tu vois la mémoire ressortir ci-dessus : SUCCÈS. Tout tourne en local."
echo "    (Tu peux aussi la voir dans l'UI : http://localhost:3000)"
