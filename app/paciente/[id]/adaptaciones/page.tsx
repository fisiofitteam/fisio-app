import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";

export default async function PatientAdaptations({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: {
      adaptations: {
        include: { movement: { include: { category: true } } },
        orderBy: [{ state: "asc" }, { movement: { displayName: "asc" } }],
      },
    },
  });
  if (!patient) notFound();

  const byState = {
    BLOCKED: patient.adaptations.filter((a) => a.state === "BLOCKED"),
    CONDITIONAL: patient.adaptations.filter((a) => a.state === "CONDITIONAL"),
    OK: patient.adaptations.filter((a) => a.state === "OK"),
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-6">
        <Link href={`/paciente/${patient.id}`} className="text-xs text-neutral-500">← Inicio</Link>
        <h1 className="text-xl font-semibold mt-1">Mis adaptaciones</h1>
        <p className="text-sm text-neutral-500">Definidas por tu fisio</p>
      </header>

      {byState.BLOCKED.length > 0 && (
        <section className="mb-5">
          <div
            className="text-center text-sm font-semibold uppercase mb-3 px-4 py-2 rounded-full inline-block"
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              color: "#FCA5A5",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              letterSpacing: "0.1em",
              display: "block",
              maxWidth: "fit-content",
              margin: "0 auto 12px",
            }}
          >
            🚫 No hacer
          </div>
          {byState.BLOCKED.map((a) => (
            <div key={a.id} className="card mb-2">
              <div className="flex justify-between">
                <div className="font-medium text-sm">{a.movement.displayName}</div>
                <span className="pill-block">Bloqueado</span>
              </div>
              {a.substitutionText && (
                <div className="text-xs text-neutral-600 mt-1">
                  <span className="text-red-700">→ {a.substitutionText}</span>
                  {a.loadConstraint && <span className="text-neutral-500"> · {a.loadConstraint}</span>}
                </div>
              )}
              {a.physioWarning && <p className="text-xs italic text-amber-800 mt-1">⚠ {a.physioWarning}</p>}
            </div>
          ))}
        </section>
      )}

      {byState.CONDITIONAL.length > 0 && (
        <section className="mb-5">
          <div
            className="text-center text-sm font-semibold uppercase mb-3 px-4 py-2 rounded-full"
            style={{
              background: "rgba(245, 158, 11, 0.15)",
              color: "#FCD34D",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              letterSpacing: "0.1em",
              display: "block",
              maxWidth: "fit-content",
              margin: "0 auto 12px",
            }}
          >
            ⚠️ Con condiciones
          </div>
          {byState.CONDITIONAL.map((a) => (
            <div key={a.id} className="card mb-2">
              <div className="flex justify-between">
                <div className="font-medium text-sm">{a.movement.displayName}</div>
                <span className="pill-warn">Condicional</span>
              </div>
              {a.substitutionText && (
                <div className="text-xs text-neutral-600 mt-1">
                  <span className="text-amber-700">→ {a.substitutionText}</span>
                  {a.loadConstraint && <span className="text-neutral-500"> · {a.loadConstraint}</span>}
                </div>
              )}
              {!a.substitutionText && a.loadConstraint && (
                <div className="text-xs text-neutral-600 mt-1">Carga: {a.loadConstraint}</div>
              )}
              {a.physioWarning && <p className="text-xs italic text-amber-800 mt-1">⚠ {a.physioWarning}</p>}
            </div>
          ))}
        </section>
      )}

      <p className="text-xs text-neutral-400 text-center mt-6">
        El resto de movimientos los puedes hacer sin cambios.
      </p>

      <PatientNav patientId={patient.id} active="adapt" />
    </main>
  );
}
