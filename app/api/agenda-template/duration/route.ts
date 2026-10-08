/**
 * PATCH /api/agenda-template/duration
 *
 * Cambia la duración de TODAS las franjas de la plantilla a la vez (global).
 * Solo acepta 30, 45 o 60.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { hasAnyRole, type Role } from "@/lib/auth";

const ALLOWED_ROLES: Role[] = ["ceo", "setter", "closer", "head_success"];

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!hasAnyRole(user, ALLOWED_ROLES)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slotDurationMinutes } = await req.json();
  if (![30, 45, 60].includes(slotDurationMinutes)) {
    return NextResponse.json({ error: "Duración debe ser 30, 45 o 60" }, { status: 400 });
  }

  await prisma.defaultClosingShift.updateMany({
    data: { slotDurationMinutes },
  });

  return NextResponse.json({ ok: true });
}
