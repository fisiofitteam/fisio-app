import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeGrok, madridDay, completeWindow, reportId } from "@/lib/grok-ceo-contract";
import { collectGrokPeriod } from "@/lib/grok-ceo";
import { bankAggregate } from "@/lib/bank-finance";
import { mondayForDay, weeklyStrategySchema } from "@/lib/grok-ceo-weekly";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const items = z.array(z.string().trim().min(1).max(700)).max(6);
const schema = z.object({
  reportDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resumenEjecutivo: z.string().trim().min(1).max(1800),
  luces: items, sombras: items, accionesRecomendadas: items.max(3),
  alertas: items, tendencias: items, seguimiento: items,
  decisionesFounder: items.max(3),
  weeklyStrategy: weeklyStrategySchema.optional(),
}).strict();
export async function POST(req: NextRequest) {
  if (!authorizeGrok(req.headers.get("authorization"), process.env.GROK_CEO_WRITE_TOKEN))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ error: "JSON required" }, { status: 415 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 24000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let parsed: ReturnType<typeof schema.safeParse>;
  try { parsed = schema.safeParse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!parsed.success || parsed.data.reportDay !== madridDay())
    return NextResponse.json({ error: "Invalid report or date" }, { status: 400 });
  if (parsed.data.weeklyStrategy && mondayForDay(parsed.data.reportDay) !== parsed.data.reportDay)
    return NextResponse.json({ error: "Weekly strategy is accepted on Mondays only" }, { status: 400 });
  const founderId = process.env.GROK_CEO_FOUNDER_ID;
  if (!founderId) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  try {
    const founder = await prisma.professional.findFirst({ where: { id: founderId, role: "ceo", active: true }, select: { id: true } });
    if (!founder) return NextResponse.json({ error: "Not configured" }, { status: 503 });
    const id = reportId(parsed.data.reportDay);
    const existing = await prisma.ceoReport.findUnique({ where: { id }, select: { id: true } });
    if (existing) return NextResponse.json({ ok: true, id, duplicate: true });
    const now = new Date();
    const metrics = await collectGrokPeriod(7, 0, now);
    // Additional comparisons must not prevent the existing daily report from being saved.
    const comparisons = await Promise.allSettled([collectGrokPeriod(7, 7, now), collectGrokPeriod(30, 0, now), collectGrokPeriod(30, 30, now)]);
    const [previous7, last30, previous30] = comparisons.map(result => result.status === "fulfilled" ? result.value : null);
    const banking = await bankAggregate().catch(() => ({ status: "unavailable", currency: "EUR", currentBalanceCents: null }));
    const snapshot = { ...metrics, previous7, last30, previous30, banking };
    const { start, end } = completeWindow(7, 0, now);
    const { reportDay, ...narrative } = parsed.data;
    await prisma.$transaction(async tx => {
      await tx.ceoReport.create({ data: { id, periodType: "grok_daily", periodStart: start, periodEnd: end, periodLabel: "CEO IA · " + reportDay, metrics: JSON.stringify(snapshot), narrative: JSON.stringify(narrative) } });
      await tx.teamNotification.create({ data: { targetProfessionalId: founder.id, type: "grok_ceo_daily", title: "Tu informe CEO IA está disponible", body: narrative.decisionesFounder.length ? "Incluye decisiones que requieren tu revisión." : "Consulta el diagnóstico y las prioridades de hoy.", actionUrl: "/fisio/ceo-ia/informes?report=" + id, refKey: id } });
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") return NextResponse.json({ ok: true, id: reportId(parsed.data.reportDay), duplicate: true });
    return NextResponse.json({ error: "Report unavailable" }, { status: 503 });
  }
}
