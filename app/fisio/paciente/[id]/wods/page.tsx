import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fDateTime(d: Date): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export default async function PatientWodsTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!patient) notFound();

  const logs = await prisma.wodLog.findMany({
    where: { patientId: params.id },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <header className="mb-4">
        <h2 className="font-medium">WODs registrados</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {logs.length === 0 ? "Sin registros todavía" : `${logs.length} ${logs.length === 1 ? "WOD registrado" : "WODs registrados"}`}
          {logs.length === 50 && " (mostrando los 50 más recientes)"}
        </p>
      </header>

      {logs.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12 card">
          El paciente todavía no ha registrado ningún WOD desde la pestaña de adaptación.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <details key={log.id} className="card group">
              <summary className="flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{fDateTime(log.submittedAt)}</div>
                  <div className="text-xs text-neutral-500 truncate mt-0.5">
                    {(log.rawText || "").replace(/\s*\n\s*/g, " / ").slice(0, 100)}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-xs text-right">
                    {log.rpe !== null && (
                      <div className="text-neutral-700">
                        RPE <span className="font-medium">{log.rpe}</span>
                      </div>
                    )}
                    {log.painScore !== null && log.painScore > 0 && (
                      <div className="text-amber-700 mt-0.5">Dolor {log.painScore}/10</div>
                    )}
                  </div>
                  <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                </div>
              </summary>

              <div className="mt-3 border-t border-neutral-100 pt-3 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">WOD del entrenador (lo que escribió)</div>
                  <pre className="text-xs text-neutral-800 whitespace-pre-wrap font-mono bg-neutral-50 rounded-lg p-3">{log.rawText || "—"}</pre>
                </div>
                {log.adaptedText && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">Versión adaptada</div>
                    <pre className="text-xs text-neutral-800 whitespace-pre-wrap font-mono bg-emerald-50 rounded-lg p-3">{log.adaptedText}</pre>
                  </div>
                )}
                {log.notes && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">Notas del paciente</div>
                    <p className="text-xs italic text-neutral-700">{log.notes}</p>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
