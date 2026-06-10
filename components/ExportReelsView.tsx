"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Piece = {
  id: string;
  title: string | null;
  format: string;
  goal: string;
  blocks: string;          // JSON string
  caption: string | null;
  dmKeyword: string | null;
  pubDate: string;         // ISO
  editorNotes: string | null;
};

type Block = { id: string; label: string; content: string; order: number };

function parseBlocks(raw: string): Block[] {
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) {
      return v
        .filter((b) => b && typeof b === "object")
        .map((b: any, i: number) => ({
          id: typeof b.id === "string" ? b.id : `b${i}`,
          label: typeof b.label === "string" ? b.label : "",
          content: typeof b.content === "string" ? b.content : "",
          order: typeof b.order === "number" ? b.order : i,
        }))
        .sort((a, b) => a.order - b.order);
    }
  } catch {}
  return [];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function ExportReelsView({
  monthLabel,
  currentMonth,
  monthOptions,
  pieces,
}: {
  monthLabel: string;
  currentMonth: string;
  monthOptions: Array<{ value: string; label: string }>;
  pieces: Piece[];
}) {
  const router = useRouter();

  return (
    <main className="bg-white text-neutral-900 min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .reel-card { page-break-inside: avoid; break-inside: avoid; }
          .reel-card + .reel-card { page-break-before: auto; }
        }
        @page { margin: 1.5cm; }
      `}</style>

      {/* Barra de acciones (no se imprime) */}
      <div className="no-print sticky top-0 bg-neutral-50 border-b border-neutral-200 px-4 py-3 flex justify-between items-center gap-3 flex-wrap z-10">
        <Link href="/fisio/contenido/calendario" className="text-sm text-neutral-500 hover:underline">
          ← Volver al calendario
        </Link>
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">Mes:</label>
          <select
            value={currentMonth}
            onChange={(e) => router.push(`/fisio/contenido/export-reels?month=${e.target.value}`)}
            className="input text-sm w-auto capitalize"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value} className="capitalize">
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            className="btn btn-primary text-sm whitespace-nowrap"
            disabled={pieces.length === 0}
          >
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-8 py-10">
        <header className="mb-8 pb-4 border-b-2 border-neutral-900">
          <h1 className="text-3xl font-bold tracking-tight capitalize" style={{ letterSpacing: "-0.02em" }}>
            Guiones de Reels · {monthLabel}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {pieces.length} reels · FisioFit Team · Generado el{" "}
            {new Date().toLocaleDateString("es-ES")}
          </p>
        </header>

        {pieces.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            <div className="text-3xl mb-2">🎬</div>
            <p className="text-sm">No hay reels planificados en este mes.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {pieces.map((p, idx) => {
              const blocks = parseBlocks(p.blocks);
              const editorNote = p.editorNotes?.trim();
              return (
                <section
                  key={p.id}
                  className="reel-card rounded-xl border border-neutral-200 p-5"
                >
                  <header className="mb-4 pb-3 border-b border-neutral-100">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                      <h2 className="text-lg font-bold" style={{ letterSpacing: "-0.015em" }}>
                        Reel #{idx + 1}
                        {p.title && <span className="text-neutral-500 font-normal"> · {p.title}</span>}
                      </h2>
                      <span className="text-base font-bold capitalize" style={{ color: "#0A0A0A" }}>
                        {formatDate(p.pubDate)}
                      </span>
                    </div>
                    {p.dmKeyword && (
                      <div className="text-xs text-neutral-500">
                        Palabra clave DM: <span className="font-mono text-neutral-700">{p.dmKeyword}</span>
                      </div>
                    )}
                  </header>

                  {/* Nota para el editor: solo si existe contenido en editorNotes.
                      Va destacada en amarillo justo encima del guion. */}
                  {editorNote && (
                    <div
                      className="mb-3 rounded-lg p-3"
                      style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}
                    >
                      <div
                        className="text-[10px] uppercase tracking-wide font-bold mb-1"
                        style={{ color: "#78350F" }}
                      >
                        📌 Para el editor
                      </div>
                      <p
                        className="text-sm whitespace-pre-wrap leading-relaxed"
                        style={{ color: "#451A03" }}
                      >
                        {editorNote}
                      </p>
                    </div>
                  )}

                  {blocks.length === 0 ? (
                    <p className="text-xs italic text-neutral-400">
                      (Sin guion todavía — esta pieza está en estado "idea")
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {blocks.map((b) => (
                        <div key={b.id}>
                          <div className="text-[10px] uppercase tracking-wide font-semibold text-neutral-500 mb-1">
                            {b.label}
                          </div>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{b.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {p.caption?.trim() && (
                    <div className="mt-4 pt-3 border-t border-neutral-100">
                      <div className="text-[10px] uppercase tracking-wide font-semibold text-neutral-500 mb-1">
                        Caption
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-neutral-700">{p.caption}</p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </article>
    </main>
  );
}
