import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CallsList } from "@/components/CallsList";

export default async function CallsPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/");

  // Fuera los pacientes fantasma en llamadas y en el selector. Los fisios
  // normales solo ven las llamadas de SUS pacientes asignados; CEO y
  // head_success ven las de todo el equipo.
  const patientFilter = user.isManager
    ? { isTest: false }
    : { isTest: false, assignedProfessionalId: user.id };
  const calls = await prisma.scheduledCall.findMany({
    where: { patient: patientFilter },
    include: { patient: true },
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
        calls={calls.map((c) => ({
          id: c.id,
          patientId: c.patientId,
          patientName: c.patient.fullName,
          scheduledAt: c.scheduledAt?.toISOString() ?? null,
          type: c.type,
          notes: c.notes ?? "",
          completedAt: c.completedAt?.toISOString() ?? null,
          outcome: c.outcome ?? "",
        }))}
        patients={patients.map((p) => ({ id: p.id, fullName: p.fullName }))}
      />
    </main>
  );
}
