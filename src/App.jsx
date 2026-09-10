import { useState } from "react";

// En Vercel, /api/gtBuscador funciona tal cual (mismo dominio),
// no necesitas poner una URL completa como en Firebase.
const FUNCTION_URL = "/api/gtBuscador";

function linkify(text) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [loading, setLoading] = useState(false);

  async function buscar() {
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setRespuesta("");

    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setRespuesta(data.respuesta || "No se encontró información.");
    } catch (err) {
      setRespuesta("Ocurrió un error al buscar. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") buscar();
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>🔎 Buscador GT</h1>
      <p style={styles.subtitle}>Pregúntame por un manual, evento o integrante</p>

      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Ej: informe de poleras 2026-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={styles.input}
        />
        <button onClick={buscar} disabled={loading} style={styles.button}>
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {loading && <p style={styles.loading}>Buscando en Notion y Drive…</p>}

      {respuesta && !loading && (
        <div style={styles.resultBox}>{linkify(respuesta)}</div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 16px",
    background: "#0f172a",
    color: "#e2e8f0",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  title: { fontSize: "1.5rem", marginBottom: 4 },
  subtitle: { color: "#94a3b8", marginTop: 0, marginBottom: 24 },
  searchBox: { width: "100%", maxWidth: 640, display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: "1rem",
    outline: "none",
  },
  button: {
    padding: "14px 20px",
    borderRadius: 10,
    border: "none",
    background: "#6366f1",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "1rem",
  },
  loading: { marginTop: 24, color: "#94a3b8" },
  resultBox: {
    width: "100%",
    maxWidth: 640,
    marginTop: 28,
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 20,
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
  },
};
