/**
 * GET / POST / PATCH /api/lead-source-tags
 *
 * Catálogo editable de etiquetas de origen de lead. Setter, closer, CEO y
 * head_success pueden gestionarlo — fisios normales no.
 *
 * GET   → devuelve las activas por sortOrder + label.
 * POST  → { label, color? } crea una etiqueta nueva.
 * PATCH → { id, label?, color?, active?, sortOrder? } edita/archiva.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "setter" || role === "closer";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const includeArchived = req.nextUrl.searchParams.get("all") === "1";
  const tags = await prisma.leadSourceTag.findMany({
    where: includeArchived ? {} : { active: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (label.length > 60) return NextResponse.json({ error: "Máximo 60 caracteres" }, { status: 400 });
  const color = typeof body?.color === "string" && body.color.trim() ? body.color.trim() : null;

  // Detecta conflicto (label es UNIQUE) para dar un error claro
  const existing = await prisma.leadSourceTag.findUnique({ where: { label } });
  if (existing) {
    if (existing.active) {
      return NextResponse.json({ error: "Ya existe una etiqueta con ese nombre" }, { status: 409 });
    }
    // Si está archivada, la re-activamos en vez de fallar
    const reactivated = await prisma.leadSourceTag.update({
      where: { id: existing.id },
      data: { active: true, color: color ?? existing.color },
    });
    return NextResponse.json(reactivated);
  }

  const created = await prisma.leadSourceTag.create({ data: { label, color } });
  return NextResponse.json(created);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { id, label, color, active, sortOrder } = body ?? {};
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (typeof label === "string" && label.trim()) data.label = label.trim();
  if (color === null || typeof color === "string") data.color = color || null;
  if (typeof active === "boolean") data.active = active;
  if (Number.isInteger(sortOrder)) data.sortOrder = Number(sortOrder);
  const updated = await prisma.leadSourceTag.update({ where: { id }, data });
  return NextResponse.json(updated);
}
