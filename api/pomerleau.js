/**
 * /api/pomerleau — réception du questionnaire préparatoire Pomerleau
 *
 * Reçoit un POST JSON : { answers, files, subFolder }
 *   - answers  : réponses du formulaire (identité, cases, questions ouvertes)
 *   - files    : [{ name, size, url, kind, q, seconds }] — TOUS déjà téléversés dans Blob
 *   - subFolder: dossier Blob de la soumission (pomerleau/soumissions/<horodatage>_<nom>_<rand>)
 *
 * 1) ARCHIVE DURABLE dans Blob : 00-reponses.txt + 00-reponses.json dans le dossier de la soumission
 *    (rien n'est jamais perdu, même si le courriel échoue)
 * 2) Courriel récapitulatif à POMERLEAU_TO via Resend (réponses + liens fichiers + lien archive)
 * 3) Confirmation au répondant
 * Transcription optionnelle des notes vocales si OPENAI_API_KEY / V2T présent.
 *
 * Env : RESEND_API_KEY (requis), BLOB_READ_WRITE_TOKEN (requis pour l'archive),
 *       POMERLEAU_TO (défaut "pl@pascallepine.ca" ; plusieurs adresses séparées par des virgules),
 *       POMERLEAU_FROM (défaut "Pascal Lépine <pl@pascallepine.ca>"),
 *       OPENAI_API_KEY ou V2T (optionnel, transcription).
 */

import { put } from "@vercel/blob";

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
  const subFolder = (body.subFolder || "pomerleau/soumissions/soumission").replace(/[^a-zA-Z0-9/_.\-]/g, "");

  const courriel = (answers.courriel || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) {
    return res.status(400).json({ error: "Adresse courriel invalide." });
  }

  const toList = [...new Set((process.env.POMERLEAU_TO || "pl@pascallepine.ca").split(",").map((s) => s.trim()).filter(Boolean))];
  const from = process.env.POMERLEAU_FROM || "Pascal Lépine <pl@pascallepine.ca>";
  const nom = (answers.nom || "").trim();

  const voices = files.filter((f) => f.kind === "voice");
  const documents = files.filter((f) => f.kind !== "voice");
  const voiceByQ = {};
  voices.forEach((v) => { if (v.q) voiceByQ[v.q] = v; });
  const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;

  // ── Transcription optionnelle des notes vocales (si clé présente) ──
  const openaiKey = process.env.OPENAI_API_KEY || process.env.V2T;
  if (openaiKey && voices.length) {
    await Promise.all(voices.map(async (v) => {
      try {
        if (!v.url) return;
        const ar = await fetch(v.url);
        const buf = Buffer.from(await ar.arrayBuffer());
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

  const QUESTIONS = {
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
    q6: "Commentaires libres",
  };

  const docsChecked = Array.isArray(answers.docsLabels) ? answers.docsLabels : [];
  const recuLe = new Date().toISOString();

  // ── Corps texte (aussi archivé dans Blob) ──
  const lines = [];
  lines.push("Questionnaire préparatoire — Pomerleau");
  lines.push(`Reçu le ${recuLe}`);
  lines.push("");
  lines.push(`Répondant : ${nom || "(sans nom)"} <${courriel}>`);
  lines.push("");
  lines.push(`── 01 · Documentation à transmettre ──`);
  lines.push(docsChecked.length ? docsChecked.map((d) => `  • ${d}`).join("\n") : "  (aucune case cochée)");
  lines.push("");
  Object.entries(QUESTIONS).forEach(([k, label]) => {
    const v = (answers[k] || "").trim();
    const vn = voiceByQ[k];
    if (!v && !vn) return;
    lines.push(`── ${label} ──`);
    if (v) lines.push(v);
    if (vn) {
      if (vn.transcript) lines.push(`« ${vn.transcript} »`);
      lines.push(`[Note vocale — ${mmss(vn.seconds)}] ${vn.url}`);
    }
    lines.push("");
  });
  if (documents.length) {
    lines.push(`── Documents joints (${documents.length}) ──`);
    documents.forEach((f) => lines.push(`  • ${f.name} — ${f.url}`));
    lines.push("");
  }
  const textBody = lines.join("\n");

  const jsonArchive = JSON.stringify({
    recuLe, nom, courriel, docsChecked, answers,
    documents: documents.map((f) => ({ name: f.name, size: f.size, url: f.url })),
    notesVocales: voices.map((v) => ({ q: v.q, seconds: v.seconds, url: v.url, transcript: v.transcript || null })),
  }, null, 2);

  // ── 1) ARCHIVE DURABLE dans Blob (le filet de sécurité) ──
  let archiveUrl = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const r1 = await put(`${subFolder}/00-reponses.txt`, textBody, { access: "public", contentType: "text/plain; charset=utf-8", addRandomSuffix: false });
      archiveUrl = r1.url;
      await put(`${subFolder}/00-reponses.json`, jsonArchive, { access: "public", contentType: "application/json; charset=utf-8", addRandomSuffix: false });
    } catch (e) { console.error("Blob archive failed:", e); }
  } else {
    console.error("BLOB_READ_WRITE_TOKEN missing — archive non écrite");
  }

  // ── 2) Courriel récapitulatif ──
  const esc = escapeHtml;
  let rows = "";
  if (archiveUrl) {
    rows += `<tr><td style="padding:12px 14px;background:#f2f0ea;border-radius:4px;">
        <div style="font:400 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8680;margin-bottom:4px;">Archive complète</div>
        <a href="${esc(archiveUrl)}" style="color:#111;font:400 14px Georgia,serif;">Voir la version archivée (réponses + fichiers)</a>
      </td></tr><tr><td style="height:10px;"></td></tr>`;
  }
  rows += block("Répondant", `${nom || "(sans nom)"} <${courriel}>`);
  rows += `<tr><td style="padding:14px 0;border-bottom:1px solid #eee;">
      <div style="font:400 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8680;margin-bottom:8px;">01 · Documentation à transmettre</div>
      ${docsChecked.length ? `<ul style="margin:0;padding-left:18px;font:400 15px/1.6 Georgia,serif;color:#111;">${docsChecked.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : `<div style="font:italic 400 15px Georgia,serif;color:#8a8680;">Aucune case cochée</div>`}
    </td></tr>`;
  Object.entries(QUESTIONS).forEach(([k, label]) => {
    const v = (answers[k] || "").trim();
    const vn = voiceByQ[k];
    if (!v && !vn) return;
    let inner = "";
    if (v) inner += `<div style="font:400 15px/1.6 Georgia,serif;color:#111;white-space:pre-wrap;">${esc(v)}</div>`;
    if (vn) {
      const link = `<a href="${esc(vn.url)}" style="color:#8a8680;">Note vocale — ${mmss(vn.seconds)}</a>`;
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
    const items = documents.map((f) => `<li><a href="${esc(f.url)}" style="color:#111;">${esc(f.name)}</a></li>`).join("");
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

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: toList,
        reply_to: courriel,
        subject: `[Pomerleau] Questionnaire — ${nom || courriel}`,
        text: textBody + (archiveUrl ? `\n\n── Archive ──\n${archiveUrl}` : ""),
        html: htmlBody,
      }),
    });
    if (!r.ok) {
      const errTxt = await r.text();
      console.error("Resend error:", r.status, errTxt);
      // L'archive est déjà écrite : on signale l'échec courriel mais rien n'est perdu.
      return res.status(archiveUrl ? 200 : 502).json({ ok: !!archiveUrl, emailFailed: true, archived: !!archiveUrl });
    }
  } catch (err) {
    console.error("Fetch to Resend failed:", err);
    return res.status(archiveUrl ? 200 : 500).json({ ok: !!archiveUrl, emailFailed: true, archived: !!archiveUrl });
  }

  // ── 3) Confirmation au répondant (best-effort) ──
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [courriel],
        reply_to: toList[0],
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

  return res.status(200).json({ ok: true, archived: !!archiveUrl });
}

function block(label, val) {
  const esc = escapeHtml;
  return `<tr><td style="padding:14px 0;border-bottom:1px solid #eee;vertical-align:top;">
     <div style="font:400 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a8680;margin-bottom:6px;">${esc(label)}</div>
     <div style="font:400 15px/1.6 Georgia,serif;color:#111;white-space:pre-wrap;">${esc(val)}</div>
   </td></tr>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
