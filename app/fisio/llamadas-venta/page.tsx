import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CallsListView } from "@/components/CallsListView";
import { FollowUpView } from "@/components/FollowUpView";
import { parseTargetRoles, templateVisibleFor, type ResourceRole } from "@/lib/resource-roles";

export default async function LlamadasVentaPage({
  searchParams,
}: {
  searchParams: { status?: string; closer?: string; view?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "closer" && user.role !== "setter") redirect("/fisio");

  const status = ["scheduled", "won", "lost", "cancelled", "no_show"].includes(searchParams.status ?? "")
    ? searchParams.status!
    : "scheduled";

  // Lista de closers disponibles (para tabs del CEO)
  const closers = await prisma.professional.findMany({
    where: { role: { in: ["ceo", "closer"] } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }], // ceo primero (por orden alfabético del role)
  });

  // CEO y setter pueden filtrar por closer (la setter no tiene closer propio, así
  // que cae al primero disponible). Closer ve solo lo suyo.
  let activeCloserId: string;
  if (user.role === "ceo") {
    activeCloserId = searchParams.closer || user.id;
  } else if (user.role === "setter") {
    activeCloserId = searchParams.closer || closers[0]?.id || "";
  } else {
    activeCloserId = user.id; // closer ve solo lo suyo
  }

  const baseWhere = { closerId: activeCloserId };

  // Vista Follow-up embebida en la página de llamadas (CEO y setter; el closer
  // la tiene como pestaña propia en el sidebar).
  const view = (user.role === "ceo" || user.role === "setter") && searchParams.view === "followup" ? "followup" : "calls";
  if (view === "followup") {
    const fuLeads = await prisma.lead.findMany({
      where: { closerId: activeCloserId, inFollowUp: true },
      include: { closer: { select: { id: true, fullName: true, role: true } } },
      orderBy: [{ followUpStartedAt: "desc" }, { decidedAt: "desc" }],
    });
    return (
      <FollowUpView
        embedded
        activeCloserId={activeCloserId}
        currentUser={{ id: user.id, role: user.role }}
        closers={closers.map((c) => ({ id: c.id, fullName: c.fullName, role: c.role }))}
        leads={fuLeads.map((l) => ({
          id: l.id,
          fullName: l.fullName,
          contactType: l.contactType,
          contactValue: l.contactValue,
          aiSummary: l.aiSummary,
          followUpNote: l.followUpNote,
          callScheduledAt: l.callScheduledAt.toISOString(),
          status: l.status,
          lostReason: l.lostReason,
          followUp24hDate: l.followUp24hDate?.toISOString() ?? null,
          followUp24hDone: l.followUp24hDone,
          followUp48hDate: l.followUp48hDate?.toISOString() ?? null,
          followUp48hDone: l.followUp48hDone,
          followUp30dDate: l.followUp30dDate?.toISOString() ?? null,
          followUp30dDone: l.followUp30dDone,
          followUp90dDate: l.followUp90dDate?.toISOString() ?? null,
          followUp90dDone: l.followUp90dDone,
          closer: l.closer,
        }))}
      />
    );
  }

  // Contadores por status (filtrados por closer activo)
  const counts = await Promise.all([
    prisma.lead.count({ where: { ...baseWhere, status: "scheduled", inFollowUp: false } }),
    prisma.lead.count({ where: { ...baseWhere, status: "won" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "lost" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "cancelled" } }),
    prisma.lead.count({ where: { ...baseWhere, status: "no_show" } }),
  ]);

  const leads = await prisma.lead.findMany({
    where: { ...baseWhere, status, ...(status === "scheduled" ? { inFollowUp: false } : {}) },
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

  // Plantillas con acción + casos activos + intro del usuario. Las plantillas
  // las filtramos por rol (head_success no ve las solo-CEO, etc).
  const [allActionTemplates, successCases, currentUserFull] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { actionType: { in: ["send_success_case", "send_meeting_reminder"] } },
      select: { id: true, name: true, body: true, targetRoles: true, actionType: true },
    }),
    prisma.successCase.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, injury: true, youtubeUrl: true },
    }),
    prisma.professional.findUnique({
      where: { id: user.id },
      select: { closerIntro: true },
    }),
  ]);
  const userRole = user.role as ResourceRole;
  const visibleActionTemplates = allActionTemplates
    .filter((t) => templateVisibleFor(parseTargetRoles(t.targetRoles), userRole))
    .map((t) => ({ id: t.id, name: t.name, body: t.body, actionType: t.actionType! }));
  const successCaseTemplates = visibleActionTemplates.filter((t) => t.actionType === "send_success_case");
  const meetingReminderTemplates = visibleActionTemplates.filter((t) => t.actionType === "send_meeting_reminder");

  // Análisis IA de Skalex (Zapp) por lead, para pintarlo en cada card.
  const { getSkalexAiForLeads } = await import("@/lib/skalex/summaries");
  const skalexAiByLeadId = await getSkalexAiForLeads(leads.map((l) => l.id));

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
        setterNotifiedAt: l.setterNotifiedAt?.toISOString() ?? null,
        closerContactedAt: l.closerContactedAt?.toISOString() ?? null,
        reminderSentAt: l.reminderSentAt?.toISOString() ?? null,
        aiScheduled: l.aiScheduled,
      }))}
      fisios={fisios.map((f) => ({ id: f.id, fullName: f.fullName, role: f.role }))}
      counts={{
        scheduled: counts[0],
        won: counts[1],
        lost: counts[2],
        cancelled: counts[3],
        no_show: counts[4],
      }}
      successCaseTemplates={successCaseTemplates.map((t) => ({ id: t.id, name: t.name, body: t.body }))}
      meetingReminderTemplates={meetingReminderTemplates.map((t) => ({ id: t.id, name: t.name, body: t.body, actionType: "send_meeting_reminder" as const }))}
      successCases={successCases}
      currentUserCloserIntro={currentUserFull?.closerIntro ?? null}
      skalexAiByLeadId={skalexAiByLeadId}
    />
  );
}
