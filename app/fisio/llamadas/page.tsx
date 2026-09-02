import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CallsList } from "@/components/CallsList";

export default async function CallsPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/");

  // Los fisios normales solo ven las llamadas de SUS pacientes asignados;
  // CEO y head_success ven las de todo el equipo. Los pacientes marcados
  // como test SÍ aparecen aquí (útil para probar el flujo end-to-end) — se
  // distinguen con un chip 🧪 en cada tarjeta. Las métricas agregadas
  // siguen ignorando isTest por otro camino.
  const patientFilter = user.isManager
    ? {}
    : { assignedProfessionalId: user.id };
  const calls = await prisma.scheduledCall.findMany({
    where: { patient: patientFilter },
    include: {
      patient: { select: { id: true, fullName: true, whatsappGroupUrl: true, isTest: true } },
      patientCalls: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { callSummary: true },
      },
    },
    orderBy: [
      { completedAt: "asc" },
      { scheduledAt: { sort: "asc", nulls: "first" } }, // pendientes de agendar arriba
      { createdAt: "asc" },
    ],
  });
  const patients = await prisma.patient.findMany({ where: patientFilter, orderBy: { fullName: "asc" } });

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Llamadas</h1>
      </header>
      <CallsList
        calls={calls.map((c) => {
          const pc = c.patientCalls?.[0] ?? null;
          const sum = pc?.callSummary ?? null;
          return {
            id: c.id,
            patientId: c.patientId,
            patientName: c.patient.fullName,
            patientFirstName: c.patient.fullName.split(" ")[0] ?? c.patient.fullName,
            patientGroupUrl: c.patient.whatsappGroupUrl ?? null,
            patientIsTest: c.patient.isTest,
            scheduledAt: c.scheduledAt?.toISOString() ?? null,
            type: c.type,
            notes: c.notes ?? "",
            completedAt: c.completedAt?.toISOString() ?? null,
            outcome: c.outcome ?? "",
            // PatientCall enlazado (si el fisio agendó vía link). Solo lo
            // pasamos para poder pintar el resumen IA en las realizadas.
            patientCallId: pc?.id ?? null,
            patientCallType: (pc?.type ?? null) as "optimization" | "renewal" | null,
            summary: sum && sum.clinicalSummary
              ? {
                  clinicalSummary: sum.clinicalSummary,
                  clinicalKeyPoints: sum.clinicalKeyPoints,
                  coachingSummary: sum.coachingSummary,
                  coachingKeyPoints: sum.coachingKeyPoints,
                  salesSummary: sum.salesSummary,
                  salesKeyPoints: sum.salesKeyPoints,
                  transcriptCharCount: sum.transcriptCharCount,
                  updatedAt: sum.updatedAt.toISOString(),
                }
              : null,
          };
        })}
        patients={patients.map((p) => ({ id: p.id, fullName: p.fullName }))}
        isCeo={user.role === "ceo"}
      />
    </main>
  );
}
