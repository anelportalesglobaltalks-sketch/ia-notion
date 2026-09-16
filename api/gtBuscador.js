/**
 * GT Buscador — Vercel Serverless Function
 * Busca en Notion + Google Drive y usa Gemini para interpretar la pregunta
 * y devolver el documento más relevante con su link directo.
 *
 * Variables de entorno necesarias (configúralas en Vercel → Project →
 * Settings → Environment Variables):
 *   NOTION_TOKEN
 *   GDRIVE_SA_KEY   (el JSON completo de la service account, como string)
 *   GEMINI_API_KEY
 */

import { Client as NotionClient } from "@notionhq/client";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function searchNotion(token, query) {
  const notion = new NotionClient({ auth: token });
  try {
    const res = await notion.search({ query, page_size: 8 });
    return res.results.map((r) => {
      const title =
        r.properties?.title?.title?.[0]?.plain_text ||
        r.properties?.Name?.title?.[0]?.plain_text ||
        r.child_page?.title ||
        "(sin título)";
      return { source: "notion", title, url: r.url };
    });
  } catch (err) {
    console.error("Error buscando en Notion:", err.message);
    return [];
  }
}

async function searchDrive(saKeyJson, query) {
  try {
    const credentials = JSON.parse(saKeyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.list({
      q: `fullText contains '${query.replace(/'/g, "\\'")}'`,
      fields: "files(id, name, webViewLink, mimeType, modifiedTime)",
      pageSize: 8,
    });

    return (res.data.files || []).map((f) => ({
      source: "drive",
      title: f.name,
      url: f.webViewLink,
    }));
  } catch (err) {
    console.error("Error buscando en Drive:", err.message);
    return [];
  }
}

async function interpretarConGemini(apiKey, pregunta, resultados) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  const listado = resultados
    .map((r, i) => `${i + 1}. [${r.source.toUpperCase()}] "${r.title}" -> ${r.url}`)
    .join("\n");

  const prompt = `
Eres el buscador interno de "Global Talks" (GT). Un integrante te hizo esta pregunta:
"${pregunta}"

Estos son los resultados encontrados en Notion y Google Drive:
${listado || "(no se encontraron resultados)"}

Instrucciones para tu respuesta:
- Si hay un resultado que responde claramente a la pregunta, respóndele empezando con
  "Hola GTcito, encontré esta información aquí:" seguido del título y el link, SIN dar resumen del contenido.
- Si hay más de un resultado relevante, lista los principales (título + link).
- Si no encontraste nada relevante en Notion, NO lo menciones — solo presenta lo de Drive (o viceversa).
- Cierra siempre ofreciendo ayuda para cualquier otra cosa.
- No inventes links ni documentos que no estén en la lista de resultados.
`.trim();

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usa POST" });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Falta 'query' en el body" });
  }

  try {
    const [notionResults, driveResults] = await Promise.all([
      searchNotion(process.env.NOTION_TOKEN, query),
      searchDrive(process.env.GDRIVE_SA_KEY, query),
    ]);

    const resultados = [...notionResults, ...driveResults];
    const respuesta = await interpretarConGemini(
      process.env.GEMINI_API_KEY,
      query,
      resultados
    );

    return res.status(200).json({ respuesta, resultados });
  } catch (err) {
    console.error("Error general:", err);
    return res.status(500).json({ error: "Error interno", detail: err.message });
  }
}
