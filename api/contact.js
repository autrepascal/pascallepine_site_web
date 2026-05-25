/**
 * /api/contact — relais formulaire de contact vers Resend
 *
 * Reçoit un POST JSON avec { nom, courriel, organisation, objet, message }.
 * Envoie un courriel à pl@pascallepine.ca via Resend.
 *
 * Variables d'environnement requises :
 *   - RESEND_API_KEY : clé API Resend (à configurer dans Vercel → Settings → Environment Variables)
 *
 * Configuration optionnelle :
 *   - CONTACT_FROM : adresse expéditeur (défaut : "Pascal Lépine <pl@pascallepine.ca>")
 *   - CONTACT_TO   : adresse destinataire (défaut : "pascallepinemtl@gmail.com")
 *
 * Le domaine expéditeur doit être vérifié dans le compte Resend.
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY missing");
    return res.status(500).json({ error: "Service non configuré" });
  }

  // Body parsing (Vercel parses JSON automatically when Content-Type is set)
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { nom, courriel, organisation, objet, message } = body;

  if (!courriel || !message) {
    return res.status(400).json({ error: "Courriel et message sont requis" });
  }

  // Validation minimale du courriel
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) {
    return res.status(400).json({ error: "Adresse courriel invalide" });
  }

  const from = process.env.CONTACT_FROM || "Pascal Lépine <pl@pascallepine.ca>";
  const to = process.env.CONTACT_TO || "pascallepinemtl@gmail.com";

  const subject = `[Site] ${objet ? objet : "Message de " + (nom || courriel)}`;

  const textBody = [
    `De : ${nom || "(sans nom)"} <${courriel}>`,
    organisation ? `Organisation : ${organisation}` : null,
    objet ? `Objet : ${objet}` : null,
    "",
    "─────────",
    "",
    message
  ].filter(Boolean).join("\n");

  const htmlBody = `
    <div style="font-family: Georgia, serif; font-size: 16px; line-height: 1.6; color: #111;">
      <p><strong>De :</strong> ${escapeHtml(nom || "(sans nom)")} &lt;${escapeHtml(courriel)}&gt;</p>
      ${organisation ? `<p><strong>Organisation :</strong> ${escapeHtml(organisation)}</p>` : ""}
      ${objet ? `<p><strong>Objet :</strong> ${escapeHtml(objet)}</p>` : ""}
      <hr style="border: none; border-top: 1px solid #ddd; margin: 1.5em 0;">
      <div style="white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: courriel,
        subject,
        text: textBody,
        html: htmlBody
      })
    });

    if (!resendRes.ok) {
      const errTxt = await resendRes.text();
      console.error("Resend API error:", resendRes.status, errTxt);
      return res.status(502).json({ error: "Erreur lors de l'envoi" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Fetch to Resend failed:", err);
    return res.status(500).json({ error: "Erreur réseau" });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
