/**
 * Notas persistentes del CEO (singleton sin fecha).
 *
 * GET /api/ceo/notes  → devuelve { content }
 * PUT /api/ceo/notes  → body { content }, upsert
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal } from "@/lib/ceo-personal";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const row = await prisma.ceoNotes.findUnique({ where: { professionalId: user.id } });
  return NextResponse.json({ content: row?.content ?? "" });
}

export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const content = typeof data?.content === "string" ? data.content : "";
  const row = await prisma.ceoNotes.upsert({
    where: { professionalId: user.id },
    create: { professionalId: user.id, content },
    update: { content },
  });
  return NextResponse.json({ content: row.content });
}
