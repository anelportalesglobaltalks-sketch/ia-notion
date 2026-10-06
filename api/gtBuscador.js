/**
 * GT Buscador — Vercel Serverless Function
 * Busca en Notion + Google Drive y usa Gemini para interpretar la pregunta
 * y devolver el documento más relevante con su link directo.
 *
 * Variables de entorno necesarias (configúralas en Vercel → Project →
 * Settings → Environment Variables):
 *   NOTION_TOKEN
 *   GDRIVE_SA_KEY         (el JSON completo de la service account, como string)
 *   GEMINI_API_KEY
 *   GDRIVE_ROOT_FOLDER_ID (opcional, para los desplegables Año/Equipo)
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
 * Recolecta el ID de rootId y todos sus subcarpetas descendientes,
 * nivel por nivel, consultando TODAS las carpetas de un mismo nivel
 * en paralelo (mucho más rápido que ir una por una).
 */
async function recolectarSubcarpetas(drive, rootId) {
  const todos = [rootId];
  let nivelActual = [rootId];

  while (nivelActual.length > 0) {
    const respuestas = await Promise.all(
      nivelActual.map((id) =>
        drive.files.list({
          q: `'${id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id)",
          pageSize: 100,
        })
      )
    );

    const siguienteNivel = respuestas.flatMap((r) =>
      (r.data.files || []).map((f) => f.id)
    );

    todos.push(...siguienteNivel);
    nivelActual = siguienteNivel;
  }

  return todos;
}

function dividirEnBloques(arr, tamano) {
  const bloques = [];
  for (let i = 0; i < arr.length; i += tamano) {
    bloques.push(arr.slice(i, i + tamano));
  }
  return bloques;
}

async function ejecutarBusquedaDrive(drive, query, folderId) {
  const textoEscapado = query.replace(/'/g, "\\'");
  const baseQ = `fullText contains '${textoEscapado}' and trashed = false`;

  // Sin filtro de carpeta: una sola consulta normal.
  if (!folderId) {
    const res = await drive.files.list({
      q: baseQ,
      fields: "files(id, name, webViewLink, mimeType, modifiedTime)",
      pageSize: 8,
    });
    return (res.data.files || []).map((f) => ({
      source: "drive",
      title: f.name,
      url: f.webViewLink,
    }));
  }

  // Con filtro: la carpeta puede tener muchas subcarpetas, y meter todos
  // los IDs en un solo "or" gigante puede exceder el límite de longitud
  // que acepta la API de Drive (error 400). Lo partimos en bloques.
  const ids = await recolectarSubcarpetas(drive, folderId);
  const bloques = dividirEnBloques(ids, 20);

  const respuestasPorBloque = await Promise.all(
    bloques.map((bloque) => {
      const clausulaParents = bloque.map((id) => `'${id}' in parents`).join(" or ");
      const q = `${baseQ} and (${clausulaParents})`;
      return drive.files.list({
        q,
        fields: "files(id, name, webViewLink, mimeType, modifiedTime)",
        pageSize: 8,
      });
    })
  );

  const vistos = new Set();
  const archivos = [];
  for (const res of respuestasPorBloque) {
    for (const f of res.data.files || []) {
      if (!vistos.has(f.id)) {
        vistos.add(f.id);
        archivos.push(f);
      }
    }
  }

  return archivos.slice(0, 8).map((f) => ({
    source: "drive",
    title: f.name,
    url: f.webViewLink,
  }));
}

async function searchDrive(saKeyJson, query, folderId) {
  try {
    const credentials = JSON.parse(saKeyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    const drive = google.drive({ version: "v3", auth });

    const resultadosFiltrados = await ejecutarBusquedaDrive(drive, query, folderId);

    // Si buscabas dentro de un Año/Equipo y no salió nada, reintenta sin
    // el filtro, en todo el Drive, para no devolver "no encontré nada" en falso.
    if (folderId && resultadosFiltrados.length === 0) {
      const resultadosGlobales = await ejecutarBusquedaDrive(drive, query, undefined);
      return {
        resultados: resultadosGlobales,
        fueraDelFiltro: resultadosGlobales.length > 0,
      };
    }

    return { resultados: resultadosFiltrados, fueraDelFiltro: false };
  } catch (err) {
    console.error("Error buscando en Drive:", err.message);

    // Si el error fue específicamente en la búsqueda filtrada, igual
    // intentamos el respaldo sin filtro antes de rendirnos.
    try {
      const credentials = JSON.parse(saKeyJson);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });
      const drive = google.drive({ version: "v3", auth });
      const resultadosGlobales = await ejecutarBusquedaDrive(drive, query, undefined);
      return {
        resultados: resultadosGlobales,
        fueraDelFiltro: Boolean(folderId) && resultadosGlobales.length > 0,
      };
    } catch (err2) {
      console.error("Error en búsqueda de respaldo:", err2.message);
      return { resultados: [], fueraDelFiltro: false };
    }
  }
}

async function interpretarConGemini(apiKey, pregunta, resultados, fueraDelFiltro) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

  const listado = resultados
    .map((r, i) => `${i + 1}. [${r.source.toUpperCase()}] "${r.title}" -> ${r.url}`)
    .join("\n");

  const notaFiltro = fueraDelFiltro
    ? `\nNOTA: no se encontró nada dentro del Año/Equipo que la persona filtró, así que estos resultados vienen de una búsqueda en TODO el Drive. Menciónalo brevemente en "intro" (ej. "no encontré nada en ese filtro, pero sí en el resto del Drive:").`
    : "";

  const prompt = `
Eres el buscador interno de "Global Talks" (GT), grupo extraacadémico de la UPC.
Un integrante te hizo esta pregunta: "${pregunta}"

Estos son los resultados encontrados en Notion y Google Drive:
${listado || "(no se encontraron resultados)"}
${notaFiltro}

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
    const [notionResults, driveResultado] = await Promise.all([
      searchNotion(process.env.NOTION_TOKEN, query),
      searchDrive(process.env.GDRIVE_SA_KEY, query, folderId),
    ]);

    const resultados = [...notionResults, ...driveResultado.resultados];
    const respuesta = await interpretarConGemini(
      process.env.GEMINI_API_KEY,
      query,
      resultados,
      driveResultado.fueraDelFiltro
    );

    return res.status(200).json({ respuesta });
  } catch (err) {
    console.error("Error general:", err);
    return res.status(500).json({ error: "Error interno", detail: err.message });
  }
}