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

  // El setter ve leads con status "scheduled" que aún NO haya pasado el día
  // de la videollamada, o que aún no haya marcado como avisado. Al marcar
  // "avisado" la card queda visible con un chip verde, pero el lead sigue
  // accesible por si Niki necesita editar el resumen o corregir algo. Cuando
  // pasa el día de la llamada, desaparece del panel (queda en el del closer).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const where: any = {
    status: "scheduled",
    OR: [
      { setterNotifiedAt: null },
      { callScheduledAt: { gte: startOfToday } },
    ],
  };
  if (activeFilter !== "all") {
    where.closerId = activeFilter;
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      closer: { select: { id: true, fullName: true, role: true } },
      sourceTag: { select: { id: true, label: true, color: true } },
    },
    orderBy: { callScheduledAt: "asc" },
  });

  // Counts por closer con el mismo criterio.
  const allActive = await prisma.lead.findMany({
    where: {
      status: "scheduled",
      OR: [
        { setterNotifiedAt: null },
        { callScheduledAt: { gte: startOfToday } },
      ],
    },
    select: { closerId: true },
  });
  const counts: Record<string, number> = { all: allActive.length };
  for (const c of closers) {
    counts[c.id] = allActive.filter((l) => l.closerId === c.id).length;
  }

  // Análisis IA de Skalex (Zapp) por lead, para pintarlo en cada card.
  const { getSkalexAiForLeads } = await import("@/lib/skalex/summaries");
  const skalexAiByLeadId = await getSkalexAiForLeads(leads.map((l) => l.id));

  return (
    <SetterLeadsView
      activeFilter={activeFilter}
      counts={counts}
      closers={closers.map((c) => ({ id: c.id, fullName: c.fullName, role: c.role }))}
      skalexAiByLeadId={skalexAiByLeadId}
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
        aiScheduled: l.aiScheduled,
        callScheduledAt: l.callScheduledAt.toISOString(),
        setterNotifiedAt: l.setterNotifiedAt?.toISOString() ?? null,
        closer: l.closer,
        sourceTag: l.sourceTag,
      }))}
    />
  );
}
