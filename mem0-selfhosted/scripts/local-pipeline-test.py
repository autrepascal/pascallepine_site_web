"""
Test direct du pipeline mem0, 100 % local.

S'exécute DANS le conteneur openmemory-mcp (qui contient déjà mem0), mais en
contournant les bugs du serveur OpenMemory : on configure mem0 nous-mêmes,
correctement.

  - LLM        : llama3.2:3b   via l'API compatible OpenAI d'Ollama (/v1)
  - Embeddings : nomic-embed-text (768 dims) via la même API /v1
  - Stockage   : Qdrant (service mem0_store)

Rien ne sort de la machine : tout passe par Ollama natif + Qdrant local.
"""
import json
from mem0 import Memory

config = {
    "llm": {
        "provider": "openai",  # API compatible OpenAI, pointée vers Ollama
        "config": {
            "model": "llama3.2:3b",
            "openai_base_url": "http://host.docker.internal:11434/v1",
            "api_key": "ollama",
        },
    },
    "embedder": {
        "provider": "openai",  # idem : contourne l'API Ollama obsolète (#4155)
        "config": {
            "model": "nomic-embed-text",
            "openai_base_url": "http://host.docker.internal:11434/v1",
            "api_key": "ollama",
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "mem0_store",
            "port": 6333,
            "collection_name": "pipeline_test",
            "embedding_model_dims": 768,  # = dimensions de nomic-embed-text
        },
    },
}

print("==> Initialisation de mem0 (Ollama + Qdrant, tout local)...")
m = Memory.from_config(config)

print("==> Écriture d'une mémoire...")
add_res = m.add(
    "Pascal développe le projet pascallepine_site_web et préfère avancer une étape validée à la fois.",
    user_id="pascal",
)
print(json.dumps(add_res, indent=2, ensure_ascii=False))

print("\n==> Recherche : « Sur quoi travaille Pascal ? »")
search_res = m.search("Sur quoi travaille Pascal ?", user_id="pascal")
print(json.dumps(search_res, indent=2, ensure_ascii=False))

results = search_res.get("results", search_res) if isinstance(search_res, dict) else search_res
if results:
    print("\n✅ SUCCÈS : mémoire écrite puis retrouvée. Pipeline 100 % local OK.")
else:
    print("\n⚠️  Rien n'est ressorti à la recherche.")
    print("    (L'extraction LLM par un petit modèle est parfois capricieuse —")
    print("     colle cette sortie à Claude, on ajustera.)")
