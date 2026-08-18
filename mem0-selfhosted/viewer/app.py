"""
Visualiseur web privé de la mémoire mem0 (lecture seule).

Affiche les fiches de la collection Qdrant 'claude_memory'.
Protégé par mot de passe (HTTP Basic Auth) + servi en HTTPS via Caddy.
Accès : https://mem0.autrepascal.ca/viewer
"""
import os
import sys
import functools
import contextlib

from flask import Flask, request, Response, render_template_string

with contextlib.redirect_stdout(sys.stderr):
    from mem0 import Memory

OLLAMA_V1 = os.environ.get("OLLAMA_OPENAI_URL", "http://host.docker.internal:11434/v1")
USER = os.environ.get("MEM0_USER", "pascal")
PASSWORD = os.environ.get("VIEWER_PASSWORD", "")

config = {
    "llm": {"provider": "openai", "config": {"model": os.environ.get("LLM_MODEL", "llama3.2:3b"), "openai_base_url": OLLAMA_V1, "api_key": "ollama"}},
    "embedder": {"provider": "openai", "config": {"model": "nomic-embed-text", "openai_base_url": OLLAMA_V1, "api_key": "ollama"}},
    "vector_store": {"provider": "qdrant", "config": {"host": os.environ.get("QDRANT_HOST", "mem0_store"), "port": int(os.environ.get("QDRANT_PORT", "6333")), "collection_name": "claude_memory", "embedding_model_dims": 768}},
}

with contextlib.redirect_stdout(sys.stderr):
    memory = Memory.from_config(config)

app = Flask(__name__)


def _authenticate():
    return Response("Authentification requise.", 401, {"WWW-Authenticate": 'Basic realm="mem0"'})


def requires_auth(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.authorization
        if PASSWORD == "" or not auth or auth.password != PASSWORD:
            return _authenticate()
        return f(*args, **kwargs)
    return wrapper


TEMPLATE = """
<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ma mémoire mem0 — Montréal</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; background:#0f1115; color:#e6e6e6; }
  h1 { font-size: 1.4rem; } .sub { color:#8a93a2; margin-bottom:24px; font-size:.9rem;}
  .card { background:#1a1d24; border:1px solid #2a2f3a; border-radius:12px; padding:14px 16px; margin:10px 0; }
  .mem { font-size:1rem; line-height:1.45; }
  .meta { color:#6b7280; font-size:.75rem; margin-top:8px; }
  .empty { color:#8a93a2; }
  .badge { display:inline-block; background:#16331f; color:#7ee2a0; border-radius:999px; padding:2px 10px; font-size:.8rem;}
</style></head><body>
  <h1>🧠 Ma mémoire mem0 <span class="badge">Montréal 🇨🇦</span></h1>
  <div class="sub">{{ count }} fiche(s) · stockées sur ta VM · lecture seule</div>
  {% if items %}
    {% for it in items %}
      <div class="card">
        <div class="mem">{{ it.get('memory', it) if it is mapping else it }}</div>
        {% if it is mapping %}
        <div class="meta">{{ it.get('created_at','') }}{% if it.get('id') %} · {{ it.get('id')[:8] }}{% endif %}</div>
        {% endif %}
      </div>
    {% endfor %}
  {% else %}
    <p class="empty">Aucune mémoire pour l'instant. Ajoute-en en disant à Claude « souviens-toi que… ».</p>
  {% endif %}
</body></html>
"""


@app.route("/")
@requires_auth
def index():
    with contextlib.redirect_stdout(sys.stderr):
        res = memory.get_all(filters={"user_id": USER})
    items = res.get("results", res) if isinstance(res, dict) else res
    return render_template_string(TEMPLATE, items=items, count=len(items))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9000)
