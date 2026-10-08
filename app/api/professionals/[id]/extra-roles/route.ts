/**
 * PATCH /api/professionals/[id]/extra-roles
 *
 * Reemplaza la lista `extraRoles` de un profesional. Solo CEO. Útil
 * para asignar cargos adicionales a quien ya tiene uno principal
 * (ej. una fisio que empieza a cerrar ventas → extraRoles=["closer"]).
 *
 * Body: { extraRoles: string[] }
 * El array se sanea: solo roles válidos del vocabulario Role, sin
 * incluir el rol principal (sería redundante).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ROLES: Role[] = ["ceo", "head_success", "fisio", "setter", "closer"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body?.extraRoles) ? body.extraRoles : [];
  const current = await prisma.professional.findUnique({
    where: { id: params.id },
    select: { role: true },
  });
  if (!current) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const sanitized = Array.from(new Set(
    incoming
      .filter((r: unknown): r is string => typeof r === "string")
      .filter((r: string) => (VALID_ROLES as readonly string[]).includes(r))
      .filter((r: string) => r !== current.role),
  ));

  const updated = await prisma.professional.update({
    where: { id: params.id },
    data: { extraRoles: sanitized } as any,
    select: { id: true, role: true, extraRoles: true } as any,
  });

  return NextResponse.json({ ok: true, professional: updated });
}
