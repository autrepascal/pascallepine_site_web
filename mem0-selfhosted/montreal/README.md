# Étape 4 — Déploiement à Montréal (Google Cloud)

Héberge le stack mémoire sur une VM Google Cloud en région
`northamerica-northeast1` (Montréal). Données conservées au Canada (Loi 25),
toujours allumées, accessibles depuis Claude.

**Approche en 2 phases :**
- **Phase 1 (4a)** : VM Montréal + stack, accès depuis Claude Desktop par **tunnel SSH** (chiffré, authentifié par ta clé SSH — pas besoin de domaine ni HTTPS).
- **Phase 2 (4b/4c)** : exposition publique HTTPS + auth + connecteur **claude.ai web**.

La VM ne fait tourner que les **embeddings** (léger) + Qdrant + serveur MCP.
Pas de gros LLM → une petite VM `e2-medium` (~35-40 $CA/mois) suffit.

---

## Phase 1 — Partie 1 : installer gcloud + créer la VM (sur ton Mac)

```bash
# 1. Installer le SDK Google Cloud (compatible macOS)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# 2. Se connecter + choisir le projet (un navigateur s'ouvre)
gcloud init

# 3. Activer Compute Engine
gcloud services enable compute.googleapis.com

# 4. Créer la VM à Montréal
gcloud compute instances create mem0-montreal \
  --zone=northamerica-northeast1-a \
  --machine-type=e2-medium \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB
```

## Phase 1 — Partie 2 : monter le stack sur la VM

```bash
# Se connecter à la VM (depuis ton Mac)
gcloud compute ssh mem0-montreal --zone=northamerica-northeast1-a
```

Une fois **dans la VM** (le prompt change) :

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/autrepascal/pascallepine_site_web.git
cd pascallepine_site_web/mem0-selfhosted
bash montreal/setup-vm.sh
```

`setup-vm.sh` installe Docker + Ollama, configure le réseau, démarre Qdrant +
le serveur MCP, et lance un test. Si une mémoire s'affiche → **stack validé à
Montréal.**

## Phase 1 — Partie 3 : brancher Claude Desktop par SSH

(À faire après validation de la partie 2 — voir avec Claude. On aura besoin de
l'IP externe de la VM : `gcloud compute instances list`, et du nom d'utilisateur
sur la VM : `whoami` dans la session SSH.)

L'idée : Claude Desktop lance le serveur MCP **à distance** via SSH —
```
ssh <user>@<VM_IP> docker exec -i mem0-mcp-server python /app/mcp_server.py
```
Le SSH chiffre et authentifie ; aucun port public ouvert.

---

## Sécurité (Phase 1)

- Seul le **port SSH (22)** est ouvert (pare-feu GCP par défaut). Qdrant (6333),
  Ollama (11434) et le MCP ne sont **pas exposés** à Internet.
- L'accès à la mémoire passe uniquement par ta **clé SSH**.

## Coûts

- `e2-medium` 24/7 ≈ **35-40 $CA/mois** + disque (~3 $/mois pour 30 Go).
- Pour mettre en pause : `gcloud compute instances stop mem0-montreal --zone=northamerica-northeast1-a`
  (tu ne paies plus le calcul, juste le disque). Redémarrer : `... start ...`.

## Rappel honnête (Loi 25)

La VM garde la **mémoire** au Canada. Quand tu **discutes** avec Claude,
l'inférence se fait chez Anthropic (US) — indépendant de mem0.
