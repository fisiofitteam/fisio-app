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

  const where: any = { status: "scheduled" };
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

  // Counts por closer
  const allScheduled = await prisma.lead.findMany({
    where: { status: "scheduled" },
    select: { closerId: true },
  });
  const counts: Record<string, number> = { all: allScheduled.length };
  for (const c of closers) {
    counts[c.id] = allScheduled.filter((l) => l.closerId === c.id).length;
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
        aiSummary: l.aiSummary,
        callScheduledAt: l.callScheduledAt.toISOString(),
        closer: l.closer,
      }))}
    />
  );
}
