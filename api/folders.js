/**
 * GT Buscador — lista subcarpetas de Drive (para llenar los desplegables
 * de Año y Equipo dinámicamente, sin tener que escribirlos a mano).
 *
 * GET /api/folders?parentId=XXXX
 * Si no se pasa parentId, usa la variable de entorno GDRIVE_ROOT_FOLDER_ID
 * (la carpeta general de GT).
 */

import { google } from "googleapis";

async function listarSubcarpetas(saKeyJson, parentId) {
  const credentials = JSON.parse(saKeyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    orderBy: "name",
    pageSize: 100,
  });

  return res.data.files || [];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Usa GET" });
  }

  const parentId = req.query.parentId || process.env.GDRIVE_ROOT_FOLDER_ID;

  if (!parentId) {
    return res.status(400).json({
      error: "Falta parentId y no hay GDRIVE_ROOT_FOLDER_ID configurado",
    });
  }

  try {
    const carpetas = await listarSubcarpetas(process.env.GDRIVE_SA_KEY, parentId);
    return res.status(200).json({ carpetas });
  } catch (err) {
    console.error("Error listando carpetas:", err.message);
    return res.status(500).json({ error: "Error interno", detail: err.message });
  }
}
