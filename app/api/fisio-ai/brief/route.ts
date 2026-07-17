/**
 * GET /api/fisio-ai/brief — devuelve el brief actual (crea uno vacío si no existe).
 * PUT /api/fisio-ai/brief { content } — actualiza el brief.
 *
 * Restricción actual: solo CEO. Cuando salgamos de beta, ampliamos.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

async function requireCeo() {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (user.role !== "ceo") return { error: "Forbidden" as const, status: 403 };
  return { user };
}

async function getOrCreateBrief() {
  let brief = await (prisma as any).fisioAiBrief.findFirst({ orderBy: { createdAt: "asc" } });
  if (!brief) {
    brief = await (prisma as any).fisioAiBrief.create({ data: { content: "" } });
  }
  return brief;
}

export async function GET() {
  const g = await requireCeo();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const brief = await getOrCreateBrief();
  return NextResponse.json({ id: brief.id, content: brief.content, updatedAt: brief.updatedAt });
}

export async function PUT(req: NextRequest) {
  const g = await requireCeo();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { content } = await req.json().catch(() => ({}));
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content requerido" }, { status: 400 });
  }
  const brief = await getOrCreateBrief();
  const updated = await (prisma as any).fisioAiBrief.update({
    where: { id: brief.id },
    data: { content, updatedById: g.user.id },
  });
  return NextResponse.json({ id: updated.id, content: updated.content, updatedAt: updated.updatedAt });
}
