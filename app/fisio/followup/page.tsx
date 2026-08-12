import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { FollowUpView } from "@/components/FollowUpView";

export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: { closer?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "closer") redirect("/fisio");

  const closers = await prisma.professional.findMany({
    where: { role: { in: ["ceo", "closer"] } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  // CEO: por defecto sus follow-ups; closer: los suyos
  const activeCloserId = user.role === "ceo" ? (searchParams.closer || user.id) : user.id;

  const leads = await prisma.lead.findMany({
    where: { closerId: activeCloserId, inFollowUp: true },
    include: {
      closer: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: [{ followUpStartedAt: "desc" }, { decidedAt: "desc" }],
  });

  // Resumen comercial IA (Meet transcript → Claude) por lead.
  const fuSummariesRaw = await prisma.callSummary.findMany({
    where: { leadId: { in: leads.map((l) => l.id) } },
    select: {
      leadId: true,
      salesSummary: true,
      salesKeyPoints: true,
      outcome: true,
      noTranscript: true,
      errorMessage: true,
      generatedAt: true,
    },
  });
  const callSummaryByLeadId: Record<string, {
    salesSummary: string | null;
    salesKeyPoints: string | null;
    outcome: string | null;
    noTranscript: boolean;
    errorMessage: string | null;
    generatedAt: string;
  }> = {};
  for (const c of fuSummariesRaw) {
    callSummaryByLeadId[c.leadId] = {
      salesSummary: c.salesSummary,
      salesKeyPoints: c.salesKeyPoints,
      outcome: c.outcome,
      noTranscript: c.noTranscript,
      errorMessage: c.errorMessage,
      generatedAt: c.generatedAt.toISOString(),
    };
  }

  return (
    <FollowUpView
      activeCloserId={activeCloserId}
      currentUser={{ id: user.id, role: user.role }}
      closers={closers.map((c) => ({ id: c.id, fullName: c.fullName, role: c.role }))}
      leads={leads.map((l) => ({
        id: l.id,
        fullName: l.fullName,
        contactType: l.contactType,
        contactValue: l.contactValue,
        phone: l.phone,
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
      callSummaryByLeadId={callSummaryByLeadId}
    />
  );
}
