"""
Serveur MCP pour la mémoire de Pascal.

Branche Claude (Desktop / Code) sur la mémoire mem0 auto-hébergée, en
réutilisant la config validée :
  - LLM + embeddings via l'API compatible OpenAI d'Ollama (tout local)
  - stockage dans Qdrant (service mem0_store)

Expose 3 outils : add_memory, search_memory, list_memories.
Transport : stdio (Claude lance ce script via `docker exec -i` ou `ssh`).
"""
import sys
import os
import contextlib
import logging
import warnings

# ⚠️ CRUCIAL (MCP via stdio) : le protocole JSON-RPC passe par STDOUT.
# Tout texte parasite sur stdout (warnings de mem0/qdrant : spaCy, fastembed,
# « Collection predates v3 »...) corromprait le protocole et ferait timeouter
# Claude. On envoie donc TOUT le bruit des librairies vers stderr.
logging.basicConfig(stream=sys.stderr, level=logging.ERROR)
warnings.filterwarnings("ignore")

# Imports lourds : stdout détourné vers stderr le temps du chargement.
with contextlib.redirect_stdout(sys.stderr):
    from mcp.server.fastmcp import FastMCP
    from mem0 import Memory

OLLAMA_V1 = os.environ.get("OLLAMA_OPENAI_URL", "http://host.docker.internal:11434/v1")
DEFAULT_USER = os.environ.get("MEM0_USER", "pascal")
# Extraction intelligente via LLM. Désactivée par défaut (fiable + pas besoin
# d'un gros LLM sur la VM). Mettre MEM0_INFER=true si un bon modèle est dispo.
INFER = os.environ.get("MEM0_INFER", "false").lower() == "true"

config = {
    "llm": {
        "provider": "openai",
        "config": {
            "model": os.environ.get("LLM_MODEL", "llama3.2:3b"),
            "openai_base_url": OLLAMA_V1,
            "api_key": "ollama",
        },
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "model": "nomic-embed-text",
            "openai_base_url": OLLAMA_V1,
            "api_key": "ollama",
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": os.environ.get("QDRANT_HOST", "mem0_store"),
            "port": int(os.environ.get("QDRANT_PORT", "6333")),
            "collection_name": "claude_memory",
            "embedding_model_dims": 768,
        },
    },
}

with contextlib.redirect_stdout(sys.stderr):
    memory = Memory.from_config(config)

mcp = FastMCP("mem0-local")


@contextlib.contextmanager
def _quiet():
    """Empêche le bruit des libs de polluer le stdout du protocole MCP."""
    with contextlib.redirect_stdout(sys.stderr):
        yield


def _format(res):
    items = res.get("results", res) if isinstance(res, dict) else res
    if not items:
        return None
    return "\n".join(f"- {it.get('memory', it) if isinstance(it, dict) else it}" for it in items)


@mcp.tool()
def add_memory(text: str, user_id: str = DEFAULT_USER) -> str:
    """Enregistre une information durable dans la mémoire locale de Pascal
    (préférences, décisions, faits sur ses projets comme L'autre Pascal /
    autrepascal.ca). À utiliser quand Pascal demande de se souvenir de quelque
    chose, ou quand une info mérite d'être conservée entre les sessions."""
    with _quiet():
        if INFER:
            try:
                res = memory.add(text, user_id=user_id, infer=True)
                if not (res.get("results") if isinstance(res, dict) else res):
                    res = memory.add(text, user_id=user_id, infer=False)
            except Exception:
                res = memory.add(text, user_id=user_id, infer=False)
        else:
            res = memory.add(text, user_id=user_id, infer=False)
    return f"Mémoire enregistrée. {res}"


@mcp.tool()
def search_memory(query: str, user_id: str = DEFAULT_USER) -> str:
    """Recherche dans la mémoire locale de Pascal par similarité de sens.
    À utiliser au début d'une tâche pour récupérer le contexte pertinent."""
    with _quiet():
        out = _format(memory.search(query, filters={"user_id": user_id}))
    return out or "Aucune mémoire pertinente trouvée."


@mcp.tool()
def list_memories(user_id: str = DEFAULT_USER) -> str:
    """Liste toutes les mémoires enregistrées pour Pascal."""
    with _quiet():
        out = _format(memory.get_all(filters={"user_id": user_id}))
    return out or "La mémoire est vide."


if __name__ == "__main__":
    mcp.run()
