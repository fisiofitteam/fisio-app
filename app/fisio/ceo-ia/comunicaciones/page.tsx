import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { parseObject } from "@/lib/ceo-direction-contract";
import { GrokCeoExchangePanel } from "@/components/GrokCeoExchangePanel";
export const dynamic = "force-dynamic";

export default async function CommunicationsPage({ searchParams }: { searchParams: { report?: string } }) {
  if (!await founderSession()) redirect("/fisio/ceo-ia");
  const id = typeof searchParams.report === "string" && /^grok-ceo-\d{4}-\d{2}-\d{2}$/.test(searchParams.report) ? searchParams.report : null;
  const report = id
    ? await prisma.ceoReport.findUnique({ where: { id }, select: { id: true, narrative: true, periodLabel: true } })
    : await prisma.ceoReport.findFirst({ where: { periodType: "grok_daily" }, orderBy: { generatedAt: "desc" }, select: { id: true, narrative: true, periodLabel: true } });
  const raw = parseObject(report?.narrative).decisionesFounder;
  const decisions = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  return <div className="space-y-4">
    <div><h2 className="text-xl font-semibold">Comunicaciones</h2><p className="mt-1 text-sm text-neutral-500">Encargos, respuestas y decisiones con tu CEO IA, en un único buzón.</p></div>
    {report && <p className="text-xs text-neutral-500">Decisiones vinculadas a: {report.periodLabel}</p>}
    {id && !report && <p className="text-sm text-amber-800">El informe de origen ya no está disponible. Puedes consultar el historial o enviar un nuevo encargo.</p>}
    <GrokCeoExchangePanel key={report?.id || "general"} reportId={report?.id} decisions={decisions} />
  </div>;
}
