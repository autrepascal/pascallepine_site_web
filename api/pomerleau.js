/**
 * /api/pomerleau — réception du questionnaire préparatoire Pomerleau
 *
 * Reçoit un POST JSON : { answers, files, mode }
 *   - answers : réponses du formulaire (identité, cases, questions ouvertes)
 *   - files   : soit des pièces jointes inline { name, type, size, b64 }
 *               soit des liens Blob { name, size, url } selon `mode`
 *   - mode    : "inline" (petits fichiers en pièce jointe) ou "blob" (liens)
 *
 * Envoie un courriel récapitulatif à pl@pascallepine.ca via Resend,
 * et une courte confirmation au répondant (best-effort).
 *
 * Variables d'environnement :
 *   - RESEND_API_KEY (requis) — déjà utilisée par /api/contact
 *   - POMERLEAU_TO   (optionnel, défaut "pl@pascallepine.ca")
 *   - POMERLEAU_FROM (optionnel, défaut "Pascal Lépine <pl@pascallepine.ca>")
 *
 * Le domaine expéditeur (pascallepine.ca) doit être vérifié chez Resend.
 */

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY missing");
    return res.status(500).json({ error: "Service non configuré (RESEND_API_KEY)." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const answers = body.answers || {};
  const files = Array.isArray(body.files) ? body.files : [];
  const mode = body.mode || "inline";

  const courriel = (answers.courriel || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) {
    return res.status(400).json({ error: "Adresse courriel invalide." });
  }

  const to = process.env.POMERLEAU_TO || "pl@pascallepine.ca";
  const from = process.env.POMERLEAU_FROM || "Pascal Lépine <pl@pascallepine.ca>";
  const nom = (answers.nom || "").trim();

  // ── Structure lisible du récapitulatif ──
  const QUESTIONS = {
    fonction: "Fonction",
    q2a: "02 · Types de contributions offerts",
    q2b: "02 · Enveloppe annuelle et répartition",
    q2c: "02 · Causes / milieux / territoires soutenus",
    q2d: "02 · Engagements récurrents ou pluriannuels",
    q3a: "03 · Qui décide et selon quels seuils",
    q3b: "03 · Fréquence d'évaluation",
    q3c: "03 · Critères de rétention / refus",
    q3d: "03 · Implication du personnel",
    q4a: "04 · Canaux d'arrivée des demandes",
    q4b: "04 · Volume annuel approximatif",
    q4c: "04 · Partenaires existants vs. nouvelles organisations",
    q4d: "04 · Demandes souhaitées en plus / en moins",
    q5a: "05 · Ce que la politique exprime / n'arrive pas à dire",
    q5b: "05 · Tensions ressenties",
    q5c: "05 · Ce que la politique devrait permettre",
    q5d: "05 · À quoi ressemble une politique réussie",
    q6:  "Commentaires libres",
  };

  const docs = Array.isArray(answers.docsLabels) ? answers.docsLabels : [];

  // Séparer notes vocales et documents ; indexer les notes par question
  const voices = files.filter(f => f.kind === "voice");
  const documents = files.filter(f => f.kind !== "voice");
  const voiceByQ = {};
  voices.forEach(v => { if (v.q) voiceByQ[v.q] = v; });
  const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;

  // Transcription optionnelle des notes vocales (activée si OPENAI_API_KEY présente)
  const openaiKey = process.env.OPENAI_API_KEY || process.env.V2T;
  if (openaiKey && voices.length) {
    await Promise.all(voices.map(async (v) => {
      try {
        let buf;
        if (v.b64) buf = Buffer.from(v.b64, "base64");
        else if (v.url) { const rr = await fetch(v.url); buf = Buffer.from(await rr.arrayBuffer()); }
        if (!buf || !buf.length) return;
        const fd = new FormData();
        fd.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
        fd.append("language", "fr");
        fd.append("file", new File([buf], v.name || "note.webm", { type: v.type || "audio/webm" }));
        const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: fd,
        });
        if (tr.ok) { const j = await tr.json(); v.transcript = (j.text || "").trim(); }
        else { console.error("Transcription error:", tr.status, await tr.text()); }
      } catch (e) { console.error("Transcription failed:", e); }
    }));
  }

  // ── Corps texte ──
  const lines = [];
  lines.push(`Nouveau questionnaire préparatoire — Pomerleau`);
  lines.push(``);
  lines.push(`Répondant : ${nom || "(sans nom)"} <${courriel}>`);
  if (answers.fonction) lines.push(`Fonction : ${answers.fonction}`);
  lines.push(``);
  lines.push(`── 01 · Documentation à transmettre ──`);
  lines.push(docs.length ? docs.map(d => `  • ${d}`).join("\n") : "  (aucune case cochée)");
  lines.push(``);
  Object.entries(QUESTIONS).forEach(([k, label]) => {
    if (k === "fonction") return;
    const v = (answers[k] || "").trim();
    const vn = voiceByQ[k];
    if (!v && !vn) return;
    lines.push(`── ${label} ──`);
    if (v) lines.push(v);
    if (vn) {
      if (vn.transcript) lines.push(`« ${vn.transcript} »`);
      lines.push(`[Note vocale — ${mmss(vn.seconds)}]${mode === "blob" && vn.url ? ` ${vn.url}` : " (en pièce jointe)"}`);
    }
    lines.push(``);
  });
  if (documents.length) {
    lines.push(`── Documents joints (${documents.length}) ──`);
    documents.forEach(f => lines.push(mode === "blob" ? `  • ${f.name} — ${f.url}` : `  • ${f.name} (en pièce jointe)`));
  }

  const textBody = lines.join("\n");

  // ── Corps HTML ──
  const esc = escapeHtml;
  const block = (label, val) =>
    `<tr><td style="padding:14px 0;border-bottom:1px solid #eee;vertical-align:top;">
       <div style="font:400 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8680;margin-bottom:6px;">${esc(label)}</div>
       <div style="font:400 15px/1.6 Georgia,serif;color:#111;white-space:pre-wrap;">${esc(val)}</div>
     </td></tr>`;

  let rows = "";
  rows += block("Répondant", `${nom || "(sans nom)"} <${courriel}>`);
  if (answers.fonction) rows += block("Fonction", answers.fonction);
  rows += `<tr><td style="padding:14px 0;border-bottom:1px solid #eee;">
      <div style="font:400 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8680;margin-bottom:8px;">01 · Documentation à transmettre</div>
      ${docs.length ? `<ul style="margin:0;padding-left:18px;font:400 15px/1.6 Georgia,serif;color:#111;">${docs.map(d=>`<li>${esc(d)}</li>`).join("")}</ul>` : `<div style="font:italic 400 15px Georgia,serif;color:#8a8680;">Aucune case cochée</div>`}
    </td></tr>`;
  Object.entries(QUESTIONS).forEach(([k, label]) => {
    if (k === "fonction") return;
    const v = (answers[k] || "").trim();
    const vn = voiceByQ[k];
    if (!v && !vn) return;
    let inner = "";
    if (v) inner += `<div style="font:400 15px/1.6 Georgia,serif;color:#111;white-space:pre-wrap;">${esc(v)}</div>`;
    if (vn) {
      const lab = `Note vocale — ${mmss(vn.seconds)}`;
      const link = mode === "blob" && vn.url
        ? `<a href="${esc(vn.url)}" style="color:#8a8680;">${lab}</a>`
        : `${lab} <span style="color:#8a8680;">(en pièce jointe)</span>`;
      if (vn.transcript) {
        inner += `<div style="font:400 15px/1.6 Georgia,serif;color:#111;white-space:pre-wrap;margin-top:${v ? "8px" : "0"};">${esc(vn.transcript)}</div>`;
        inner += `<div style="font:400 11px/1.4 Arial,sans-serif;color:#8a8680;margin-top:5px;">${link}</div>`;
      } else {
        inner += `<div style="font:italic 400 14px/1.5 Georgia,serif;color:#4a4844;margin-top:${v ? "8px" : "0"};">${link}</div>`;
      }
    }
    rows += `<tr><td style="padding:14px 0;border-bottom:1px solid #eee;vertical-align:top;">
       <div style="font:400 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8680;margin-bottom:6px;">${esc(label)}</div>
       ${inner}
     </td></tr>`;
  });
  if (documents.length) {
    const items = documents.map(f => mode === "blob"
      ? `<li><a href="${esc(f.url)}" style="color:#111;">${esc(f.name)}</a></li>`
      : `<li>${esc(f.name)} <span style="color:#8a8680;">(en pièce jointe)</span></li>`).join("");
    rows += `<tr><td style="padding:14px 0;">
        <div style="font:400 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8680;margin-bottom:8px;">Documents joints (${documents.length})</div>
        <ul style="margin:0;padding-left:18px;font:400 15px/1.6 Georgia,serif;color:#111;">${items}</ul>
      </td></tr>`;
  }

  const htmlBody = `
    <div style="max-width:640px;margin:0 auto;font-family:Georgia,serif;color:#111;">
      <div style="font:400 24px/1.1 Georgia,serif;letter-spacing:-.01em;">Informations préparatoires — Pomerleau</div>
      <div style="font:italic 400 15px Georgia,serif;color:#8a8680;margin:6px 0 22px;">Réponse au questionnaire</div>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`;

  // ── Pièces jointes inline (petits fichiers) ──
  const attachments = (mode === "inline")
    ? files.filter(f => f.b64).map(f => ({ filename: f.name, content: f.b64 }))
    : [];

  // ── Envoi principal à Pascal ──
  try {
    const payload = {
      from,
      to: [to],
      reply_to: courriel,
      subject: `[Pomerleau] Questionnaire — ${nom || courriel}`,
      text: textBody,
      html: htmlBody,
    };
    if (attachments.length) payload.attachments = attachments;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errTxt = await r.text();
      console.error("Resend error:", r.status, errTxt);
      return res.status(502).json({ error: "L'envoi a échoué. Réessayez, ou écrivez à pl@pascallepine.ca." });
    }
  } catch (err) {
    console.error("Fetch to Resend failed:", err);
    return res.status(500).json({ error: "Erreur réseau à l'envoi." });
  }

  // ── Confirmation au répondant (best-effort, non bloquant) ──
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [courriel],
        reply_to: to,
        subject: "Bien reçu — questionnaire préparatoire",
        text: `Bonjour${nom ? " " + nom : ""},\n\nMerci — vos réponses au questionnaire préparatoire sont bien arrivées. Je vous reviens avant la rencontre de démarrage.\n\nPascal Lépine`,
        html: `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#111;max-width:520px;">
          <p>Bonjour${nom ? " " + esc(nom) : ""},</p>
          <p>Merci — vos réponses au questionnaire préparatoire sont bien arrivées. Je vous reviens avant la rencontre de démarrage.</p>
          <p style="font-style:italic;color:#4a4844;">Pascal Lépine</p>
        </div>`,
      }),
    });
  } catch (e) { /* silencieux */ }

  return res.status(200).json({ ok: true });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
