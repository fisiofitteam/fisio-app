import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { integrationFounder, advisoryReply, exchangeSelect } from "@/lib/grok-ceo-exchange";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(req: NextRequest) {
  const founder = await integrationFounder(req.headers.get("authorization"));
  if (!founder) return json({ error: "Unauthorized" }, 401);
  try {
    const pending = await prisma.grokCeoExchange.findMany({ where: { founderId: founder.id, respondedAt: null }, orderBy: { createdAt: "asc" }, take: 25, select: exchangeSelect });
    return json({ version: 1, scope: "advisory_only", pending, notice: "Respond with analysis only. Founder decisions are records, not permission to execute operations." });
  } catch { return json({ error: "Exchange unavailable" }, 503); }
}
export async function POST(req: NextRequest) {
  const founder = await integrationFounder(req.headers.get("authorization"));
  if (!founder) return json({ error: "Unauthorized" }, 401);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 16000) return json({ error: "Too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = advisoryReply.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid reply" }, 400);
  const { id, response } = parsed.data;
  try {
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.grokCeoExchange.updateMany({ where: { id, founderId: founder.id, respondedAt: null }, data: { response, respondedAt: new Date() } });
      if (!updated.count) {
        const row = await tx.grokCeoExchange.findFirst({ where: { id, founderId: founder.id }, select: { response: true } });
        return row ? row.response === response ? "duplicate" : "conflict" : "missing";
      }
      await tx.teamNotification.create({ data: { targetProfessionalId: founder.id, type: "grok_ceo_reply", title: "Tu CEO IA ha respondido", body: "Consulta la respuesta en el buzón de dirección.", actionUrl: "/fisio/informe-ceo#buzon-ceo", refKey: id } });
      return "saved";
    });
    return result === "missing" ? json({ error: "Not found" }, 404) : result === "conflict" ? json({ error: "Already answered" }, 409) : json({ ok: true, id, duplicate: result === "duplicate" });
  } catch { return json({ error: "Exchange unavailable" }, 503); }
}
