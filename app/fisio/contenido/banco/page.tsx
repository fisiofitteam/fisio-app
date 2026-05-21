import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { BankView } from "@/components/BankView";

export default async function BankPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const tab = ["ideas", "hooks", "cases", "leadmagnets"].includes(searchParams.tab ?? "")
    ? (searchParams.tab as "ideas" | "hooks" | "cases" | "leadmagnets")
    : "ideas";

  const [ideas, hooks, cases, leadMagnets, patientsForLink] = await Promise.all([
    prisma.contentIdea.findMany({ orderBy: [{ used: "asc" }, { createdAt: "desc" }] }),
    prisma.winningHook.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.clinicalCase.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.leadMagnet.findMany({ orderBy: [{ active: "desc" }, { lastPromotedAt: "desc" }, { createdAt: "desc" }] }),
    prisma.patient.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);

  return (
    <main>
      <ContentNav active="bank" />
      <BankView
        activeTab={tab}
        ideas={ideas.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          funnelStage: i.funnelStage,
          bodyZone: i.bodyZone,
          suggestedFormat: i.suggestedFormat,
          used: i.used,
          usedPieceId: i.usedPieceId,
        }))}
        hooks={hooks.map((h) => ({
          id: h.id,
          text: h.text,
          format: h.format,
          bodyZone: h.bodyZone,
          reach: h.reach,
          saves: h.saves,
          dmKeyword: h.dmKeyword,
          conversions: h.conversions,
          notes: h.notes,
        }))}
        cases={cases.map((c) => ({
          id: c.id,
          athleteName: c.athleteName,
          injury: c.injury,
          insight: c.insight,
          consentSigned: c.consentSigned,
          videoUrls: JSON.parse(c.videoUrls) as string[],
          notes: c.notes,
          patientId: c.patientId,
        }))}
        leadMagnets={leadMagnets.map((l) => ({
          id: l.id,
          name: l.name,
          keyword: l.keyword,
          description: l.description,
          url: l.url,
          active: l.active,
          lastPromotedAt: l.lastPromotedAt?.toISOString() ?? null,
        }))}
        patientsForLink={patientsForLink.map((p) => ({ id: p.id, fullName: p.fullName }))}
      />
    </main>
  );
}
