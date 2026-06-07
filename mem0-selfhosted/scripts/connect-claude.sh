#!/usr/bin/env bash
# Étape 3b : branche Claude (Desktop + Code) sur la mémoire locale via MCP.
# Prérequis : "docker compose up -d --build" lancé (le conteneur mem0-mcp-server
# doit tourner).
set -euo pipefail

echo "==> 1) Vérification du conteneur MCP (deps mem0 + mcp)..."
docker compose exec -T mem0-mcp-server python -c "import mem0, mcp; print('   deps OK')"

echo
echo "==> 2) Claude Code"
if command -v claude >/dev/null 2>&1; then
  claude mcp add mem0-local -- docker exec -i mem0-mcp-server python /app/mcp_server.py \
    && echo "   ✔ Ajouté à Claude Code (vérifie : claude mcp list)" \
    || echo "   (déjà présent ? vérifie : claude mcp list)"
else
  echo "   'claude' introuvable dans le PATH. Lance manuellement :"
  echo "   claude mcp add mem0-local -- docker exec -i mem0-mcp-server python /app/mcp_server.py"
fi

echo
echo "==> 3) Claude Desktop"
echo "   Ajoute ce bloc dans :"
echo "   ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "   ---------------------------------------------------------------"
cat <<'EOF'
{
  "mcpServers": {
    "mem0-local": {
      "command": "docker",
      "args": ["exec", "-i", "mem0-mcp-server", "python", "/app/mcp_server.py"]
    }
  }
}
EOF
echo "   ---------------------------------------------------------------"
echo "   (si le fichier existe déjà, ajoute juste l'entrée \"mem0-local\""
echo "    dans la section \"mcpServers\"), puis REDÉMARRE Claude Desktop."
