import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { DossierMonthPicker } from "@/components/DossierMonthPicker";
import { DossierPrintButton } from "@/components/DossierPrintButton";
import { DAY_LABELS } from "@/lib/content-templates";
import {
  formatLabelOnly,
  formatIcon,
  parseGoals,
  goalColor,
  goalLabel,
  GOAL_COLOR_CLASSES,
  piecePublishDate,
} from "@/lib/content-formats";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  idea: "Idea",
  script: "Guion listo",
  recorded: "Grabado",
  edited: "Editado",
  scheduled: "Programado",
  published: "Publicado",
};

const WEEK_TYPE_LABEL: Record<string, string> = {
  educativa: "Educativa",
  objeciones: "Objeciones",
  lanzamiento: "Lanzamiento",
  recuperacion: "Recuperación",
};

function parseMonthParam(m: string | undefined): { year: number; month: number } {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mm] = m.split("-").map(Number);
    if (mm >= 1 && mm <= 12) return { year: y, month: mm };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  const s = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parsear el JSON blocks del guion. Ignora bloques vacíos.
 */
function parseBlocks(raw: string): Array<{ label: string; content: string }> {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((b: any) => ({
        label: String(b?.label ?? "").trim(),
        content: String(b?.content ?? "").trim(),
      }))
      .filter((b) => b.label || b.content);
  } catch {
    return [];
  }
}

export default async function DossierPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const { year, month } = parseMonthParam(searchParams.m);
  // Ventana del mes en UTC (mismo criterio que ContentWeek.startDate, que
  // es un lunes 00:00 UTC). Buscamos semanas cuyo intervalo intersecte con
  // este mes: startDate <= último día del mes AND endDate >= primer día.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const weeks = await prisma.contentWeek.findMany({
    where: {
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    include: {
      // Solo REELS — el resto de formatos (carrusel, foto, directo) no
      // aplican al flujo grabación / drive / editor.
      pieces: {
        where: { format: "reel" },
        orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { startDate: "asc" },
  });

  return (
    <main>
      <header className="mb-5 print:hidden">
        <h1 className="text-xl font-semibold">📄 Dossier de contenido</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Documento vivo por mes. Se sincroniza automáticamente con la estrategia y guiones que edites en el calendario y en las fichas de cada pieza.
        </p>
      </header>

      <div className="print:hidden">
        <ContentNav active="dossier" role={user.role} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap print:hidden">
        <DossierMonthPicker year={year} month={month} />
        <DossierPrintButton />
      </div>

      {/* Encabezado del documento (visible al imprimir) */}
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">FisioFit Team · Dossier de contenido</div>
        <h2 className="text-2xl font-bold">{monthLabel(year, month)}</h2>
        <p className="text-xs text-neutral-500 mt-1">
          {weeks.length} semana{weeks.length === 1 ? "" : "s"} · {weeks.reduce((n, w) => n + w.pieces.length, 0)} reels totales
        </p>
      </div>

      {weeks.length === 0 ? (
        <section className="card text-center py-12 print:border-0">
          <p className="text-sm text-neutral-500 italic">
            Este mes no tiene semanas planificadas.
          </p>
          <Link
            href="/fisio/contenido/calendario"
            className="inline-block mt-3 text-xs font-medium text-neutral-900 underline print:hidden"
          >
            Ir al calendario para planificar →
          </Link>
        </section>
      ) : (
        (() => {
          // Contador global de reels del mes, en el orden de aparición
          // (semana asc → día asc). Se incrementa al renderizar cada pieza.
          let reelCounter = 0;
          return (
        <div className="space-y-8">
          {weeks.map((week) => {
            const startStr = week.startDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
            const endStr = week.endDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
            const weekTypeLabel = WEEK_TYPE_LABEL[week.weekType] ?? week.weekType;
            return (
              <section key={week.id} className="print:break-inside-avoid-page">
                {/* Cabecera de semana */}
                <div className="border-b-2 border-neutral-800 pb-2 mb-3">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold">
                      Semana {week.weekNumber}
                      <span className="text-neutral-500 font-normal"> · {startStr} → {endStr}</span>
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                      {weekTypeLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-800">
                    <b>Tema:</b> {week.centralTheme || <span className="italic text-neutral-400">sin tema</span>}
                    {week.bodyZone && <span className="text-neutral-500"> · {week.bodyZone}</span>}
                  </div>
                  {week.leadMagnetName && (
                    <div className="text-xs text-neutral-600 mt-0.5">
                      🎁 Lead magnet: <b>{week.leadMagnetName}</b>
                      {week.leadMagnetKeyword && <span> — keyword DM: <code className="bg-neutral-100 px-1 rounded">{week.leadMagnetKeyword}</code></span>}
                    </div>
                  )}
                  {week.limitingBeliefs && (
                    (() => {
                      try {
                        const arr = JSON.parse(week.limitingBeliefs);
                        if (!Array.isArray(arr) || arr.length === 0) return null;
                        return (
                          <div className="text-xs text-neutral-600 mt-1">
                            <b>Creencias limitantes a atacar:</b> {arr.join(" · ")}
                          </div>
                        );
                      } catch { return null; }
                    })()
                  )}
                </div>

                {/* Piezas de la semana */}
                {week.pieces.length === 0 ? (
                  <p className="text-sm text-neutral-400 italic ml-1">
                    Sin reels planificados esta semana.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {week.pieces.map((p) => {
                      const goals = parseGoals(p.goals);
                      const blocks = parseBlocks(p.blocks);
                      const publishDate = piecePublishDate(week.startDate, p.dayOfWeek);
                      const publishStr = publishDate
                        ? publishDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })
                        : DAY_LABELS[p.dayOfWeek];
                      const fmtLabel = formatLabelOnly(p.format);
                      const fmtIcon = formatIcon(p.format);
                      const displayTitle = p.title?.trim() || fmtLabel;
                      // Como solo mostramos reels, el contador es continuo y
                      // no distingue formato. Empieza en 1.
                      reelCounter += 1;
                      const reelLabel = `Reel ${reelCounter}`;
                      return (
                        <article
                          key={p.id}
                          className="border border-neutral-200 rounded-lg p-4 print:break-inside-avoid print:border-neutral-300"
                        >
                          {/* Header de la pieza */}
                          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span
                                className="text-sm font-bold px-2 py-0.5 rounded"
                                style={{ background: "#1E3A8A", color: "#FAFAFA", letterSpacing: "0.02em" }}
                              >
                                {reelLabel}
                              </span>
                              <span>{fmtIcon}</span>
                              <h4 className="text-base font-semibold">{displayTitle}</h4>
                              {p.title?.trim() && (
                                <span className="text-[11px] text-neutral-400">({fmtLabel})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-neutral-700 capitalize">
                                📅 {publishStr}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                                {STATUS_LABEL[p.status] ?? p.status}
                              </span>
                            </div>
                          </div>

                          {goals.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {goals.map((g) => (
                                <span key={g} className={`text-[10px] px-1.5 py-0.5 rounded ${GOAL_COLOR_CLASSES[goalColor(g)]}`}>
                                  {goalLabel(g)}
                                </span>
                              ))}
                            </div>
                          )}

                          {blocks.length > 0 && (
                            <div className="mb-2">
                              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Guion</div>
                              <div className="space-y-2">
                                {blocks.map((b, i) => (
                                  <div key={i} className="text-sm">
                                    {b.label && (
                                      <div
                                        className="text-[12px] font-bold uppercase tracking-wide"
                                        style={{ color: "#172554" }}
                                      >
                                        {b.label}
                                      </div>
                                    )}
                                    {b.content && (
                                      <div className="text-neutral-800 whitespace-pre-wrap">{b.content}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(p.recordingLocation || p.recordingOutfit || p.recordingMaterial) && (
                            <div className="text-xs text-neutral-700 mb-1">
                              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">Producción</div>
                              <ul className="pl-4 list-disc space-y-0.5">
                                {p.recordingLocation && <li>📍 {p.recordingLocation}</li>}
                                {p.recordingOutfit && <li>👕 {p.recordingOutfit}</li>}
                                {p.recordingMaterial && <li>🎒 {p.recordingMaterial}</li>}
                              </ul>
                            </div>
                          )}

                          {p.editorNotes && (
                            <div className="text-xs text-neutral-700 mb-1">
                              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">Notas para editor</div>
                              <p className="text-neutral-800 whitespace-pre-wrap">{p.editorNotes}</p>
                            </div>
                          )}

                          {p.finalFileUrl && (
                            <div className="text-xs mt-1">
                              <b>Archivo final:</b>{" "}
                              <a href={p.finalFileUrl} target="_blank" rel="noreferrer" className="underline text-blue-700 break-all">
                                {p.finalFileUrl}
                              </a>
                            </div>
                          )}

                          <div className="mt-2 pt-2 border-t border-neutral-100 print:hidden">
                            <Link
                              href={`/fisio/contenido/pieza/${p.id}`}
                              className="text-[11px] text-neutral-500 hover:text-neutral-900"
                            >
                              Editar pieza →
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
          );
        })()
      )}
    </main>
  );
}
