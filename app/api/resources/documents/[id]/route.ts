/**
 * DELETE /api/resources/documents/[id]
 *   → borra el documento. Cualquier profesional puede (a diferencia de
 *     tarifas, que son solo CEO).
 *
 * NOTA: no borramos el blob del storage aquí para no complicar. En caso
 * de necesidad se limpia con una tarea de mantenimiento.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await (prisma as any).resourceDocument.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
