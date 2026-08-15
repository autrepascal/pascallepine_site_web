/**
 * /api/upload — autorisation des téléversements clients vers Vercel Blob
 *
 * Utilisé pour les gros fichiers (> ~3 Mo au total) : le navigateur téléverse
 * directement vers Blob (sans passer par la limite de corps ~4,5 Mo des fonctions),
 * puis /api/pomerleau reçoit les liens.
 *
 * Variable d'environnement :
 *   - BLOB_READ_WRITE_TOKEN (fourni automatiquement quand un store Blob
 *     est connecté au projet dans Vercel → Storage → Blob).
 *
 * Tant qu'aucun store Blob n'est connecté, les petits fichiers passent quand
 * même (en pièce jointe inline via /api/pomerleau) ; seuls les envois volumineux
 * nécessitent cette route.
 */

import { handleUpload } from "@vercel/blob/client";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: "Le stockage de fichiers n'est pas encore activé. Réduisez la taille des pièces jointes, ou écrivez à pl@pascallepine.ca.",
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // Aucune restriction de type : documents bureautiques, audio, images, etc.
        maximumSizeInBytes: 50 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => { /* rien : les liens sont renvoyés au client */ },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error("Blob upload error:", err);
    return res.status(400).json({ error: err?.message || "Téléversement refusé." });
  }
}
