import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import {
  assignableRolesForUser,
  canManageResources,
  parseTargetRoles,
  type ResourceRole,
  ROLE_ORDER,
  templateVisibleFor,
} from "@/lib/resource-roles";

/**
 * Normaliza un array entrante de roles a JSON string válido, filtrando los
 * que el usuario actual NO puede asignar (p.ej. head_success no puede asignar
 * "ceo"). Si no queda ninguno, devuelve null para que el caller decida fallback.
 */
function buildTargetRolesJson(input: unknown, userRole: ResourceRole): string | null {
  if (!Array.isArray(input)) return null;
  const allowed = new Set(assignableRolesForUser(userRole));
  const filtered: ResourceRole[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    if (!(ROLE_ORDER as string[]).includes(raw)) continue;
    if (!allowed.has(raw as ResourceRole)) continue;
    if (!filtered.includes(raw as ResourceRole)) filtered.push(raw as ResourceRole);
  }
  if (!filtered.length) return null;
  return JSON.stringify(filtered);
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageResources(user.role as ResourceRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userRole = user.role as ResourceRole;
  const { name, category, body, targetRoles } = await req.json();

  const rolesJson = buildTargetRolesJson(targetRoles, userRole)
    ?? JSON.stringify([userRole]); // fallback: el propio rol del autor

  const m = await prisma.messageTemplate.create({
    data: {
      name,
      category: category || "Otros",
      body,
      targetRoles: rolesJson,
    },
  });
  return NextResponse.json(m);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageResources(user.role as ResourceRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userRole = user.role as ResourceRole;
  const { id, name, category, body, targetRoles } = await req.json();

  // Verificar que el usuario tiene acceso a esta plantilla (head_success no
  // puede editar plantillas exclusivas de CEO).
  const existing = await prisma.messageTemplate.findUnique({ where: { id }, select: { targetRoles: true } });
  if (!existing) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (!templateVisibleFor(parseTargetRoles(existing.targetRoles), userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rolesJson: string | undefined;
  if (targetRoles !== undefined) {
    const built = buildTargetRolesJson(targetRoles, userRole);
    if (!built) return NextResponse.json({ error: "Debe seleccionar al menos un rol válido" }, { status: 400 });
    rolesJson = built;
  }

  const m = await prisma.messageTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(body !== undefined && { body }),
      ...(rolesJson !== undefined && { targetRoles: rolesJson }),
    },
  });
  return NextResponse.json(m);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageResources(user.role as ResourceRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userRole = user.role as ResourceRole;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Misma protección: no borrar plantillas que el usuario no puede ver.
  const existing = await prisma.messageTemplate.findUnique({ where: { id }, select: { targetRoles: true } });
  if (!existing) return NextResponse.json({ ok: true });
  if (!templateVisibleFor(parseTargetRoles(existing.targetRoles), userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
