import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { SetterLeadsView } from "@/components/SetterLeadsView";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { closer?: string };
}) {
  const user = (await getActiveProfessional())!;

  // CEO y closer tienen sus propias páginas
  if (user.role === "ceo" || user.role === "closer") {
    redirect("/fisio/llamadas-venta");
  }
  // Head-success ya no usa Leads (lo quitamos del sidebar)
  if (user.role === "head_success") {
    redirect("/fisio");
  }
  if (user.role !== "setter") redirect("/fisio");

  const closers = await prisma.professional.findMany({
    where: { role: { in: ["ceo", "closer"] } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  // Tab activo: por defecto "all" (todos los closers); o un closer específico
  const activeFilter = searchParams.closer ?? "all";

  // El setter solo ve los leads pendientes de avisar al closer: status "scheduled"
  // y aún sin marcar como avisados. Al pulsar "✓ Avisado", el lead desaparece de
  // su panel y queda solo en el de llamadas del closer.
  const where: any = { status: "scheduled", setterNotifiedAt: null };
  if (activeFilter !== "all") {
    where.closerId = activeFilter;
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      closer: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: { callScheduledAt: "asc" },
  });

  // Counts por closer (solo pendientes de avisar)
  const allPending = await prisma.lead.findMany({
    where: { status: "scheduled", setterNotifiedAt: null },
    select: { closerId: true },
  });
  const counts: Record<string, number> = { all: allPending.length };
  for (const c of closers) {
    counts[c.id] = allPending.filter((l) => l.closerId === c.id).length;
  }

  return (
    <SetterLeadsView
      activeFilter={activeFilter}
      counts={counts}
      closers={closers.map((c) => ({ id: c.id, fullName: c.fullName, role: c.role }))}
      leads={leads.map((l) => ({
        id: l.id,
        fullName: l.fullName,
        contactType: l.contactType,
        contactValue: l.contactValue,
        email: l.email,
        phone: l.phone,
        motivo: l.motivo,
        tratamientosPrevios: l.tratamientosPrevios,
        impactoCrossfit: l.impactoCrossfit,
        aiSummary: l.aiSummary,
        meetingUrl: l.meetingUrl,
        source: l.source,
        callScheduledAt: l.callScheduledAt.toISOString(),
        closer: l.closer,
      }))}
    />
  );
}
