import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { founderSession, founderSubmission, channelConfigured, decisionQuestion, exchangeSelect } from "@/lib/grok-ceo-exchange";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(req: NextRequest) {
  const user = await founderSession();
  if (!user) return json({ error: "Forbidden" }, 403);
  try {
    const reportId = req.nextUrl.searchParams.get("reportId");
    const [history, reportDecisions, channel, pendingCount, latestResponse] = await Promise.all([
      prisma.grokCeoExchange.findMany({ where: { founderId: user.id }, orderBy: { createdAt: "desc" }, take: 60, select: exchangeSelect }),
      reportId && /^grok-ceo-\d{4}-\d{2}-\d{2}$/.test(reportId)
        ? prisma.grokCeoExchange.findMany({ where: { founderId: user.id, reportId, kind: "decision" }, select: exchangeSelect })
        : Promise.resolve([]),
      prisma.grokCeoChannelState.findUnique({ where: { founderId: user.id }, select: { lastPollAt: true, lastReplyAt: true } }),
      prisma.grokCeoExchange.count({ where: { founderId: user.id, respondedAt: null } }),
      prisma.grokCeoExchange.findFirst({ where: { founderId: user.id, respondedAt: { not: null } }, orderBy: { respondedAt: "desc" }, select: { respondedAt: true } }),
    ]);
    return json({ history, reportDecisions, channelConfigured: channelConfigured(), pendingCount,
      lastPollAt: channel?.lastPollAt ?? null, lastReplyAt: channel?.lastReplyAt ?? latestResponse?.respondedAt ?? null });
  } catch { return json({ error: "Buzón temporalmente no disponible." }, 503); }
}
export async function POST(req: NextRequest) {
  const user = await founderSession();
  if (!user) return json({ error: "Forbidden" }, 403);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 16000) return json({ error: "Mensaje demasiado largo." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "JSON inválido." }, 400); }
  const parsed = founderSubmission.safeParse(body);
  if (!parsed.success) return json({ error: "Datos inválidos." }, 400);
  const d = parsed.data;
  try {
    const existing = await prisma.grokCeoExchange.findUnique({ where: { id: d.id } });
    if (existing) {
      if (existing.founderId !== user.id || existing.kind !== d.kind || existing.message !== d.message || existing.reportId !== (d.reportId ?? null) ||
        (d.kind === "decision" && (existing.decision !== d.decision || existing.decisionIndex !== d.decisionIndex))) return json({ error: "Identificador ya utilizado." }, 409);
      return json({ ok: true, id: existing.id, duplicate: true });
    }
    let question: string | null = null;
    if (d.reportId) {
      const report = await prisma.ceoReport.findFirst({ where: { id: d.reportId, periodType: "grok_daily" }, select: { narrative: true } });
      if (!report) return json({ error: "Informe no encontrado." }, 404);
      if (d.kind === "decision") {
        question = decisionQuestion(report.narrative, d.decisionIndex);
        if (!question) return json({ error: "Propuesta no encontrada." }, 404);
      }
    }
    const row = await prisma.grokCeoExchange.create({ data: {
      id: d.id, founderId: user.id, kind: d.kind, reportId: d.reportId, message: d.message,
      ...(d.kind === "decision" ? { decisionIndex: d.decisionIndex, decision: d.decision, question } : {}),
    } });
    return json({ ok: true, id: row.id }, 201);
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") return json({ error: "Ya existe una decisión o envío con ese identificador. Actualiza el buzón." }, 409);
    return json({ error: "No se pudo guardar el envío." }, 503);
  }
}
