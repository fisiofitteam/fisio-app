import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { FORMAT_TEMPLATES, DAY_LABELS, type FormatKey } from "@/lib/content-templates";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const diff = Math.round((dayStart.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Hoy ${time}`;
  if (diff === 1) return `Mañana ${time}`;
  if (diff === -1) return `Ayer ${time}`;
  if (diff > 1 && diff < 7)
    return `${d.toLocaleDateString("es-ES", { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${time}`;
}

export default async function ToRecordPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const pieces = await prisma.contentPiece.findMany({
    where: { status: "script" },
    orderBy: [{ scheduledAt: "asc" }, { dayOfWeek: "asc" }],
    include: {
      week: {
        select: {
          id: true,
          weekNumber: true,
          year: true,
          centralTheme: true,
          bodyZone: true,
        },
      },
    },
  });

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">🎬 Para grabar</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Piezas en estado "guion" listas para producción, ordenadas por fecha. Pulsa una para abrir su modo grabación.
        </p>
      </header>

      <ContentNav active="to-record" />

      {pieces.length === 0 ? (
        <section className="card text-center py-12">
          <p className="text-sm text-neutral-500 italic">
            No hay piezas en estado "guion". Cuando marques una pieza como "Guion" listo, aparecerá aquí.
          </p>
        </section>
      ) : (
        <section className="card">
          <div className="divide-y divide-neutral-100">
            {pieces.map((p) => {
              const tpl = FORMAT_TEMPLATES[p.format as FormatKey];
              const formatLabel = tpl?.label ?? p.format;
              const displayTitle = p.title?.trim() || formatLabel;
              const dayLabel = DAY_LABELS[p.dayOfWeek] ?? "";
              return (
                <Link
                  key={p.id}
                  href={`/fisio/contenido/pieza/${p.id}?mode=recording`}
                  className="block py-3 px-2 -mx-2 hover:bg-neutral-50 rounded transition-colors"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium">{displayTitle}</span>
                        {p.title?.trim() && (
                          <span className="text-[11px] text-neutral-400 italic">({formatLabel})</span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Semana {p.week.weekNumber}/{p.week.year} · {p.week.centralTheme || "Sin tema"} · {p.week.bodyZone}
                      </div>
                      {p.hook && (
                        <p className="text-xs text-neutral-700 italic line-clamp-2 mt-1">
                          "{p.hook}"
                        </p>
                      )}
                      {(p.recordingLocation || p.recordingOutfit) && (
                        <div className="text-[11px] text-neutral-500 mt-1 flex gap-3 flex-wrap">
                          {p.recordingLocation && <span>📍 {p.recordingLocation}</span>}
                          {p.recordingOutfit && <span>👕 {p.recordingOutfit}</span>}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-medium text-blue-700">
                        📅 {formatDate(p.scheduledAt?.toISOString() ?? null)}
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-1">{dayLabel}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
