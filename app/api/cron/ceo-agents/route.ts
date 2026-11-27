import { NextRequest, NextResponse } from "next/server";
import { authorizeGrok } from "@/lib/grok-ceo-contract";
import { agentEngine } from "@/lib/ceo-agents/engine";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!authorizeGrok(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (process.env.VERCEL_ENV !== "production") return NextResponse.json({ status: "disabled_outside_production" }, { headers });
  const founderId = process.env.GROK_CEO_FOUNDER_ID;
  if (!founderId || !await prisma.professional.findFirst({ where: { id: founderId, active: true, role: "ceo", deletedAt: null }, select: { id: true } })) return NextResponse.json({ error: "Founder unavailable" }, { status: 503, headers });
  try {
    const scheduled = await agentEngine.schedule(founderId), processed: unknown[] = [], start = Date.now();
    for (let i = 0; i < 4 && Date.now() - start < 220000; i++) { const r = await agentEngine.processOne(founderId); processed.push(r); if (r.status === "idle") break; }
    return NextResponse.json({ scheduled, processed }, { headers });
  } catch { return NextResponse.json({ error: "Agent worker unavailable" }, { status: 503, headers }); }
}
