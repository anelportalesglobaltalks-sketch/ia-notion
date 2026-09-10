# Buscador GT (versión Vercel) — Notion + Google Drive + Gemini

Buscador web para Global Talks: escribes una pregunta y busca en tu Notion
y tu Google Drive, devolviendo el link directo al documento. Esta versión
se despliega en **Vercel**, sin necesidad de tarjeta de crédito.

## Estructura del proyecto

```
gt-buscador-vercel/
├── api/
│   └── gtBuscador.js      ← función serverless (backend)
├── src/
│   ├── App.jsx            ← componente principal (frontend)
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```

## 1. Credenciales de Notion

1. Ve a https://developers.notion.com/ → **My integrations** → **New integration**.
2. Ponle un nombre (ej. "GT Buscador"), selecciona tu workspace, guarda.
3. Copia el **Internal Integration Token**.
4. En Notion, entra a cada base de datos/página que quieras que el buscador
   pueda leer → botón **"..."** → **Connections** → conecta "GT Buscador".

## 2. Credenciales de Google Drive

1. Ve a https://console.cloud.google.com/ → crea un proyecto.
2. Activa la **Google Drive API**.
3. "Credenciales" → **Crear credenciales** → **Cuenta de servicio**.
4. Pestaña "Claves" → **Agregar clave** → JSON → descarga el archivo.
5. Comparte tu carpeta de Drive con el correo de la cuenta de servicio
   (permiso de **Lector**).

## 3. API Key de Gemini

Ve a https://aistudio.google.com/apikey y crea una key gratuita.

## 4. Instalar dependencias localmente

```bash
npm install
```

## 5. Configurar variables de entorno

Crea un archivo `.env.local` en la raíz (NO lo subas a GitHub):

```
NOTION_TOKEN=secret_xxxxxxxxxxxx
GEMINI_API_KEY=xxxxxxxxxxxx
GDRIVE_SA_KEY={"type":"service_account","project_id":"...", ...}
```

`GDRIVE_SA_KEY` es el contenido completo del JSON de la cuenta de
servicio, **en una sola línea**.

## 6. Probar localmente

```bash
npm install -g vercel
vercel dev
```

Esto simula el entorno de Vercel en tu máquina (frontend + función `/api`).

## 7. Subir a GitHub

```bash
git init
echo "node_modules/" >> .gitignore
echo ".env.local" >> .gitignore
echo "dist/" >> .gitignore
echo ".vercel/" >> .gitignore
git add .
git commit -m "Buscador GT: Notion + Drive + Gemini (Vercel)"
git remote add origin <tu-repo-url>
git push -u origin main
```

**Importante:** nunca subas `.env.local` ni el JSON de la cuenta de
servicio de Google al repo.

## 8. Desplegar en Vercel

1. Ve a https://vercel.com/ → inicia sesión con GitHub.
2. **Add New → Project** → selecciona tu repo `gt-buscador-vercel`.
3. Vercel detecta automáticamente que es un proyecto Vite/React.
4. Antes de darle a "Deploy", ve a **Environment Variables** y agrega las
   tres: `NOTION_TOKEN`, `GEMINI_API_KEY`, `GDRIVE_SA_KEY` (los mismos
   valores de tu `.env.local`).
5. Dale a **Deploy**.

Listo — Vercel te da una URL pública (ej. `gt-buscador.vercel.app`) donde
ya funciona todo: el frontend y la función en `/api/gtBuscador`.

## 9. Actualizaciones futuras

Cada vez que hagas `git push` a la rama principal, Vercel vuelve a
desplegar automáticamente — no necesitas repetir el proceso manual.

## Notas

- Si quieres limitar la búsqueda de Drive a una carpeta específica, agrega
  `and '<ID_DE_CARPETA>' in parents` a la query dentro de `searchDrive()`
  en `api/gtBuscador.js`.
- El formato de respuesta ("Hola GTcito, encontré esta información
  aquí...") ya está definido dentro del prompt que se le manda a Gemini,
  en la función `interpretarConGemini()`.
