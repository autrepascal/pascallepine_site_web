"""
Serveur MCP HTTP + OAuth (Google) — accès web/mobile via claude.ai.

Même mémoire que le serveur stdio (collection Qdrant 'claude_memory') :
ce que tu écris depuis Claude Desktop est lisible depuis le web et vice-versa.

Authentification : Google OAuth. L'accès est restreint à toi via la liste
d'« utilisateurs tests » de l'écran de consentement Google (mode Testing).
Les données de mémoire restent à Montréal ; Google ne fait que vérifier
ton identité.
"""
import os
import sys
import contextlib
import logging
import warnings

logging.basicConfig(stream=sys.stderr, level=logging.ERROR)
warnings.filterwarnings("ignore")

from fastmcp import FastMCP
from fastmcp.server.auth.providers.google import GoogleProvider

with contextlib.redirect_stdout(sys.stderr):
    from mem0 import Memory

OLLAMA_V1 = os.environ.get("OLLAMA_OPENAI_URL", "http://host.docker.internal:11434/v1")
DEFAULT_USER = os.environ.get("MEM0_USER", "pascal")
BASE_URL = os.environ["MCP_BASE_URL"]  # ex. https://mem0.autrepascal.ca

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

auth = GoogleProvider(
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    base_url=BASE_URL,
    required_scopes=["openid", "https://www.googleapis.com/auth/userinfo.email"],
)

mcp = FastMCP(name="mem0-montreal", auth=auth)


@contextlib.contextmanager
def _quiet():
    with contextlib.redirect_stdout(sys.stderr):
        yield


def _format(res):
    items = res.get("results", res) if isinstance(res, dict) else res
    if not items:
        return None
    return "\n".join(f"- {it.get('memory', it) if isinstance(it, dict) else it}" for it in items)


@mcp.tool
def add_memory(text: str, user_id: str = DEFAULT_USER) -> str:
    """Enregistre une information durable dans la mémoire de Pascal
    (préférences, décisions, faits sur ses projets comme L'autre Pascal /
    autrepascal.ca)."""
    with _quiet():
        res = memory.add(text, user_id=user_id, infer=False)
    return f"Mémoire enregistrée. {res}"


@mcp.tool
def search_memory(query: str, user_id: str = DEFAULT_USER) -> str:
    """Recherche dans la mémoire de Pascal par similarité de sens."""
    with _quiet():
        out = _format(memory.search(query, filters={"user_id": user_id}))
    return out or "Aucune mémoire pertinente trouvée."


@mcp.tool
def list_memories(user_id: str = DEFAULT_USER) -> str:
    """Liste toutes les mémoires enregistrées pour Pascal."""
    with _quiet():
        out = _format(memory.get_all(filters={"user_id": user_id}))
    return out or "La mémoire est vide."


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8000)
