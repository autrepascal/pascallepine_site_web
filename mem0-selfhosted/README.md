# mem0 auto-hébergé — Étape 3 : valider le stack en local

Mémoire partagée pour IA, **100 % en local** sur ton Mac. Rien ne sort de la
machine : LLM + embeddings via Ollama natif, stockage via Qdrant dans Docker.

> **But de cette étape** : prouver que « écrire une mémoire → la retrouver »
> fonctionne entièrement en local. Ni clé OpenAI, ni cloud mem0, ni donnée qui
> quitte ta machine. Le déploiement à Montréal (Google Cloud) = étape 4.

## Architecture

```
   Toi / Claude
        │ (MCP, plus tard)
        ▼
┌──────────────────────┐      host.docker.internal:11434
│  OpenMemory  :8765   │ ───────────────────────────────►  Ollama (NATIF, GPU)
│  API REST + MCP      │                                    - LLM : llama3.2:3b
│  UI         :3000    │                                    - embed: nomic-embed-text
└──────────┬───────────┘
           │
           ▼
   Qdrant  :6333   (Docker)  ← stockage des mémoires
```

## Pourquoi ces choix (rappel)

- **Pas l'extension Chrome officielle** : elle est verrouillée sur le cloud mem0
  (US), impossible de la pointer ailleurs. → On passe par MCP/API.
- **Pas l'image serveur mem0 « lourde »** : elle ne supporte pas Ollama et envoie
  les embeddings chez OpenAI/Gemini (US). → On utilise **OpenMemory** qui, lui,
  supporte Ollama → tout reste au Canada.
- **Ollama natif** (pas dans Docker) : accès GPU Metal sur Apple Silicon = rapide.

## Prérequis

1. **Docker Desktop** installé et lancé.
2. **Ollama** installé et lancé : https://ollama.com/download

## Lancement (5 étapes)

```bash
cd mem0-selfhosted

# 1. Config locale
cp .env.example .env

# 2. Modèles Ollama (une seule fois, ~2,3 Go au total)
bash scripts/pull-models.sh

# 3. Démarrer le stack
docker compose up -d

# 4. Appliquer la config Ollama + dimensions 768 (corrige le piège #3439)
#    Attendre ~15 s que l'API soit prête, puis :
bash scripts/bootstrap-config.sh

# 5. Test de bout en bout
bash scripts/smoke-test.sh
```

**Validation réussie** = le smoke-test réécrit la mémoire que tu viens d'ajouter.
Tu peux aussi ouvrir l'UI : http://localhost:3000

➡️ **Colle-moi la sortie de l'étape 4 et 5** : c'est notre validation de l'étape 3.

### Monter en qualité (optionnel, tu as 32 Go de RAM)

Une fois le test validé, tu peux passer à un meilleur LLM (les embeddings ne
changent pas → **pas de reset Qdrant** nécessaire) :

```bash
ollama pull llama3.1:8b
# dans .env : LLM_MODEL=llama3.1:8b
docker compose up -d --force-recreate openmemory-mcp
bash scripts/bootstrap-config.sh   # re-pousse la config avec le nouveau modèle
```

## Le piège à connaître (issue mem0 #3439)

Ollama `nomic-embed-text` produit des vecteurs de **768 dimensions**, alors que
le défaut (OpenAI) est **1536**. Si Qdrant a été créé en 1536, ça plante au
moment d'écrire une mémoire. Deux garde-fous sont déjà en place :

- `config/openmemory-config.json` force `embedding_model_dims: 768` ;
- `bootstrap-config.sh` applique cette config avant tout usage.

Si tu changes de modèle d'embeddings (donc de dimensions), **repars de zéro** :

```bash
docker compose down -v   # -v efface le volume Qdrant
docker compose up -d
bash scripts/bootstrap-config.sh
```

## Dépannage rapide

| Symptôme | Piste |
|---|---|
| `connection refused` vers Ollama | Ollama lancé ? `ollama list` doit répondre. |
| Erreur de dimensions / `Wrong vector size` | `docker compose down -v` puis recommencer (voir ci-dessus). |
| L'API réclame une clé OpenAI / `OpenAIError: api_key must be set` | Bug #3439 : la catégorisation appelle OpenAI en dur. Géré ici en détournant l'appel vers Ollama (`OPENAI_BASE_URL` + alias `gpt-4o-mini`). Vérifier que `ollama list` montre bien `gpt-4o-mini` et que les 2 variables `OPENAI_*` sont dans `.env`. |
| Voir les logs | `docker compose logs -f openmemory-mcp` |

## Étape 3b — brancher Claude (MCP)

On n'utilise PAS le serveur MCP d'OpenMemory (buggé avec Ollama local). À la
place, un petit serveur MCP maison (`mcp/mcp_server.py`) réutilise la config
validée. Claude Desktop et Claude Code le lancent via `docker exec`.

```bash
# 1. Construire et démarrer le conteneur MCP
docker compose up -d --build mem0-mcp-server

# 2. Brancher Claude (teste les deps + ajoute à Claude Code + affiche la
#    config Claude Desktop à coller)
bash scripts/connect-claude.sh
```

Pour **Claude Desktop**, ajoute dans
`~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "mem0-local": {
      "command": "docker",
      "args": ["exec", "-i", "mem0-mcp-server", "python", "/app/mcp_server.py"]
    }
  }
}
```
puis **redémarre Claude Desktop**.

**Outils exposés à Claude :** `add_memory`, `search_memory`, `list_memories`.
Essaie : « *souviens-toi que je préfère avancer une étape validée à la fois* »,
puis dans une nouvelle session : « *qu'est-ce que tu sais de mes préférences ?* »

> Le conteneur `mem0-mcp-server` doit tourner (`docker compose up -d`) pour que
> Claude puisse joindre la mémoire. Tout reste local.

## Et Montréal (étape 4) ?

Même stack, déplacé sur une VM Google Cloud région `northamerica-northeast1`.
Comme tout (LLM, embeddings, stockage) tourne localement au stack, déplacer la VM
à Montréal = données conservées au Canada. À planifier après validation locale.

> ⚠️ Rappel honnête : mem0 garde tes **mémoires** au Canada. Quand tu **discutes**
> avec Claude, ta question transite quand même chez Anthropic (US) — ça, mem0 n'y
> change rien. La Loi 25 vise surtout la **conservation** : là, on est bons.
