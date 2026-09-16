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

/**
 * Recolecta el ID de folderId y todos sus subcarpetas descendientes
 * (recursivo), para poder restringir la búsqueda a "esta carpeta y
 * todo lo que hay adentro".
 */
async function recolectarSubcarpetas(drive, folderId, acumulado = []) {
  acumulado.push(folderId);

  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 100,
  });

  const hijos = res.data.files || [];
  for (const hijo of hijos) {
    await recolectarSubcarpetas(drive, hijo.id, acumulado);
  }

  return acumulado;
}

async function searchDrive(saKeyJson, query, folderId) {
  try {
    const credentials = JSON.parse(saKeyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });

    const textoEscapado = query.replace(/'/g, "\\'");
    let q = `fullText contains '${textoEscapado}' and trashed = false`;

    // Si viene un filtro de carpeta (Año/Equipo elegido en los desplegables),
    // restringimos a esa carpeta y a todas sus subcarpetas.
    if (folderId) {
      const ids = await recolectarSubcarpetas(drive, folderId);
      const clausulaParents = ids.map((id) => `'${id}' in parents`).join(" or ");
      q += ` and (${clausulaParents})`;
    }

    const res = await drive.files.list({
      q,
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
Eres el buscador interno de "Global Talks" (GT), grupo extraacadémico de la UPC.
Un integrante te hizo esta pregunta: "${pregunta}"

Estos son los resultados encontrados en Notion y Google Drive:
${listado || "(no se encontraron resultados)"}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después,
sin markdown, sin bloques de código, con esta forma exacta:

{
  "intro": "una frase corta que empiece exactamente con 'Hola GTcito, encontré esta información aquí:' (o, si no hay nada relevante, una frase breve explicando que no se encontró nada)",
  "items": [
    { "title": "título del documento tal cual aparece en la lista", "url": "el link exacto de la lista" }
  ],
  "outro": "una frase corta y amable ofreciendo ayuda para cualquier otra cosa"
}

Reglas:
- No inventes documentos ni links que no estén en la lista de resultados.
- Si no encontraste nada relevante en una fuente (Notion o Drive), simplemente no la menciones ni en "intro" ni en "items" — no expliques que faltó.
- Incluye en "items" solo los documentos realmente relevantes a la pregunta (máximo 5).
- No uses asteriscos, negritas en markdown, ni viñetas dentro de los textos — el formato lo pone la interfaz.
`.trim();

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      intro: raw,
      items: [],
      outro: "¿Te puedo ayudar con algo más?",
    };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usa POST" });
  }

  const { query, folderId } = req.body || {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Falta 'query' en el body" });
  }

  try {
    const [notionResults, driveResults] = await Promise.all([
      searchNotion(process.env.NOTION_TOKEN, query),
      searchDrive(process.env.GDRIVE_SA_KEY, query, folderId),
    ]);

    const resultados = [...notionResults, ...driveResults];
    const respuesta = await interpretarConGemini(
      process.env.GEMINI_API_KEY,
      query,
      resultados
    );

    return res.status(200).json({ respuesta });
  } catch (err) {
    console.error("Error general:", err);
    return res.status(500).json({ error: "Error interno", detail: err.message });
  }
}
