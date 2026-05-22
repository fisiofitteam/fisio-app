import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CallsListView } from "@/components/CallsListView";

export default async function LlamadasVentaPage({
  searchParams,
}: {
  searchParams: { status?: string; closer?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "closer") redirect("/fisio");

  const status = ["scheduled", "won", "lost", "cancelled", "no_show"].includes(searchParams.status ?? "")
    ? searchParams.status!
    : "scheduled";

  // Lista de closers disponibles (para tabs del CEO)
  const closers = await prisma.professional.findMany({
    where: { role: { in: ["ceo", "closer"] } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }], // ceo primero (por orden alfabético del role)
  });

  // Para CEO: filtro por closer activo. Por defecto Ales (él mismo)
  let activeCloserId: string;
  if (user.role === "ceo") {
    activeCloserId = searchParams.closer || user.id;
  } else {
    activeCloserId = user.id; // closer ve solo lo suyo
  }

  const baseWhere = { closerId: activeCloserId };

  // Contadores por status (filtrados por closer activo)
  const counts = await Promise.all([
    prisma.lead.count({ where: { ...baseWhere, status: "scheduled" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "won" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "lost" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "cancelled" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "no_show" } }),
  ]);

  const leads = await prisma.lead.findMany({
    where: { ...baseWhere, status },
    include: {
      setter: { select: { id: true, fullName: true, role: true } },
      closer: { select: { id: true, fullName: true, role: true } },
      convertedPatient: { select: { id: true, fullName: true } },
    },
    orderBy: status === "scheduled" ? { callScheduledAt: "asc" } : { decidedAt: "desc" },
  });

  const fisios = await prisma.professional.findMany({
    where: { role: { in: ["fisio", "head_success"] } },
    orderBy: { fullName: "asc" },
  });

  return (
    <CallsListView
      activeStatus={status}
      activeCloserId={activeCloserId}
      currentUser={{ id: user.id, fullName: user.fullName, role: user.role }}
      closers={closers.map((c) => ({ id: c.id, fullName: c.fullName, role: c.role }))}
      leads={leads.map((l) => ({
        id: l.id,
        fullName: l.fullName,
        contactType: l.contactType,
        contactValue: l.contactValue,
        aiSummary: l.aiSummary,
        callScheduledAt: l.callScheduledAt.toISOString(),
        status: l.status,
        inFollowUp: l.inFollowUp,
        followUpNote: l.followUpNote,
        followUpDate: l.followUpDate?.toISOString() ?? null,
        lostReason: l.lostReason,
        setter: l.setter,
        closer: l.closer,
        convertedPatient: l.convertedPatient,
        decidedAt: l.decidedAt?.toISOString() ?? null,
        email: l.email,
        phone: l.phone,
        motivo: l.motivo,
        tratamientosPrevios: l.tratamientosPrevios,
        impactoCrossfit: l.impactoCrossfit,
        meetingUrl: l.meetingUrl,
        source: l.source,
      }))}
      fisios={fisios.map((f) => ({ id: f.id, fullName: f.fullName, role: f.role }))}
      counts={{
        scheduled: counts[0],
        won: counts[1],
        lost: counts[2],
        cancelled: counts[3],
        no_show: counts[4],
      }}
    />
  );
}
