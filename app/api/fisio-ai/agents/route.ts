/**
 * GET /api/fisio-ai/agents — lista de agentes ordenados por `order`.
 *   Siempre siembra los defaults si aún no existen (idempotente).
 * Solo CEO por ahora.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ensureDefaultAgents } from "@/lib/fisio-ai-agents";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureDefaultAgents();
  const agents = await (prisma as any).fisioAiAgent.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ agents });
}
