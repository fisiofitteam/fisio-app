/**
 * GET /api/fisio-ai/agents — lista de agentes ordenados por `order`.
 *   Siempre siembra los defaults si aún no existen (idempotente).
 * Solo CEO por ahora.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ensureDefaultAgents } from "@/lib/fisio-ai-agents";

async function requireCeo() {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (user.role !== "ceo") return { error: "Forbidden" as const, status: 403 };
  return { user };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function GET() {
  const g = await requireCeo();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  await ensureDefaultAgents();
  const agents = await (prisma as any).fisioAiAgent.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ agents });
}

/** POST /api/fisio-ai/agents { name, description?, icon?, brief?, usesPatientContext? }
 *  → crea un agente nuevo con slug derivado del name. Si el slug ya existe,
 *    añade sufijo -2, -3... para no romper el @unique. */
export async function POST(req: NextRequest) {
  const g = await requireCeo();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const b = await req.json().catch(() => ({}));
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });

  const base = slugify(name) || `agente-${Date.now()}`;
  // Elegir el primer slug libre: base, base-2, base-3, ...
  let slug = base;
  let i = 2;
  while (await (prisma as any).fisioAiAgent.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }

  // Nuevo agente al final del listado (order = max + 1).
  const last = await (prisma as any).fisioAiAgent.findFirst({ orderBy: { order: "desc" } });
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await (prisma as any).fisioAiAgent.create({
    data: {
      slug,
      name,
      description: (typeof b?.description === "string" ? b.description.trim() : "") || "Nuevo agente",
      icon: (typeof b?.icon === "string" ? b.icon.trim() : "") || "🤖",
      brief: typeof b?.brief === "string" ? b.brief : "",
      order: nextOrder,
      usesPatientContext: !!b?.usesPatientContext,
      updatedById: g.user.id,
    },
  });
  return NextResponse.json({ agent: created });
}

/** DELETE /api/fisio-ai/agents?slug=... — borra un agente. Los defaults se
 *  vuelven a crear en el siguiente GET (ensureDefaultAgents es idempotente),
 *  así que solo se pueden "eliminar de verdad" los agentes custom. */
export async function DELETE(req: NextRequest) {
  const g = await requireCeo();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug requerido" }, { status: 400 });
  await (prisma as any).fisioAiAgent.delete({ where: { slug } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
