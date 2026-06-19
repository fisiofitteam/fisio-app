import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds } from "@/lib/ads";

/**
 * Banco específico de Anuncios. Maneja hooks y audiencias.
 * Query param `kind`: "hook" | "audience".
 */

function unauthorized() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const data = await req.json().catch(() => ({}));
  const kind = data?.kind;

  if (kind === "hook") {
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Texto obligatorio" }, { status: 400 });
    const created = await prisma.adHook.create({
      data: { text, notes: typeof data?.notes === "string" ? data.notes.trim() || null : null },
    });
    return NextResponse.json({ id: created.id });
  }

  if (kind === "audience") {
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    const description = typeof data?.description === "string" ? data.description.trim() : "";
    if (!name || !description) return NextResponse.json({ error: "Nombre y descripción obligatorios" }, { status: 400 });
    const created = await prisma.adAudience.create({ data: { name, description } });
    return NextResponse.json({ id: created.id });
  }

  return NextResponse.json({ error: "kind debe ser 'hook' o 'audience'" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  const kind = data?.kind;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  if (kind === "hook") {
    const update: any = {};
    if (data.text !== undefined) update.text = String(data.text).trim();
    if (data.notes !== undefined) update.notes = String(data.notes).trim() || null;
    if (data.active !== undefined) update.active = !!data.active;
    await prisma.adHook.update({ where: { id }, data: update });
    return NextResponse.json({ ok: true });
  }
  if (kind === "audience") {
    const update: any = {};
    if (data.name !== undefined) update.name = String(data.name).trim();
    if (data.description !== undefined) update.description = String(data.description).trim();
    if (data.active !== undefined) update.active = !!data.active;
    await prisma.adAudience.update({ where: { id }, data: update });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "kind inválido" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const id = req.nextUrl.searchParams.get("id");
  const kind = req.nextUrl.searchParams.get("kind");
  if (!id || !kind) return NextResponse.json({ error: "id y kind requeridos" }, { status: 400 });
  if (kind === "hook") await prisma.adHook.delete({ where: { id } });
  else if (kind === "audience") await prisma.adAudience.delete({ where: { id } });
  else return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
