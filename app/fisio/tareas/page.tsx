import { prisma } from "@/lib/prisma";
import { FisioTasksList } from "@/components/FisioTasksList";

export default async function TasksPage() {
  const tasks = await prisma.fisioTask.findMany({
    include: { patient: true },
    orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  const patients = await prisma.patient.findMany({ orderBy: { fullName: "asc" } });

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Tareas</h1>
      </header>
      <FisioTasksList
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description ?? "",
          patientId: t.patientId,
          patientName: t.patient?.fullName ?? "",
          dueDate: t.dueDate?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
          source: t.source,
          assignedBy: t.assignedBy ?? "",
          assignedTo: t.assignedTo ?? "",
          priority: t.priority,
          recurrenceType: t.recurrenceType,
          recurrenceDay: t.recurrenceDay,
        }))}
        patients={patients.map((p) => ({ id: p.id, fullName: p.fullName }))}
      />
    </main>
  );
}
