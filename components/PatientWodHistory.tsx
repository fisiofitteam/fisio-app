import Link from "next/link";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

// Only render after the enclosing patient page has checked access.
export async function PatientWodHistory({ patientId, pageParam }: { patientId: string; pageParam?: string }) {
  const total = await prisma.wodLog.count({ where: { patientId } });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(pageParam);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const logs = await prisma.wodLog.findMany({
    where: { patientId },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const href = (n: number) => `/paciente/${patientId}/wod?historyPage=${n}#historial-wods`;

  return (
    <section id="historial-wods" className="mt-8 scroll-mt-4">
      <h2 className="text-lg font-semibold">Mi historial de WODs</h2>
      <p className="text-sm text-neutral-500 mt-1 mb-4">Consulta tus entrenamientos, las cargas que anotaste y cómo te sentiste. Los más recientes aparecen primero.</p>
      {total === 0 ? (
        <div className="card text-sm text-neutral-500">Todavía no has registrado ningún WOD. Al terminar, pulsa «Registrar al terminar» y guarda tus sensaciones para verlo aquí.</div>
      ) : (
        <>
          <p className="text-xs text-neutral-500 mb-3">{total} {total === 1 ? "WOD registrado" : "WODs registrados"}</p>
          <div className="space-y-3">
            {logs.map((log) => (
              <details key={log.id} className="card group min-w-0">
                <summary className="cursor-pointer flex items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{(log.completedAt ?? log.submittedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })}</div>
                    <p className="text-sm text-neutral-500 truncate mt-1">{log.rawText.split("\n").find((line) => line.trim()) || "WOD registrado"}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      {log.rpe !== null && <span className="rounded bg-neutral-100 px-2 py-1">Esfuerzo: {log.rpe}/10</span>}
                      {log.painScore !== null && <span className="rounded bg-neutral-100 px-2 py-1">Dolor: {log.painScore}/10</span>}
                    </div>
                  </div>
                  <span aria-hidden="true" className="text-neutral-400 group-open:rotate-180">⌄</span>
                </summary>
                <div className="border-t mt-3 pt-3 space-y-4 text-sm">
                  <div><h3 className="font-medium mb-1">WOD original</h3><p className="whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3">{log.rawText}</p></div>
                  {log.adaptedText && <div><h3 className="font-medium mb-1">Mi versión adaptada</h3><p className="whitespace-pre-wrap break-words rounded-lg bg-emerald-50 p-3">{log.adaptedText}</p></div>}
                  <div><h3 className="font-medium mb-1">Mis sensaciones y marcas</h3><p className="whitespace-pre-wrap break-words">{log.notes || "No añadiste comentarios en este WOD."}</p></div>
                </div>
              </details>
            ))}
          </div>
          {pages > 1 && <nav aria-label="Páginas del historial de WODs" className="flex items-center justify-between gap-2 mt-4 text-sm">
            {page > 1 ? <Link className="btn" href={href(page - 1)}>← Recientes</Link> : <span />}
            <span className="text-xs text-neutral-500">{page} / {pages}</span>
            {page < pages ? <Link className="btn" href={href(page + 1)}>Anteriores →</Link> : <span />}
          </nav>}
        </>
      )}
    </section>
  );
}
