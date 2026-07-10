import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// Cualquier profesional del equipo puede moderar comentarios (mismos roles
// que ya pueden borrar posts en /api/community/feed/[id]).
function canModerate(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio" || role === "setter" || role === "closer";
}

// DELETE /api/community/comments/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canModerate(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.communityComment.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
