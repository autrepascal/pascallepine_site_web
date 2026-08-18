#!/usr/bin/env bash
# Installe et démarre le stack mémoire SUR LA VM Google Cloud (Montréal).
# À lancer depuis ~/pascallepine_site_web/mem0-selfhosted sur la VM :
#     bash montreal/setup-vm.sh
#
# Ne fait tourner que les embeddings (léger) + Qdrant + serveur MCP.
# Pas de gros LLM (MEM0_INFER=false) -> tient sur une petite VM e2-medium.
set -euo pipefail
cd "$(dirname "$0")/.."   # -> mem0-selfhosted

echo "==> [1/6] Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

echo "==> [2/6] Ollama..."
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

echo "==> [3/6] Ollama écoute sur 0.0.0.0 (pour que les conteneurs le joignent)..."
sudo mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0"\n' \
  | sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart ollama
sleep 3

echo "==> [4/6] Modèle d'embeddings (nomic-embed-text)..."
ollama pull nomic-embed-text

echo "==> [5/6] Démarrage du stack (Qdrant + serveur MCP)..."
cp -n .env.example .env || true
sudo docker compose up -d --build mem0_store mem0-mcp-server

echo "==> [6/6] Test de bout en bout (écrire + relire une mémoire)..."
sleep 5
sudo bash scripts/test-add.sh

echo
echo "✅ Si une mémoire s'affiche ci-dessus, le stack tourne à MONTRÉAL."
echo "   Prochaine sous-étape : brancher Claude Desktop par SSH."
