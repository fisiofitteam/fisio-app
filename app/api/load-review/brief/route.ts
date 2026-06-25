/**
 * Brief metodológico singleton para la sugerencia IA de control de cargas.
 *
 * GET → devuelve el brief actual (lo siembra vacío si no existe).
 * PUT → actualiza (solo CEO/head_success).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brief = await prisma.loadReviewBrief.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  return NextResponse.json({ brief });
}

export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await req.json().catch(() => ({}));
  const update: any = { updatedById: user.id };
  if (typeof data?.methodology === "string") update.methodology = data.methodology;
  if (typeof data?.hardRules === "string") update.hardRules = data.hardRules;
  if (typeof data?.goodExamples === "string") update.goodExamples = data.goodExamples;
  const brief = await prisma.loadReviewBrief.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...update },
    update,
  });
  return NextResponse.json({ brief });
}
