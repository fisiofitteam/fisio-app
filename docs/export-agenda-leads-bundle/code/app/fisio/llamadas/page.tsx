import { prisma } from "@/lib/prisma";
import { CallsList } from "@/components/CallsList";

export default async function CallsPage() {
  const calls = await prisma.scheduledCall.findMany({
    include: { patient: true },
    orderBy: [{ completedAt: "asc" }, { scheduledAt: "asc" }],
  });
  const patients = await prisma.patient.findMany({ orderBy: { fullName: "asc" } });

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
          scheduledAt: c.scheduledAt.toISOString(),
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
