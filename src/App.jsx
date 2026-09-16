import { useState } from "react";

const FUNCTION_URL = "/api/gtBuscador";

function iconoPara(url = "") {
  if (url.includes("/folders/")) return "📁";
  if (url.includes("docs.google.com/spreadsheets")) return "📊";
  if (url.includes("docs.google.com/document")) return "📄";
  if (url.includes("notion.so")) return "🗂️";
  return "🔗";
}

export default function App() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  async function buscar() {
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setErrored(false);
    setData(null);

    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const json = await res.json();
      setData(json.respuesta);
    } catch (err) {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") buscar();
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Global Talks · UPC</p>
        <h1 className="wordmark">Buscador GT</h1>
        <div className="rule" />
        <p className="subtitle">
          Pregunta por un manual, un evento o un integrante — te digo
          exactamente dónde está.
        </p>
      </header>

      <div className="search-row">
        <input
          type="text"
          placeholder="Ej: informe de poleras 2026-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="search-input"
        />
        <button onClick={buscar} disabled={loading} className="search-btn">
          {loading ? "Buscando" : "Buscar"}
        </button>
      </div>

      {loading && <p className="status-text">Revisando Notion y Drive…</p>}
      {errored && (
        <p className="status-text status-error">
          Algo falló al buscar. Intenta de nuevo en un momento.
        </p>
      )}

      {data && !loading && (
        <section className="result-panel">
          {data.intro && <p className="result-intro">{data.intro}</p>}

          {Array.isArray(data.items) && data.items.length > 0 && (
            <ul className="result-list">
              {data.items.map((item, i) => (
                <li key={i} className="result-item">
                  <span className="result-icon" aria-hidden="true">
                    {iconoPara(item.url)}
                  </span>
                  <span className="result-title">{item.title}</span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="result-open"
                  >
                    Abrir →
                  </a>
                </li>
              ))}
            </ul>
          )}

          {data.outro && <p className="result-outro">{data.outro}</p>}
        </section>
      )}

      <style>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 72px 20px 40px;
        }

        .hero {
          text-align: center;
          max-width: 480px;
          margin-bottom: 40px;
        }

        .eyebrow {
          margin: 0 0 6px;
          font-size: 0.8rem;
          letter-spacing: 0.04em;
          color: var(--slate-400);
        }

        .wordmark {
          margin: 0;
          font-family: "Fraunces", serif;
          font-weight: 500;
          font-size: 2.6rem;
          letter-spacing: -0.01em;
        }

        .rule {
          width: 56px;
          height: 2px;
          background: var(--gold-500);
          margin: 16px auto;
        }

        .subtitle {
          margin: 0;
          color: var(--slate-400);
          font-size: 0.98rem;
          line-height: 1.5;
        }

        .search-row {
          width: 100%;
          max-width: 560px;
          display: flex;
          gap: 10px;
        }

        .search-input {
          flex: 1;
          padding: 15px 18px;
          border-radius: 8px;
          border: 1px solid var(--navy-700);
          background: var(--navy-800);
          color: var(--cream-100);
          font-family: inherit;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .search-input::placeholder {
          color: var(--slate-400);
          opacity: 0.7;
        }

        .search-input:focus {
          border-color: var(--gold-500);
        }

        .search-btn {
          padding: 15px 26px;
          border-radius: 8px;
          border: 1px solid var(--gold-500);
          background: transparent;
          color: var(--gold-300);
          font-family: inherit;
          font-weight: 600;
          font-size: 0.98rem;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .search-btn:hover:not(:disabled) {
          background: var(--gold-500);
          color: var(--navy-950);
        }

        .search-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .status-text {
          margin-top: 22px;
          color: var(--slate-400);
          font-size: 0.95rem;
        }

        .status-error {
          color: #e0a19c;
        }

        .result-panel {
          width: 100%;
          max-width: 560px;
          margin-top: 28px;
          background: var(--navy-800);
          border: 1px solid var(--navy-700);
          border-top: 2px solid var(--gold-500);
          border-radius: 10px;
          padding: 26px 26px 22px;
        }

        .result-intro {
          margin: 0 0 18px;
          font-size: 1.02rem;
          line-height: 1.55;
        }

        .result-list {
          list-style: none;
          margin: 0 0 18px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .result-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 4px;
          border-bottom: 1px solid var(--navy-700);
        }

        .result-item:last-child {
          border-bottom: none;
        }

        .result-icon {
          font-size: 1.1rem;
          flex-shrink: 0;
        }

        .result-title {
          flex: 1;
          font-size: 0.96rem;
          line-height: 1.4;
        }

        .result-open {
          flex-shrink: 0;
          font-size: 0.9rem;
          font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
        }

        .result-open:hover {
          text-decoration: underline;
        }

        .result-outro {
          margin: 0;
          padding-top: 14px;
          border-top: 1px solid var(--navy-700);
          color: var(--slate-400);
          font-size: 0.92rem;
        }

        @media (max-width: 480px) {
          .wordmark {
            font-size: 2.1rem;
          }
          .search-row {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
